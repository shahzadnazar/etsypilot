/*
 * Scenarios: Conservative / Base / Optimistic.
 *
 * Note the signature of `computeScenario`: it takes VerifiedTotals and
 * SellerAssumptions as separate parameters, and only the assumptions are
 * mutable. A scenario has no way to receive an adjusted Etsy fee, because there
 * is no parameter through which one could be passed.
 *
 * The provenance consequence is the interesting part. In BASE, the verified
 * lines are what Etsy reported, so they stay VERIFIED. In CONSERVATIVE and
 * OPTIMISTIC the sales volume is varied, which means the fee lines are no
 * longer what Etsy reported - they are projections. So they are relabelled
 * CALCULATED, with the projection stated. A scenario that kept calling them
 * "Verified" would be claiming Etsy confirmed a hypothetical.
 */

import { calculated, sellerInput, verified } from '@/lib/provenance/builders'
import type { Provenance, ProvenanceType } from '@/lib/provenance/types'
import type {
  MissingDataItem,
  ProfitResult,
  ScenarioKind,
  SellerAssumptions,
  VerifiedTotals,
  WaterfallLine,
} from './types'

/** How each scenario shifts the seller's own assumptions and their volume. */
interface ScenarioShape {
  /** Multiplier on sales volume. Fees scale with it. */
  salesMultiplier: number
  /** Multiplier on the seller's cost assumptions. */
  costMultiplier: number
  basis: string
}

export const SCENARIO_SHAPES: Record<ScenarioKind, ScenarioShape> = {
  CONSERVATIVE: { salesMultiplier: 1, costMultiplier: 1.12, basis: 'Costs high, sales flat' },
  BASE: { salesMultiplier: 1, costMultiplier: 1, basis: 'Your confirmed inputs' },
  OPTIMISTIC: { salesMultiplier: 1.08, costMultiplier: 0.94, basis: 'Costs low, sales up 8%' },
}

export function computeScenario(
  /** Immutable. Nothing in this function writes to it. */
  verifiedTotals: VerifiedTotals,
  assumptions: SellerAssumptions,
  args: { scenario: ScenarioKind; coverage: number; missingData: MissingDataItem[] },
): ProfitResult {
  const shape = SCENARIO_SHAPES[args.scenario]
  const isBase = args.scenario === 'BASE'

  // Volume scales revenue and the fees that follow from it.
  const grossRevenue = round2(verifiedTotals.grossRevenue * shape.salesMultiplier)
  const etsyFees = round2(verifiedTotals.etsyFees * shape.salesMultiplier)
  const paymentProcessing = round2(verifiedTotals.paymentProcessing * shape.salesMultiplier)
  const offsiteAds = round2(verifiedTotals.offsiteAds * shape.salesMultiplier)
  const orderCount = verifiedTotals.orderCount * shape.salesMultiplier

  // The seller's own numbers move with the scenario.
  const shipping = round2(assumptions.shippingPerOrder * orderCount * shape.costMultiplier)
  const cogs = round2(grossRevenue * assumptions.cogsPercent * shape.costMultiplier)
  const labour = round2(assumptions.labourTotal * shape.costMultiplier)
  const otherCosts = round2(assumptions.otherCosts * shape.costMultiplier)

  const totalCosts = round2(
    etsyFees + paymentProcessing + offsiteAds + shipping + cogs + labour + otherCosts,
  )
  const netProfit = round2(grossRevenue - totalCosts)

  /*
   * A projected fee is not a verified one. Outside BASE these carry CALCULATED
   * with the projection named, so the badge never claims Etsy confirmed a
   * number it was never asked about.
   */
  const revenueProvenance: Provenance = isBase
    ? verified(null, 'Your Etsy order receipts').provenance
    : calculated(null, `Projected from your verified revenue at ${shape.basis.toLowerCase()}.`)
        .provenance

  const lines: WaterfallLine[] = [
    line('gross', 'Gross revenue', grossRevenue, revenueProvenance),
    line('etsyFees', 'Etsy fees', -etsyFees, revenueProvenance),
    line('processing', 'Payment processing', -paymentProcessing, revenueProvenance),
    line('offsiteAds', 'Offsite Ads', -offsiteAds, revenueProvenance),
    line('shipping', 'Shipping', -shipping, sellerInput(null).provenance),
    line('cogs', 'COGS', -cogs, sellerInput(null).provenance),
    line('labour', 'Labour', -labour, sellerInput(null).provenance),
    line('other', 'Other costs', -otherCosts, sellerInput(null).provenance),
    line(
      'net',
      'Net profit',
      netProfit,
      calculated(null, 'Gross revenue minus every cost line above.', {
        coverage: Math.round(args.coverage * 100),
      }).provenance,
    ),
  ]

  return {
    scenario: args.scenario,
    lines,
    grossRevenue,
    totalCosts,
    netProfit,
    marginPercent: grossRevenue === 0 ? 0 : round1((netProfit / grossRevenue) * 100),
    coveragePercent: Math.round(args.coverage * 100),
    missingData: args.missingData,
  }
}

