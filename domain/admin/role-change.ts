import 'server-only'

/*
 * The one path by which a platform role changes.
 *
 * Everything that has to be true is checked here, in one function, in an order
 * that is itself part of the design. Splitting these across the action, the
 * page and the repository is how a check comes to be skipped on one of three
 * routes; keeping them together is why there is a single place to read when
 * asking "what stops X".
 *
 * ── THE ORDER, AND WHY IT IS THIS ORDER ───────────────────────────────────
 *
 *   1. roles.write            Before anything else, including before the
 *                             password is looked at. An ADMIN who submits this
 *                             form must not learn whether they typed their own
 *                             password correctly — that is a free oracle, and
 *                             the answer is none of their business.
 *   2. parse the role         Cheap, local, and turns a string into the type
 *                             the rest of the path is built on.
 *   3. read the target fresh  Not from the form. The list was rendered earlier
 *                             and both facts that matter may have moved.
 *   4. refuse env-derived     Writing the column for someone in
 *                             SUPER_ADMIN_EMAILS succeeds and changes nothing.
 *   5. rate limit             BEFORE the network call, so a lockout costs an
 *                             attacker nothing to discover but costs them
 *                             every subsequent guess.
 *   6. verify the password    The round trip, last of the checks.
 *   7. write, then audit      In that order, because an audit row claiming a
 *                             change that failed is worse than a change with a
 *                             late record.
 *
 * ── EVERY OUTCOME IS RECORDED, INCLUDING THE REFUSALS ─────────────────────
 *
 * D66: a log of what succeeded cannot answer the question a dispute asks.
 * Three WRONG_PASSWORD rows in a row against the role editor is the single
 * most useful thing this table will ever hold, and it does not exist in a
 * success-only log. NOT_PERMITTED is the other one worth having: an ADMIN
 * repeatedly trying to promote someone is a fact about that ADMIN.
 *
 * WHAT IS NOT RECORDED is anyone without admin access at all — they get
 * notFound() from requireAdmin() before reaching this function. Otherwise any
 * signed-in seller could write rows into the audit log at will, and a log
 * anybody can fill is a log nobody can read.
 */

import { requireAdmin } from './access'
import { parseAssignableRole, roleSource, type AssignableRole, type PlatformRole } from './roles'
import type { AdminAuditOutcome, RefusalReason } from './audit'
import { appendAdminAuditEvent } from '@/lib/repositories/admin-audit-log'
import { adminReadAccount } from '@/lib/repositories/admin-reads-every-shop'
import { setStoredPlatformRole } from '@/lib/repositories/admin-writes-platform-role'
import { verifyPassword } from '@/lib/auth/step-up'
import { rateLimit, stepUpKey, STEP_UP_PATH } from '@/lib/security/rate-limit'
import { logFailure } from '@/lib/errors/api'

export type RoleChangeResult =
  | { ok: true; to: AssignableRole; targetEmail: string }
  | { ok: false; reason: RefusalReason }

export interface RoleChangeRequest {
  targetUserId: string
  /** Raw from the form. Parsed here, never trusted. */
  role: unknown
  password: string
}

/**
 * Change one account's platform role, or refuse and say why.
 *
 * Calls requireAdmin() itself rather than taking an AdminAccess parameter. A
 * function that accepts "the caller is an admin, honestly" as an argument is a
 * function whose security depends on every call site passing a real one.
 */
export async function changePlatformRole(request: RoleChangeRequest): Promise<RoleChangeResult> {
  /*
   * users.view, not roles.write — because roles.write is deliberately NOT a
   * Permission and requireAdmin() cannot accept it. This establishes that the
   * caller is an operator at all, which is what makes an audit row meaningful;
   * the roles.write check is the next line and is the one that decides.
   */
  const access = await requireAdmin('users.view')

  /** Record the attempt against this actor, then answer. */
  const refuse = async (
    reason: RefusalReason,
    target: { id: string | null; email: string } = { id: request.targetUserId, email: '—' },
    attempted: AssignableRole | null = null,
  ): Promise<RoleChangeResult> => {
    await record(access, target, { kind: 'REFUSED', reason, attempted })
    return { ok: false, reason }
  }

  // 1. Only SUPER_ADMIN, and before the password is so much as looked at.
  if (!access.canSuperAdminOnly('roles.write')) {
    return refuse('NOT_PERMITTED')
  }

  // 2. Parse. The single place a string becomes an AssignableRole.
  const role = parseAssignableRole(request.role)
  if (!role) return refuse('INVALID_ROLE')

  // 3. Read the target fresh.
  const target = await adminReadAccount(request.targetUserId)
  if (!target) return refuse('TARGET_NOT_FOUND', { id: null, email: '—' }, role)

  const identified = { id: target.id, email: target.email }

  /*
   * 4. An env-derived role is not the column's to change.
   *
   * Refused server-side as well as hidden in the UI. The row's control is
   * absent for these accounts, but "the button is not rendered" is not a
   * security property — a form can be posted without one.
   */
  if (roleSource(target.resolvedRole) === 'ENVIRONMENT') {
    return refuse('ROLE_FROM_ENVIRONMENT', identified, role)
  }

  // 5. Rate limit BEFORE the round trip.
  const budget = rateLimit(stepUpKey(access.userId), STEP_UP_PATH, Date.now())
  if (!budget.allowed) return refuse('RATE_LIMITED', identified, role)

  // 6. Verify the password without disturbing the session. See lib/auth/step-up.
  const verified = await verifyPassword(access.email, request.password)
  if (!verified.ok) {
    return refuse(
      verified.reason === 'UNAVAILABLE' ? 'AUTH_UNAVAILABLE' : 'WRONG_PASSWORD',
      identified,
      role,
    )
  }

  // 7. Write, then record what actually happened.
  const changed = await setStoredPlatformRole(target.id, role)
  if (!changed) return refuse('TARGET_NOT_FOUND', identified, role)

  await record(access, identified, {
    kind: 'APPLIED',
    from: target.resolvedRole,
    to: role,
  })
  return { ok: true, to: role, targetEmail: target.email }
}

/**
 * Append the record, and never let a logging failure decide the outcome.
 *
 * DELIBERATE, and it cuts against the instinct to fail closed. On the refusal
 * paths there is nothing to undo, so throwing would only replace a clear
 * refusal with a server error. On the success path the row is already written,
 * and throwing here would tell the operator the change failed when it did not
 * — which is a worse lie than a missing log line, and would have them try
 * again. The failure is logged with a reference either way.
 *
 * The honest cost: a database that accepts an UPDATE and rejects an INSERT
 * leaves a change with no record. That is a narrow window, it is reported, and
 * the alternative is worse.
 */
async function record(
  access: { userId: string; email: string; role: PlatformRole },
  target: { id: string | null; email: string },
  outcome: AdminAuditOutcome,
): Promise<void> {
  try {
    await appendAdminAuditEvent({
      actorId: access.userId,
      actorEmail: access.email,
      actorRole: access.role,
      targetId: target.id,
      targetEmail: target.email,
      outcome,
    })
  } catch (error) {
    logFailure(error, { path: 'admin/role-change' })
  }
}
