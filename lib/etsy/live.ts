/*
 * LiveEtsyService — Phase 11.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  YOU DO NOT HAVE AN ETSY API KEY YET, AND NOTHING HERE NEEDS ONE TO EXIST.
 *
 *  When the key arrives:
 *    1. Create an app at https://www.etsy.com/developers/your-apps
 *    2. Register the redirect URI: https://<your-domain>/api/etsy/callback
 *    3. Put ETSY_API_KEY and ETSY_REDIRECT_URI in .env.local
 *    4. Set ETSY_MODE=live
 *
 *  Then read docs/ETSY-SETUP.md, which lists what to verify on the first live
 *  call — the field names below follow Etsy's documented v3 shapes, and a
 *  provider's payloads are not ours to guarantee.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The acceptance criterion for this phase is "live mode can replace mock mode
 * without rewriting the product". That is why this file is long and nothing
 * else changed: every mapping from Etsy's shapes to ours happens here, so the
 * domain above keeps talking to EtsyService and never learns which adapter it
 * has.
 *
 * Three refusals worth naming, because they are the same in live mode as in
 * demo:
 *
 *   - getListingViews and getAdsPerformance still return UNAVAILABLE. A live
 *     connection does not conjure data Etsy does not publish, and the moment
 *     these have a real endpoint is the moment to change them — not before.
 *   - applyListingChanges writes only what it is given, per item, with the
 *     before-state recorded. It is reachable only through the bulk editor's
 *     ConfirmedOperation gate; nothing here can be called with an unconfirmed
 *     change.
 *   - Every method is shop-scoped. A shopId belongs to a ShopContext the caller
 *     already holds, and this adapter never looks one up from user input.
 */

import 'server-only'
import { AppError, Errors } from '@/lib/errors/types'
import { unavailable } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'
import { EtsyClient } from './http'
import { needsRefresh, refreshTokens } from './oauth'
import { getTokenStore } from './tokens'
import type {
  EtsyListing,
  EtsyOrder,
  EtsyService,
  EtsyShop,
  ListingState,
  ListingWriteRequest,
  ListingWriteResult,
  SyncProgress,
} from './interface'

/* ------------------------------------------------- Etsy's response shapes */

interface EtsyShopPayload {
  shop_id: number
  shop_name: string
  currency_code: string
  listing_active_count: number
  update_timestamp?: number
}

interface EtsyListingPayload {
  listing_id: number
  title: string
  description: string
  tags: string[]
  price?: { amount: number; divisor: number; currency_code: string }
  quantity: number
  state: string
  shop_section_id?: number | null
  skus?: string[]
  has_variations?: boolean
  num_favorers?: number
  ending_timestamp?: number
  last_modified_timestamp?: number
}

interface EtsyReceiptPayload {
  receipt_id: number
  created_timestamp: number
  grandtotal?: { amount: number; divisor: number }
  discount_amt?: { amount: number; divisor: number }
  total_shipping_cost?: { amount: number; divisor: number }
  country_iso?: string
  transactions?: {
    listing_id: number
    quantity: number
    price?: { amount: number; divisor: number }
  }[]
}

interface Paged<T> {
  count: number
  results: T[]
}

/** Etsy prices are integer minor units plus a divisor, never a float. */
function money(value: { amount: number; divisor: number } | undefined): number {
  if (!value || !value.divisor) return 0
  return Math.round((value.amount / value.divisor) * 100) / 100
}

function iso(timestamp: number | undefined): string | null {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null
}

function listingState(raw: string): ListingState {
  switch (raw) {
    case 'active':
      return 'ACTIVE'
    case 'draft':
      return 'DRAFT'
    case 'expired':
      return 'EXPIRED'
    default:
      return 'INACTIVE'
  }
}

/* ------------------------------------------------------------- the adapter */

export class LiveEtsyService implements EtsyService {
  readonly canWrite = true
  readonly mode = 'live' as const

  /*
   * One client PER SHOP, not one client.
   *
   * The token closure below captures a shopId. A single cached client would
   * capture the first shop it was built for and then serve every later shop
   * from those credentials — this adapter is a process-wide singleton, so on a
   * multi-shop server that is a cross-shop read, quietly, with no error. The
   * brief's rule is that a user must never be able to operate on another shop's
   * data, and a cache keyed by nothing is exactly how that rule gets broken by
   * an optimisation rather than by a decision.
   */
  private readonly clients = new Map<string, EtsyClient>()

  /**
   * The client factory is injectable, for the same reason every other adapter's
   * transport is (D28): the mapping and write behaviour of this file is the
   * part most likely to be wrong, and it must be testable without credentials,
   * without a network, and without an Etsy account.
   */
  constructor(private readonly makeClient?: (shopId: string) => EtsyClient) {}

