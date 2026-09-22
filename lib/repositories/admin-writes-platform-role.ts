import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ONLY WRITE IN THE OPERATOR PANEL.
 *
 *   One function. One column. `users.platform_role`, and nothing else in the
 *   database is reachable from here — no seller data, no listing, no order, no
 *   shop row, no membership. The panel reads across every shop
 *   (admin-reads-every-shop.ts) and writes exactly this.
 *
 *   THE PARAMETER TYPE IS THE GUARANTEE. `role: AssignableRole` is 'MANAGER' |
 *   'USER'. Not PlatformRole, not string, not StorableRole. So
 *
 *       applyPlatformRoleChange({ to: 'SUPER_ADMIN', ... })  // ← does not compile
 *       applyPlatformRoleChange({ to: someRole, ... })       // ← PlatformRole: no
 *
 *   are refused by the compiler, not by an `if` that a later edit could drop.
 *   SUPER_ADMIN and ADMIN live in environment variables so that writing a row
 *   cannot mint one; a panel that could put those strings in this column would
 *   not break that rule — resolvePlatformRole() ignores them there — but it
 *   would make the account list show a role nobody holds and the audit log
 *   record a promotion that never happened.
 *
 *   THERE IS EXACTLY ONE EXPORTED WRITE, and it carries its own audit record
 *   in the same transaction. The bare setStoredPlatformRole() this file used
 *   to export was deleted rather than left unused: an exported function that
 *   changes a privilege without recording it is what the next person reaches
 *   for, and "remember to write the audit row too" is not a guarantee.
 *
 *   IT DOES NOT AUTHORISE ANYTHING. domain/admin/role-change.ts is the gate:
 *   it checks roles.write, verifies the password, refuses env-derived targets
 *   and writes the audit record. This function assumes all of that already
 *   happened, because a function that checks its own caller's rights is a
 *   function people stop checking before.
 *
 *   NO DELETE, NO INSERT. It cannot create an account and it cannot remove
 *   one. An UPDATE ... WHERE id = $1 on one column is the whole surface.
 *
 * ██████████████████████████████████████████████████████████████████████████
 */

import { eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { flattenOutcome } from '@/domain/admin/audit'
import type { AssignableRole, PlatformRole } from '@/domain/admin/roles'

/**
 * Change a role AND record it, atomically. The only way the panel applies one.
 *
 * ── THE GAP THIS CLOSES ───────────────────────────────────────────────────
 *
 * A2 did these as two separate awaits: setStoredPlatformRole(), then
 * appendAdminAuditEvent(), with the audit failure deliberately swallowed so a
 * logging problem could not report a successful change as failed. The cost was
 * written down at the time and it was the wrong trade: a database that
 * accepted the UPDATE and rejected the INSERT left a privilege change that
 * nobody recorded — in the one log whose entire purpose is that no privilege
 * change goes unrecorded.
 *
 * Both writes now run inside one transaction. If the audit insert throws, the
 * role change rolls back with it and the caller reports a failure that is
 * TRUE. The operator sees "not changed", the role is not changed, and there is
 * no state where the two disagree.
 *
 * WHAT THIS COSTS, said plainly: an audit table that is broken now blocks role
 * changes entirely. That is the correct direction. The panel refusing to
 * promote anyone until its log works is a visible, diagnosable failure; a
 * promotion with no record is neither.
 *
 * The `from` role is passed in rather than re-read here. It comes from the
 * same fresh read that decided the change was legitimate, so the record
 * describes the state that was actually checked.
 */
export async function applyPlatformRoleChange(input: {
  target: { id: string; email: string }
  from: PlatformRole
  to: AssignableRole
  actor: { id: string; email: string; role: PlatformRole }
}): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    const updated = await tx
      .update(schema.users)
      .set({ platformRole: input.to })
      .where(eq(schema.users.id, input.target.id))
      .returning({ id: schema.users.id })

    /*
     * No row matched: the account vanished between the read and the write.
     * Return false WITHOUT writing a record — "promoted to manager" for a row
     * that was never touched is exactly the false record this log must not
     * hold. The caller turns it into a refusal, which is recorded separately.
     */
    if (updated.length !== 1) return false

    await tx.insert(schema.adminAuditEvents).values({
      id: crypto.randomUUID(),
      at: new Date(),
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      targetId: input.target.id,
      targetEmail: input.target.email,
      ...flattenOutcome({ kind: 'APPLIED', from: input.from, to: input.to }),
    })

    return true
  })
}
