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
  /*
   * Money the seller gave back to buyers, and money taken off at checkout.
   *
   * Both are on the receipt and both reduce what the seller keeps, so both
   * belong here beside the fees. D74 added them to computeWaterfall and missed
   * this type, which is what Profit Reality actually renders — so the flagship
   * screen went on overstating net profit by exactly their sum while a passing
   * test covered the other implementation.
   */
  readonly discounts: number
  readonly refunds: number
  /**
   * NULL when the payment-account ledger has not been read for this period.
   *
   * ── THIS TYPE IS THE ONE THAT RENDERS, AND THAT HAS BITTEN BEFORE ──────
   *
   * The comment on `discounts` above records it: D74 added those lines to
   * computeWaterfall and missed this type, "which is what Profit Reality
   * actually renders — so the flagship screen went on overstating net profit
   * by exactly their sum while a passing test covered the other
   * implementation." The fee fix is the same shape, so it was made in both
   * places at once rather than in the one with the better tests.
   */
  readonly etsyFees: number | null
  readonly paymentProcessing: number | null
  readonly offsiteAds: number | null
  readonly orderCount: number
}

/**
 * The seller's own numbers. These, and only these, vary between scenarios.
 */
export interface SellerAssumptions {
  /**
   * The seller's own numbers. NULL means THEY HAVE NOT TOLD US.
   *
   * ── AN ASSUMPTION NOBODY MADE ─────────────────────────────────────────
   *
   * This screen's whole job is to separate verified figures from assumed
   * ones, and these four were DEMO_COST_INPUTS — a fictional shop's costs,
   * presented to a real seller as their own assumptions. The type could not
   * say otherwise: four plain numbers, so every caller had to invent four.
   *
   * Zero is not the fix. A COGS of 0% claims the seller's products cost
   * nothing to make, which is the direction that flatters — the same
   * direction the missing fee lines went.
   */
  shippingPerOrder: number | null
  /** Product cost as a fraction of price, 0-1. Null when unset. */
  cogsPercent: number | null
  labourTotal: number | null
  otherCosts: number | null
  /**
   * False when this seller has never set a cost rule at all.
   *
   * Distinct from "the numbers are null", which it implies but is not implied
   * by: a seller may have set three of four. The copy differs — "add your
   * costs" against "some of your cost figures are not set" — and only the
   * flag can tell them apart.
   */
  hasAnyRule: boolean
}

export const SCENARIO_KINDS = ['CONSERVATIVE', 'BASE', 'OPTIMISTIC'] as const
export type ScenarioKind = (typeof SCENARIO_KINDS)[number]

export interface WaterfallLine {
  key: string
  label: string
  /** NULL when the figure is not known. Never 0 standing in for unknown. */
  amount: number | null
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
  /** NULL when a cost line is unknown, so the total cannot be stated. */
  totalCosts: number | null
  /**
   * NULL when Etsy's fees for the period are unknown.
   *
   * Not a figure with a caveat beside it. Without the fees, gross minus the
   * costs we DO have lands above the truth, and this is the number sellers
   * act on. The operator console already refuses the name on the mirror-image
   * case (0% cost coverage); this is the fee half.
   */
  netProfit: number | null
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
  /**
   * null when Etsy's fees for this order are not known.
   *
   * Sits beside `cost` and `profit` below for the same reason they are
   * nullable: a figure this product does not hold must not be rendered as a
   * figure it does. The ledger row then shows an em dash for the fee and for
   * the profit that depended on it.
   */
  fees: number | null
  /** null when no confirmed cost exists — never a guessed figure. */
  cost: number | null
  /** null whenever cost or fees is null: profit is never computed from a gap. */
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