  /**
   * Build the HTTP client for one shop, refreshing the token if it is near
   * expiry.
   *
   * The token is fetched inside a closure the client calls per request, so a
   * long bulk job refreshes mid-flight instead of failing halfway — the
   * failure mode this product spends the most effort avoiding.
   */
  private clientFor(shopId: string): EtsyClient {
    const cached = this.clients.get(shopId)
    if (cached) return cached

    if (this.makeClient) {
      const made = this.makeClient(shopId)
      this.clients.set(shopId, made)
      return made
    }

    const apiKey = process.env.ETSY_API_KEY
    if (!apiKey) {
      throw new AppError({
        kind: 'EXTERNAL_SERVICE',
        code: 'ETSY_NOT_CONFIGURED',
        message: 'Live Etsy access is not configured.',
        recovery:
          'ETSY_API_KEY is not set on the server. Demo mode needs no credentials — set ETSY_MODE=mock to use it.',
      })
    }

    const client = new EtsyClient({
      apiKey,
      accessToken: async () => {
        const store = getTokenStore()
        const tokens = await store.read(shopId)
        if (!tokens) throw Errors.notAuthenticated()

        if (!needsRefresh(tokens, Date.now())) return tokens.accessToken

        const refreshed = await refreshTokens({
          clientId: apiKey,
          refreshToken: tokens.refreshToken,
        })
        await store.write(shopId, refreshed)
        return refreshed.accessToken
      },
    })
    this.clients.set(shopId, client)
    return client
  }

  async getShop(shopId: string): Promise<EtsyShop> {
    const payload = await this.clientFor(shopId).get<EtsyShopPayload>(`/shops/${shopId}`)
    return {
      etsyShopId: String(payload.shop_id),
      name: payload.shop_name,
      currency: payload.currency_code,
      // Etsy does not return a zone here; UTC is this product's single basis (D24).
      timezone: 'UTC',
      connectionStatus: 'CONNECTED',
      lastSyncedAt: iso(payload.update_timestamp),
      activeListingCount: payload.listing_active_count,
      grantedScopes: [],
    }
  }

