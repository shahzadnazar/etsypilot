import 'server-only'

/*
 * The one place the demo shop's change jobs are allowed to leave the fixture.
 *
 * domain/change-history/store.ts was a Map on a global Symbol, seeded with
 * `demoChangeJobs(listings)` — the demo narrative rebuilt out of whatever
 * catalogue had just loaded. On a live shop that would have invented bulk jobs
 * over a real seller's own listings, each offering a rollback that would write
 * to Etsy. It never got that far: the page returned HTTP 500 first, because
 * the service asked the Etsy adapter for a catalogue it has no key for.
 *
 * Jobs are rows now (lib/repositories/change-jobs.ts). This keeps the demo
 * narrative, and the Map with it — in demo mode nothing may touch the
 * database, and the rollback walkthrough has to see the job it just created.
 */

import { isDemoMode } from '@/lib/etsy'
import { isEmptyDataset } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import { demoChangeJobs } from './demo-jobs'
import type { ChangeJob } from './types'

const DEMO_KEY = Symbol.for('etsypilot.changehistory.demo')

function demoStore(listings: EtsyListing[]): ChangeJob[] {
  const g = globalThis as unknown as Record<symbol, ChangeJob[] | undefined>
  const existing = g[DEMO_KEY]
  if (existing) return existing
  // A shop with nothing in it has changed nothing.
  const fresh = isEmptyDataset() ? [] : demoChangeJobs(listings)
  g[DEMO_KEY] = fresh
  return fresh
}

/** The demo shop's jobs, newest first, or null outside demo mode. */
export function demoChangeHistory(listings: EtsyListing[]): ChangeJob[] | null {
  if (!isDemoMode()) return null
  return [...demoStore(listings)].sort((a, b) => b.at.localeCompare(a.at))
}

/** Append in demo mode. Returns false when this is not a demo deployment. */
export function appendDemoChangeJob(listings: EtsyListing[], job: ChangeJob): boolean {
  if (!isDemoMode()) return false
  demoStore(listings).push(job)
  return true
}

/** Test helper. Not exported through the service. */
export function resetChangeJobs(): void {
  const g = globalThis as unknown as Record<symbol, ChangeJob[] | undefined>
  g[DEMO_KEY] = undefined
}
