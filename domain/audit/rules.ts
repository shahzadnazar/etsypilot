/*
 * Listing audit rules.
 *
 * Fourteen rules, each one either a documented Etsy requirement or a threshold
 * the seller set. Nothing here encodes a guess about Etsy's ranking algorithm,
 * and the copy says so: a rule may say "unused tag slots reduce the terms a
 * listing can match", which is mechanical, and may never say "this will rank
 * higher", which would be a claim about a system nobody outside Etsy can see.
 *
 * Each rule states:
 *   why  - what the seller loses, in mechanical terms
 *   fix  - what to do, and whether the bulk editor can do it
 *
 * `bulkFixable` is what wires the audit into the loop: an issue that a bulk
 * operation can resolve hands the selected listings to the Safe Bulk Editor,
 * which validates, diffs and requires confirmation like any other write.
 */

import type { EtsyListing } from '@/lib/etsy/interface'

export type Severity = 'ERROR' | 'WARNING'

export interface AuditRule {
  code: string
  label: string
  severity: Severity
  /** Errors that stop Etsy accepting an update at all. */
  blocksPublishing: boolean
  why: string
  fix: string
  /** True where the Safe Bulk Editor can apply the fix across listings. */
  bulkFixable: boolean
  /** Runs against one listing. Extra context is threaded via RuleContext. */
  test: (listing: EtsyListing, ctx: RuleContext) => boolean
}

export interface RuleContext {
  /** Confirmed per-listing product cost, where one exists. */
  costs: Map<string, number>
  /** Tags appearing on more than one listing in the shop. */
  duplicatedTags: Set<string>
  /** Seller's own thresholds. Editable in Audit settings. */
  thresholds: {
    minTags: number
    maxTitleLength: number
    minPhotos: number
    minDescriptionLength: number
  }
}

export const DEFAULT_THRESHOLDS: RuleContext['thresholds'] = {
  minTags: 13,
  maxTitleLength: 140,
  minPhotos: 5,
  minDescriptionLength: 160,
}

/** Words too generic to identify a listing on their own. */
const BROAD_TAGS = new Set([
  'necklace', 'jewelry', 'gift', 'handmade', 'art', 'mug', 'print', 'decor', 'custom', 'home',
])

