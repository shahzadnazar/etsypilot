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

import { calculated, sellerInput, unavailable, verified } from '@/lib/provenance/builders'
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
  // Discounts and refunds scale with volume for the same reason the fees do:
  // more orders means more of both. They are receipt facts, not assumptions,
  // so they sit with the verified lines and never move with costMultiplier.
  const discounts = round2(verifiedTotals.discounts * shape.salesMultiplier)
  const refunds = round2(verifiedTotals.refunds * shape.salesMultiplier)
  /*
   * ── A SCENARIO CANNOT PROJECT A FEE NOBODY HAS MEASURED ─────────────────
   *
   * Every scenario here scales the VERIFIED fee total by a sales multiplier.
   * With the fee total unknown there is nothing to scale: `null * 1.08` is
   * NaN, and `(fees ?? 0) * 1.08` is zero dressed as a projection. Both are
   * worse than the absence, because a scenario is explicitly a number the
   * seller is invited to plan against.
   *
   * So the fee lines stay null, and net profit with them. Revenue, discounts
   * and the seller's own costs still project — those are known — which is why
   * the screen can still show the shape of the waterfall and withhold exactly
   * the lines it cannot fill.
   */
  const feesKnown =
    verifiedTotals.etsyFees !== null &&
    verifiedTotals.paymentProcessing !== null &&
    verifiedTotals.offsiteAds !== null
  const etsyFees = feesKnown ? round2(verifiedTotals.etsyFees! * shape.salesMultiplier) : null
  const paymentProcessing = feesKnown
    ? round2(verifiedTotals.paymentProcessing! * shape.salesMultiplier)
    : null
  const offsiteAds = feesKnown ? round2(verifiedTotals.offsiteAds! * shape.salesMultiplier) : null
  const orderCount = verifiedTotals.orderCount * shape.salesMultiplier

  // The seller's own numbers move with the scenario.
  const shipping = round2(assumptions.shippingPerOrder * orderCount * shape.costMultiplier)
  const cogs = round2(grossRevenue * assumptions.cogsPercent * shape.costMultiplier)
  const labour = round2(assumptions.labourTotal * shape.costMultiplier)
  const otherCosts = round2(assumptions.otherCosts * shape.costMultiplier)

  const totalCosts =
    etsyFees === null || paymentProcessing === null || offsiteAds === null
      ? null
      : round2(
          discounts +
            refunds +
            etsyFees +
            paymentProcessing +
            offsiteAds +
            shipping +
            cogs +
            labour +
            otherCosts,
        )
  const netProfit = totalCosts === null ? null : round2(grossRevenue - totalCosts)

  /*
   * A projected fee is not a verified one. Outside BASE these carry CALCULATED
   * with the projection named, so the badge never claims Etsy confirmed a
   * number it was never asked about.
   */
  const revenueProvenance: Provenance = isBase
    ? verified(null, 'Your Etsy order receipts').provenance
    : calculated(null, `Projected from your verified revenue at ${shape.basis.toLowerCase()}.`)
        .provenance

  /*
   * The fee lines' own badge. VERIFIED/CALCULATED while the figure is real;
   * UNAVAILABLE when it is not, with the reason and the fact that there is no
   * remedy the seller can apply.
   */
  const feeProvenance: Provenance = feesKnown
    ? revenueProvenance
    : unavailable(
        'Etsy reports fees through the payment-account ledger, not the order receipt, and that ledger has not been read for this period.',
        'Not something you can fix — EtsyPilot has to read it. Until then every figure that depends on fees is withheld rather than estimated.',
      ).provenance

  const lines: WaterfallLine[] = [
    line('gross', 'Gross revenue', grossRevenue, revenueProvenance),
    line('discounts', 'Discounts', deduction(discounts), revenueProvenance),
    line('refunds', 'Refunds', deduction(refunds), revenueProvenance),
    line('etsyFees', 'Etsy fees', etsyFees === null ? null : deduction(etsyFees), feeProvenance),
    line('processing', 'Payment processing', paymentProcessing === null ? null : deduction(paymentProcessing), feeProvenance),
    line('offsiteAds', 'Offsite Ads', offsiteAds === null ? null : deduction(offsiteAds), feeProvenance),
    line('shipping', 'Shipping', deduction(shipping), sellerInput(null).provenance),
    line('cogs', 'COGS', deduction(cogs), sellerInput(null).provenance),
    line('labour', 'Labour', deduction(labour), sellerInput(null).provenance),
    line('other', 'Other costs', deduction(otherCosts), sellerInput(null).provenance),
    line(
      'net',
      'Net profit',
      netProfit,
      netProfit === null
        ? unavailable(
            'Net profit cannot be calculated while Etsy\u2019s fees for this period are unknown.',
            'Revenue and your own costs are known; the fee lines above are not, and net profit without them would read higher than the truth.',
          ).provenance
        : calculated(null, 'Gross revenue minus every cost line above.', {
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
    marginPercent:
      netProfit === null || grossRevenue === 0 ? null : round1((netProfit / grossRevenue) * 100),
    coveragePercent: Math.round(args.coverage * 100),
    missingData: args.missingData,
  }
}

export interface ScenarioComparison {
  kind: ScenarioKind
  basis: string
  /** NULL when fees for the period are unknown. A scenario cannot project one. */
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
      /*
       * A RATE NEEDS A NUMERATOR. With the fee total unknown this read
       * `(null / revenue) * 100` — which is 0.0%, printed as a locked,
       * CALCULATED input the seller plans against. An em dash and an
       * UNAVAILABLE badge instead.
       */
      value:
        verifiedTotals.etsyFees === null
          ? '—'
          : `${((verifiedTotals.etsyFees / verifiedTotals.grossRevenue) * 100).toFixed(1)}%`,
      locked: true,
      provenance: verifiedTotals.etsyFees === null ? 'UNAVAILABLE' : 'CALCULATED',
      note: verifiedTotals.etsyFees === null ? 'ledger not read' : 'fees ÷ revenue',
    },
    {
      key: 'ads',
      label: 'Offsite Ads',
      value: verifiedTotals.offsiteAds === null ? '—' : money(verifiedTotals.offsiteAds),
      locked: true,
      provenance: verifiedTotals.offsiteAds === null ? 'UNAVAILABLE' : 'VERIFIED',
      note: verifiedTotals.offsiteAds === null ? 'ledger not read' : 'charged by Etsy',
    },
    { key: 'cogs', label: 'COGS', value: `${(assumptions.cogsPercent * 100).toFixed(1)}%`, locked: false, provenance: 'SELLER_INPUT' },
    { key: 'shipping', label: 'Shipping', value: `${money(assumptions.shippingPerOrder)} / order`, locked: false, provenance: 'SELLER_INPUT' },
    { key: 'labour', label: 'Labour', value: money(assumptions.labourTotal), locked: false, provenance: 'SELLER_INPUT' },
    { key: 'other', label: 'Other costs', value: money(assumptions.otherCosts), locked: false, provenance: 'SELLER_INPUT' },
  ]
}

/**
 * A deduction's amount: the negation of a cost, without producing `-0`.
 *
 * `-round2(0)` is negative zero, which `Object.is` and JSON round-trips treat
 * as distinct from 0 — found by an assertion on a shop whose Etsy fees were
 * genuinely zero. It is invisible to the seller only by luck:
 * formatSignedCurrency takes Math.abs and prefixes the sign from `value < 0`,
 * which is false for -0, so it renders "$0.00". A naive formatter would not
 * be so kind — `Intl.NumberFormat(...).format(-0)` is "-$0.00", measured.
 *
 * Negating zero is meaningless either way, so the data does not carry it.
 */
function deduction(amount: number): number {
  return amount === 0 ? 0 : -amount
}

function line(
  key: string,
  label: string,
  amount: number | null,
  provenance: Provenance,
): WaterfallLine {
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
