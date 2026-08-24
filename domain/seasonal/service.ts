/*
 * Seasonal calendar (artboard 99).
 *
 * The design was explicit about why this can ship on thin history: every window
 * is ESTIMATED, and one of them deliberately reads "Low confidence" with the
 * reason printed beside it. The confidence field does the work that a warning
 * banner would do badly.
 *
 * So the rule here is simple and enforced by the type: a window cannot exist
 * without a confidence AND the reason for it. There is no shape for a window
 * that just asserts a date range.
 *
 * Windows are drawn from the seller's OWN order history where there is any, and
 * from public category seasonality where there is not — and the card says which,
 * because "your linen category lifted 2.4× last year" and "this category tends
 * to lift in November" are different claims and only one is about this shop.
 */

import { getEtsyService } from '@/lib/etsy'
import { BASELINE_START, DEMO_NOW, PERIOD_END } from '@/lib/etsy/demo-dataset'
import type { EtsyListing, EtsyOrder } from '@/lib/etsy/interface'
import type { Confidence } from '@/lib/provenance/types'
import type { ShopContext } from '@/lib/permissions'

export interface SeasonalWindow {
  id: string
  name: string
  /** The section or category this is about. */
  category: string
  /** Month indices 0-11 the window covers, for the strip. */
  months: number[]
  prepareFrom: string
  prepareTo: string
  liveBy: string
  peakFrom: string
  peakTo: string
  confidence: Confidence
  /**
   * Why that confidence, in the seller's own terms. Required — a window with a
   * confidence and no reason is a label, and a label is not evidence.
   */
  basis: string
  /** Measured lift where the shop's own history supports one, else null. */
  observedLift: number | null
  /** How many of the shop's own orders the lift was measured over. */
  sampleOrders: number
}

export interface SeasonalView {
  market: string
  category: string
  year: number
  windows: SeasonalWindow[]
  /** Months of the seller's own history behind these windows. */
  historyMonths: number
  empty: boolean
}

export const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export async function getSeasonalCalendar(
  ctx: ShopContext,
  query: { category?: string } = {},
): Promise<SeasonalView> {
  const etsy = getEtsyService()
  const [orders, catalogue] = await Promise.all([
    etsy.getOrders(ctx.shopId, { since: BASELINE_START, until: PERIOD_END }),
    etsy.getListings(ctx.shopId, { limit: 500 }),
  ])
  const listings = catalogue.listings

  const sections = [...new Set(listings.map((l) => l.section).filter((s): s is string => !!s))]
  const category = query.category && sections.includes(query.category) ? query.category : 'All'

  const historyMonths = monthsBetween(BASELINE_START, DEMO_NOW)
  const windows = listings.length === 0 ? [] : buildWindows({ orders, listings, category, historyMonths })

  return {
    market: 'United States',
    category,
    year: Number(DEMO_NOW.slice(0, 4)),
    windows,
    historyMonths,
    empty: windows.length === 0,
  }
}

/*
 * The three windows the design names, each measured against what this shop
 * actually has.
 *
 * `confidenceFor` is the whole point: with a few months of history the answer
 * is LOW and the card says so, rather than the window being hidden or the
 * confidence being quietly upgraded to make the screen look better.
 */
