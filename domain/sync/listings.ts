import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE LISTINGS SYNC. WRITTEN AGAINST THE INTERFACE, FILLED FROM THE MOCK
 *   TODAY AND FROM ETSY THE DAY A KEY ARRIVES — WITH NO CHANGE TO THIS FILE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * That is the property this slice exists to prove, and it rests on one fact:
 * lib/etsy/index.ts is the only file that chooses an adapter, and both adapters
 * satisfy the same EtsyService. So this function never names an adapter. It
 * asks the selector for whichever one the deployment has and writes what comes
 * back.
 *
 * tests/integration/listings-sync.int.ts fills the table from MockEtsyService
 * and asserts the row count matches what the adapter returned. The same test
 * against LiveEtsyService is the same test with one env var different, which is
 * the whole claim.
 *
 * ── IT IS A FUNCTION, NOT A SCHEDULE ──────────────────────────────────────
 *
 * No timer, no queue, no cron. When and how often is a later decision and a
 * different kind of problem; this is the thing that would be called.
 *
 * ── assertCanWrite() IS THE GATE, AND IT IS EXACTLY THE RIGHT ONE ─────────
 *
 * `ctx.readOnly` is `shops.is_demo`, so this refuses a demo shop — which is
 * correct twice over. A demo shop has nothing to sync, and MockEtsyService's
 * catalogue must never be written into a seller's tables: once it were, the
 * figures would survive a switch to live mode and be served as that seller's
 * own. The last task found the same hazard from the other end (clearing
 * is_demo while the mock still served data), and this is the write-side half
 * of it.
 *
 * It also means the gate opens exactly when it should. A shop is `is_demo`
 * until an Etsy connection clears it, so the first thing that can legitimately
 * be synced is a shop that has just connected.
 */

import { getEtsyService } from '@/lib/etsy'
import { assertTermsAccepted } from '@/domain/legal/acceptance'
import { assertCanWrite, type ShopContext } from '@/lib/permissions'
import { writeSyncedListings, type ListingSyncOutcome } from '@/lib/repositories/listings'
import type { EtsyListing } from '@/lib/etsy/interface'

/**
 * How many listings to ask for per call.
 *
 * Etsy's listings endpoint caps at 100 and live.ts already clamps to it, so
 * this is the cap rather than a preference. The mock honours limit/offset the
 * same way, which is what lets the paging loop below be exercised today.
 */
export const SYNC_PAGE_SIZE = 100

/**
 * A ceiling on pages, so a misbehaving adapter cannot loop forever.
 *
 * NOT a limit on catalogue size that anyone should rely on: 200 pages is
 * 20,000 listings, well past Etsy's practical shop sizes. It exists because
 * `total` comes from the provider and a provider that reported a total it never
 * delivers would otherwise spin. Hit, it throws rather than silently syncing a
 * partial catalogue and stamping last_synced_at beside it.
 */
const MAX_PAGES = 200

export interface ListingSyncResult extends ListingSyncOutcome {
  /** What the adapter said the shop has, for comparison with `upserted`. */
  reportedTotal: number
  syncedAt: string
}

/**
 * Pull this shop's catalogue from whichever adapter the deployment has, and
 * write it.
 *
 * Re-runnable: the repository upserts on (shop_id, etsy_listing_id) and dates
 * what Etsy no longer has, so running it twice leaves the same rows rather than
 * two sets.
 */
export async function syncShopListings(ctx: ShopContext): Promise<ListingSyncResult> {
  assertCanWrite(ctx)
  /*
   * ── AND THE TERMS, BECAUSE §4 SAYS "BEFORE THEIR NEXT CONNECT OR SYNC" ──
   *
   * assertCanWrite answers "may this shop be written to". This answers a
   * different question: is there an accepted agreement with this seller for
   * the documents AS THEY ARE NOW. A seller who connected under one version
   * and whose documents have since changed materially is asked again here,
   * before any further Etsy data is read — which is the half of Etsy's API
   * Terms §4 that a one-time checkbox at connect would miss.
   *
   * After assertCanWrite, not before: a read-only shop should be told it is
   * read-only rather than asked to accept an agreement it cannot act on.
   */
  await assertTermsAccepted(ctx.shopId)

  const etsy = getEtsyService()
  const collected: EtsyListing[] = []
  let reportedTotal = 0
  let offset = 0

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { listings, total } = await etsy.getListings(ctx.shopId, {
      limit: SYNC_PAGE_SIZE,
      offset,
    })
    reportedTotal = total
    collected.push(...listings)

    /*
     * Stop on a short page, not on `collected.length >= total`. A provider
     * whose `total` is stale — a listing deleted between page 1 and page 3 —
     * would otherwise leave the loop one request early or one request short,
     * and the short page is the fact about what was actually delivered.
     */
    if (listings.length < SYNC_PAGE_SIZE) break
    offset += listings.length

    if (page === MAX_PAGES - 1) {
      throw new Error(
        `listings sync for ${ctx.shopId} exceeded ${MAX_PAGES} pages; refusing to stamp a partial catalogue`,
      )
    }
  }

  /*
   * De-duplicated before the write, by etsyListingId, keeping the LAST seen.
   *
   * Paging a live catalogue is not a snapshot: a listing can move between
   * pages while the loop runs and arrive twice. The unique index would reject
   * the second insert and abort the whole transaction, so a catalogue that
   * merely shifted under us would fail the sync entirely. Last wins because a
   * later page is the more recent read.
   */
  const byId = new Map(collected.map((listing) => [listing.etsyListingId, listing]))
  const listings = [...byId.values()]

  const syncedAt = new Date()
  const outcome = await writeSyncedListings(ctx.shopId, listings, syncedAt)

  return { ...outcome, reportedTotal, syncedAt: syncedAt.toISOString() }
}
