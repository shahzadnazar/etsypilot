/*
 * Change history (artboards 44–45).
 *
 * The record of what EtsyPilot wrote to this shop, and the only surface from
 * which a write can be undone. Not to be confused with the Audit log, which
 * records every action INCLUDING the ones that never reached Etsy (D66). This
 * one is narrower on purpose: it lists jobs that changed listings, because a
 * rollback needs a before-value to restore and a refusal has none.
 *
 * Two things are derived rather than stored, and both matter:
 *
 *   outcome   counted from the items. A row cannot say "Complete" over a job
 *             with a failure in it.
 *   rollback  re-planned against the CURRENT catalogue on every render, never
 *             recorded at apply time. A rollback point that was valid when the
 *             job ran says nothing about whether restoring it today would
 *             discard somebody's later edit.
 */

export const CHANGE_SOURCES = ['BULK_EDIT', 'SCHEDULED', 'AI_ASSISTED', 'MANUAL'] as const
export type ChangeSource = (typeof CHANGE_SOURCES)[number]

export const SOURCE_LABEL: Record<ChangeSource, string> = {
  BULK_EDIT: 'Bulk edit',
  SCHEDULED: 'Scheduled',
  AI_ASSISTED: 'AI-assisted',
  MANUAL: 'Manual',
}

export type ItemStatus = 'SUCCEEDED' | 'FAILED' | 'SKIPPED'

export interface ChangeItem {
  listingId: string
  listingTitle: string
  /** 'price', 'tags', 'title' — the field as the seller would name it. */
  field: string
  /** What the listing held before this job. The value a rollback restores. */
  before: string
  /** What this job wrote. Compared against the live listing to detect drift. */
  after: string
  status: ItemStatus
  /** Set on FAILED. User-safe, never a stack trace. */
  error?: string
}

export interface ChangeJob {
  id: string
  at: string
  actor: string
  source: ChangeSource
  /** "Price +8%, tags" — the row's Change cell. */
  summary: string
  items: ChangeItem[]
  /** An experiment this job belongs to, where one does. */
  linkedExperiment?: { name: string; startedAt: string }
}

export interface ChangeOutcome {
  succeeded: number
  failed: number
  skipped: number
}

export function outcomeOf(job: ChangeJob): ChangeOutcome {
  return {
    succeeded: job.items.filter((i) => i.status === 'SUCCEEDED').length,
    failed: job.items.filter((i) => i.status === 'FAILED').length,
    skipped: job.items.filter((i) => i.status === 'SKIPPED').length,
  }
}

/**
 * "1 failed", "Approved", "Complete" — in that order of precedence.
 *
 * A failure is named first whatever the source. An AI-assisted job that partly
 * failed is a partly failed job, and reading "Approved" beside it would answer
 * a question nobody asked while hiding the one they did.
 */
export function outcomeLabel(job: ChangeJob): string {
  const outcome = outcomeOf(job)
  if (outcome.failed > 0) {
    return `${outcome.failed} failed`
  }
  if (outcome.skipped > 0) return `${outcome.skipped} skipped`
  return job.source === 'AI_ASSISTED' ? 'Approved' : 'Complete'
}

export function isFailure(job: ChangeJob): boolean {
  return outcomeOf(job).failed > 0
}

/*
 * Whether this job can still be undone, and why not when it cannot.
 *
 * Three states, not two. "Expired" and "the catalogue moved" are different
 * answers to a seller asking "can I undo this?" — the first is about time and
 * the second is about somebody else's work, and only one of them means the
 * change is permanent.
 */
export type RollbackState =
  | {
      kind: 'AVAILABLE'
      daysLeft: number
      /** Listings that still hold this job's value and can be restored. */
      restorable: number
      /** Changed on Etsy since. Skipped rather than overwritten. */
      blocked: number
    }
  | { kind: 'WINDOW_CLOSED'; window: number }
  | { kind: 'NOTHING_TO_RESTORE'; reason: string }
  | { kind: 'NOT_ON_PLAN'; planName: string }
