import 'server-only'

/*
 * The one place the demo shop's audit records are allowed to leave the fixture.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   MEASURED ON A LIVE ACCOUNT THAT HAS NEVER CONNECTED TO ETSY, UNDER THE
 *   HEADING "Records are immutable and cannot be edited or deleted".
 *
 *     Aug 12, 14:02  Salman  Bulk edit applied  BE-2291 · tags replaced
 *                                               12 listings · Yes · 12 of 12
 *     Aug 9,  11:20  Salman  AI draft accepted, OP-9088 · Linen table runner
 *                            then published     · Yes · 1 of 1
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Eight records by a person that seller has never met, asserting that
 * EtsyPilot published changes to their listings. In a dispute this log is the
 * evidence, and it was somebody else's.
 *
 * Real records are rows now (lib/repositories/change-jobs.ts). This keeps the
 * demo ones, and the Map with them: in demo mode nothing may touch the
 * database, and the rollback walkthrough has to see the refusal it just
 * produced appear in the log.
 */

import { isDemoMode } from '@/lib/etsy'
import { isEmptyDataset } from '@/lib/etsy/demo-dataset'
import { demoAuditRecords } from './demo-records'
import type { AuditRecord } from './types'

const DEMO_KEY = Symbol.for('etsypilot.auditlog.demo')

/** The demo log for one shop, seeded once per process. Null elsewhere. */
export function demoAuditStore(shopId: string): AuditRecord[] | null {
  if (!isDemoMode()) return null
  const g = globalThis as unknown as Record<symbol, Map<string, AuditRecord[]> | undefined>
  const byShop = g[DEMO_KEY] ?? new Map<string, AuditRecord[]>()
  g[DEMO_KEY] = byShop
  const existing = byShop.get(shopId)
  if (existing) return existing
  /*
   * A shop with nothing in it has done nothing, so its log is empty.
   *
   * Seeding the eight demo records regardless made "Nothing has happened on
   * this shop yet" unreachable — an empty state that exists in the code and
   * cannot be rendered is an empty state nobody has ever looked at.
   */
  const fresh = (isEmptyDataset() ? [] : demoAuditRecords()).map((record, seq) => ({
    ...record,
    seq,
  }))
  byShop.set(shopId, fresh)
  return fresh
}

export function resetDemoAuditRecords(): void {
  const g = globalThis as unknown as Record<symbol, Map<string, AuditRecord[]> | undefined>
  g[DEMO_KEY] = undefined
}
