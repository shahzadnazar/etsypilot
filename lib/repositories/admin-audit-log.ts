import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE OPERATOR AUDIT LOG. APPEND-ONLY BY CONSTRUCTION.
 *
 *   There is one write function and it adds a row. There is NO update and NO
 *   delete — not a guarded one, not a private one, not one behind a flag.
 *   "This record cannot be edited or removed" is therefore a statement about
 *   this file rather than about anybody's intentions (D66).
 *
 *   That is the entire reason the module exists as its own file. Drizzle's
 *   `getDb()` can of course issue an UPDATE; what matters is that no function
 *   reachable from the operator panel does, so tampering means editing this
 *   file and failing a test that says so by name.
 *
 *   WHY ANYONE WOULD WANT TO EDIT IT is the argument for the rule. The row
 *   most worth deleting is the one recording that you promoted yourself, and
 *   the person best placed to delete it is the person it names. An audit log
 *   whose subject can amend it is a formality.
 *
 *   READ ACCESS IS SUPER_ADMIN ONLY. `audit.view` is typed as a
 *   non-delegatable capability that can() cannot accept, so no ADMIN can be
 *   granted it and no permissions editor can ever render a checkbox for it.
 *   The reason is the same as roles.write: whoever can read the audit log can
 *   see who noticed.
 *
 *   CROSS-SHOP, like admin-reads-every-shop.ts and for the same reason — an
 *   operator action belongs to no shop. lib/permissions is untouched and
 *   shopContext() remains the seller isolation boundary; nothing here weakens
 *   it, because nothing here is seller data.
 *
 * ██████████████████████████████████████████████████████████████████████████
 */

import { and, desc, eq, inArray } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import {
  flattenOutcome,
  rebuildOutcome,
  type AdminAuditEvent,
  type AdminAuditOutcome,
} from '@/domain/admin/audit'
import type { PlatformRole } from '@/domain/admin/roles'

/** What the caller supplies. `id` and `at` are ours — see below. */
export interface AdminAuditDraft {
  actorId: string
  actorEmail: string
  actorRole: PlatformRole
  targetId: string | null
  targetEmail: string
  outcome: AdminAuditOutcome
}

/**
 * Add one record. There is deliberately no counterpart.
 *
 * `id` and `at` are assigned HERE, never accepted from the caller. A caller
 * that could choose the timestamp could place an event before the one it was
 * trying to hide, and a caller that could choose the id could collide with an
 * existing row and have the insert silently do nothing.
 */
export async function appendAdminAuditEvent(draft: AdminAuditDraft): Promise<void> {
  await getDb()
    .insert(schema.adminAuditEvents)
    .values({
      id: crypto.randomUUID(),
      at: new Date(),
      actorId: draft.actorId,
      actorEmail: draft.actorEmail,
      actorRole: draft.actorRole,
      targetId: draft.targetId,
      targetEmail: draft.targetEmail,
      ...flattenOutcome(draft.outcome),
    })
}

/**
 * One row, rebuilt into the union, or null when it cannot be.
 *
 * A row that fails to rebuild is dropped from the list rather than rendered as
 * a guess — see rebuildOutcome(). The count of dropped rows is returned beside
 * the events so the page can SAY a record was unreadable instead of quietly
 * showing a shorter log, which is the failure mode that makes an audit trail
 * worthless: nobody can tell a quiet log from a complete one.
 */
function toEvent(row: typeof schema.adminAuditEvents.$inferSelect): AdminAuditEvent | null {
  const outcome = rebuildOutcome(row)
  if (!outcome) return null
  return {
    id: row.id,
    at: row.at,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    actorRole: row.actorRole as PlatformRole,
    targetId: row.targetId,
    targetEmail: row.targetEmail,
    outcome,
  }
}

export interface AdminAuditPage {
  events: AdminAuditEvent[]
  /** Rows that could not be rebuilt. Surfaced, never swallowed. */
  unreadable: number
}

/** The whole log, newest first. */
export async function readAdminAuditLog(options: { limit?: number } = {}): Promise<AdminAuditPage> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 1000)
  const rows = await getDb()
    .select()
    .from(schema.adminAuditEvents)
    .orderBy(desc(schema.adminAuditEvents.at))
    .limit(limit)
  return collect(rows)
}

/**
 * Every record about one account, newest first.
 *
 * The Managers page uses this to answer "who promoted them", rather than
 * storing a promotedBy column beside platform_role. Two places recording the
 * same fact is how they come to disagree; the log already knows, and it knows
 * with a timestamp and an actor.
 */
export async function readAdminAuditForTarget(targetId: string): Promise<AdminAuditPage> {
  const rows = await getDb()
    .select()
    .from(schema.adminAuditEvents)
    .where(eq(schema.adminAuditEvents.targetId, targetId))
    .orderBy(desc(schema.adminAuditEvents.at))
  return collect(rows)
}

/**
 * The promotion that made each of these accounts a manager.
 *
 * ONE query, not one per manager, and it answers with the log rather than with
 * a `promoted_by` column beside platform_role. Two places recording the same
 * fact is how they come to disagree — and the column would be the one that
 * lies, because it has no timestamp, no actor role and no record of the
 * demotion that came after.
 *
 * Returns a map of targetId to the MOST RECENT applied promotion. Accounts with
 * no record are simply absent: a manager promoted before this log existed, or
 * one whose row was set directly in the database, genuinely has no answer, and
 * the page says so rather than inventing one.
 */
export async function adminReadPromotions(
  targetIds: readonly string[],
): Promise<Map<string, AdminAuditEvent>> {
  const found = new Map<string, AdminAuditEvent>()
  if (targetIds.length === 0) return found

  const rows = await getDb()
    .select()
    .from(schema.adminAuditEvents)
    .where(
      and(
        inArray(schema.adminAuditEvents.targetId, [...targetIds]),
        eq(schema.adminAuditEvents.outcomeKind, 'APPLIED'),
        eq(schema.adminAuditEvents.toRole, 'MANAGER'),
      ),
    )
    .orderBy(desc(schema.adminAuditEvents.at))

  for (const row of rows) {
    const event = toEvent(row)
    // Newest first, so the first one seen for a target is the one that counts.
    if (event && event.targetId && !found.has(event.targetId)) found.set(event.targetId, event)
  }
  return found
}

function collect(rows: (typeof schema.adminAuditEvents.$inferSelect)[]): AdminAuditPage {
  const events: AdminAuditEvent[] = []
  let unreadable = 0
  for (const row of rows) {
    const event = toEvent(row)
    if (event) events.push(event)
    else unreadable += 1
  }
  return { events, unreadable }
}
