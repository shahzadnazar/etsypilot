/*
 * The listings manager (artboard 36).
 *
 * The row model exists so the table cannot invent anything. Three fields carry
 * most of the weight:
 *
 *   status   derived from the listing's state and its renewal date, not stored.
 *            "Expiring" is not an Etsy state — it is ACTIVE plus a renewal
 *            inside the window, which is why the window is a parameter.
 *
 *   health   run from the SAME rule set as the Listing Audit, so the two
 *            screens cannot disagree about whether a listing has errors.
 *
 *   margin   null wherever no confirmed cost exists. Never the default rule's
 *            figure: the Costs page already names that an assumption, and
 *            printing it in a column headed "Margin" would launder it into a
 *            fact (D65).
 */

export const LISTING_STATUSES = ['ACTIVE', 'EXPIRING', 'DRAFT', 'EXPIRED', 'INACTIVE'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const STATUS_LABEL: Record<ListingStatus, string> = {
  ACTIVE: 'Active',
  EXPIRING: 'Expiring',
  DRAFT: 'Draft',
  EXPIRED: 'Expired',
  INACTIVE: 'Inactive',
}

export const HEALTH_KINDS = ['GOOD', 'NEEDS_WORK', 'ERRORS'] as const
export type HealthKind = (typeof HEALTH_KINDS)[number]

export interface ListingHealth {
  kind: HealthKind
  errors: number
  warnings: number
}

/** "Good", "Needs work", "3 errors" — derived from the counts, never typed. */
export function healthLabel(health: ListingHealth): string {
  if (health.kind === 'ERRORS') {
    return `${health.errors} ${health.errors === 1 ? 'error' : 'errors'}`
  }
  return health.kind === 'NEEDS_WORK' ? 'Needs work' : 'Good'
}

export interface ListingRow {
  etsyListingId: string
  title: string
  sku: string | null
  tagCount: number
  hasVariations: boolean
  /** "3 sizes", or null when the adapter did not load inventory. */
  variationSummary: string | null
  status: ListingStatus
  price: number
  /** Null for a digital listing, which has no finite quantity. */
  quantity: number | null
  section: string | null
  renewsAt: string | null
  health: ListingHealth
  /** Null wherever no confirmed cost exists. Never a rule-derived figure. */
  margin: number | null
  lastChangedAt: string
}

export interface ListingFilters {
  q: string
  status: ListingStatus | 'ALL'
  health: HealthKind | 'ALL'
  section: string | 'ALL'
  page: number
}
