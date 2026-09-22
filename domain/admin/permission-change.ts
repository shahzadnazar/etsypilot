import 'server-only'

/*
 * The one path by which a role's permissions change.
 *
 * Deliberately the same shape as domain/admin/role-change.ts, in the same
 * order, reusing the same step-up check and the same rate-limit budget. ONE
 * RULE — sensitive operator actions require your password — and one
 * implementation of it. Two screens that both ask for a password but verify it
 * differently is how one of them ends up with the weaker check.
 *
 * ── THE ORDER, AND WHY IT IS THIS ORDER ───────────────────────────────────
 *
 *   1. roles.write            Before the password is looked at, so an ADMIN
 *                             who posts this form cannot learn whether they
 *                             typed their own password correctly.
 *   2. parse the role         SUPER_ADMIN is refused here: its set is not
 *                             stored and not editable.
 *   3. parse the permissions  Refuses an unknown key rather than dropping it,
 *                             so a tampered request is recorded as an attempt
 *                             instead of answered with a cheerful success.
 *   4. rate limit             BEFORE the round trip, sharing the step-up
 *                             budget with role changes — the attacker at an
 *                             unlocked laptop does not care which form they
 *                             guess through.
 *   5. verify the password    The round trip.
 *   6. write AND record       One transaction. A failed record rolls the
 *                             permission change back, which is the gap A2 left
 *                             on the role change and this path never had.
 *
 * Every outcome is recorded, refusals included (D66). A log of permission
 * changes that succeeded cannot answer "did someone try to grant themselves
 * the audit log", which is the question worth asking of this screen.
 */

import { requireAdmin } from './access'
import { isEditableRole, parsePermissionKeys, type EditableRole } from './permissions'
import type { PermissionOutcome, RefusalReason } from './audit'
import type { Permission, PlatformRole } from './roles'
import {
  appendPermissionAuditEvent,
  applyRolePermissions,
} from '@/lib/repositories/admin-permissions'
import { verifyPassword } from '@/lib/auth/step-up'
import { rateLimit, stepUpKey, STEP_UP_PATH } from '@/lib/security/rate-limit'
import { logFailure } from '@/lib/errors/api'

export type PermissionChangeResult =
  | { ok: true; role: EditableRole; from: readonly Permission[]; to: readonly Permission[] }
  | { ok: false; reason: RefusalReason }

export interface PermissionChangeRequest {
  /** Raw from the form. Parsed here, never trusted. */
  role: unknown
  /** Raw checkbox values. Parsed here, never trusted. */
  permissions: readonly unknown[]
  password: string
}

export async function changeRolePermissions(
  request: PermissionChangeRequest,
): Promise<PermissionChangeResult> {
  /*
   * users.view establishes that the caller is an operator at all, which is
   * what makes an audit row meaningful. roles.write is the next line and is
   * the one that decides — it cannot be passed to requireAdmin() because it is
   * not a Permission, by design.
   */
  const access = await requireAdmin('users.view')

  const actor = { id: access.userId, email: access.email, role: access.role }

  const refuse = async (
    reason: RefusalReason,
    subjectRole: EditableRole | null,
    attempted: readonly Permission[] | null = null,
  ): Promise<PermissionChangeResult> => {
    /*
     * A refusal whose subject could not be parsed has no role to file itself
     * under, and the column is NOT NULL. Recorded against ADMIN would be a
     * lie; so an unparseable role is logged to the application log and
     * returned, without a fabricated audit row. That is the one refusal this
     * screen does not write, and it is written down here so the gap is known
     * rather than discovered.
     */
    if (subjectRole === null) {
      logFailure(new Error(`permission change refused: ${reason} (unparseable role)`), {
        path: 'admin/permission-change',
      })
      return { ok: false, reason }
    }
    await record(actor, subjectRole, { kind: 'REFUSED', reason, attempted })
    return { ok: false, reason }
  }

  // 1. SUPER_ADMIN only, before the password is so much as looked at.
  if (!access.canSuperAdminOnly('roles.write')) {
    return refuse('NOT_PERMITTED', isEditableRole(request.role) ? request.role : null)
  }

  // 2. Only ADMIN and MANAGER have a set to edit.
  if (!isEditableRole(request.role)) return refuse('ROLE_NOT_EDITABLE', null)
  const role = request.role

  // 3. The single door from string[] to Permission[].
  const permissions = parsePermissionKeys(request.permissions)
  if (!permissions) return refuse('INVALID_PERMISSION', role)

  // 4. Rate limit BEFORE the round trip, on the shared step-up budget.
  const budget = rateLimit(stepUpKey(access.userId), STEP_UP_PATH, Date.now())
  if (!budget.allowed) return refuse('RATE_LIMITED', role, permissions)

  // 5. The same verification a role change uses. See lib/auth/step-up.
  const verified = await verifyPassword(access.email, request.password)
  if (!verified.ok) {
    return refuse(
      verified.reason === 'UNAVAILABLE' ? 'AUTH_UNAVAILABLE' : 'WRONG_PASSWORD',
      role,
      permissions,
    )
  }

  // 6. Write and record, atomically.
  try {
    const { from } = await applyRolePermissions({ role, permissions, actor })
    return { ok: true, role, from, to: permissions }
  } catch (error) {
    logFailure(error, { path: 'admin/permission-change' })
    return refuse('NOT_RECORDED', role, permissions)
  }
}

/**
 * Append a REFUSAL record. Refusals only — successes go through the transaction.
 *
 * A logging failure is swallowed because on a refusal there is nothing to roll
 * back, and throwing would replace a clear refusal with a server error.
 */
async function record(
  actor: { id: string; email: string; role: PlatformRole },
  subjectRole: EditableRole,
  outcome: PermissionOutcome,
): Promise<void> {
  try {
    await appendPermissionAuditEvent({ actor, subjectRole, outcome })
  } catch (error) {
    logFailure(error, { path: 'admin/permission-change' })
  }
}
