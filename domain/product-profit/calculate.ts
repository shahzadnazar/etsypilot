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

import { calculateFees, type FeeLine } from '@/domain/fees/calculate'
import { DEFAULT_FEE_RATES, type FeeRate } from '@/domain/fees/rules'

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
  /*
   * True when Etsy attributed THIS sale to one of its ads.
   *
   * Optional and false by default, which is the honest default rather than a
   * convenient one: Offsite Ads is charged per attributed order, not on every
   * sale, so defaulting it on would overstate the cost of every product a
   * seller prices here. The fee engine renders the line either way — at zero
   * with its reason attached — so a seller can see it was considered.
   */
  offsiteAd?: boolean
  /*
   * Anything else this sale costs that is not materials, packaging, postage or
   * time: a marketplace subscription apportioned per unit, a payment on a
   * tool, a studio cost. One field rather than five, because the useful thing
   * is that it is IN the arithmetic, not how it is itemised.
   */
  otherCosts?: number
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
  /*
   * Etsy's fees, one row per rate, with each row's own arithmetic.
   *
   * `lines` carries fees as a SINGLE total, because a seller reading a profit
   * statement wants one "Etsy fees" row beside materials and postage. But the
   * row is the one most worth opening: it is three or four different rates on
   * three different bases, and "6.5% of the price" — the figure sellers work
   * out by hand — is always too low.
   *
   * So the breakdown comes back WITH the result rather than being recomputed
   * by whoever wants it. Returning it is what let the marketing page's
   * fee-only calculator be retired into this one instead of running
   * `calculateFees` a second time beside it: two calls with the same inputs
   * agree today and are two things to keep in step tomorrow.
   */
  feeLines: FeeLine[]
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

/*
 * ── Math.max(0, NaN) IS NaN, AND THAT IS HOW NaN REACHED THE SCREEN ──────
 *
 * Every input here was clamped with `Math.max(0, x)`, which handles a negative
 * and passes NaN and Infinity straight through. One unparseable field then
 * turned every figure on the panel into "NaN" — which tells a seller their
 * input was fine and the arithmetic was not, the exact inversion of the truth.
 *
 * The component refuses a keystroke that would not parse, so this is the
 * second line of defence rather than the first. It is here, in the domain,
 * because the next caller will not be that component.
 */
const amount = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)

export function calculateProductProfit(input: ProductProfitInput): ProductProfitResult {
  const revenue = round2(amount(input.price) + amount(input.shippingCharged))

  const fees = calculateFees({
    itemPrice: amount(input.price),
    shipping: amount(input.shippingCharged),
    tax: 0,
    offsiteAd: input.offsiteAd ?? false,
    ...(input.rates ? { rates: input.rates } : {}),
  })

  const labour = round2((amount(input.minutes) / 60) * amount(input.hourlyRate))

  const lines: CostLine[] = [
    {
      key: 'fees',
      label: 'Etsy fees',
      amount: fees.totalFees,
      formula: `${fees.effectivePercent}% of the $${revenue.toFixed(2)} the buyer pays`,
    },
    { key: 'materials', label: 'Materials', amount: round2(amount(input.materials)), formula: 'What you entered' },
    { key: 'packaging', label: 'Packaging', amount: round2(amount(input.packaging)), formula: 'What you entered' },
    {
      key: 'shipping',
      label: 'Postage you pay',
      amount: round2(amount(input.shippingCost)),
      formula: `You charge $${amount(input.shippingCharged).toFixed(2)} and pay $${amount(input.shippingCost).toFixed(2)}`,
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
      formula: `${amount(input.minutes)} min at $${amount(input.hourlyRate).toFixed(2)}/hr`,
    },
  ]

  /*
   * Other costs is the only line that is omitted when it is zero, and the
   * asymmetry is deliberate. The five lines above are always true of a
   * product — it is made of something, it goes in something, it is posted,
   * somebody's hour went into it, Etsy takes its cut — so a zero there is a
   * seller's answer and worth showing. "Other" at zero is the absence of a
   * question, and a permanent $0.00 row teaches a reader to skip the column.
   */
  const other = round2(amount(input.otherCosts ?? 0))
  if (other > 0) {
    lines.push({
      key: 'other',
      label: 'Other costs',
      amount: other,
      formula: 'What you entered',
    })
  }

  const totalCosts = round2(lines.reduce((s, l) => s + l.amount, 0))
  const profit = round2(revenue - totalCosts)
  const nonFeeCosts = round2(totalCosts - fees.totalFees)

  /*
   * The two halves of the fee schedule, for the break-even solve below.
   *
   * Offsite Ads is included only when this sale is said to have come from an
   * ad, because that is the only time it is charged — and `calculateFees`
   * makes the same exclusion, so the two cannot disagree about it. The listing
   * fee contributes its flat amount and no percentage: it is charged per
   * listing rather than on the sale, which is why its basis is zero there too.
   */
  const chargedRates = (input.rates ?? DEFAULT_FEE_RATES).filter(
    (rate) => rate.key !== 'offsite' || (input.offsiteAd ?? false),
  )
  const flatFees = round2(chargedRates.reduce((sum, rate) => sum + rate.flat, 0))
  const percentOfRevenue = chargedRates.reduce(
    (sum, rate) => sum + (rate.key === 'listing' ? 0 : rate.percent),
    0,
  )

  return {
    revenue,
    lines,
    feeLines: fees.lines,
    totalCosts,
    profit,
    marginPercent: revenue === 0 ? null : Math.round((profit / revenue) * 1000) / 10,
    /*
     * ── BREAK-EVEN SOLVES THE EQUATION, AND IT USED TO APPROXIMATE IT ────
     *
     * The principle was right from the start: raising the price raises the
     * fee with it, so cost-plus-nothing is always short of break-even.
     *
     * The arithmetic was not. It divided by the EFFECTIVE fee percentage,
     * which is total fees over what the buyer paid — and total fees include
     * the flat ones, the $0.20 listing fee and the $0.25 of processing. A
     * flat charge does not scale with the price, so folding it into a
     * percentage and then solving with that percentage overstates how much
     * each extra dollar costs. Measured on the page's own default sale:
     * pricing at the number it returned left $0.26 of profit, so a seller
     * aiming at break-even cleared it by a quarter and never knew which way.
     *
     * Solved properly, splitting the two kinds of fee:
     *
     *     revenue − (flat + percent × revenue) − otherCosts = 0
     *     revenue = (flat + otherCosts) ÷ (1 − percent)
     *     price   = revenue − shipping the buyer pays
     *
     * The rates are read from the same table the fee lines came from, so an
     * edited rate moves break-even with it.
     */
    breakEvenPrice: round2(
      (flatFees + nonFeeCosts) / Math.max(0.01, 1 - percentOfRevenue) -
        amount(input.shippingCharged),
    ),
    warning:
      profit < 0
        ? `This product loses $${Math.abs(profit).toFixed(2)} on every sale at this price.`
        : null,
    limitations: [
      'Fees use published rates applied to the numbers you entered — not a charge Etsy has confirmed.',
      'Offsite Ads is charged only on orders Etsy attributed to one of its ads, so it is counted here only when you say this sale was one.',
      'Currency conversion and sales tax are not included here.',
      'Your time is costed at the rate you set. If you left it at zero, this profit is paying you nothing for the work.',
    ],
  }
}
