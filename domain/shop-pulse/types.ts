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
import type { Diagnosis, EventType } from '@/lib/events/types'

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
  listingsTooNew: number
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
  orders: Baseline
  revenue: Baseline
  changes: DetectedChange[]
  counts: Record<Diagnosis, number>
}
