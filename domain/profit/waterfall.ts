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

import { feeTotals, type StoredOrder } from '@/domain/orders/types'
import { calculated, sellerInput, unavailable, verified } from '@/lib/provenance/builders'
import type { Provenanced } from '@/lib/provenance/types'

export interface CostInputs {
  /**
   * The seller's own numbers. NULL means THEY HAVE NOT TOLD US.
   *
   * ── NOT ZERO, AND NOT THE DEMO SHOP'S ─────────────────────────────────
   *
   * These were plain numbers, so every caller had to supply four figures for
   * a seller who had set none — and what they all supplied was
   * DEMO_COST_INPUTS, the Willow & Fern designed values. Measured in a
   * browser in live mode, on a real account: /profit reported "Net profit
   * -$1,322.05", a loss assembled entirely from a fictional shop's labour and
   * other-costs totals.
   *
   * Zero would be no better. A COGS of 0% is a claim that the seller's
   * products cost nothing to make, and it is the claim that flatters — the
   * same direction the missing fee lines went.
   *
   * So null propagates, exactly as an unread fee does: no total, no net
   * profit, and a missingData entry naming what is absent.
   */
  shippingPerOrder: number | null
  /** The seller's product cost as a fraction of price, 0-1. Null if unset. */
  cogsPercent: number | null
  labourTotal: number | null
  otherCosts: number | null
  /**
   * Fraction of order value carrying a CONFIRMED listing-specific cost, 0-1.
   * Reported, not applied - see rule 2 above.
   *
   * A measurement rather than a seller input, so it is never null: a shop with
   * no confirmed costs has a coverage of 0, which is a true statement about
   * how much of its order value is confirmed.
   */
  coverage: number
  /**
   * False when this seller has never set a cost rule at all.
   *
   * ── WHY THIS IS NOT THE SAME AS "THE NUMBERS ARE NULL" ────────────────
   *
   * /profit currently tells a seller the uncosted remainder "is costed by your
   * default rule (38% of price), which is your assumption rather than a
   * confirmed cost". That sentence is honest only because the seller set the
   * rule. A seller who has set NOTHING has made no assumption, so there is no
   * rule to attribute one to and the sentence has to change — not soften.
   *
   * The two states produce identical nulls, so the flag carries the
   * difference: "add your costs to see profit" against "your costs say this".
   */
  hasAnyRule: boolean
}

export interface WaterfallLine {
  key: string
  label: string
  /**
   * NULL when the figure is not known. Never 0 standing in for unknown.
   *
   * The fee lines are the reason: Etsy's fees come from the payment-account
   * ledger rather than the receipt, so until something reads it there is no
   * figure — not a figure of zero. A renderer must show an absence here.
   */
  amount: number | null
  provenance: Provenanced<number>['provenance']
}

export interface ProfitResult {
  lines: WaterfallLine[]
  grossRevenue: number
  /** NULL when a cost line is unknown, so the total cannot be stated. */
  totalCosts: number | null
  /**
   * NULL when a cost line is unknown, because then there is no net profit.
   *
   * ── THE ONE NUMBER THIS PRODUCT MOST HAD TO GET RIGHT ─────────────────
   *
   * With the fee lines unknown, `grossRevenue - totalCosts` omits the fees
   * entirely and lands ABOVE the truth — the direction that flatters, which
   * this codebase has already been burned by twice: Money rendering
   * Math.abs(value), and the discounts/refunds lines missing from the screen
   * that actually renders while a passing test covered the other copy.
   *
   * The operator console reached the same conclusion from the other side and
   * is the precedent followed here: at 0% cost coverage it refuses the name,
   * because "what remains is revenue minus Etsy's fees — which is not profit,
   * and labelling it profit would be the single most damaging number this
   * product could render." Absent FEES are the mirror image of absent costs,
   * and nothing guarded them.
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
  /**
   * False when any order in the set has an unknown fee line.
   *
   * Set-level, not per order: the waterfall is a period total, so one order
   * with unknown fees makes the period's fee total unknown. Summing the rest
   * would report a number smaller than the truth and call it the total.
   */
  feesKnown: boolean
  /** False when the seller's own cost figures are not all set. */
  costsKnown: boolean
  /** Stated plainly, never inferred from a chart gap. */
  missingData: string[]
}

