/*
 * Change history (artboards 44–45).
 *
 * The record of what CobaltRank wrote to this shop, and the only surface from
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

/*
 * ── 'AI_ASSISTED' IS NOT ONE OF THESE ────────────────────────────────────
 *
 * It was the third source, labelled "AI-assisted" and badged in violet on
 * /listings/change-history. Nothing ever wrote it: every writer in the product
 * sets BULK_EDIT, SCHEDULED or MANUAL (domain/bulk-editor, rollback.ts), and
 * the Copilot that was meant to is gone.
 *
 * So the only thing the member could still do was put those words on a
 * seller's screen for a row that cannot exist. A vocabulary this product
 * renders is not a place to keep a word it has no use for.
 *
 * A row in an older database carrying that string is read through a cast and
 * finds no label, so its badge renders empty rather than naming a feature
 * nobody can reach. Nothing else about the job — what it changed, when, by
 * whom, and the rollback — depends on the source.
 */
export const CHANGE_SOURCES = ['BULK_EDIT', 'SCHEDULED', 'MANUAL'] as const
export type ChangeSource = (typeof CHANGE_SOURCES)[number]

export const SOURCE_LABEL: Record<ChangeSource, string> = {
  BULK_EDIT: 'Bulk edit',
  SCHEDULED: 'Scheduled',
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
 * "1 failed", "1 skipped", "Complete" — in that order of precedence.
 *
 * A failure is named first whatever the source: a job that partly failed is a
 * partly failed job, and an outcome that answered some other question first
 * would hide the one the reader actually asked.
 *
 * There was a fourth answer, "Approved", for a job whose source was
 * AI_ASSISTED. Nothing writes that source (see CHANGE_SOURCES above), so the
 * branch could only ever have been reached by a row no code can create.
 */
export function outcomeLabel(job: ChangeJob): string {
  const outcome = outcomeOf(job)
  if (outcome.failed > 0) {
    return `${outcome.failed} failed`
  }
  if (outcome.skipped > 0) return `${outcome.skipped} skipped`
  return 'Complete'
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
      /*
       * Null where no plan sets a window, because no plan is in force: nobody
       * can pay on this deployment yet (lib/billing/index.ts). The rollback is
       * genuinely available — the listings still hold the job's values — and
       * nothing is counting down to taking it away.
       *
       * It used to be Solo's 30 days, read off MockBillingProvider, so a live
       * seller was told "Available · 12 d" by a plan they had not bought.
       */
      daysLeft: number | null
      /** Listings that still hold this job's value and can be restored. */
      restorable: number
      /** Changed on Etsy since. Skipped rather than overwritten. */
      blocked: number
    }
  | { kind: 'WINDOW_CLOSED'; window: number }
  | { kind: 'NOTHING_TO_RESTORE'; reason: string }
  | { kind: 'NOT_ON_PLAN'; planName: string }
