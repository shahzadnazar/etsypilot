import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SELLER'S LISTING CATALOGUE. THE FIRST OF FIVE AGGREGATES, SO THE
 *   SHAPE HERE IS THE THING UNDER REVIEW, NOT THE SQL.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── THE ONE DECISION THAT MAKES THE REST SMALL ────────────────────────────
 *
 * The read returns `EtsyListing[]` — THE SAME TYPE THE ADAPTER RETURNS.
 *
 * Not a `StoredListing` with its own fields and a mapper into the domain. That
 * was the obvious design and it is the expensive one: every aggregate would
 * need a second shape, a second mapper, and a second place for the two to
 * drift. Returning the adapter's shape means domain/listings/service.ts is
 * unchanged — the audit rules, the status derivation, the margin rule, the
 * filters and the paging all run on exactly what they ran on before. The only
 * thing that differs between a demo shop and a synced one is WHERE the array
 * came from.
 *
 * That is also the property this slice exists to prove. If the repository
 * returns the adapter's type, "sync from the mock today, from Etsy tomorrow"
 * and "read from the adapter today, from the database tomorrow" are the same
 * one-line change at the top of a service, five times over.
 *
 * THE COST, STATED: the database has to be able to hold everything
 * `EtsyListing` declares. It can — `attributes` and `required_attributes` are
 * jsonb, `tags` is jsonb — but a future adapter field with no column would be
 * a migration rather than a mapper tweak. That is the right place for the
 * friction: a field the adapter reports and we silently drop is the defect this
 * shape makes impossible to write by accident.
 *
 * ── SHOP SCOPING IS STRUCTURAL, NOT REMEMBERED ────────────────────────────
 *
 * Every exported function takes `shopId` as its FIRST parameter and every
 * query filters on it. There is no function here without one, and no function
 * that takes a list of shop ids — so there is no call that can read across
 * shops, which is a different thing from no call that happens to. The operator
 * console reads every shop and has lib/repositories/admin-reads-every-shop.ts
 * for it, deliberately separate; this is the seller path and it can only ever
 * see one.
 *
 * tests/unit/listings-repository.test.ts asserts both halves of that from the
 * source: a shopId first parameter on every export, and a shopId predicate in
 * every query.
 */

import { randomUUID } from 'node:crypto'
import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { writeAggregateSyncedAt } from '@/lib/repositories/sync-state'
import type { EtsyListing, ListingState } from '@/lib/etsy/interface'

/** The four states Etsy reports. Anything else in the column is not a state. */
const LISTING_STATES: readonly ListingState[] = ['ACTIVE', 'DRAFT', 'INACTIVE', 'EXPIRED']

function asListingState(raw: string): ListingState {
  /*
   * `listings.state` is a text column, so the database cannot promise the
   * four. A row holding something else is a row written by something that is
   * not this file, and ACTIVE would be the dangerous guess — it would put an
   * unknown listing in front of the seller as live. INACTIVE is the quiet one.
   */
  return (LISTING_STATES as readonly string[]).includes(raw) ? (raw as ListingState) : 'INACTIVE'
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null
}

/**
 * Every listing this shop has, as the adapter would have returned them.
 *
 * REMOVED LISTINGS ARE NOT HERE. `removed_at is null` is the filter, and it is
 * the reason removal did not have to become a sixth ListingStatus: a listing
 * Etsy no longer has never reaches a ListingRow, so the closed status list in
 * domain/listings/types.ts is untouched. The row survives because eight
 * foreign keys point at it — see db/migrations/0010.
 */