export interface ScenarioComparison {
  kind: ScenarioKind
  basis: string
  netProfit: number
  marginPercent: number
}

/** All three, for side-by-side comparison. */
export function buildScenarios(
  verifiedTotals: VerifiedTotals,
  assumptions: SellerAssumptions,
  args: { coverage: number; missingData: MissingDataItem[] },
): { results: Record<ScenarioKind, ProfitResult>; comparison: ScenarioComparison[] } {
  const results = {
    CONSERVATIVE: computeScenario(verifiedTotals, assumptions, { ...args, scenario: 'CONSERVATIVE' }),
    BASE: computeScenario(verifiedTotals, assumptions, { ...args, scenario: 'BASE' }),
    OPTIMISTIC: computeScenario(verifiedTotals, assumptions, { ...args, scenario: 'OPTIMISTIC' }),
  }

  return {
    results,
    comparison: (['CONSERVATIVE', 'BASE', 'OPTIMISTIC'] as const).map((kind) => ({
      kind,
      basis: SCENARIO_SHAPES[kind].basis,
      netProfit: results[kind].netProfit,
      marginPercent: results[kind].marginPercent,
    })),
  }
}

/**
 * Which inputs the panel may edit.
 *
 * Returned as data so the UI renders locked rows from the verified side and
 * editable rows from the assumption side, without either list being assembled
 * by hand at the call site.
 */
export interface InputRow {
  key: string
  label: string
  value: string
  /** Verified rows are locked. There is no editable variant of them. */
  locked: boolean
  /**
   * Locked is not the same as verified (D32).
   *
   * Average price and the effective fee rate are locked because a seller must
   * not adjust them - but they are ratios DERIVED from verified figures, not
   * numbers Etsy reported. They carry CALCULATED, and the design agrees:
   * artboard 51 labels "Average order" Calculated for exactly this reason.
   */
  provenance: ProvenanceType
  note?: string
}

export function inputRows(
  verifiedTotals: VerifiedTotals,
  assumptions: SellerAssumptions,
  currency: string,
): InputRow[] {
  const money = (n: number) => formatMoney(n, currency)
  return [
    {
      key: 'sales',
      label: 'Sales',
      value: `${verifiedTotals.orderCount} orders`,
      locked: true,
      // A count of receipts is an exact aggregate, not a transform.
      provenance: 'VERIFIED',
      note: 'counted from your receipts',
    },
    {
      key: 'averagePrice',
      label: 'Average price',
      value: money(verifiedTotals.grossRevenue / Math.max(1, verifiedTotals.orderCount)),
      locked: true,
      provenance: 'CALCULATED',
      note: 'revenue ÷ orders',
    },
    {
      key: 'etsyFees',
      label: 'Etsy fees',
      value: `${((verifiedTotals.etsyFees / verifiedTotals.grossRevenue) * 100).toFixed(1)}%`,
      locked: true,
      provenance: 'CALCULATED',
      note: 'fees ÷ revenue',
    },
    {
      key: 'ads',
      label: 'Offsite Ads',
      value: money(verifiedTotals.offsiteAds),
      locked: true,
      provenance: 'VERIFIED',
      note: 'charged by Etsy',
    },
    { key: 'cogs', label: 'COGS', value: `${(assumptions.cogsPercent * 100).toFixed(1)}%`, locked: false, provenance: 'SELLER_INPUT' },
    { key: 'shipping', label: 'Shipping', value: `${money(assumptions.shippingPerOrder)} / order`, locked: false, provenance: 'SELLER_INPUT' },
    { key: 'labour', label: 'Labour', value: money(assumptions.labourTotal), locked: false, provenance: 'SELLER_INPUT' },
    { key: 'other', label: 'Other costs', value: money(assumptions.otherCosts), locked: false, provenance: 'SELLER_INPUT' },
  ]
}

function line(key: string, label: string, amount: number, provenance: Provenance): WaterfallLine {
  return { key, label, amount, provenance }
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
