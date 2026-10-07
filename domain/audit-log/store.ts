import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE AUDIT LOG. IT PROMISES IMMUTABILITY, SO IT NEEDS A TABLE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file was a Map on `Symbol.for('etsypilot.auditlog.store')`, seeded for
 * every shop with `demoAuditRecords()`. Both halves of that were wrong on a
 * live deployment, and the page states the stakes itself: "Every action taken
 * on this shop through EtsyPilot, including the ones that were refused.
 * Records are immutable and cannot be edited or deleted from this page."
 *
 * Measured in a browser on a live account that has never connected to Etsy:
 *
 *     Aug 12, 14:02  Salman  Bulk edit applied   BE-2291 · tags replaced
 *                                                12 listings · Yes · 12 of 12
 *     Aug 9,  11:20  Salman  AI draft accepted,  OP-9088 · title and 4 tags
 *                            then published      Linen table runner · Yes · 1 of 1
 *
 * An immutable record, under that seller's own shop, asserting that EtsyPilot
 * published changes to their Etsy listings. In a dispute this log is the
 * evidence, and it was somebody else's.
 *
 * Nothing survived a restart either. A Map is not a record.
 *
 * ── WHAT THIS FILE IS NOW ─────────────────────────────────────────────────
 *
 * A thin seam over lib/repositories/change-jobs.ts, kept so the four call
 * sites do not each have to know about the demo branch. Append-only still has
 * no counterpart: there is no update and no delete, here or in the repository.
 */

import {
  appendAuditRecord as appendToTable,
  readAuditRecords as readFromTable,
} from '@/lib/repositories/change-jobs'
import type { AuditRecord } from './types'
import { demoAuditStore, resetDemoAuditRecords } from './demo'

/** Newest first, as a copy. Nothing a caller does to the result changes the log. */
export async function readAuditRecords(shopId: string): Promise<AuditRecord[]> {
  const demo = demoAuditStore(shopId)
  if (demo) return [...demo].sort((a, b) => b.at.localeCompare(a.at))
  return readFromTable(shopId)
}

/**
 * Add one record. There is deliberately no counterpart.
 *
 * The sequence is assigned by the store, never by the caller. A caller that
 * could choose one could choose a duplicate, and the sequence is half of a
 * record's address.
 */
export async function appendAuditRecord(
  shopId: string,
  actorId: string | null,
  record: AuditRecord,
): Promise<void> {
  const demo = demoAuditStore(shopId)
  if (demo) {
    demo.push({ ...record, seq: demo.length })
    return
  }
  await appendToTable(shopId, actorId, record)
}

/** Test helper for the demo path. Not exported through the service. */
export function resetAuditRecords(): void {
  resetDemoAuditRecords()
}