export async function readListings(shopId: string): Promise<EtsyListing[]> {
  const rows = await getDb()
    .select()
    .from(schema.listings)
    .where(and(eq(schema.listings.shopId, shopId), isNull(schema.listings.removedAt)))
    .orderBy(schema.listings.etsyListingId)

  return rows.map((row) => ({
    etsyListingId: row.etsyListingId,
    title: row.title,
    description: row.description,
    tags: row.tags,
    price: Number(row.price),
    quantity: row.quantity,
    state: asListingState(row.state),
    section: row.section,
    sku: row.sku,
    attributes: row.attributes,
    requiredAttributes: row.requiredAttributes,
    photoCount: row.photoCount,
    renewsAt: iso(row.renewsAt),
    /*
     * `lastChangedAt` is NOT NULL in EtsyListing and nullable in the column,
     * because the column predates the interface. Falling back to the epoch
     * would put "56 years ago" in a column headed "Last changed"; falling back
     * to now would claim the listing changed at page load. The row's own
     * renewal date is the closest true thing, and failing that the sync's own
     * clock is at least a real instant this product can account for.
     */
    lastChangedAt: iso(row.lastChangedAt) ?? iso(row.renewsAt) ?? new Date(0).toISOString(),
    hasVariations: false,
    /*
     * Null, meaning "not loaded" — which is what it is. EtsyService reports
     * variations as a SUMMARY STRING on the listing, not as rows, so the sync
     * has nothing to put in `listing_variations` and this repository does not
     * touch that table. The interface's own comment is explicit that null here
     * is "not loaded" and never "none", so this is the honest value rather
     * than a convenient one.
     */
    variationSummary: null,
  }))
}

/** How many listings this shop has, without materialising them. */
export async function countListings(shopId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.listings)
    .where(and(eq(schema.listings.shopId, shopId), isNull(schema.listings.removedAt)))
  return row?.total ?? 0
}

export interface ShopSyncState {
  /**
   * What the shop is called, from our own row.
   *
   * Here because the app shell needs it and was asking the ADAPTER for it,
   * which cannot answer in a live deployment without an Etsy API key — so
   * every seller screen returned 500 before any of them reached their own
   * data. The name and the currency are columns on `shops`; the connection
   * writes them (lib/repositories/etsy-connection.ts) and this reads them.
   */
  name: string
  currency: string
  /**
   * The shop's time basis. From our row, for the same reason the name is.
   *
   * Etsy's shop payload carries no timezone — live.ts's getShop() says so and
   * hardcodes 'UTC' as this product's single basis (D24) — so this column is
   * the only place it has ever lived. Shop Pulse needs it to bucket days, and
   * was asking the adapter, which is a 500 in a live deployment with no API
   * key.
   */
  timezone: string
  /** Null when no sync has ever completed. The distinction the UI turns on. */
  lastSyncedAt: string | null
}

/**
 * The shop's own facts the listings view needs, and whether it has ever synced.
 *
 * `lastSyncedAt` null is the whole reason this function exists. "No rows
 * because nothing has synced" and "no rows because the shop has none" are
 * different answers, and a count alone cannot tell them apart.
 */
export async function readShopSyncState(shopId: string): Promise<ShopSyncState | null> {
  const [row] = await getDb()
    .select({
      name: schema.shops.name,
      currency: schema.shops.currency,
      timezone: schema.shops.timezone,
      lastSyncedAt: schema.shops.lastSyncedAt,
    })
    .from(schema.shops)
    .where(eq(schema.shops.id, shopId))
    .limit(1)
  if (!row) return null
  return {
    name: row.name,
    currency: row.currency,
    timezone: row.timezone,
    lastSyncedAt: iso(row.lastSyncedAt),
  }
}

export interface ListingSyncOutcome {
  /** Inserted or updated from this run's payload. */
  upserted: number
  /** Present before, absent from Etsy now, newly dated. */
  removed: number
  /** Dated as removed before, back from Etsy now. */
  restored: number
}

