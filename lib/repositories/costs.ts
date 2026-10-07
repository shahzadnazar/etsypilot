import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SELLER'S OWN COSTS. THE THIRD AGGREGATE, AND THE FIRST ONE THE
 *   SELLER AUTHORS RATHER THAN ONE WE READ FROM ETSY.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Listings and orders arrive from an adapter and we store them. Costs are
 * typed by a person, which changes three things: who may write (assertCanWrite,
 * so a demo shop cannot), what the trail is (cost_rules.actorId, which is why
 * this table is append-only), and what happens to last month's profit when a
 * rule changes. The third is a product decision and it is stated in
 * `currentCostRules` below.
 *
 * ── THE MODEL: cost_rules IS REAL, CostSettings IS A VIEW OVER IT ──────────
 *
 * domain/costs/store.ts held five scalars in a module-level Map and named its
 * own replacement — "The Drizzle `shop_cost_settings` row replaces it" — and
 * that table was never built. It should not be. /profit already says "52
 * listings without a product cost" and "Costs are confirmed for 83% of order
 * value": claims about per-listing costs that five shop-wide numbers cannot
 * express. cost_rules can, and carries actorId and createdAt besides.
 *
 * So the five scalars become a projection of the DEFAULT-scope rules, and
 * FIELD_RULES below is the only place that mapping exists.
 *
 * ── SHOP SCOPING IS STRUCTURAL, NOT REMEMBERED ────────────────────────────
 *
 * Every exported function takes `shopId` as its FIRST parameter and every
 * statement filters on it. tests/unit/costs-repository.test.ts runs the same
 * sweep the listings and orders repositories get.
 */

import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import type { CostSettings } from '@/domain/costs/types'

export type CostKind = 'COGS' | 'SHIPPING' | 'LABOUR' | 'OTHER' | 'ADS'
export type CostScope = 'DEFAULT' | 'LISTING' | 'VARIATION'
export type CostValueType = 'PERCENT' | 'FIXED'

/**
 * The one place the five-scalar form maps onto the rule table.
 *
 * ── THE PER-ORDER / PER-PERIOD WART, NAMED ────────────────────────────────
 *
 * `valueType` says PERCENT or FIXED and nothing says whether a FIXED value is
 * charged per order or per period. SHIPPING is per order; LABOUR, OTHER and
 * ADS are per period. That distinction lives in `basis` here and nowhere else,
 * so a reader has one table to consult rather than four call sites to compare
 * — and tests/unit/costs-repository.test.ts asserts no other file decides it.
 */
export const FIELD_RULES = [
  { field: 'defaultRulePercent', costKind: 'COGS', valueType: 'PERCENT', basis: 'OF_PRICE' },
  { field: 'shippingPerOrder', costKind: 'SHIPPING', valueType: 'FIXED', basis: 'PER_ORDER' },
  { field: 'labourTotal', costKind: 'LABOUR', valueType: 'FIXED', basis: 'PER_PERIOD' },
  { field: 'otherCosts', costKind: 'OTHER', valueType: 'FIXED', basis: 'PER_PERIOD' },
  { field: 'adSpend', costKind: 'ADS', valueType: 'FIXED', basis: 'PER_PERIOD' },
] as const satisfies readonly {
  field: keyof CostSettings
  costKind: CostKind
  valueType: CostValueType
  basis: 'OF_PRICE' | 'PER_ORDER' | 'PER_PERIOD'
}[]

/*
 * The five DEFAULT-scope rules, flattened. SAME TYPE the form posts.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   A COST NOBODY HAS ENTERED IS ABSENT. NOT ZERO, AND NOT THE DEMO SHOP'S.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `CostSettings` typed four of its five fields as plain `number`, so the store
 * had to invent values for a seller who had set nothing — and what it invented
 * was DEMO_COST_INPUTS. Measured in a browser, in live mode, on a real
 * account: the settings form offered `defaultRulePercent 38.0` and
 * `shippingPerOrder 2.6187214611872145`, which is DEMO_TOTALS.shipping /
 * DEMO_TOTALS.orderCount, unrounded, presented as that seller's own postage.
 *
 * All five are nullable now, and this is an ALIAS rather than a second
 * interface: the repository's view of a shop's default rules and the form's
 * five fields are the same five facts, and two names for one shape is how they
 * drift. domain/costs/types.ts owns the definition because that is where the
 * form vocabulary lives.
 */
export type SellerCosts = CostSettings

export const NO_SELLER_COSTS: SellerCosts = {
  defaultRulePercent: null,
  shippingPerOrder: null,
  labourTotal: null,
  otherCosts: null,
  adSpend: null,
}

