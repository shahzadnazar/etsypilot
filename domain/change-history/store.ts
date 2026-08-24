/*
 * Where change jobs live until there is a database.
 *
 * Append-only, like the audit log store and for the same reason: the page tells
 * the seller this is an immutable trail, and a store with an update on it would
 * make that a promise about discipline.
 *
 * A rollback does not delete the job it reverses — it appends a new one. That
 * is enforced here by there being no other way to change the list.
 */

import { isEmptyDataset } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import { demoChangeJobs } from './demo-jobs'
import type { ChangeJob } from './types'

const STORE_KEY = Symbol.for('etsypilot.changehistory.store')

function store(): Map<string, ChangeJob[]> {
  const g = globalThis as unknown as Record<symbol, Map<string, ChangeJob[]> | undefined>
  const existing = g[STORE_KEY]
  if (existing) return existing
  const fresh = new Map<string, ChangeJob[]>()
  g[STORE_KEY] = fresh
  return fresh
}

function jobsFor(shopId: string, listings: EtsyListing[]): ChangeJob[] {
  const existing = store().get(shopId)
  if (existing) return existing
  // A shop with nothing in it has changed nothing.
  const seeded = isEmptyDataset() ? [] : demoChangeJobs(listings)
  store().set(shopId, seeded)
  return seeded
}

/** Newest first, as a copy. */
export function readChangeJobs(shopId: string, listings: EtsyListing[]): ChangeJob[] {
  return [...jobsFor(shopId, listings)].sort((a, b) => b.at.localeCompare(a.at))
}

export function appendChangeJob(shopId: string, listings: EtsyListing[], job: ChangeJob): void {
  jobsFor(shopId, listings).push(job)
}

/** Test helper. */
export function resetChangeJobs(): void {
  store().clear()
}
