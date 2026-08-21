/*
 * The fee breakdown. Pure, and every line shows its own arithmetic.
 *
 * "Shows the formula" is the whole point of this tool — a seller who cannot
 * see which rate hit which number has been given a figure to take on trust,
 * which is exactly what this product exists not to do.
 */

import { DEFAULT_FEE_RATES, FEE_LIMITATIONS, FEE_RULES_EFFECTIVE, type FeeRate } from './rules'

export interface FeeInput {
  /** What the buyer pays for the item. */
  itemPrice: number
  /** Shipping the buyer pays you. Zero for free shipping. */
  shipping: number
  /** Sales tax collected. Included in the processing basis, not the transaction one. */
  tax: number
  /** True when Etsy attributed the sale to one of its ads. */
  offsiteAd: boolean
  rates?: FeeRate[]
}

export interface FeeLine {
  key: string
  label: string
  amount: number
  /** e.g. "6.5% of $24.50" — this line's own arithmetic, with real numbers. */
  formula: string
  note: string
}

export interface FeeBreakdown {
  lines: FeeLine[]
  totalFees: number
  /** What reaches the seller before their own costs. */
  netToSeller: number
  /** Fees as a share of what the buyer paid. */
  effectivePercent: number
  buyerPays: number
  effectiveFrom: string
  limitations: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const money = (n: number) => `$${n.toFixed(2)}`

export function calculateFees(input: FeeInput): FeeBreakdown {
  const rates = input.rates ?? DEFAULT_FEE_RATES
  const itemPrice = Math.max(0, input.itemPrice)
  const shipping = Math.max(0, input.shipping)
  const tax = Math.max(0, input.tax)

  /*
   * Three different bases, and they are genuinely different — this is the part
   * sellers get wrong by hand, and the reason a flat "6.5% of the price" answer
   * is usually too low.
   */
  const transactionBasis = round2(itemPrice + shipping)
  const buyerPays = round2(itemPrice + shipping + tax)

  const lines: FeeLine[] = []
  for (const rate of rates) {
    if (rate.key === 'offsite' && !input.offsiteAd) {
      /*
       * Not silently skipped. A seller who does not see the line cannot tell
       * whether it was excluded or forgotten, so it is shown at zero with the
       * reason attached.
       */
      lines.push({
        key: rate.key,
        label: rate.label,
        amount: 0,
        formula: 'Not charged — this sale was not attributed to an Etsy ad',
        note: rate.note,
      })
      continue
    }

    const basis =
      rate.key === 'listing' ? 0 : rate.key === 'transaction' ? transactionBasis : buyerPays
    const amount = round2(basis * rate.percent + rate.flat)

    const parts: string[] = []
    if (rate.percent > 0) parts.push(`${(rate.percent * 100).toFixed(2).replace(/\.?0+$/, '')}% of ${money(basis)}`)
    if (rate.flat > 0) parts.push(money(rate.flat))

    lines.push({
      key: rate.key,
      label: rate.label,
      amount,
      formula: parts.length ? parts.join(' + ') : 'Not charged at your rates',
      note: rate.note,
    })
  }

  const totalFees = round2(lines.reduce((sum, l) => sum + l.amount, 0))

  return {
    lines,
    totalFees,
    // Tax is collected FOR the buyer's state, not earned, so it is not income
    // to the seller and is excluded here even though fees were charged on it.
    netToSeller: round2(itemPrice + shipping - totalFees),
    effectivePercent: buyerPays === 0 ? 0 : Math.round((totalFees / buyerPays) * 1000) / 10,
    buyerPays,
    effectiveFrom: FEE_RULES_EFFECTIVE,
    limitations: [...FEE_LIMITATIONS],
  }
}
