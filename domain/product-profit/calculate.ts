/*
 * One product, end to end.
 *
 * The same eight-cost shape as Profit Reality, for a single item and with
 * nothing read from Etsy — so a seller can price something before they list
 * it, or check an existing product without connecting a shop.
 *
 * It reuses the fee engine rather than restating rates, because two fee
 * calculations in one product will disagree eventually and the seller has no
 * way to tell which is right.
 */

import { calculateFees } from '@/domain/fees/calculate'
import type { FeeRate } from '@/domain/fees/rules'

export interface ProductProfitInput {
  price: number
  shippingCharged: number
  /** What the item costs you to make or buy. */
  materials: number
  /** Packaging, labels, inserts. */
  packaging: number
  /** What you pay to ship it, which is rarely what you charge. */
  shippingCost: number
  /** Minutes of your time per unit. */
  minutes: number
  /** What you value an hour at. */
  hourlyRate: number
  rates?: FeeRate[]
}

export interface CostLine {
  key: string
  label: string
  amount: number
  formula: string
}

export interface ProductProfitResult {
  revenue: number
  lines: CostLine[]
  totalCosts: number
  profit: number
  /** Null when there is no revenue to be a margin of (D57b). */
  marginPercent: number | null
  /** Price at which profit reaches zero, holding costs constant. */
  breakEvenPrice: number
  /** Set when the item loses money. Says so plainly. */
  warning: string | null
  limitations: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateProductProfit(input: ProductProfitInput): ProductProfitResult {
  const revenue = round2(Math.max(0, input.price) + Math.max(0, input.shippingCharged))

  const fees = calculateFees({
    itemPrice: Math.max(0, input.price),
    shipping: Math.max(0, input.shippingCharged),
    tax: 0,
    offsiteAd: false,
    ...(input.rates ? { rates: input.rates } : {}),
  })

  const labour = round2((Math.max(0, input.minutes) / 60) * Math.max(0, input.hourlyRate))

  const lines: CostLine[] = [
    {
      key: 'fees',
      label: 'Etsy fees',
      amount: fees.totalFees,
      formula: `${fees.effectivePercent}% of the $${revenue.toFixed(2)} the buyer pays`,
    },
    { key: 'materials', label: 'Materials', amount: round2(Math.max(0, input.materials)), formula: 'What you entered' },
    { key: 'packaging', label: 'Packaging', amount: round2(Math.max(0, input.packaging)), formula: 'What you entered' },
    {
      key: 'shipping',
      label: 'Postage you pay',
      amount: round2(Math.max(0, input.shippingCost)),
      formula: `You charge $${Math.max(0, input.shippingCharged).toFixed(2)} and pay $${Math.max(0, input.shippingCost).toFixed(2)}`,
    },
    {
      key: 'labour',
      label: 'Your time',
      amount: labour,
      /*
       * Labour is a cost even when nobody invoices for it. Leaving it out is
       * how a handmade seller concludes a product is profitable at an hourly
       * rate below minimum wage — the single most useful thing this tool can
       * show, so it is a line rather than an option.
       */
      formula: `${Math.max(0, input.minutes)} min at $${Math.max(0, input.hourlyRate).toFixed(2)}/hr`,
    },
  ]

  const totalCosts = round2(lines.reduce((s, l) => s + l.amount, 0))
  const profit = round2(revenue - totalCosts)
  const nonFeeCosts = round2(totalCosts - fees.totalFees)

  return {
    revenue,
    lines,
    totalCosts,
    profit,
    marginPercent: revenue === 0 ? null : Math.round((profit / revenue) * 1000) / 10,
    /*
     * Break-even solves for price with the fee percentage applied, rather than
     * naively adding costs: raising the price raises the fee too, so
     * cost-plus-nothing is always short.
     */
    breakEvenPrice: round2(nonFeeCosts / Math.max(0.01, 1 - fees.effectivePercent / 100) - Math.max(0, input.shippingCharged)),
    warning:
      profit < 0
        ? `This product loses $${Math.abs(profit).toFixed(2)} on every sale at this price.`
        : null,
    limitations: [
      'Fees use published rates applied to the numbers you entered — not a charge Etsy has confirmed.',
      'Offsite Ads, currency conversion and sales tax are not included here.',
      'Your time is costed at the rate you set. If you left it at zero, this profit is paying you nothing for the work.',
    ],
  }
}
