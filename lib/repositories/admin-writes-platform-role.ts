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
 *       setStoredPlatformRole(id, 'SUPER_ADMIN')   // ← does not compile
 *       setStoredPlatformRole(id, someRole)        // ← PlatformRole: no
 *
 *   are refused by the compiler, not by an `if` that a later edit could drop.
 *   SUPER_ADMIN and ADMIN live in environment variables so that writing a row
 *   cannot mint one; a panel that could put those strings in this column would
 *   not break that rule — resolvePlatformRole() ignores them there — but it
 *   would make the account list show a role nobody holds and the audit log
 *   record a promotion that never happened.
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
import type { AssignableRole } from '@/domain/admin/roles'

/**
 * Set one account's stored platform role.
 *
 * Returns whether a row actually changed, rather than void. The caller needs
 * to know: an update that matched nothing means the account disappeared
 * between rendering the list and submitting the form, and writing "promoted to
 * manager" into the audit log for a row that was never touched would put a
 * false record in the one place that must not hold one.
 */
export async function setStoredPlatformRole(
  userId: string,
  role: AssignableRole,
): Promise<boolean> {
  const updated = await getDb()
    .update(schema.users)
    .set({ platformRole: role })
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id })
  return updated.length === 1
}