/**
 * Refuse a price that is not a number, BEFORE the transaction opens.
 *
 * ── MEASURED, NOT ASSUMED, AND IT WAS A REAL HOLE ─────────────────────────
 *
 * `price` is numeric(12,2), and Postgres numeric accepts the literal 'NaN' as
 * a value — checked directly:
 *
 *     insert into p (v) values ('NaN') returning v;   ->   NaN
 *
 * So `String(Number.NaN)` is stored without complaint, and readListings' own
 * `Number(row.price)` reads it back as NaN. One such row would then poison
 * every figure computed from it: a NaN price makes a NaN margin, and a NaN
 * margin renders as a figure rather than as an absence. That is exactly the
 * failure the provenance classes exist to prevent — an unknown presented as a
 * number.
 *
 * ── WHY ONLY NON-FINITE, AND NOT OUT-OF-RANGE ─────────────────────────────
 *
 * Deliberately asymmetric. NaN and +/-Infinity are not decimals at all, and
 * Postgres is silent about the first and would coerce nothing useful from the
 * second, so this is the only place that can catch them. A price that is
 * merely too large IS rejected by Postgres, loudly: numeric(12,2) raises
 * "numeric field overflow" (SQLSTATE 22003). A check here would be a second,
 * weaker copy of a constraint the column already enforces, and the integration
 * suite uses that overflow as its mid-transaction poison precisely because it
 * is the database's own refusal rather than ours.
 *
 * Throws rather than skipping the listing. The sync's promise is "this is the
 * catalogue as of this instant"; dropping one listing and stamping
 * last_synced_at beside the rest would make that false, and silently.
 */
function assertStorablePrices(listings: readonly EtsyListing[]): void {
  for (const listing of listings) {
    if (!Number.isFinite(listing.price)) {
      throw new Error(
        `listing ${listing.etsyListingId} has a price that cannot be stored (${String(listing.price)}); refusing the sync rather than writing a non-numeric price`,
      )
    }
  }
}

/**
 * Replace this shop's catalogue with what the adapter just returned.
 *
 * ── RE-RUNNABLE, AND THE UNIQUE INDEX IS WHAT MAKES IT SO ─────────────────
 *
 * Upserted on (shop_id, etsy_listing_id), which `listings_shop_etsy_idx`
 * already enforces. So running the sync twice updates the same rows rather
 * than inserting a second set — and the row's own `id` is left alone by the
 * conflict branch, which matters because eight tables point at it. A sync that
 * re-minted ids would orphan every cost rule and every audit issue.
 *
 * ── ONE TRANSACTION, FOR THE SAME REASON THE CONNECTION IS ────────────────
 *
 * The upserts, the removals and `shops.last_synced_at` are one fact: "this is
 * the catalogue as of this instant". A partial apply would leave rows from two
 * different moments with a timestamp claiming one of them — and
 * `last_synced_at` is what the UI uses to tell "never synced" from "synced and
 * empty", so a timestamp written beside an incomplete catalogue is the one
 * value that must not be optimistic.
 */