export const AUDIT_RULES: AuditRule[] = [
  {
    code: 'MISSING_REQUIRED_ATTRIBUTE',
    label: 'Missing required attribute',
    severity: 'ERROR',
    blocksPublishing: true,
    why: 'Etsy requires category-specific attributes such as metal purity or material. Listings without them cannot be updated through the API and may rank lower in category browsing.',
    fix: 'Set the attribute once per listing, or apply one value across every listing where the material is identical.',
    bulkFixable: true,
    test: (l) => l.requiredAttributes.some((key) => !l.attributes[key]),
  },
  {
    code: 'BELOW_COST',
    label: 'Sells below cost',
    severity: 'ERROR',
    blocksPublishing: false,
    why: 'Price minus Etsy fees minus your product cost is negative, so every sale loses money.',
    fix: 'Raise the price to your margin floor, or reduce the cost.',
    bulkFixable: true,
    test: (l, ctx) => {
      const cost = ctx.costs.get(l.etsyListingId)
      if (cost === undefined) return false // Unknown cost is not a finding. It is a gap.
      const fees = l.price * 0.095 + 0.2
      return l.price - fees - cost < 0
    },
  },
  {
    code: 'ACTIVE_OUT_OF_STOCK',
    label: 'Active but out of stock',
    severity: 'ERROR',
    blocksPublishing: false,
    why: 'An active listing with zero quantity can be found but not bought.',
    fix: 'Restock it, or deactivate it until you can.',
    bulkFixable: true,
    test: (l) => l.state === 'ACTIVE' && l.quantity === 0,
  },
  {
    code: 'FEW_TAGS',
    label: `Fewer than ${DEFAULT_THRESHOLDS.minTags} tags`,
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'Unused tag slots reduce the terms a listing can match. Etsy allows 13.',
    fix: 'Fill the remaining slots from a keyword list — review each addition before publishing.',
    bulkFixable: true,
    test: (l, ctx) => l.tags.length < ctx.thresholds.minTags,
  },
  {
    code: 'TITLE_TOO_LONG',
    label: `Title over ${DEFAULT_THRESHOLDS.maxTitleLength} characters`,
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'Etsy truncates long titles in search results and on small screens, so the end of the title is not read.',
    fix: 'Shorten to the words a buyer would actually type.',
    bulkFixable: false,
    test: (l, ctx) => l.title.length > ctx.thresholds.maxTitleLength,
  },
  {
    code: 'FEW_PHOTOS',
    label: `Fewer than ${DEFAULT_THRESHOLDS.minPhotos} photos`,
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'Listings with more photos give a buyer more to check before deciding. Etsy allows 10.',
    fix: 'Add scale, detail and in-use shots.',
    bulkFixable: false,
    test: (l, ctx) => l.photoCount < ctx.thresholds.minPhotos,
  },
  {
    code: 'DUPLICATE_TAGS',
    label: 'Duplicate tags across listings',
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'Identical tags across many listings make them compete with each other for the same term.',
    fix: 'Differentiate the tags on your closest variants.',
    bulkFixable: true,
    test: (l, ctx) => l.tags.filter((t) => ctx.duplicatedTags.has(t)).length >= 4,
  },
  {
    code: 'TAG_IN_TITLE',
    label: 'Tag duplicates the title',
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'A tag that repeats a phrase already in the title spends a slot on a term the listing already matches.',
    fix: 'Replace it with a term the title does not contain.',
    bulkFixable: true,
    test: (l) => {
      const title = l.title.toLowerCase()
      return l.tags.some((t) => t.length > 6 && title.includes(t.toLowerCase()))
    },
  },
  {
    code: 'TAG_TOO_BROAD',
    label: 'Tag is too broad to rank',
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'Single generic words compete with millions of listings, so the slot returns very little.',
    fix: 'Use a two- or three-word phrase a buyer would type.',
    bulkFixable: true,
    test: (l) => l.tags.some((t) => BROAD_TAGS.has(t.trim().toLowerCase())),
  },
  {
    code: 'MISSING_SKU',
    label: 'No SKU set',
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'Without a SKU, costs and supplier invoices cannot be matched to this listing, so its profit stays unknown.',
    fix: 'Set a SKU, then import costs against it.',
    bulkFixable: true,
    test: (l) => !l.sku,
  },
  {
    code: 'SHORT_DESCRIPTION',
    label: 'Description under 160 characters',
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'A short description leaves a buyer with unanswered questions about materials, size and delivery.',
    fix: 'Cover materials, dimensions and what arrives in the box.',
    bulkFixable: false,
    test: (l, ctx) => l.description.trim().length < ctx.thresholds.minDescriptionLength,
  },
  {
    code: 'TITLE_REPEATS_WORD',
    label: 'Title repeats a word',
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'Repeating a word does not add a term; it spends characters that could carry a different one.',
    fix: 'Remove the duplicate and use the space for a term you do not already have.',
    bulkFixable: false,
    test: (l) => {
      const words = l.title.toLowerCase().match(/[a-z]{4,}/g) ?? []
      const seen = new Set<string>()
      return words.some((w) => (seen.has(w) ? true : (seen.add(w), false)))
    },
  },
  {
    code: 'NO_SECTION',
    label: 'Not in a shop section',
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'Listings outside a section are harder to browse and are excluded from section links you share.',
    fix: 'Assign a section.',
    bulkFixable: true,
    test: (l) => !l.section,
  },
  {
    code: 'RENEWS_SOON',
    label: 'Renews within 7 days',
    severity: 'WARNING',
    blocksPublishing: false,
    why: 'A renewal charges the listing fee again. Worth checking before it happens on a listing that has not sold.',
    fix: 'Review the listing, or let it expire if it is not earning.',
    bulkFixable: false,
    test: (l) => {
      if (!l.renewsAt) return false
      const days = (Date.parse(l.renewsAt) - Date.parse(AUDIT_NOW)) / 86_400_000
      return days >= 0 && days <= 7
    },
  },
]

/**
 * Fixed "now" for the demo, in UTC (D24).
 *
 * Not Date.now(): a rule that depends on the wall clock produces a different
 * audit on every render, which makes the screen impossible to test and the
 * health score impossible to compare with last week's.
 */
export const AUDIT_NOW = '2026-08-20T00:00:00.000Z'

if (AUDIT_RULES.length !== 14) {
  throw new Error(`The audit advertises 14 rules and has ${AUDIT_RULES.length}.`)
}
