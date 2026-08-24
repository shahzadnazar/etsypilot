/*
 * The Etsy service interface.
 *
 * This is the load-bearing abstraction of the project. The UI never depends on
 * an Etsy API implementation - it depends on this contract, through a domain
 * service. Phase 11 swaps MockEtsyService for LiveEtsyService and nothing above
 * this file changes (architecture.md section 4).
 *
 * Note how refusal is modelled. There is no getSearchTerms at all — Etsy
 * releases nothing of the kind, so the interface does not pretend the question
 * can be asked. getListingViews and getAdsPerformance DO exist, and can only
 * ever return UNAVAILABLE with a null value: those two get asked about
 * constantly, so an explicit refusal carrying the reason is more useful than a
 * missing method a caller works around.
 *
 * (This comment used to claim all three were absent, which was true of one of
 * them. A file that misdescribes itself is the same defect as a figure that
 * misdescribes its source.)
 */

import type { Provenanced } from '@/lib/provenance/types'

export type ListingState = 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'EXPIRED'
export type ConnectionStatus = 'CONNECTED' | 'TOKEN_EXPIRED' | 'REVOKED' | 'DISCONNECTED' | 'DEMO'

export interface EtsyShop {
  etsyShopId: string
  name: string
  currency: string
  timezone: string
  connectionStatus: ConnectionStatus
  lastSyncedAt: string | null
  activeListingCount: number
  /** Scopes actually granted, so the UI can explain what breaks if revoked. */
  grantedScopes: string[]
}

export interface EtsyListing {
  etsyListingId: string
  title: string
  description: string
  tags: string[]
  price: number
  quantity: number
  state: ListingState
  section: string | null
  sku: string | null
  /** Category-specific attributes. A missing required one blocks publishing. */
  attributes: Record<string, string | null>
  requiredAttributes: string[]
  photoCount: number
  renewsAt: string | null
  lastChangedAt: string
  /**
   * Etsy reports this on the listing itself, so every adapter can fill it.
   */
  hasVariations: boolean
  /**
   * "3 sizes". Null when the adapter did not load inventory — that is a
   * separate call per listing, and null here means "not loaded", never "none".
   * A listing with no variations has hasVariations false and a null summary,
   * and the difference is the caller's to render.
   */
  variationSummary: string | null
}

export interface EtsyOrderItem {
  etsyListingId: string
  quantity: number
  unitPrice: number
}

export interface EtsyOrder {
  etsyReceiptId: string
  placedAt: string
  gross: number
  discounts: number
  refunds: number
  /** Verified fee lines, straight from the receipt. */
  etsyFees: number
  paymentProcessing: number
  offsiteAds: number
  countryCode: string
  items: EtsyOrderItem[]
}

export interface SyncStage {
  key: string
  label: string
  detail: string
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'QUEUED' | 'FAILED'
  current?: number
  total?: number
}

export interface SyncProgress {
  overallPercent: number
  etaSeconds: number | null
  stages: SyncStage[]
  /** Set when Etsy rate-limited us mid-sync. Nothing is lost. */
  rateLimitedUntil: string | null
}

export interface ListingWriteRequest {
  etsyListingId: string
  changes: Partial<Pick<EtsyListing, 'title' | 'description' | 'tags' | 'price' | 'quantity' | 'state'>>
}

export interface ListingWriteResult {
  etsyListingId: string
  status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED'
  /** User-safe. "Edited on Etsy while this job ran", not a stack trace. */
  error?: string
}

export interface EtsyService {
  /** True when this adapter cannot write. Demo mode is read-only by design. */
  readonly canWrite: boolean
  readonly mode: 'mock' | 'live'

  getShop(shopId: string): Promise<EtsyShop>
  getListings(shopId: string, opts?: { limit?: number; offset?: number }): Promise<{ listings: EtsyListing[]; total: number }>
  getListing(shopId: string, etsyListingId: string): Promise<EtsyListing | null>
  getOrders(shopId: string, opts?: { since?: string; until?: string }): Promise<EtsyOrder[]>
  getSyncProgress(shopId: string): Promise<SyncProgress>

  /**
   * Writes. Always a batch, always per-item results, so partial success is the
   * normal case rather than an edge case (PRD section 4.6).
   */
  applyListingChanges(shopId: string, requests: ListingWriteRequest[]): Promise<ListingWriteResult[]>

  /**
   * Metrics Etsy does not expose. These return UNAVAILABLE rather than a
   * modelled number - the interface makes refusing explicit.
   */
  getListingViews(shopId: string, etsyListingId: string): Promise<Provenanced<number>>
  getAdsPerformance(shopId: string): Promise<Provenanced<number>>
}
