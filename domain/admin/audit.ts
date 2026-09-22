/*
 * What the operator audit log records, and what shape it records it in.
 *
 * Pure: types and two total functions, no database and no `server-only`, so
 * every rule below is testable without Postgres and the renderer can import it.
 *
 * ── D66, applied to a second log ──────────────────────────────────────────
 *
 * The seller-facing audit log learned two things the hard way, and both apply
 * here with more force because this log is about privilege rather than about
 * listings.
 *
 * 1. A LOG THAT RECORDS ONLY SUCCESSES CANNOT ANSWER THE QUESTION A DISPUTE
 *    ASKS. "Did someone try to promote themselves?" has no answer at all in a
 *    log of promotions that happened. Three wrong passwords in a row against
 *    the role editor is the single most useful row this table will ever hold,
 *    and a success-only log does not contain it.
 *
 * 2. THE OUTCOME IS DERIVED FROM THE SHAPE, NOT STORED BESIDE IT. On the
 *    seller log a `refused: boolean` next to the counts would have been two
 *    answers to one question — the defect that made the nav badges say 2 and 5.
 *    Here the same discipline: `outcome` is a discriminated union, so an
 *    APPLIED record CARRIES the before and after roles and a REFUSED record
 *    CARRIES a reason. "Applied" cannot be written over a record with no new
 *    role in it, because there is nowhere to write it.
 */

import type { AssignableRole, PlatformRole } from './roles'

/* --------------------------------------------------------------- refusals */

/**
 * Why a role change did not happen.
 *
 * A CLOSED list, rendered through a map, for the same reason the auth outcomes
 * are: a reason that reached the page as free text would eventually carry a
 * provider's wording, or a target's email, into a screen that should only ever
 * show our own words.
 */
export const REFUSAL_REASONS = [
  /** The password re-confirmation did not verify. The row worth counting. */
  'WRONG_PASSWORD',
  /** Too many attempts in the window. Recorded, because it is the tail of a
   *  brute-force attempt and the attempts before it are already in the log. */
  'RATE_LIMITED',
  /** A signed-in operator who is not SUPER_ADMIN reached the action anyway. */
  'NOT_PERMITTED',
  /** The target's role comes from SUPER_ADMIN_EMAILS or ADMIN_EMAILS, so the
   *  column does not decide it and writing one would change nothing. */
  'ROLE_FROM_ENVIRONMENT',
  /** The submitted role was not MANAGER or USER. */
  'INVALID_ROLE',
  /** No such account, or it vanished between render and submit. */
  'TARGET_NOT_FOUND',
  /** Step-up is impossible because auth is not configured. */
  'AUTH_UNAVAILABLE',
] as const
export type RefusalReason = (typeof REFUSAL_REASONS)[number]

/** Our words, never a provider's. Shown in the log and in the form. */
export const REFUSAL_COPY: Record<RefusalReason, string> = {
  WRONG_PASSWORD: 'Password did not match',
  RATE_LIMITED: 'Too many attempts',
  NOT_PERMITTED: 'Not permitted to change roles',
  ROLE_FROM_ENVIRONMENT: 'Role is set by environment variable',
  INVALID_ROLE: 'Role was not one the panel may assign',
  TARGET_NOT_FOUND: 'Account not found',
  AUTH_UNAVAILABLE: 'Authentication is not configured',
}

export function isRefusalReason(value: unknown): value is RefusalReason {
  return typeof value === 'string' && (REFUSAL_REASONS as readonly string[]).includes(value)
}

/* ---------------------------------------------------------------- outcome */

/**
 * What happened, as a union.
 *
 * `to` is AssignableRole, not PlatformRole, so this type cannot even DESCRIBE
 * a promotion to SUPER_ADMIN. The guarantee that the panel cannot grant the top
 * roles therefore reaches the log as well: there is no record shape that claims
 * one was granted.
 *
 * `from` IS PlatformRole, because the role someone held before may well have
 * been env-derived, and recording it honestly matters more than symmetry.
 */