function numeric(raw: string | null): number | null {
  if (raw === null) return null
  const parsed = Number(raw)
  /*
   * A stored value that is not a number reads as UNKNOWN, not as zero. Postgres
   * numeric accepts the literal 'NaN' — found while building the listings
   * slice — and a NaN cost would make a NaN margin, which renders as a figure.
   */
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The rules in force for this shop, newest row per key.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   A RULE CHANGE RESTATES HISTORY. THAT IS A DECISION, NOT AN OVERSIGHT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Profit is computed from the rules in force AT READ TIME, so correcting a
 * COGS percentage today changes what last month's profit says. The
 * alternative — freezing each order's cost when it was synced — was rejected
 * on three grounds:
 *
 *   1. cost_rules cannot date a rule's VALIDITY. `createdAt` is when the row
 *      was written, not when the cost took effect, and a snapshot "from the
 *      rules then in force" needs the second. Inventing it from the first
 *      would be an authored figure dressed as a measurement.
 *
 *   2. The ordinary sequence is orders first, costs later. A seller connects,
 *      syncs months of history, then sets up costs — so freezing at sync time
 *      would leave every seller's entire back catalogue permanently uncosted,
 *      with no way to fix it.
 *
 *   3. A seller editing a cost percentage is almost always CORRECTING it, not
 *      recording that their supplier's prices moved. Restating is what they
 *      mean.
 *
 * The cost of this decision is real and the screen must own it: last month's
 * net profit is not a fixed number. components/profit/profit-tabs.tsx says so
 * in words, next to the figure, rather than leaving a seller to discover that
 * a number they wrote down has moved.
 *
 * `order_items.cost_snapshot` therefore stays NULL, and its schema comment
 * stays true: "null means this order has no confirmed cost and is EXCLUDED
 * from profit rather than given an assumed one". It is the column that would
 * hold the frozen answer, and it will not be written until a rule can say
 * when it applied.
 */
export async function currentCostRules(shopId: string): Promise<SellerCosts> {
  /*
   * Every DEFAULT row, newest first, reduced to one per kind in JS.
   *
   * The first draft of this was a `distinct on (cost_kind)` subquery, and it
   * was wrong twice: it put the shop predicate inside a raw SQL template where
   * tests/unit/costs-repository.test.ts could not see it, and a reader had to
   * trust an aliased subquery to know the read was scoped. A shop's own rule
   * history is small — append-only, but bounded by how often one person edits
   * a form — so fetching it and taking the first per kind is both clearer and
   * visibly shop-scoped. `cost_rules_current_idx` serves the ordering.
   */
  const rows = await getDb()
    .select({ costKind: schema.costRules.costKind, value: schema.costRules.value })
    .from(schema.costRules)
    .where(and(eq(schema.costRules.shopId, shopId), eq(schema.costRules.scope, 'DEFAULT')))
    .orderBy(desc(schema.costRules.createdAt), desc(schema.costRules.id))

  const newestPerKind = new Map<string, string | null>()
  for (const row of rows) {
    if (!newestPerKind.has(row.costKind)) newestPerKind.set(row.costKind, row.value)
  }

  return {
    defaultRulePercent: fieldValue(newestPerKind, 'defaultRulePercent'),
    shippingPerOrder: fieldValue(newestPerKind, 'shippingPerOrder'),
    labourTotal: fieldValue(newestPerKind, 'labourTotal'),
    otherCosts: fieldValue(newestPerKind, 'otherCosts'),
    adSpend: fieldValue(newestPerKind, 'adSpend'),
  }
}

/** One field's current value, via FIELD_RULES so the mapping stays in one place. */
function fieldValue(
  newestPerKind: Map<string, string | null>,
  field: keyof CostSettings,
): number | null {
  const spec = FIELD_RULES.find((entry) => entry.field === field)
  if (!spec) throw new Error(`no cost rule mapping for field ${field}`)
  return numeric(newestPerKind.get(spec.costKind) ?? null)
}

/**
 * Per-listing confirmed costs: Etsy listing id -> unit cost in money.
 *
 * These are the "confirmed" costs the coverage figure counts. A listing with a
 * rule here is costed from a number the seller gave for that listing; one
 * without falls to the default rule IF the seller set one, and is excluded
 * otherwise.
 *
 * Keyed by Etsy listing id rather than our own row id, because that is what
 * the domain's cost map and `EtsyListing` speak. The join lives here so no
 * caller has to know the rule table points at `listings.id`.
 */
export async function currentListingCosts(shopId: string): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({
      listingId: schema.costRules.listingId,
      etsyListingId: schema.listings.etsyListingId,
      value: schema.costRules.value,
    })
    .from(schema.costRules)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.costRules.listingId))
    .where(
      and(
        eq(schema.costRules.shopId, shopId),
        /*
         * BOTH sides scoped, deliberately. The join could rely on the rule's
         * own shop_id alone — a rule and its listing always share a shop — but
         * that holds only as long as nothing ever writes a rule pointing at
         * another shop's listing, which is exactly what writeListingCost
         * checks for and exactly the kind of invariant a guard should not
         * assume.
         */
        eq(schema.listings.shopId, shopId),
        eq(schema.costRules.scope, 'LISTING'),
        eq(schema.costRules.costKind, 'COGS'),
      ),
    )
    .orderBy(desc(schema.costRules.createdAt), desc(schema.costRules.id))

  const out = new Map<string, number>()
  const seen = new Set<string>()
  for (const row of rows) {
    const key = row.listingId
    if (key === null || seen.has(key)) continue
    seen.add(key)
    const value = numeric(row.value)
    // A retracted rule is not a cost of zero, so it is simply not in the map.
    if (value !== null) out.set(row.etsyListingId, value)
  }
  return out
}

