/*
 * The audit log (artboard 109).
 *
 * Built around REFUSALS, not successes. A log that only records what succeeded
 * cannot answer the question a dispute actually asks — "did EtsyPilot change my
 * listing?" — because the useful answer is usually no, and a record that is
 * absent proves nothing.
 *
 * `reached` is the load-bearing field, and it is a discriminated union rather
 * than a string so the four states cannot be written as free text:
 *
 *   SENT             a request went to Etsy. How many of how many succeeded is
 *                    part of the value, so the row cannot say "Yes" over 8 of 9.
 *   NOTHING_SENT     the action intended to reach Etsy and did not. This IS the
 *                    definition of a refusal — see `isRefusal` below.
 *   NOT_APPLICABLE   the action never intended to reach Etsy, with the reason:
 *                    it was an authorisation step, an EtsyPilot-only setting, or
 *                    a read.
 *
 * The "Refused only" filter is derived from this union, not stored beside it.
 * Two fields that can disagree about whether something was refused is exactly
 * the defect that makes a log unusable in the dispute it exists for.
 */

export const AUDIT_SOURCES = ['MANUAL', 'BULK_JOB', 'SYNC', 'AI_ASSISTED'] as const
export type AuditSource = (typeof AUDIT_SOURCES)[number]

export const SOURCE_LABEL: Record<AuditSource, string> = {
  MANUAL: 'Manual',
  BULK_JOB: 'Bulk job',
  SYNC: 'Sync',
  AI_ASSISTED: 'AI-assisted',
}

/** Why an action never intended to reach Etsy. */
export const NOT_APPLICABLE_REASONS = ['AUTHORISATION', 'ETSYPILOT_ONLY', 'READ_ONLY'] as const
export type NotApplicableReason = (typeof NOT_APPLICABLE_REASONS)[number]

export const NOT_APPLICABLE_LABEL: Record<NotApplicableReason, string> = {
  AUTHORISATION: 'authorisation',
  ETSYPILOT_ONLY: 'EtsyPilot only',
  READ_ONLY: 'read only',
}

export type ReachedEtsy =
  | { kind: 'SENT'; succeeded: number; attempted: number }
  | { kind: 'NOTHING_SENT' }
  | { kind: 'NOT_APPLICABLE'; reason: NotApplicableReason }

/**
 * A refusal is an action that meant to reach Etsy and sent nothing.
 *
 * Derived, never stored. The filter and the column read the same field, so a
 * row cannot be listed under "Refused only" while its Reached Etsy cell says
 * something else.
 */
export function isRefusal(record: AuditRecord): boolean {
  return record.reached.kind === 'NOTHING_SENT'
}

/** "Yes · 12 of 12", "Partly · 8 of 9", derived from the counts. */
export function reachedLabel(reached: ReachedEtsy): string {
  switch (reached.kind) {
    case 'SENT':
      return `${reached.succeeded === reached.attempted ? 'Yes' : 'Partly'} · ${reached.succeeded} of ${reached.attempted}`
    case 'NOTHING_SENT':
      return 'No · nothing sent'
    case 'NOT_APPLICABLE':
      return `— ${NOT_APPLICABLE_LABEL[reached.reason]}`
  }
}

export interface AuditActor {
  name: string
  role: string
  /** Masked. Enough to tell two sessions apart, not enough to be one. */
  session: string
  device: string
}

export interface AuditStep {
  at: string
  label: string
  detail: string
  /** The step where it stopped. Rendered differently, and only ever one. */
  terminal?: true
}

/** A change that was going to happen. Struck through, because it did not. */
export interface AuditDiffLine {
  target: string
  field: string
  before: string
  after: string
}

export interface AuditRecord {
  /** The operation id. BE-2288, OP-9102, SY-4410. */
  id: string
  at: string
  actor: AuditActor
  action: string
  /** The second line of the Action cell: id and what changed. */
  detail: string
  target: string
  source: AuditSource
  reached: ReachedEtsy
  /** Why, in plain words. Required on a refusal — see the type test. */
  explanation?: string
  sequence: AuditStep[]
  /** What would have changed, for a refusal. Empty otherwise. */
  wouldHaveChanged: AuditDiffLine[]
  /** Lines beyond the ones listed, so "+ 2 more" is counted, not written. */
  wouldHaveChangedMore: number
  /** Where the operation came from, e.g. "Created 08:54 by Salman". */
  origin: string
  /** The job behind it, when there is one to open. */
  jobHref?: string
}

export const AUDIT_FILTERS = ['ALL', 'REFUSED'] as const
export type AuditFilter = (typeof AUDIT_FILTERS)[number]