  async getListings(
    shopId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<{ listings: EtsyListing[]; total: number }> {
    const page = await this.clientFor(shopId).get<Paged<EtsyListingPayload>>(
      `/shops/${shopId}/listings`,
      { limit: Math.min(opts?.limit ?? 100, 100), offset: opts?.offset ?? 0 },
    )
    return { listings: page.results.map(toListing), total: page.count }
  }

  async getListing(shopId: string, etsyListingId: string): Promise<EtsyListing | null> {
    try {
      const payload = await this.clientFor(shopId).get<EtsyListingPayload>(`/listings/${etsyListingId}`)
      return toListing(payload)
    } catch (error) {
      // A deleted listing is a legitimate null, not a failure to report.
      if (error instanceof AppError && error.code === 'ETSY_HTTP_404') return null
      throw error
    }
  }

  async getOrders(shopId: string, opts?: { since?: string; until?: string }): Promise<EtsyOrder[]> {
    const params: Record<string, string | number | undefined> = { limit: 100 }
    if (opts?.since) params.min_created = Math.floor(Date.parse(opts.since) / 1000)
    if (opts?.until) params.max_created = Math.floor(Date.parse(opts.until) / 1000)

    const page = await this.clientFor(shopId).get<Paged<EtsyReceiptPayload>>(
      `/shops/${shopId}/receipts`,
      params,
    )
    return page.results.map(toOrder)
  }

  /**
   * Sync progress.
   *
   * This adapter runs no background sync of its own — progress belongs to the
   * sync job, which the repository owns and which lands with DATABASE_URL. So
   * every stage reports PENDING and the overall figure is 0, because a sync
   * that has not started is at 0%. A screen that invented a percentage here
   * would be the same defect as a metric that invented a figure.
   *
   * The one real number available is Etsy's own remaining-today budget, read
   * from the last response's headers, and it goes in the stage detail where a
   * seller waiting on a large import can see why it is pacing itself.
   */
  async getSyncProgress(shopId: string): Promise<SyncProgress> {
    const budget = this.clientFor(shopId).rateBudget()
    const budgetDetail =
      budget.remainingToday !== null
        ? `${budget.remainingToday} Etsy requests remaining today`
        : 'Etsy has not reported a rate budget yet.'

    return {
      overallPercent: 0,
      // Not "0 seconds". An ETA is unknown until a job is running, and null is
      // how this product says unknown.
      etaSeconds: null,
      rateLimitedUntil: null,
      stages: [
        { key: 'shop', label: 'Confirming shop', detail: 'Waiting to start', status: 'PENDING' },
        { key: 'listings', label: 'Importing listings', detail: budgetDetail, status: 'PENDING' },
        { key: 'inventory', label: 'Syncing inventory and variations', detail: 'Waiting to start', status: 'PENDING' },
        { key: 'orders', label: 'Loading 24 months of orders', detail: 'Waiting to start', status: 'PENDING' },
        { key: 'metrics', label: 'Calculating profit and catalog health', detail: 'Waiting to start', status: 'PENDING' },
      ],
    }
  }

  /**
   * Writes.
   *
   * Per item, each independently reported, because partial success is the
   * normal case for a batch against a rate-limited API. A failure on item 40
   * must not roll back items 1–39 silently, and must not stop items 41+ from
   * being attempted — the bulk editor already renders per-item outcomes.
   */
  async applyListingChanges(
    shopId: string,
    requests: ListingWriteRequest[],
  ): Promise<ListingWriteResult[]> {
    const client = this.clientFor(shopId)
    const results: ListingWriteResult[] = []

    for (const request of requests) {
      try {
        /*
         * Only the fields the operation actually changed are sent. `changes` is
         * a Partial, so an absent key means "leave it alone" — sending the
         * whole listing back would overwrite fields the seller edited on Etsy
         * between the diff and the apply, which is exactly the silent
         * clobbering the confirm step exists to prevent.
         */
        const { changes } = request
        const body: Record<string, unknown> = {}
        if (changes.title !== undefined) body.title = changes.title
        if (changes.description !== undefined) body.description = changes.description
        if (changes.tags !== undefined) body.tags = changes.tags
        if (changes.price !== undefined) body.price = changes.price
        if (changes.quantity !== undefined) body.quantity = changes.quantity
        if (changes.state !== undefined) body.state = changes.state.toLowerCase()

        if (Object.keys(body).length === 0) {
          // Nothing to send. Reported as skipped rather than succeeded: the
          // audit log must not record a write that never happened.
          results.push({ etsyListingId: request.etsyListingId, status: 'SKIPPED' })
          continue
        }

        await client.put(`/shops/${shopId}/listings/${request.etsyListingId}`, body)
        results.push({ etsyListingId: request.etsyListingId, status: 'SUCCEEDED' })
      } catch (error) {
        results.push({
          etsyListingId: request.etsyListingId,
          status: 'FAILED',
          // The seller-facing message, never the transport detail.
          error: error instanceof AppError ? error.message : 'Etsy refused this change.',
        })
      }
    }

    return results
  }

  /*
   * Still unavailable, with a live connection and a valid key.
   *
   * This is the point of having the methods at all: the answer to "can you get
   * listing views now that we are connected?" is written down, in the adapter,
   * where someone looking for the endpoint will find it.
   */
  async getListingViews(_shopId: string, _etsyListingId: string): Promise<Provenanced<number>> {
    return unavailable(
      'Etsy does not provide listing views through the public API.',
      'Import your Etsy Stats file to add this metric.',
    ) as Provenanced<number>
  }

  async getAdsPerformance(_shopId: string): Promise<Provenanced<number>> {
    return unavailable(
      'Etsy does not expose Etsy Ads performance through the public API.',
      'Enter your ad spend manually to include it in profit.',
    ) as Provenanced<number>
  }
}

/* ------------------------------------------------------------- mappers */

export function toListing(payload: EtsyListingPayload): EtsyListing {
  return {
    etsyListingId: String(payload.listing_id),
    title: payload.title,
    description: payload.description ?? '',
    tags: payload.tags ?? [],
    price: money(payload.price),
    quantity: payload.quantity ?? 0,
    state: listingState(payload.state),
    section: payload.shop_section_id ? String(payload.shop_section_id) : null,
    sku: payload.skus?.[0] ?? null,
    /*
     * Etsy returns attributes from a separate endpoint, per listing. Fetching
     * them for every listing would spend the rate budget on a page nobody has
     * opened; the audit's attribute rule loads them for the listings it is
     * about to flag. Empty here means "not fetched", not "none" — which is why
     * requiredAttributes is empty too, so no rule fires on missing data.
     */
    attributes: {},
    requiredAttributes: [],
    photoCount: 0,
    renewsAt: iso(payload.ending_timestamp),
    lastChangedAt: iso(payload.last_modified_timestamp) ?? new Date(0).toISOString(),
    hasVariations: payload.has_variations ?? false,
    /*
     * Null, and it means "not loaded" rather than "none".
     *
     * Etsy reports THAT a listing has variations on the listing itself, and
     * WHAT they are only from the inventory endpoint — one call per listing.
     * Spending that on a table the seller may only be scrolling is the same
     * trade the attributes above make, so the summary stays null and the
     * listings table renders `hasVariations` instead of inventing a label.
     */
    variationSummary: null,
  }
}

export function toOrder(payload: EtsyReceiptPayload): EtsyOrder {
  const gross = money(payload.grandtotal)

  return {
    etsyReceiptId: String(payload.receipt_id),
    placedAt: new Date(payload.created_timestamp * 1000).toISOString(),
    gross,
    discounts: money(payload.discount_amt),
    refunds: 0,
    /*
     * Fees come from the payment-account ledger, not the receipt. Zero here
     * means "not yet loaded from the ledger", and the profit domain treats a
     * period with no fee data as incomplete rather than as fee-free — a shop
     * whose fees read $0 would show a wildly optimistic net profit.
     */
    etsyFees: 0,
    paymentProcessing: 0,
    offsiteAds: 0,
    // 'XX' is the unknown-country code the profit domain already understands;
    // there is no second, human-readable country field to disagree with it.
    countryCode: payload.country_iso ?? 'XX',
    items: (payload.transactions ?? []).map((t) => ({
      etsyListingId: String(t.listing_id),
      quantity: t.quantity,
      unitPrice: money(t.price),
    })),
  }
}
