/*
 * Etsy Ads return, from figures the seller supplies.
 *
 * The reason this tool takes typed input rather than reading the shop: Etsy
 * does not expose Ads performance through its public API. That is not a gap in
 * this product's integration — it is a thing that cannot be fetched, which is
 * why getAdsPerformance() returns UNAVAILABLE in both the mock and the live
 * adapter and why this calculator exists at all.
 *
 * The honest core of it is that "revenue from ads" is Etsy's OWN attribution
 * figure, and attribution is a claim about causality made by the party selling
 * the advertising. So the result reports what those numbers imply, names the
 * assumption, and does not call it profit.
 */

export interface AdsInput {
  /** What you spent, from your Etsy Ads dashboard. */
  spend: number
  /** Revenue Etsy attributed to those ads, from the same dashboard. */
  attributedRevenue: number
  /** Orders Etsy attributed. Optional — enables cost-per-order. */
  attributedOrders?: number
  /**
   * Share of revenue left after Etsy's fees and your product costs, as a
   * fraction. Without it, "ROAS 4x" says nothing about whether you made money.
   */
  marginPercent?: number
}

export interface AdsResult {
  roas: number | null
  /** Return on ad spend as a percentage gain, e.g. 300% for 4x. */
  netReturn: number | null
  costPerOrder: number | null
  /** Contribution after fees/costs AND after the ad spend. The real question. */
  contributionAfterAds: number | null
  /** Spend at which contribution reaches zero, given the margin. */
  breakEvenRoas: number | null
  formula: string
  limitations: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateAdsRoi(input: AdsInput): AdsResult {
  const spend = Math.max(0, input.spend)
  const revenue = Math.max(0, input.attributedRevenue)

  const limitations = [
    'Revenue attributed to ads is Etsy’s own figure. Attribution is a claim about which sales an ad caused, made by the party selling the advertising.',
    'Some attributed sales would have happened anyway. ROAS cannot tell you which, and neither can anything outside Etsy.',
    'These are the numbers you entered. Nothing here is read from your Etsy account, because Etsy does not publish Ads performance through its API.',
  ]

  /*
   * Zero spend is not zero return, it is no ratio at all. Returning 0 would
   * read as "these ads made nothing", which is the opposite of true when
   * nothing was spent (D57b: the divide-by-zero guard is where a false zero
   * usually enters).
   */
  if (spend === 0) {
    return {
      roas: null,
      netReturn: null,
      costPerOrder: null,
      contributionAfterAds: null,
      breakEvenRoas: null,
      formula: 'Enter what you spent to see a return.',
      limitations,
    }
  }

  const roas = Math.round((revenue / spend) * 100) / 100
  const orders = input.attributedOrders ?? 0
  const margin = input.marginPercent

  return {
    roas,
    netReturn: Math.round((roas - 1) * 1000) / 10,
    costPerOrder: orders > 0 ? round2(spend / orders) : null,
    /*
     * The figure sellers actually need, and the one a bare ROAS hides: 4x
     * looks excellent and loses money at a 20% margin.
     */
    contributionAfterAds: margin === undefined ? null : round2(revenue * margin - spend),
    breakEvenRoas: margin === undefined || margin <= 0 ? null : Math.round((1 / margin) * 100) / 100,
    formula: `$${revenue.toFixed(2)} attributed ÷ $${spend.toFixed(2)} spent = ${roas.toFixed(2)}×`,
    limitations,
  }
}
