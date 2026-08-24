/*
 * Where audit records live until there is a database.
 *
 * Append-only by construction: there is no update and no delete, and the read
 * hands out copies. That is not decoration — the page tells the seller "this
 * record cannot be edited or removed", and a store with a `remove` on it would
 * make that a promise about discipline rather than about the code.
 *
 * globalThis for the same reason as the billing and cost stores: a route
 * handler and a page are separate server bundles, so a module-level array is
 * two arrays, and a record appended by a POST would be invisible to the page
 * that renders the log.
 */

import { isEmptyDataset } from '@/lib/etsy/demo-dataset'
import type { AuditRecord } from './types'
import { demoAuditRecords } from './demo-records'

const STORE_KEY = Symbol.for('etsypilot.auditlog.store')

function store(): Map<string, AuditRecord[]> {
  const g = globalThis as unknown as Record<symbol, Map<string, AuditRecord[]> | undefined>
  const existing = g[STORE_KEY]
  if (existing) return existing
  const fresh = new Map<string, AuditRecord[]>()
  g[STORE_KEY] = fresh
  return fresh
}

function recordsFor(shopId: string): AuditRecord[] {
  const existing = store().get(shopId)
  if (existing) return existing
  /*
   * A shop with nothing in it has done nothing, so its log is empty.
   *
   * Seeding the eight demo records regardless made "Nothing has happened on
   * this shop yet" unreachable — an empty state that exists in the code and
   * cannot be rendered is an empty state nobody has ever looked at, which is
   * how a health score of 100/100 came to sit above "covers 0% of your
   * listings" for eleven phases.
   */
  const seeded = (isEmptyDataset() ? [] : demoAuditRecords()).map((record, seq) => ({
    ...record,
    seq,
  }))
  store().set(shopId, seeded)
  return seeded
}

/** Newest first, as a copy. Nothing a caller does to the result changes the log. */
export function readAuditRecords(shopId: string): AuditRecord[] {
  return [...recordsFor(shopId)].sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * Add one record. There is deliberately no counterpart.
 *
 * The one call site outside tests is the cost settings route, which is how
 * "Cost rule changed · Shop-wide · — EtsyPilot only" gets into the log by
 * happening rather than by being written down.
 */
export function appendAuditRecord(shopId: string, record: AuditRecord): void {
  const records = recordsFor(shopId)
  // The sequence is assigned here, never by the caller. A caller that could
  // choose one could choose a duplicate.
  records.push({ ...record, seq: records.length })
}

/** Test helper. Not exported through the service. */
export function resetAuditRecords(): void {
  store().clear()
}
