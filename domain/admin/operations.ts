/*
 * Bulk operations across every shop, as data.
 *
 * Pure: no database, no `server-only`, no React.
 *
 * ── THE VOCABULARY IS COPIED, AND CHECKED ─────────────────────────────────
 *
 * `domain/bulk-editor/types.ts` owns OPERATION_STATES, and importing it would
 * pull `lib/etsy/interface.ts` into the operator closure through its
 * `ListingState` import — where the write-boundary guard fails on a module
 * that so much as NAMES `applyListingChanges`. Same trade as the connection
 * vocabulary: a short duplication, kept honest by a test that reads both files
 * as TEXT and asserts they are the same set.
 *
 * THE COUNT IS NINE, NOT TEN. The brief for this screen said ten states; the
 * schema comment and the state machine both define nine. Nothing was invented
 * to make up the difference — a tenth state with no transition into it would
 * be a bucket that can never be non-zero, which is worse than an accurate
 * nine. The test pins the number to the two sources rather than to a literal
 * anybody wrote down.
 *
 * ── WHAT THIS SCREEN CANNOT DO, AND WHY IT MATTERS MOST HERE ──────────────
 *
 * Retry, clear and roll back are the three most plausible support requests in
 * the product, and all three are foreclosed (D94a). They are also the three
 * whose consequences are worst: a retry is an Etsy WRITE against a real
 * seller's live listings, and a rollback is another one. D50's gate — SELECT →
 * CONFIGURE → VALIDATE → DIFF → CONFIRM → APPLY → AUDIT → ROLLBACK — exists so
 * that nothing reaches Etsy without a seller confirming it, and an operator
 * retry button would be a way to the far end of that gate without its near
 * end.
 */

import { countedRows } from './provenance'
import type { Provenanced } from '@/lib/provenance/types'

/** The nine states an operation can be in. Checked against both sources. */
export const OPERATION_STATES = [
  'DRAFT',
  'VALIDATING',
  'READY',
  'APPLYING',
  'PARTIAL_SUCCESS',
  'COMPLETED',
  'FAILED',
  'ROLLBACK_AVAILABLE',
  'ROLLED_BACK',
] as const
export type OperationStateValue = (typeof OPERATION_STATES)[number]

/** The seven per-item statuses. */
export const ITEM_STATUSES = [
  'PENDING',
  'READY',
  'WARNING',
  'BLOCKED',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED',
] as const
export type ItemStatusValue = (typeof ITEM_STATUSES)[number]

export const STATE_LABEL: Record<OperationStateValue, string> = {
  DRAFT: 'Draft',
  VALIDATING: 'Validating',
  READY: 'Ready',
  APPLYING: 'Applying',
  PARTIAL_SUCCESS: 'Partial success',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  ROLLBACK_AVAILABLE: 'Rollback available',
  ROLLED_BACK: 'Rolled back',
}

/**
 * States that mean a human should look.
 *
 * PARTIAL_SUCCESS is first deliberately. A wholly failed job is obvious and
 * the seller knows; a partial one leaves a shop in a state nobody chose —
 * some listings changed and some did not — and the seller may not have
 * noticed which.
 */
export const ATTENTION_STATES: readonly OperationStateValue[] = [
  'PARTIAL_SUCCESS',
  'FAILED',
  'APPLYING',
] as const

/**
 * An APPLYING operation older than this is not applying, it is stuck.
 *
 * Thirty minutes because a bulk apply is rate-limited against Etsy and a large
 * job legitimately takes a while — a shorter window would report healthy jobs
 * as stuck, and an operator who learns the column cries wolf stops reading it.
 */
export const STUCK_AFTER_MINUTES = 30

const MINUTE_MS = 60 * 1000

/** One operation, as the repository returns it. Never any listing content. */
export interface OperationRow {
  id: string
  shopId: string
  shopName: string | null
  ownerEmail: string | null
  state: string
  /** The field NAMES the job touches — price, tags — never the values. */
  fields: string[]
  listingCount: number
  createdAt: Date
  completedAt: Date | null
}

/** One failed item. The reason, never the before and after values. */
export interface OperationItemRow {
  operationId: string
  listingId: string
  status: string
  error: string | null
  attempts: number
}

export interface AssessedOperation {
  row: OperationRow
  state: OperationStateValue | 'UNKNOWN'
  /** APPLYING for longer than the window. Not a state, a judgement about one. */
  stuck: boolean
  minutesRunning: number | null
  /** The failed items behind a FAILED or PARTIAL_SUCCESS job. */
  failures: OperationItemRow[]
}

