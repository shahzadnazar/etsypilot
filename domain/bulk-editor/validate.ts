/*
 * Validation.
 *
 * Three outcomes, and the distinction between them is what the seller can do:
 *
 *   BLOCKED  the write would fail or is not permitted. Excluded automatically.
 *   WARNING  the write will succeed but not do what the seller probably meant.
 *            Included, and reported so it is a choice rather than a surprise.
 *   READY    nothing to say.
 *
 * SKIPPED is separate: the seller asked for it (the cost-floor toggle), so it is
 * neither a problem nor silent.
 */

import type { EtsyListing } from '@/lib/etsy/interface'
import { MAX_TAGS, proposeChanges } from './configure'
import type {
  FieldChange,
  ItemStatus,
  OperationItem,
  ValidationNote,
  ValidationSummary,
} from './types'

export interface ValidationContext {
  /** Per-listing cost, where the seller has supplied one. */
  costs: Map<string, number>
  /** Etsy's cut, for the cost-floor test. */
  feeRate: number
}

/** A note plus how much it matters. Status is derived from these, not mutated. */
type Severity = 'BLOCK' | 'SKIP' | 'WARN'
type Finding = ValidationNote & { severity: Severity }

export function validateListing(
  listing: EtsyListing,
  changes: FieldChange[],
  ctx: ValidationContext,
): OperationItem {
  const proposed = proposeChanges(listing, changes)
  const findings: Finding[] = []
  const block = (n: ValidationNote) => findings.push({ ...n, severity: 'BLOCK' })
  const warn = (n: ValidationNote) => findings.push({ ...n, severity: 'WARN' })

  /* --- blocked: the write would fail or is not permitted --- */

  const missing = listing.requiredAttributes.filter((a) => !listing.attributes[a])
  if (missing.length > 0) {
    block({
      code: 'MISSING_REQUIRED_ATTRIBUTE',
      message: `Missing required attribute: ${missing.join(', ')}.`,
      remedy: 'Etsy will not accept an update until this is set. Fix it in the listing editor.',
    })
  }

  if (proposed.price !== undefined && proposed.price <= 0) {
    block({
      code: 'PRICE_NOT_POSITIVE',
      message: 'This change would take the price to zero or below.',
      remedy: 'Use a smaller reduction, or exclude this listing.',
    })
  }

  if (listing.state === 'EXPIRED' && proposed.state === undefined) {
    block({
      code: 'LISTING_EXPIRED',
      message: 'This listing has expired and cannot be edited through the API.',
      remedy: 'Renew it on Etsy first.',
    })
  }

  /* --- skipped: the seller asked for this to be excluded --- */

  const priceChange = changes.find((c) => c.kind === 'PRICE')
  const cost = ctx.costs.get(listing.etsyListingId)
  if (
    priceChange?.kind === 'PRICE' &&
    priceChange.skipBelowCostFloor &&
    proposed.price !== undefined &&
    cost !== undefined &&
    proposed.price * (1 - ctx.feeRate) < cost
  ) {
    findings.push({
      severity: 'SKIP',
      code: 'BELOW_COST_FLOOR',
      message: 'Excluded — this price would fall below your cost floor after fees.',
      remedy: 'Turn off the cost-floor guard to include it anyway.',
    })
  }

  /* --- warnings: it will work, but probably not as intended --- */

  if (proposed.tags !== undefined && proposed.tags.length > MAX_TAGS) {
    warn({
      code: 'TAG_LIMIT',
      message: `Already at ${MAX_TAGS} tags — the new tags will not be added unless you remove one first.`,
      remedy: 'Remove a tag in the same job, or use Replace instead of Add.',
    })
  }

  if (
    priceChange?.kind === 'PRICE' &&
    proposed.price !== undefined &&
    Math.abs(proposed.price - listing.price) / listing.price > 0.25
  ) {
    warn({
      code: 'LARGE_PRICE_CHANGE',
      message: 'This changes the price by more than 25%.',
      remedy: 'Check the diff for this listing before publishing.',
    })
  }

  /*
   * Precedence: blocked beats skipped beats warning.
   *
   * Deriving rather than mutating means a rule added later cannot accidentally
   * downgrade a block by running after it.
   */
  const status: ItemStatus = findings.some((f) => f.severity === 'BLOCK')
    ? 'BLOCKED'
    : findings.some((f) => f.severity === 'SKIP')
      ? 'SKIPPED'
      : findings.some((f) => f.severity === 'WARN')
        ? 'WARNING'
        : 'READY'

  return {
    listingId: listing.etsyListingId,
    title: listing.title,
    sku: listing.sku,
    status,
    diffs: buildDiffs(listing, proposed, status),
    // Only the findings that explain the status the seller sees.
    notes: findings
      .filter((f) => f.severity === severityFor(status))
      .map(({ severity: _severity, ...note }) => note),
    attempts: 0,
  }
}

function severityFor(status: ItemStatus): Severity {
  if (status === 'BLOCKED') return 'BLOCK'
  if (status === 'SKIPPED') return 'SKIP'
  return 'WARN'
}

/** Blocked and skipped items carry no diff: nothing is going to happen to them. */
function buildDiffs(
  listing: EtsyListing,
  proposed: ReturnType<typeof proposeChanges>,
  status: ItemStatus,
) {
  if (status === 'BLOCKED' || status === 'SKIPPED') return []

  const diffs = []
  if (proposed.price !== undefined && proposed.price !== listing.price) {
    diffs.push({
      field: 'Price',
      before: listing.price.toFixed(2),
      after: proposed.price.toFixed(2),
    })
  }
  if (proposed.tags !== undefined && proposed.tags.join('|') !== listing.tags.join('|')) {
    diffs.push({ field: 'Tags', before: listing.tags.join(', '), after: proposed.tags.join(', ') })
  }
  if (proposed.quantity !== undefined && proposed.quantity !== listing.quantity) {
    diffs.push({
      field: 'Quantity',
      before: String(listing.quantity),
      after: String(proposed.quantity),
    })
  }
  if (proposed.state !== undefined && proposed.state !== listing.state) {
    diffs.push({ field: 'State', before: listing.state, after: proposed.state })
  }
  return diffs
}

/** Six identical warnings read as one line with a count, not six lines. */
export function summarise(items: OperationItem[]): ValidationSummary {
  const groups = new Map<string, { message: string; remedy?: string; count: number }>()
  for (const item of items) {
    for (const note of item.notes) {
      const existing = groups.get(note.code)
      if (existing) existing.count += 1
      else groups.set(note.code, { message: note.message, remedy: note.remedy, count: 1 })
    }
  }

  return {
    ready: items.filter((i) => i.status === 'READY').length,
    warnings: items.filter((i) => i.status === 'WARNING').length,
    blocked: items.filter((i) => i.status === 'BLOCKED').length,
    groups: [...groups.entries()].map(([code, g]) => ({ code, ...g })),
  }
}
