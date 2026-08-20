/*
 * The Profit Reality waterfall (D5).
 *
 * Gross revenue -> Etsy fees -> payment processing -> Offsite Ads -> shipping
 * -> COGS -> labour -> other costs = net profit.
 *
 * Two rules shape this module.
 *
 * 1. Net profit is COMPUTED from the lines, never asserted. A waterfall whose
 *    parts do not sum to its total is worse than no waterfall.
 *
 * 2. Coverage is reported beside the result, never folded into it. Coverage is
 *    the share of order value carrying a confirmed, listing-specific cost; the
 *    remainder falls back to the seller's default rule (artboard 53-56: "Default
 *    rule - applies where no specific cost exists"). Orders that cannot be
 *    reconciled at all are excluded upstream rather than given an assumed cost,
 *    which is why the result is described as a floor.
 */

import type { EtsyOrder } from '@/lib/etsy/interface'
import { calculated, sellerInput, verified } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'

export interface CostInputs {
  /** Seller's shipping cost per order. */
  shippingPerOrder: number
  /** Seller's product cost as a fraction of price, 0-1. */
  cogsPercent: number
  labourTotal: number
  otherCosts: number
  /**
   * Fraction of order value carrying a CONFIRMED listing-specific cost, 0-1.
   * Reported, not applied - see rule 2 above.
   */
  coverage: number
}

export interface WaterfallLine {
  key: string
  label: string
  amount: number
  provenance: Provenanced<number>['provenance']
}

export interface ProfitResult {
  lines: WaterfallLine[]
  grossRevenue: number
  totalCosts: number
  netProfit: number
  marginPercent: number
  coveragePercent: number
  /** Stated plainly, never inferred from a chart gap. */
  missingData: string[]
}

export function computeWaterfall(orders: EtsyOrder[], costs: CostInputs): ProfitResult {
  const grossRevenue = sum(orders.map((o) => o.gross))
  const etsyFees = sum(orders.map((o) => o.etsyFees))
  const paymentProcessing = sum(orders.map((o) => o.paymentProcessing))
  const offsiteAds = sum(orders.map((o) => o.offsiteAds))

  // Seller cost rates apply to the whole period. Where a listing has no
  // specific cost the seller's default rule supplies one, so every order in the
  // reconciled set carries a cost - `coverage` says how many of those were
  // confirmed rather than defaulted.
  const shipping = round2(costs.shippingPerOrder * orders.length)
  const cogs = round2(grossRevenue * costs.cogsPercent)
  const labour = round2(costs.labourTotal)
  const otherCosts = round2(costs.otherCosts)

  const totalCosts = round2(
    etsyFees + paymentProcessing + offsiteAds + shipping + cogs + labour + otherCosts,
  )
  const netProfit = round2(grossRevenue - totalCosts)
  const marginPercent = grossRevenue === 0 ? 0 : round1((netProfit / grossRevenue) * 100)
  const coveragePercent = Math.round(costs.coverage * 100)

  const verifiedSource = 'Your Etsy order receipts'

  const lines: WaterfallLine[] = [
    line('gross', 'Gross revenue', round2(grossRevenue), verified(null, verifiedSource).provenance),
    line('etsyFees', 'Etsy fees', -round2(etsyFees), verified(null, verifiedSource).provenance),
    line('processing', 'Payment processing', -round2(paymentProcessing), verified(null, verifiedSource).provenance),
    line('offsiteAds', 'Offsite Ads', -round2(offsiteAds), verified(null, verifiedSource).provenance),
    line('shipping', 'Shipping', -shipping, sellerInput(null).provenance),
    line('cogs', 'COGS', -cogs, sellerInput(null).provenance),
    line('labour', 'Labour', -labour, sellerInput(null).provenance),
    line('other', 'Other costs', -otherCosts, sellerInput(null).provenance),
    line(
      'net',
      'Net profit',
      netProfit,
      calculated(null, 'Gross revenue minus every cost line above.', {
        coverage: coveragePercent,
      }).provenance,
    ),
  ]

  return {
    lines,
    grossRevenue: round2(grossRevenue),
    totalCosts,
    netProfit,
    marginPercent,
    coveragePercent,
    missingData: describeMissing(coveragePercent, costs),
  }
}

function describeMissing(coveragePercent: number, costs: CostInputs): string[] {
  const missing: string[] = []
  if (coveragePercent < 100) {
    missing.push(
      `Costs are confirmed for ${coveragePercent}% of order value. The rest is costed by your default rule, which is your own assumption rather than a confirmed cost, so net profit is only as good as that rule.`,
    )
  }
  if (costs.labourTotal === 0) missing.push('No labour minutes recorded per product.')
  missing.push('Etsy does not expose ad spend per listing.')
  return missing
}

function line(
  key: string,
  label: string,
  amount: number,
  provenance: WaterfallLine['provenance'],
): WaterfallLine {
  return { key, label, amount, provenance }
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