export async function writeSyncedListings(
  shopId: string,
  listings: readonly EtsyListing[],
  syncedAt: Date = new Date(),
): Promise<ListingSyncOutcome> {
  assertStorablePrices(listings)

  const seen = listings.map((listing) => listing.etsyListingId)

  return getDb().transaction(async (tx) => {
    /*
     * COUNTED BEFORE THE UPSERTS, which is the only moment it is knowable.
     *
     * The first version counted afterwards and could not: `returning` on a
     * conflict branch reports the row AFTER the update, by which time
     * `removed_at` is already null and cannot say whether it was null before.
     * The count came out 0 every time — a field that is always zero is worse
     * than no field, because it reads as "nothing was restored".
     */
    const restoredRows =
      seen.length > 0
        ? await tx
            .select({ etsyListingId: schema.listings.etsyListingId })
            .from(schema.listings)
            .where(
              and(
                eq(schema.listings.shopId, shopId),
                inArray(schema.listings.etsyListingId, seen),
                isNotNull(schema.listings.removedAt),
              ),
            )
        : []
    const restored = restoredRows.length

    if (listings.length > 0) {
      /*
       * Row by row rather than one multi-value insert. The catalogue is
       * hundreds, not millions, and a loop keeps the conflict target and the
       * updated columns readable — which is what the next four aggregates will
       * copy. If a shop ever has enough listings for this to matter, batching
       * is a change inside this function and nowhere else.
       */
      for (const listing of listings) {
        const values = {
          shopId,
          etsyListingId: listing.etsyListingId,
          title: listing.title,
          description: listing.description,
          tags: listing.tags,
          price: String(listing.price),
          quantity: listing.quantity,
          state: listing.state,
          section: listing.section,
          sku: listing.sku,
          attributes: listing.attributes,
          requiredAttributes: listing.requiredAttributes,
          photoCount: listing.photoCount,
          renewsAt: listing.renewsAt ? new Date(listing.renewsAt) : null,
          lastChangedAt: listing.lastChangedAt ? new Date(listing.lastChangedAt) : null,
          /*
           * CLEARED on every upsert, which is how a relisted listing comes
           * back. Etsy returning it means it is there; keeping an old removal
           * date beside a present listing would be the same contradiction
           * `revoked_at` beside a live token would be.
           */
          removedAt: null,
        }

        await tx
          .insert(schema.listings)
          .values({ id: `listing_${randomUUID()}`, ...values })
          .onConflictDoUpdate({
            target: [schema.listings.shopId, schema.listings.etsyListingId],
            // `id` is deliberately absent: it is referenced by eight tables.
            set: {
              title: values.title,
              description: values.description,
              tags: values.tags,
              price: values.price,
              quantity: values.quantity,
              state: values.state,
              section: values.section,
              sku: values.sku,
              attributes: values.attributes,
              requiredAttributes: values.requiredAttributes,
              photoCount: values.photoCount,
              renewsAt: values.renewsAt,
              lastChangedAt: values.lastChangedAt,
              removedAt: null,
            },
          })
      }
    }

    /*
     * ── WHAT ETSY NO LONGER HAS ─────────────────────────────────────────
     *
     * Dated, not deleted — db/migrations/0010 has the argument, and the short
     * version is that `events` is append-only and `order_items` records that
     * the listing sold. Removing a listing from Etsy does not unsell it.
     *
     * `isNull(removedAt)` in the predicate so a listing that has been gone for
     * a month is not re-dated on every sync. The date means "when we first
     * found it gone", which is the only reading that can answer a seller
     * asking when their listing vanished.
     */
    const removedRows =
      seen.length > 0
        ? await tx
            .update(schema.listings)
            .set({ removedAt: syncedAt })
            .where(
              and(
                eq(schema.listings.shopId, shopId),
                isNull(schema.listings.removedAt),
                notInArray(schema.listings.etsyListingId, seen),
              ),
            )
            .returning({ etsyListingId: schema.listings.etsyListingId })
        : await tx
            .update(schema.listings)
            .set({ removedAt: syncedAt })
            .where(and(eq(schema.listings.shopId, shopId), isNull(schema.listings.removedAt)))
            .returning({ etsyListingId: schema.listings.etsyListingId })

    /*
     * ── AND THE TIMESTAMP THE WHOLE UI TURNS ON ─────────────────────────
     *
     * `shops.last_synced_at` has existed since 0000 and has never been
     * written, which is why components/layout/shop-context.tsx can only ever
     * say "Static data · no sync". Written here, inside the same transaction,
     * so it is never ahead of the rows it describes.
     */
    /*
     * ── PER AGGREGATE SINCE ORDERS ARRIVED ──────────────────────────────
     *
     * This wrote only `shops.last_synced_at`, which could not say WHICH
     * aggregate had been read. A second aggregate made that ambiguous and a
     * fifth would make it useless, so sync_state carries one row per (shop,
     * aggregate) and writeAggregateSyncedAt writes both — the aggregate's own
     * row and the shop's shell-facing timestamp — inside this transaction.
     */
    await writeAggregateSyncedAt(tx, shopId, 'LISTINGS', syncedAt)

    return { upserted: listings.length, removed: removedRows.length, restored }
  })
}
