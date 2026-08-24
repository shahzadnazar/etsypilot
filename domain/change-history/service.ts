/*
 * Change history view (artboards 44–45).
 *
 * The rollback state is re-planned against the CURRENT catalogue on every
 * render. It is never read from something recorded when the job ran, because a
 * rollback point that was valid then says nothing about whether restoring it
 * today would discard an edit somebody made since.
 *
 * The window comes from the seller's plan, not from a constant. Solo keeps 30
 * days and Growth 90, and the row that says "Available · 28 d" is counting down
 * from whichever one the shop is actually on.
 */

import { planOf, type Plan } from '@/domain/billing/plans'
import { getBillingProvider } from '@/lib/billing'
import { getEtsyService } from '@/lib/etsy'
import { DEMO_NOW } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'
import { readChangeJobs } from './store'
import {
  outcomeOf,
  type ChangeJob,
  type ChangeSource,
  type RollbackState,
  CHANGE_SOURCES,
} from './types'

export interface ChangeRow {
  job: ChangeJob
  listingCount: number
  rollback: RollbackState
}

export interface ChangeHistoryView {
  rows: ChangeRow[]
  total: number
  source: ChangeSource | 'ALL'
  sources: ChangeSource[]
  plan: Plan
  /** How long the trail itself is kept. Different from the rollback window. */
  retentionDays: number | null
  rollbackWindowDays: number | null
  selected: { row: ChangeRow; drift: DriftReport } | null
  now: string
}

/** What a rollback would and would not touch, measured against the shop now. */
export interface DriftReport {
  restorable: { item: ChangeJob['items'][number] }[]
  blocked: { item: ChangeJob['items'][number]; reason: string }[]
}

export async function getChangeHistory(
  ctx: ShopContext,
  query: { source?: string; job?: string } = {},
): Promise<ChangeHistoryView> {
  const etsy = getEtsyService()
  const [catalogue, subscription] = await Promise.all([
    etsy.getListings(ctx.shopId, { limit: 500 }),
    getBillingProvider().getSubscription(ctx.shopId),
  ])
  const listings = catalogue.listings
  const plan = planOf(subscription.plan)
  const window = plan.limits.rollbackDays

  const jobs = readChangeJobs(ctx.shopId, listings)
  const source: ChangeSource | 'ALL' = CHANGE_SOURCES.includes(query.source as ChangeSource)
    ? (query.source as ChangeSource)
    : 'ALL'

  const rows: ChangeRow[] = jobs.map((job) => ({
    job,
    listingCount: job.items.length,
    rollback: rollbackStateOf(job, listings, { window, planName: plan.name, now: DEMO_NOW }),
  }))

  const shown = rows.filter((r) => (source === 'ALL' ? true : r.job.source === source))
  const selectedRow = query.job ? (rows.find((r) => r.job.id === query.job) ?? null) : null

  return {
    rows: shown,
    total: rows.length,
    source,
    sources: CHANGE_SOURCES.filter((s) => rows.some((r) => r.job.source === s)),
    plan,
    retentionDays: plan.limits.auditRetentionDays,
    rollbackWindowDays: window,
    selected: selectedRow
      ? { row: selectedRow, drift: driftOf(selectedRow.job, listings) }
      : null,
    now: DEMO_NOW,
  }
}

/**
 * Compare what the job wrote against what the listing holds now.
 *
 * A listing that no longer matches is BLOCKED, not overwritten. Restoring it
 * would silently discard whatever was done to it since, which is the one thing
 * a rollback must never do.
 */
export function driftOf(job: ChangeJob, listings: EtsyListing[]): DriftReport {
  const byId = new Map(listings.map((l) => [l.etsyListingId, l]))
  const restorable: DriftReport['restorable'] = []
  const blocked: DriftReport['blocked'] = []

  for (const item of job.items) {
    // Only what actually landed can be rolled back. A failure changed nothing.
    if (item.status !== 'SUCCEEDED') continue

    const listing = byId.get(item.listingId)
    if (!listing) {
      blocked.push({ item, reason: 'No longer in your shop.' })
      continue
    }
    if (currentValue(listing, item.field) !== item.after) {
      blocked.push({ item, reason: `${item.field} was changed on Etsy after this job ran.` })
      continue
    }
    restorable.push({ item })
  }

  return { restorable, blocked }
}

function rollbackStateOf(
  job: ChangeJob,
  listings: EtsyListing[],
  args: { window: number | null; planName: string; now: string },
): RollbackState {
  if (args.window === null) return { kind: 'NOT_ON_PLAN', planName: args.planName }

  const elapsed = (Date.parse(args.now) - Date.parse(job.at)) / 86_400_000
  if (elapsed > args.window) return { kind: 'WINDOW_CLOSED', window: args.window }

  const drift = driftOf(job, listings)
  if (drift.restorable.length === 0) {
    return {
      kind: 'NOTHING_TO_RESTORE',
      reason:
        drift.blocked.length > 0
          ? 'Every listing in this job has changed on Etsy since it ran.'
          : 'Nothing in this job reached Etsy, so there is nothing to undo.',
    }
  }

  return {
    kind: 'AVAILABLE',
    daysLeft: Math.max(0, Math.ceil(args.window - elapsed)),
    restorable: drift.restorable.length,
    blocked: drift.blocked.length,
  }
}

function currentValue(listing: EtsyListing, field: string): string {
  switch (field) {
    case 'price':
      return `$${listing.price.toFixed(2)}`
    case 'tags':
      return `${listing.tags.length} tags`
    case 'title':
      return listing.title
    default:
      return ''
  }
}

/** Exposed for the outcome column, so the page does not re-derive it. */
export { outcomeOf }