export type AdminAuditOutcome =
  | { kind: 'APPLIED'; from: PlatformRole; to: AssignableRole }
  | { kind: 'REFUSED'; reason: RefusalReason; attempted: AssignableRole | null }

export interface AdminAuditEvent {
  id: string
  at: Date
  /** Who did it. Email is snapshotted: it is what the log must still say in a
   *  year, after the account was renamed or deleted. */
  actorId: string
  actorEmail: string
  /** Their platform role AT THE TIME. A later demotion must not rewrite it. */
  actorRole: PlatformRole
  /** Whose role was to change. Null only if the target could not be resolved. */
  targetId: string | null
  targetEmail: string
  outcome: AdminAuditOutcome
}

/** Did this record refuse? One field decides, so nothing can disagree. */
export function isRefusal(event: AdminAuditEvent): boolean {
  return event.outcome.kind === 'REFUSED'
}

/* ------------------------------------------------- persistence boundary */

/**
 * The flat row, which is what a table can actually hold.
 *
 * Columns cannot be a union, so the union is flattened on write and rebuilt on
 * read. Both directions live here, next to each other, so they cannot drift —
 * the failure mode otherwise is a writer that stops setting a column and a
 * reader that goes on assuming it.
 */
export interface AdminAuditRow {
  id: string
  at: Date
  actorId: string
  actorEmail: string
  actorRole: string
  targetId: string | null
  targetEmail: string
  outcomeKind: string
  fromRole: string | null
  toRole: string | null
  refusalReason: string | null
}

export function flattenOutcome(outcome: AdminAuditOutcome): {
  outcomeKind: string
  fromRole: string | null
  toRole: string | null
  refusalReason: string | null
} {
  if (outcome.kind === 'APPLIED') {
    return {
      outcomeKind: 'APPLIED',
      fromRole: outcome.from,
      toRole: outcome.to,
      refusalReason: null,
    }
  }
  return {
    outcomeKind: 'REFUSED',
    fromRole: null,
    toRole: outcome.attempted,
    refusalReason: outcome.reason,
  }
}

/**
 * Rebuild the union from a row, or null when the row cannot be one.
 *
 * NULL RATHER THAN A GUESS, and this is the whole reason the function exists.
 * A row marked APPLIED with no `to_role` is not a promotion whose target we
 * should invent — it is a corrupt record, and the log must show it as
 * unreadable rather than quietly render it as something plausible. An audit
 * trail that fills in blanks is worse than one with a gap in it, because the
 * gap is visible and the guess is not.
 */
export function rebuildOutcome(row: {
  outcomeKind: string
  fromRole: string | null
  toRole: string | null
  refusalReason: string | null
}): AdminAuditOutcome | null {
  if (row.outcomeKind === 'APPLIED') {
    if (!row.fromRole || !row.toRole) return null
    if (row.toRole !== 'MANAGER' && row.toRole !== 'USER') return null
    return { kind: 'APPLIED', from: row.fromRole as PlatformRole, to: row.toRole }
  }
  if (row.outcomeKind === 'REFUSED') {
    if (!isRefusalReason(row.refusalReason)) return null
    const attempted = row.toRole === 'MANAGER' || row.toRole === 'USER' ? row.toRole : null
    return { kind: 'REFUSED', reason: row.refusalReason, attempted }
  }
  return null
}

/**
 * How a record reads in one line.
 *
 * Derived, never stored. "Promoted to manager" is computed from `from` and
 * `to`, so it cannot be written over a record that says something else — the
 * same property that stops "Yes" sitting above "8 of 9" on the seller log.
 */
export function describeOutcome(outcome: AdminAuditOutcome): string {
  if (outcome.kind === 'REFUSED') return REFUSAL_COPY[outcome.reason]
  if (outcome.to === 'MANAGER') return 'Promoted to manager'
  if (outcome.from === 'MANAGER') return 'Demoted to user'
  return 'Set to user'
}
