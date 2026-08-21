/*
 * Profit Reality types.
 *
 * The load-bearing decision here is the split between VerifiedTotals and
 * SellerAssumptions.
 *
 * A seller must never be able to "adjust" an Etsy fee. Rather than guarding
 * that in the inputs panel, the two kinds of number are different types, and
 * the scenario function accepts only assumptions. There is no parameter through
 * which a verified figure could be varied, so the guarantee holds no matter
 * what a future UI does.
 */

import type { Provenance } from '@/lib/provenance/types'

/**
 * Read from the seller's own Etsy receipts. Immutable at every level.
 *
 * `readonly` here is a statement of intent as much as a compiler check: nothing
 * in this domain writes to these, and a scenario cannot take them as input.
 */
export interface VerifiedTotals {
  readonly grossRevenue: number
  readonly etsyFees: number
  readonly paymentProcessing: number
  readonly offsiteAds: number
  readonly orderCount: number
}

/**
 * The seller's own numbers. These, and only these, vary between scenarios.
 */
export interface SellerAssumptions {
  shippingPerOrder: number
  /** Product cost as a fraction of price, 0-1. */
  cogsPercent: number
  labourTotal: number
  otherCosts: number
}

export const SCENARIO_KINDS = ['CONSERVATIVE', 'BASE', 'OPTIMISTIC'] as const
export type ScenarioKind = (typeof SCENARIO_KINDS)[number]

export interface WaterfallLine {
  key: string
  label: string
  amount: number
  provenance: Provenance
}

/** Something the seller can do about a gap or an exception. Never optional. */
export interface Resolution {
  label: string
  href: string
  /** PRIMARY is the action most sellers should take. */
  kind: 'PRIMARY' | 'SECONDARY'
}

/**
 * Incomplete coverage is a first-class state, not an error and not a footnote.
 * Each gap says what is missing, what it costs the seller in certainty, and
 * what they can do about it.
 */
export interface MissingDataItem {
  code: string
  title: string
  detail: string
  /** Order value affected, where it can be quantified. */
  affectedValue?: number
  resolutions: Resolution[]
}

export interface ProfitResult {
  scenario: ScenarioKind
  lines: WaterfallLine[]
  grossRevenue: number
  totalCosts: number
  netProfit: number
  /*
   * Null when there is no revenue to be a margin OF.
   *
   * It used to be `grossRevenue === 0 ? 0 : ...`, so a shop with no sales and
   * $1,322 of fixed costs reported a net margin of 0.0% — which reads as
   * breaking even, next to a net profit of −$1,322.05. Zero is a real margin;
   * this is the absence of one, and the product already distinguishes those
   * everywhere else (D34a).
   */
  marginPercent: number | null
  coveragePercent: number
  missingData: MissingDataItem[]
}

/* ------------------------------------------------------- reconciliation */

export type ReconciliationStatus = 'MATCHED' | 'PARTIAL' | 'UNMATCHED'

export interface TransactionRow {
  orderId: string
  listingTitle: string
  placedAt: string
  gross: number
  fees: number
  /** null when no confirmed cost exists — never a guessed figure. */
  cost: number | null
  /** null whenever cost is null: profit is not computed from an assumption. */
  profit: number | null
  status: ReconciliationStatus
  /** Why it is not matched, in plain language. Empty for MATCHED. */
  reason?: string
  /** Every exception has a way out. Empty only for MATCHED. */
  resolutions: Resolution[]
}

export interface ReconciliationSummary {
  matched: number
  partial: number
  unmatched: number
  /** Order value with no confirmed cost, so no per-order profit is computed. */
  excludedValue: number
  /** Order value carrying a confirmed per-listing cost. */
  confirmedGross: number
  /** Order value costed by the seller's default rule instead. */
  ruleCostedGross: number
  /** Measured share of order value with a confirmed cost. Never a constant. */
  coveragePercent: number
  rows: TransactionRow[]
}

export const SCENARIO_LABEL: Record<ScenarioKind, string> = {
  CONSERVATIVE: 'Conservative',
  BASE: 'Base',
  OPTIMISTIC: 'Optimistic',
}

export const STATUS_LABEL: Record<ReconciliationStatus, string> = {
  MATCHED: 'Matched',
  PARTIAL: 'Partial',
  UNMATCHED: 'Unmatched',
}
