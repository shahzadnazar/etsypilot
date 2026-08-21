/*
 * Etsy's published fee schedule, as a data set with a date on it.
 *
 * The single most important thing about this file is that it is an ASSUMPTION,
 * not a fact this product can verify. Etsy changes its fees, they differ by
 * country and currency, and there is no API that reports the schedule. So:
 *
 *   - Every rate carries the date the set was recorded and a link to the page
 *     it came from. A fee figure with no effective date is a figure that was
 *     true once.
 *   - Every rate is EDITABLE in the tool. A seller in a different country, or
 *     reading this after a change, can correct it and get a right answer
 *     instead of a confidently wrong one.
 *   - The result is never called an Etsy fee. It is what these rates produce
 *     for the numbers entered, which is a different claim (D49).
 *
 * The regulatory operating fee is deliberately zero by default and listed
 * anyway: it applies in several countries and not others, and a zero the
 * seller can see and change is better than a line that silently is not there.
 */

export const FEE_RULES_EFFECTIVE = '2026-01-01'
export const FEE_RULES_SOURCE = 'Etsy’s published Fees & Payments policy, United States, USD'

export interface FeeRate {
  key: string
  label: string
  /** What it is charged on, in the seller's words. */
  basis: string
  /** Percentage of the basis, as a fraction. */
  percent: number
  /** Flat amount added, in the shop currency. */
  flat: number
  /** Shown under the field. Names the condition, not just the number. */
  note: string
}

export const DEFAULT_FEE_RATES: FeeRate[] = [
  {
    key: 'listing',
    label: 'Listing fee',
    basis: 'per listing, per four months',
    percent: 0,
    flat: 0.2,
    note: 'Charged again when the listing renews, and on each additional quantity sold.',
  },
  {
    key: 'transaction',
    label: 'Transaction fee',
    basis: 'item price + shipping you charge + gift wrap',
    percent: 0.065,
    flat: 0,
    note: 'Applies to what the buyer pays you, not to the item price alone.',
  },
  {
    key: 'processing',
    label: 'Payment processing',
    basis: 'total the buyer pays, including tax',
    percent: 0.03,
    flat: 0.25,
    note: 'Varies by country. 3% + $0.25 in the United States.',
  },
  {
    key: 'regulatory',
    label: 'Regulatory operating fee',
    basis: 'total the buyer pays',
    percent: 0,
    flat: 0,
    note: 'Applies in some countries and not others. Set your own rate if it applies to you.',
  },
  {
    key: 'offsite',
    label: 'Offsite Ads',
    basis: 'order total, only when the sale came from an Etsy ad',
    percent: 0,
    flat: 0,
    note: '12% or 15% depending on your annual revenue, and mandatory above a threshold. Only charged on attributed orders, so it is 0 unless this sale was one.',
  },
]

/**
 * What the tool must say, every time, next to the result.
 *
 * Not a footnote a component may choose to render: it is returned with the
 * calculation, so a screen cannot show the figure without it.
 */
export const FEE_LIMITATIONS = [
  'These are published rates applied to the numbers you entered — not a charge Etsy has confirmed.',
  'Fees differ by country and currency, and Etsy changes them. Check your Etsy payment account for what you were actually charged.',
  'Currency conversion, taxes and Offsite Ads eligibility can all change the total.',
]
