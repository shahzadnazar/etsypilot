/*
 * Cost settings — the seller's own numbers.
 *
 * Everything in here is SELLER_INPUT. Nothing on this surface is read from
 * Etsy, and nothing on it can be written back: changing a cost changes what
 * EtsyPilot calculates, never what a buyer pays or what a listing says.
 *
 * `adSpend` is nullable on purpose. Etsy exposes no ads endpoint (see
 * EtsyService.getAdsPerformance, which can only ever return UNAVAILABLE), so
 * the honest states are "the seller typed a figure" and "nobody knows" — not
 * zero, which would silently improve the profit waterfall.
 */

/*
 * ══════════════════════════════════════════════════════════════════════════
 *   THIS IS A VIEW OVER cost_rules, NOT A MODEL OF ITS OWN.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * cost_rules is the real model: per-listing and per-variation scope, a cost
 * kind, a value type, an actor and a timestamp. /profit already speaks that
 * language — "52 listings without a product cost", "Costs are confirmed for
 * 83% of order value" — and five shop-wide scalars cannot carry a per-listing
 * cost at all.
 *
 * What these five ARE is the settings FORM: the DEFAULT-scope rules, flattened
 * into the shape a five-field form posts. lib/repositories/costs.ts holds the
 * mapping (FIELD_RULES) and nothing else may duplicate it.
 *
 * domain/costs/store.ts used to hold these in a module-level Map and its own
 * header named the replacement — "The Drizzle `shop_cost_settings` row
 * replaces it". That table was never built and should not be; cost_rules
 * already existed and nothing wrote it.
 *
 * ── EVERY FIELD NULLABLE, WHICH IS THE WHOLE CORRECTION ───────────────────
 *
 * Four of these were plain `number`, so a seller who had set nothing had to be
 * given four numbers — and what the store gave them was DEMO_COST_INPUTS, the
 * Willow & Fern designed figures. Measured in a browser in live mode on a real
 * account: the form offered `defaultRulePercent 38.0` and `shippingPerOrder
 * 2.6187214611872145`, which is DEMO_TOTALS.shipping / DEMO_TOTALS.orderCount,
 * unrounded, labelled as that seller's own average postage.
 *
 * `adSpend` was already nullable and its reasoning is the reasoning for all
 * five: "the honest states are 'the seller typed a figure' and 'nobody knows'
 * — not zero, which would silently improve the profit waterfall."
 */
export interface CostSettings {
  /** Fallback cost as a fraction of price, 0–1. Null when the seller has set none. */
  defaultRulePercent: number | null
  shippingPerOrder: number | null
  labourTotal: number | null
  otherCosts: number | null
  /** Ad spend the seller entered for the period, or null when none was. */
  adSpend: number | null
}

export interface CostFieldSpec {
  key: keyof CostSettings
  label: string
  /** 'PERCENT' fields are entered as 0–100 and stored as 0–1. */
  kind: 'PERCENT' | 'MONEY'
  hint: string
  min: number
  max: number
}

/*
 * ── EVERY COST FIELD MAY BE LEFT BLANK, SO THERE IS NO PER-FIELD FLAG ─────
 *
 * CostFieldSpec carried `nullable`, true only for `adSpend`. That made four of
 * the five REQUIRED, which is why a new seller's blank form could not be
 * parsed at all and why the store had to invent a starting point for them —
 * DEMO_COST_INPUTS, as it turned out.
 *
 * Blank is now meaningful everywhere: it is how a seller says "I have not told
 * you", and how they retract a cost they set before. 0 remains available as
 * the different statement it is. With no field required, the flag and the
 * REQUIRED validation problem were both dead, so both are gone rather than
 * kept as branches nothing can reach.
 */

/*
 * One table drives the form, the validation and the tests.
 *
 * The alternative — a max in the input's `max` attribute, a second one in the
 * route, a third in a test — is how a bound gets tightened in one place and
 * left alone in the other two. Client attributes are a convenience; the route
 * validates against this same table because client input is never trusted.
 */
export const COST_FIELDS: CostFieldSpec[] = [
  {
    key: 'defaultRulePercent',
    label: 'Default cost rule',
    kind: 'PERCENT',
    hint: 'Applied as a share of price wherever a listing has no cost of its own. Your assumption, not a confirmed cost. Leave blank and nothing is applied \u2014 those orders are left out of profit rather than costed by a guess.',
    min: 0,
    max: 100,
  },
  {
    key: 'shippingPerOrder',
    label: 'Shipping per order',
    kind: 'MONEY',
    hint: 'What posting one order costs you on average, including packaging. Blank means we do not know; 0 means postage is free.',
    min: 0,
    max: 10_000,
  },
  {
    key: 'labourTotal',
    label: 'Your time, this period',
    kind: 'MONEY',
    hint: 'Hours you worked priced at whatever you decide they are worth. Zero is a choice, blank is not knowing, and neither is a default.',
    min: 0,
    max: 1_000_000,
  },
  {
    key: 'otherCosts',
    label: 'Other costs, this period',
    kind: 'MONEY',
    hint: 'Software, studio rent, anything that is not materials or postage. Blank means we do not know; 0 means there are none.',
    min: 0,
    max: 1_000_000,
  },
  {
    key: 'adSpend',
    label: 'Ad spend, this period',
    kind: 'MONEY',
    hint: 'Etsy does not expose ad spend through its API, so this cannot be verified. Leave it blank if you do not know — blank stays unknown and is never treated as zero.',
    min: 0,
    max: 1_000_000,
  },
]

export interface MissingCostRow {
  etsyListingId: string
  title: string
  price: number
  section: string | null
  /** What the default rule would charge this listing. Never a confirmed cost. */
  /**
   * What the seller's default rule would price this listing at, or NULL when
   * they have set no default rule.
   *
   * Null rather than 0: this is the column on the page that exists to show
   * which listings have no cost, and a confident 0.00 beside every one of them
   * would answer the page's own question wrongly.
   */
  ruleCost: number | null
}