export interface CostRuleWrite {
  field: keyof CostSettings
  /** Null RETRACTS the rule. It does not set it to zero. */
  value: number | null
}

/**
 * Record the seller's default-scope rules. One INSERT per changed field.
 *
 * ── ONLY WHAT CHANGED, BECAUSE THE ROWS ARE THE AUDIT TRAIL ───────────────
 *
 * A save that re-inserted all five fields every time would fill the trail with
 * rows nobody changed, and the route's own comment already holds this line for
 * the audit log: "If nothing actually changed, nothing is recorded — a log
 * padded with no-op entries is a log nobody reads." The same applies here, and
 * more so, because these rows ARE the history.
 */
export async function writeCostRules(
  shopId: string,
  actorId: string,
  writes: readonly CostRuleWrite[],
): Promise<{ written: number }> {
  if (writes.length === 0) return { written: 0 }

  const current = await currentCostRules(shopId)
  const changed = writes.filter((write) => current[write.field] !== write.value)
  if (changed.length === 0) return { written: 0 }

  const specs = new Map(FIELD_RULES.map((spec) => [spec.field, spec]))
  await getDb()
    .insert(schema.costRules)
    .values(
      changed.map((write) => {
        const spec = specs.get(write.field)
        if (!spec) throw new Error(`no cost rule mapping for field ${write.field}`)
        return {
          id: `cost_${randomUUID()}`,
          shopId,
          actorId,
          scope: 'DEFAULT' as const,
          listingId: null,
          variationId: null,
          valueType: spec.valueType,
          value: write.value === null ? null : String(write.value),
          costKind: spec.costKind,
        }
      }),
    )
  return { written: changed.length }
}

/**
 * Record a per-listing confirmed cost, or retract one with null.
 *
 * `listingId` is OUR row id, and it is checked against this shop before the
 * insert. The foreign key would catch a listing that does not exist; it would
 * NOT catch another shop's listing, which is the one that matters.
 */
export async function writeListingCost(
  shopId: string,
  actorId: string,
  listingId: string,
  value: number | null,
): Promise<void> {
  const [owned] = await getDb()
    .select({ id: schema.listings.id })
    .from(schema.listings)
    .where(and(eq(schema.listings.shopId, shopId), eq(schema.listings.id, listingId)))
    .limit(1)
  if (!owned) throw new Error('listing does not belong to this shop')

  await getDb()
    .insert(schema.costRules)
    .values({
      id: `cost_${randomUUID()}`,
      shopId,
      actorId,
      scope: 'LISTING',
      listingId,
      variationId: null,
      valueType: 'FIXED',
      value: value === null ? null : String(value),
      costKind: 'COGS',
    })
}

export interface CostRuleHistoryRow {
  costKind: string
  scope: string
  value: number | null
  actorId: string | null
  at: string
}

/**
 * The trail, newest first. What append-only buys.
 *
 * Every row ever written for this shop, so a seller can see that their default
 * rule was 38% until the 6th and 41.5% after it, and who changed it. The
 * current-value reads above take the first row per key; this takes all of them.
 */
export async function costRuleHistory(
  shopId: string,
  limit = 100,
): Promise<CostRuleHistoryRow[]> {
  const rows = await getDb()
    .select({
      costKind: schema.costRules.costKind,
      scope: schema.costRules.scope,
      value: schema.costRules.value,
      actorId: schema.costRules.actorId,
      at: schema.costRules.createdAt,
    })
    .from(schema.costRules)
    .where(eq(schema.costRules.shopId, shopId))
    .orderBy(desc(schema.costRules.createdAt), desc(schema.costRules.id))
    .limit(limit)

  return rows.map((row) => ({
    costKind: row.costKind,
    scope: row.scope,
    value: numeric(row.value),
    actorId: row.actorId,
    at: row.at.toISOString(),
  }))
}

/** How many rules this shop has ever set. Zero means "has set nothing". */
export async function countCostRules(shopId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.costRules)
    .where(eq(schema.costRules.shopId, shopId))
  return row?.total ?? 0
}
