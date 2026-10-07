/*
 * Shop Pulse types.
 *
 * The load-bearing rule: a Diagnosis cannot exist without the Evidence that
 * produced it. `DetectedChange` carries its evidence inline rather than by
 * reference, so a badge can never be rendered from a row that has none.
 *
 * EtsyPilot has no access to Etsy's ranking algorithm and does not model it.
 * Nothing in this module claims cause - only that observable things moved
 * together, or demonstrably did not.
 */

import type { Confidence } from '@/lib/provenance/types'
import type { Diagnosis, DomainEvent, EventType } from '@/lib/events/types'
import type { ShopDataSource } from '@/domain/sync/source'

/** One day of the baseline-vs-actual series. */
export interface BaselinePoint {
  date: string
  /** Verified from receipts. */
  actual: number
  /** Expected from this shop's own history, by weekday. */
  expected: number
  lower: number
  upper: number
  /** True when actual falls outside the expected band. */
  outside: boolean
}

export interface Baseline {
  metric: 'orders' | 'revenue'
  windowDays: number
  series: BaselinePoint[]
  /** Mean per day across the baseline window. */
  expectedTotal: number
  actualTotal: number
  deviationPercent: number
  /** Share of listings with enough history to baseline, 0-100. */
  coveragePercent: number
  /**
   * How many listings are too NEW to baseline, or null when we cannot tell.
   *
   * ── "TOO NEW" IS NOT THE SAME AS "HAS NOT SOLD" ───────────────────────
   *
   * This was DEMO_BASELINE.listingsTooNew — the fictional shop's count — on
   * every shop, rendered as "38 listings too new to baseline" under a live
   * seller's own coverage figure. The demo dataset knows which of its listings
   * are new because it made them. `listings` has no creation date, so on a
   * real shop a listing with no prior orders might be a week old or three
   * years old and unsold, and those want opposite advice.
   *
   * Null says that, and `coverageNote` says what WAS measured instead.
   */
  listingsTooNew: number | null
  /** What the coverage figure means, in words. Rendered beside it. */
  coverageNote: string
}

/** One alternative the engine tested, and what it found. */
export interface TestedAlternative {
  label: string
  verdict: Diagnosis
  note: string
}

/**
 * Why a diagnosis was reached. Never optional - see the module note.
 */
export interface Evidence {
  /** Timestamped facts, each independently checkable. */
  observed: string[]
  /** What else was considered, each with its own verdict. */
  alsoTested: TestedAlternative[]
  confidence: Confidence
  confidenceNote: string
  coveragePercent: number
  coverageNote: string
  limitations: string[]
}

export interface DetectedChange {
  id: string
  /** null when nothing in the event log corresponds - the UNKNOWN case. */
  eventType: EventType | null
  title: string
  /** "Jul 24 · PRICE_CHANGED · +18.4% average" */
  detail: string
  occurredAt: string
  /** Which listings or section the change touched. */
  scope: string
  affectedListingIds: string[]
  /** Order change on the affected listings after the event, as a percent. */
  ordersAfterPercent: number | null
  diagnosis: Diagnosis
  evidence: Evidence
  /** Where the seller can act on it. Every row goes somewhere. */
  destinations: { label: string; href: string }[]
}

export interface ShopPulseView {
  periodStart: string
  periodEnd: string
  currency: string
  /**
   * Where the orders behind these diagnoses came from.
   *
   * On the view because Shop Pulse's three labels — CORRELATED, RULED_OUT,
   * UNKNOWN — are all verdicts about data. "No changes detected" from an
   * unread shop is a fourth thing none of them can express, and a screen
   * cannot infer it from `changes.length === 0`.
   */
  source: ShopDataSource
  orders: Baseline
  revenue: Baseline
  changes: DetectedChange[]
  counts: Record<Diagnosis, number>
}

/**
 * One group of recorded events, and how to describe it.
 *
 * Hoisted out of service.ts when the specs stopped being a single authored
 * list. There are two producers now and they must agree on the shape:
 * `demoChangeSpecs()` in ./demo.ts writes the demo narrative by hand, and
 * `specsFromEvents()` in ./service.ts derives one per operation or per
 * type-and-day from a shop's own `events` rows.
 */
export interface ChangeSpec {
  id: string
  events: DomainEvent[]
  title: string
  scope: string
  listingIds: string[]
  detailSuffix: string
  destinations: { label: string; href: string }[]
}