export function computeWaterfall(orders: readonly StoredOrder[], costs: CostInputs): ProfitResult {
  const grossRevenue = sum(orders.map((o) => o.gross))
  /*
   * Discounts and refunds, both from the receipt and both money the seller does
   * not keep.
   *
   * They were missing entirely: the waterfall ran gross → fees → costs, so a
   * refunded order counted as revenue and net profit was overstated by exactly
   * the refunded amount. The design has had both lines since artboard 53.
   */
  const discounts = sum(orders.map((o) => o.discounts))
  const refunds = sum(orders.map((o) => o.refunds))
  /*
   * ── FEES ARE ASKED FOR AS A SET, AND MAY COME BACK UNKNOWN ──────────────
   *
   * This was three `sum(orders.map(o => o.etsyFees))` calls, which could not
   * fail: a shop whose fees had never been read summed to 0 and the lines
   * below labelled that 0 VERIFIED. feeTotals returns null unless EVERY order
   * has all three, so a partial period is unknown rather than understated.
   */
  const fees = feeTotals(orders)
  const feesKnown = fees !== null

  /*
   * ── THE SELLER'S OWN NUMBERS, OR NOTHING ────────────────────────────────
   *
   * Seller cost rates apply to the whole period. Where a listing has no
   * specific cost the seller's default rule supplies one, so every order in
   * the reconciled set carries a cost — `coverage` says how many of those were
   * confirmed rather than defaulted.
   *
   * Unless there is no default rule, which is the state of every seller who
   * has not been to Settings → Costs. Then there is no cost for those orders
   * at all, and `costsKnown` is false. The four lines go null together rather
   * than individually, because a waterfall missing one cost line and showing
   * the rest reads as a complete answer: net profit would be above the truth
   * by whichever line was absent.
   */
  const costsKnown =
    costs.shippingPerOrder !== null &&
    costs.cogsPercent !== null &&
    costs.labourTotal !== null &&
    costs.otherCosts !== null
  const shipping = costsKnown ? round2(costs.shippingPerOrder! * orders.length) : null
  const cogs = costsKnown ? round2(grossRevenue * costs.cogsPercent!) : null
  const labour = costsKnown ? round2(costs.labourTotal!) : null
  const otherCosts = costsKnown ? round2(costs.otherCosts!) : null

  /*
   * NULL PROPAGATES RATHER THAN BEING COALESCED, and that is the whole fix.
   *
   * `fees?.etsyFees ?? 0` here would have compiled, passed every existing
   * test, and put the lie straight back: a total that silently omits the fee
   * bill, and a net profit above the truth. There is no total of an unknown,
   * so there is no total.
   */
  const totalCosts =
    fees === null || !costsKnown
      ? null
      : round2(
          discounts +
            refunds +
            fees.etsyFees +
            fees.paymentProcessing +
            fees.offsiteAds +
            shipping! +
            cogs! +
            labour! +
            otherCosts!,
        )
  const netProfit = totalCosts === null ? null : round2(grossRevenue - totalCosts)
  const marginPercent =
    netProfit === null || grossRevenue === 0 ? null : round1((netProfit / grossRevenue) * 100)
  const coveragePercent = Math.round(costs.coverage * 100)

  const verifiedSource = 'Your Etsy order receipts'

  /*
   * A fee line's provenance tells the truth about where it came from.
   *
   * VERIFIED while the figure is real, UNAVAILABLE when it is not — with the
   * reason and the remedy, which is what lib/provenance/builders.ts's
   * `unavailable` exists for. The alternative shipped for eleven phases:
   * every fee line marked VERIFIED, sourced to "Your Etsy order receipts",
   * for a figure that is not on the receipt and had never been read.
   */
  const feeProvenance = feesKnown
    ? verified(null, verifiedSource).provenance
    : unavailable(
        'Etsy reports fees through the payment-account ledger, not the order receipt, and that ledger has not been read for this period.',
        'Nothing you can do about it today — EtsyPilot has to read it. Until then every figure that depends on fees is withheld rather than estimated.',
      ).provenance

  /*
   * A cost line's badge says where the number came from, and an absent cost
   * did not come from the seller. SELLER_INPUT on a blank line would credit
   * them with entering something.
   */
  const costProvenance = costsKnown
    ? sellerInput(null).provenance
    : unavailable(
        costs.hasAnyRule
          ? 'Some of your cost figures are not set, so the cost lines cannot be totalled.'
          : 'You have not entered any costs yet, so there is nothing to subtract from your revenue.',
        'Settings \u2192 Costs. Nothing here is guessed for you: a cost nobody has entered is left absent rather than defaulted.',
      ).provenance

  const lines: WaterfallLine[] = [
    line('gross', 'Gross revenue', round2(grossRevenue), verified(null, verifiedSource).provenance),
    line('discounts', 'Discounts', deduction(round2(discounts)), verified(null, verifiedSource).provenance),
    line('refunds', 'Refunds', deduction(round2(refunds)), verified(null, verifiedSource).provenance),
    line('etsyFees', 'Etsy fees', fees === null ? null : deduction(round2(fees.etsyFees)), feeProvenance),
    line('processing', 'Payment processing', fees === null ? null : deduction(round2(fees.paymentProcessing)), feeProvenance),
    line('offsiteAds', 'Offsite Ads', fees === null ? null : deduction(round2(fees.offsiteAds)), feeProvenance),
    line('shipping', 'Shipping', shipping === null ? null : deduction(shipping), costProvenance),
    line('cogs', 'COGS', cogs === null ? null : deduction(cogs), costProvenance),
    line('labour', 'Labour', labour === null ? null : deduction(labour), costProvenance),
    line('other', 'Other costs', otherCosts === null ? null : deduction(otherCosts), costProvenance),
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
    feesKnown,
    costsKnown,
    missingData: describeMissing(coveragePercent, costs, feesKnown, costsKnown),
  }
}

