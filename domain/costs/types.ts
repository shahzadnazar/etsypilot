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

export interface CostSettings {
  /** Fallback cost as a fraction of price, 0–1. Used where no listing cost is set. */
  defaultRulePercent: number
  shippingPerOrder: number
  labourTotal: number
  otherCosts: number
  /** Ad spend the seller entered for the period, or null when none was. */
  adSpend: number | null
}

export interface CostFieldSpec {
  key: keyof CostSettings
  label: string
  /** 'PERCENT' fields are entered as 0–100 and stored as 0–1. */
  kind: 'PERCENT' | 'MONEY'
  hint: string
  /** Null means the field may be left blank, and blank means unknown. */
  min: number
  max: number
  nullable: boolean
}

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
    hint: 'Applied as a share of price wherever a listing has no cost of its own. Your assumption, not a confirmed cost.',
    min: 0,
    max: 100,
    nullable: false,
  },
  {
    key: 'shippingPerOrder',
    label: 'Shipping per order',
    kind: 'MONEY',
    hint: 'What posting one order costs you on average, including packaging.',
    min: 0,
    max: 10_000,
    nullable: false,
  },
  {
    key: 'labourTotal',
    label: 'Your time, this period',
    kind: 'MONEY',
    hint: 'Hours you worked priced at whatever you decide they are worth. Zero is a choice, not a default.',
    min: 0,
    max: 1_000_000,
    nullable: false,
  },
  {
    key: 'otherCosts',
    label: 'Other costs, this period',
    kind: 'MONEY',
    hint: 'Software, studio rent, anything that is not materials or postage.',
    min: 0,
    max: 1_000_000,
    nullable: false,
  },
  {
    key: 'adSpend',
    label: 'Ad spend, this period',
    kind: 'MONEY',
    hint: 'Etsy does not expose ad spend through its API, so this cannot be verified. Leave it blank if you do not know — blank stays unknown and is never treated as zero.',
    min: 0,
    max: 1_000_000,
    nullable: true,
  },
]

export interface MissingCostRow {
  etsyListingId: string
  title: string
  price: number
  section: string | null
  /** What the default rule would charge this listing. Never a confirmed cost. */
  ruleCost: number
}
