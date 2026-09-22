import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PERMISSION MATRIX STORE, AND THE ONE TRANSACTION THAT EDITS IT.
 *
 *   Two rows at most — ADMIN and MANAGER. SUPER_ADMIN has no row and must
 *   never get one: setRolePermissions takes `EditableRole`, so
 *
 *       applyRolePermissions({ role: 'SUPER_ADMIN', ... })  // ← does not compile
 *
 *   A super admin who could empty their own set would lock themselves out of
 *   the only screen that could restore it.
 *
 *   THE WRITE AND ITS AUDIT RECORD ARE ONE TRANSACTION. That is the whole
 *   point of the function at the bottom, and it is the gap A2 left on the role
 *   change: two separate writes meant a database that accepted the first and
 *   rejected the second left a privilege change nobody recorded. Here the
 *   before-set is read, the new set written and the record inserted inside one
 *   BEGIN, so there is no ordering of failures that produces a change with no
 *   record.
 *
 *   CROSS-ROLE, not cross-shop: this table has no shop and belongs to no
 *   seller. lib/permissions is untouched; shopContext() is still the seller
 *   isolation boundary and nothing here is seller data.
 *
 *   NO DELETE. A role whose row is deleted falls back to the DEFAULTS, which
 *   is a different answer from "configured to nothing" — so deleting is a way
 *   of silently restoring permissions. There is no function here that does it.
 *
 * ██████████████████████████████████████████████████████████████████████████
 */

import { eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import {
  flattenPermissionOutcome,
  type PermissionOutcome,
} from '@/domain/admin/audit'
import { resolvePermissions, type EditableRole } from '@/domain/admin/permissions'
import type { Permission, PlatformRole } from '@/domain/admin/roles'

/**
 * The raw stored keys for one role, or null when there is NO ROW.
 *
 * Null and `[]` are different answers and the caller must keep them apart:
 * null means nobody configured this role and the defaults apply; `[]` means
 * somebody configured it to nothing. Returning `[]` for a missing row would
 * make a fresh database look like a deliberately emptied one, and every
 * administrator would silently lose the panel.
 */
export async function readStoredPermissions(role: PlatformRole): Promise<string[] | null> {
  const [row] = await getDb()
    .select({ permissions: schema.adminRolePermissions.permissions })
    .from(schema.adminRolePermissions)
    .where(eq(schema.adminRolePermissions.role, role))
    .limit(1)
  return row ? row.permissions : null
}

/** Every editable role's set, resolved. For the matrix screen. */
export async function readPermissionMatrix(): Promise<Record<EditableRole, readonly Permission[]>> {
  const rows = await getDb()
    .select()
    .from(schema.adminRolePermissions)
  const stored = new Map(rows.map((row) => [row.role, row.permissions]))
  return {
    ADMIN: resolvePermissions('ADMIN', stored.get('ADMIN') ?? null),
    MANAGER: resolvePermissions('MANAGER', stored.get('MANAGER') ?? null),
  }
}

export interface PermissionAuditActor {
  id: string
  email: string
  role: PlatformRole
}

/**
 * Change one role's permissions and record it, atomically.
 *
 * ONE TRANSACTION, and every part of it matters:
 *
 *   1. read the current set INSIDE the transaction, so the `from` in the audit
 *      record is what was actually replaced rather than what some earlier
 *      request happened to see;
 *   2. upsert the new set;
 *   3. insert the audit record.
 *
 * If step 3 throws, steps 1 and 2 roll back with it. There is no ordering of
 * failures that leaves a permission change nobody recorded, which is the
 * property the equivalent role-change path was missing.
 *
 * Returns the set as it was, so the caller can report the change honestly
 * without re-reading it afterwards — a second read could see a third party's
 * write and report a diff that never happened.
 */
export async function applyRolePermissions(input: {
  role: EditableRole
  permissions: readonly Permission[]
  actor: PermissionAuditActor
}): Promise<{ from: readonly Permission[] }> {
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select({ permissions: schema.adminRolePermissions.permissions })
      .from(schema.adminRolePermissions)
      .where(eq(schema.adminRolePermissions.role, input.role))
      .limit(1)

    const from = resolvePermissions(input.role, existing ? existing.permissions : null)

    await tx
      .insert(schema.adminRolePermissions)
      .values({ role: input.role, permissions: [...input.permissions] })
      .onConflictDoUpdate({
        target: schema.adminRolePermissions.role,
        set: { permissions: [...input.permissions] },
      })

    await tx.insert(schema.adminPermissionAuditEvents).values({
      id: crypto.randomUUID(),
      at: new Date(),
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      subjectRole: input.role,
      ...flattenPermissionOutcome({ kind: 'APPLIED', from, to: input.permissions }),
    })

    return { from }
  })
}

/**
 * Record a refused permission change. Outside any transaction, deliberately.
 *
 * There is nothing to roll back on a refusal — no write happened — so wrapping
 * it would only turn a clear refusal into a server error.
 */
export async function appendPermissionAuditEvent(input: {
  actor: PermissionAuditActor
  subjectRole: EditableRole
  outcome: PermissionOutcome
}): Promise<void> {
  await getDb()
    .insert(schema.adminPermissionAuditEvents)
    .values({
      id: crypto.randomUUID(),
      at: new Date(),
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      subjectRole: input.subjectRole,
      ...flattenPermissionOutcome(input.outcome),
    })
}