function buildWindows(args: {
  orders: EtsyOrder[]
  listings: EtsyListing[]
  category: string
  historyMonths: number
}): SeasonalWindow[] {
  const SEEDS: {
    id: string
    name: string
    category: string
    months: number[]
    prepareFrom: string
    prepareTo: string
    liveBy: string
    peakFrom: string
    peakTo: string
  }[] = [
    {
      id: 'holiday-linens',
      name: 'Holiday table linens',
      category: 'Home',
      months: [7, 8, 9, 10, 11],
      prepareFrom: 'Aug 18',
      prepareTo: 'Sep 22',
      liveBy: 'Oct 6',
      peakFrom: 'Nov 10',
      peakTo: 'Dec 18',
    },
    {
      id: 'thanksgiving',
      name: 'Thanksgiving hosting',
      category: 'Kitchen',
      months: [8, 9, 10],
      prepareFrom: 'Sep 1',
      prepareTo: 'Oct 5',
      liveBy: 'Oct 20',
      peakFrom: 'Nov 3',
      peakTo: 'Nov 24',
    },
    {
      id: 'spring',
      name: 'Spring entertaining',
      category: 'Home',
      months: [0, 1, 2, 3],
      prepareFrom: 'Jan 12',
      prepareTo: 'Feb 16',
      liveBy: 'Feb 24',
      peakFrom: 'Mar 2',
      peakTo: 'Apr 20',
    },
  ]

  const sectionOf = new Map(args.listings.map((l) => [l.etsyListingId, l.section]))
  const observedMonths = new Set(args.orders.map((o) => Number(o.placedAt.slice(5, 7)) - 1))

  return SEEDS.filter(
    (seed) => args.category === 'All' || seed.category === args.category,
  ).map((seed) => {
    /*
     * The lift is measured over the shop's OWN orders in the window's months
     * against the rest of the year. Null when the shop has no orders in those
     * months at all — which is a different statement from "no lift", and the
     * card prints a different sentence for each.
     */
    const inWindow = args.orders.filter((o) => {
      const month = Number(o.placedAt.slice(5, 7)) - 1
      const section = sectionOf.get(o.items[0]?.etsyListingId ?? '')
      if (args.category !== 'All' && section !== seed.category) return false
      return seed.months.includes(month)
    })
    const outWindow = args.orders.filter((o) => {
      const month = Number(o.placedAt.slice(5, 7)) - 1
      const section = sectionOf.get(o.items[0]?.etsyListingId ?? '')
      if (args.category !== 'All' && section !== seed.category) return false
      return !seed.months.includes(month)
    })

    /*
     * Only months the shop's history actually reaches.
     *
     * The first version divided orders-in-window by orders-outside-it without
     * checking whether the window's months were inside the history at all — so
     * a shop with four months of orders reported a "0.1× lift" for a November
     * window it has never lived through. That is arithmetic on absence, and it
     * reads as a measured finding.
     */
    const covered = seed.months.filter((m) => observedMonths.has(m)).length
    const lift = covered * 2 >= seed.months.length
      ? liftOf(inWindow, outWindow, Math.max(1, covered))
      : null
    const confidence = confidenceFor(args.historyMonths, inWindow.length, lift !== null)

    return {
      id: seed.id,
      name: seed.name,
      category: seed.category,
      months: [...seed.months],
      prepareFrom: seed.prepareFrom,
      prepareTo: seed.prepareTo,
      liveBy: seed.liveBy,
      peakFrom: seed.peakFrom,
      peakTo: seed.peakTo,
      confidence,
      basis: basisFor({
        confidence,
        historyMonths: args.historyMonths,
        sample: inWindow.length,
        lift,
        covered,
        windowMonths: seed.months.length,
      }),
      observedLift: lift,
      sampleOrders: inWindow.length,
    }
  })
}

/**
 * Orders per month inside the window against outside it.
 *
 * Per month, not in total — a five-month window will always have more orders
 * than a one-month one, and comparing the totals would report a "lift" that is
 * only the window being longer.
 */
export function liftOf(
  inWindow: EtsyOrder[],
  outWindow: EtsyOrder[],
  windowMonths: number,
): number | null {
  if (inWindow.length === 0 || outWindow.length === 0) return null
  const insideRate = inWindow.length / windowMonths
  const outsideRate = outWindow.length / Math.max(1, 12 - windowMonths)
  if (outsideRate === 0) return null
  return Math.round((insideRate / outsideRate) * 10) / 10
}

/**
 * Confidence from what the history actually supports.
 *
 * Two full years is the only thing that earns HIGH, because a seasonal claim is
 * a claim about a repeating pattern and one year cannot show a repeat. This is
 * why the screen ships on thin history: it is allowed to say LOW.
 */
export function confidenceFor(
  historyMonths: number,
  sampleOrders: number,
  liftMeasured = true,
): Confidence {
  // A window whose months the history does not reach is never better than LOW,
  // whatever the order count elsewhere in the year says.
  if (sampleOrders === 0 || !liftMeasured) return 'LOW'
  if (historyMonths >= 24 && sampleOrders >= 50) return 'HIGH'
  if (historyMonths >= 12 && sampleOrders >= 20) return 'MODERATE'
  return 'LOW'
}

function basisFor(args: {
  confidence: Confidence
  historyMonths: number
  sample: number
  lift: number | null
  covered: number
  windowMonths: number
}): string {
  const history = `${args.historyMonths} months of your own order history`

  if (args.sample === 0) {
    return `You have no orders in these months yet, so this window comes from public category seasonality rather than from your shop. Nothing here is measured on you.`
  }
  if (args.lift === null) {
    return `Your history reaches ${args.covered} of this window's ${args.windowMonths} months, which is too few to compare it against the rest of the year. The dates come from public category seasonality; the shape of your own season is not known yet.`
  }
  if (args.confidence === 'HIGH') {
    return `Your orders in these months ran ${args.lift}× the rest of the year, measured over ${args.sample} of your own orders across ${history}.`
  }
  if (args.confidence === 'MODERATE') {
    return `Your orders in these months ran ${args.lift}× the rest of the year, over ${args.sample} orders. Based on ${history} — one season, so it cannot yet show a repeat.`
  }
  return `Your orders in these months ran ${args.lift}× the rest of the year, but over only ${args.sample} orders and ${history}. Treat the direction as a hint and the multiple as noise.`
}

function monthsBetween(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / (30 * 86_400_000)))
}