function describeMissing(
  coveragePercent: number,
  costs: CostInputs,
  feesKnown: boolean,
  costsKnown: boolean,
): string[] {
  const missing: string[] = []
  /*
   * ── A SELLER WHO HAS SET NOTHING HAS MADE NO ASSUMPTION ───────────────
   *
   * The coverage sentence below says the uncosted remainder "is costed by your
   * default rule, which is your own assumption rather than a confirmed cost".
   * That is honest when the seller set the rule. With no rules at all there is
   * nothing to attribute, so this is said instead — and the coverage sentence
   * is skipped, because 0% coverage against no rule is one fact, not two.
   */
  if (!costsKnown) {
    missing.push(
      costs.hasAnyRule
        ? 'Some of your cost figures are not set, so net profit is withheld rather than shown without them. Settings \u2192 Costs.'
        : 'You have not entered any costs yet. Revenue is from your own receipts, but nothing is subtracted from it until you say what your products, postage and time cost you \u2014 and nothing is guessed on your behalf.',
    )
    if (costs.labourTotal === null) missing.push('No labour minutes recorded per product.')
    missing.push('Etsy does not expose ad spend per listing.')
    return missing
  }
  /*
   * FIRST, because it is the largest thing wrong with the figure when it
   * applies, and because nothing said it before. docs/ETSY-SETUP.md and
   * live.ts's toOrder() both asserted that this domain "treats a period with
   * no fee data as incomplete rather than as fee-free"; it did not, and this
   * is the line that makes the claim true.
   */
  if (!feesKnown) {
    missing.push(
      'Etsy\u2019s fees for this period have not been read, so net profit is withheld rather than shown without them. Fees come from the payment-account ledger, which is a separate read from your order receipts.',
    )
  }
  if (coveragePercent < 100) {
    missing.push(
      `Costs are confirmed for ${coveragePercent}% of order value. The rest is costed by your default rule, which is your own assumption rather than a confirmed cost, so net profit is only as good as that rule.`,
    )
  }
  if (costs.labourTotal === 0) missing.push('No labour minutes recorded per product.')
  missing.push('Etsy does not expose ad spend per listing.')
  return missing
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