export function assessOperation(
  row: OperationRow,
  items: readonly OperationItemRow[],
  now: Date,
): AssessedOperation {
  const state = (OPERATION_STATES as readonly string[]).includes(row.state)
    ? (row.state as OperationStateValue)
    : 'UNKNOWN'

  /*
   * Elapsed since it STARTED, and only meaningful while it is still running.
   * A completed job's age is not a running time, and reporting one would make
   * every old COMPLETED row look like a four-month apply.
   */
  const minutesRunning =
    state === 'APPLYING' ? Math.floor((now.getTime() - row.createdAt.getTime()) / MINUTE_MS) : null

  return {
    row,
    state,
    stuck: minutesRunning !== null && minutesRunning >= STUCK_AFTER_MINUTES,
    minutesRunning,
    failures: items.filter((item) => item.operationId === row.id && item.status === 'FAILED'),
  }
}

export interface StateCount {
  state: OperationStateValue | 'UNKNOWN'
  label: string
  /** Provenanced, so a state count cannot render without saying where from. */
  count: Provenanced<number>
}

/**
 * Count by state, with every state present.
 *
 * Every state including the ones at zero (D34). "Failed: —" and no Failed row
 * at all read identically to somebody scanning for trouble, and only one of
 * them means there is none.
 */
export function countByState(assessed: readonly AssessedOperation[]): StateCount[] {
  const known: StateCount[] = OPERATION_STATES.map((state) => ({
    state,
    label: STATE_LABEL[state],
    count: countedRows(assessed.filter((entry) => entry.state === state).length, 'bulk_operations'),
  }))
  return [
    ...known,
    {
      state: 'UNKNOWN',
      label: 'Unrecognised state',
      count: countedRows(
        assessed.filter((entry) => entry.state === 'UNKNOWN').length,
        'bulk_operations',
      ),
    },
  ]
}

/**
 * Everything worth a human, most urgent first.
 *
 * Within APPLYING, the stuck ones come before the ones still legitimately
 * running — an operator scanning this list is looking for the jobs that are
 * not going to finish on their own.
 */
export function needsAttention(assessed: readonly AssessedOperation[]): AssessedOperation[] {
  const rank = (entry: AssessedOperation) => {
    const base = ATTENTION_STATES.indexOf(entry.state as OperationStateValue)
    return base === -1 ? Number.MAX_SAFE_INTEGER : base * 2 + (entry.stuck ? 0 : 1)
  }
  return assessed
    .filter((entry) => (ATTENTION_STATES as readonly string[]).includes(entry.state))
    .sort((a, b) => rank(a) - rank(b) || b.row.createdAt.getTime() - a.row.createdAt.getTime())
}

/** Only the APPLYING jobs that have outrun the window. */
export function stuck(assessed: readonly AssessedOperation[]): AssessedOperation[] {
  return assessed
    .filter((entry) => entry.stuck)
    .sort((a, b) => (b.minutesRunning ?? 0) - (a.minutesRunning ?? 0))
}

/**
 * The distinct failure reasons behind a set of operations, with counts.
 *
 * Grouped rather than listed one per item, because forty listings failing for
 * one reason is one finding and reading it forty times buries the second
 * reason underneath. The per-item rows are still there — they are what makes
 * partial success expressible at all — and this is how they are summarised.
 */
export function failureReasons(
  assessed: readonly AssessedOperation[],
): { reason: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const entry of assessed) {
    for (const failure of entry.failures) {
      /*
       * A failed item with no recorded reason is counted under its own
       * heading, not dropped and not merged with the ones that have one. "We
       * do not know why 12 of these failed" is a finding in itself.
       */
      const reason = failure.error ?? 'No reason was recorded with the failure.'
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
}

/**
 * What is true of an operation in this state, and who resolves it.
 *
 * Every remedy is the seller's, because the operator area holds no Etsy
 * service and `bulk_operations` is not on the write allowlist. Stating it per
 * state is what stops the screen reading as a queue of work.
 */
export const STATE_NOTE: Record<OperationStateValue, string> = {
  DRAFT: 'Being configured. Nothing has been validated or applied.',
  VALIDATING: 'Checks are running. Nothing has reached Etsy.',
  READY: 'Validated and waiting for the seller to confirm. Nothing has reached Etsy.',
  APPLYING: 'Running now. Applies are rate-limited against Etsy, so a large job takes a while.',
  PARTIAL_SUCCESS:
    'Some listings changed and some did not. The shop is in a state nobody chose, and the seller may not know which items failed.',
  COMPLETED: 'Every item applied.',
  FAILED: 'Nothing applied, or the run stopped. The reasons are on the items.',
  ROLLBACK_AVAILABLE: 'Applied, and still inside the window in which the seller can undo it.',
  ROLLED_BACK: 'The seller undid it. The reversal is itself recorded, never an edit to history.',
}
