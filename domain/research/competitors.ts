/*
 * Competitor shops (artboard 34).
 *
 * Nothing here is private: every figure describes something a shop page shows
 * to anybody, or a model of it. Calling that surveillance would both overstate
 * what it is and invite a seller to expect more than it can give.
 *
 * ── WHAT THESE FIGURES ACTUALLY ARE, TODAY ───────────────────────────────
 *
 * This comment used to say that active listings, reviews, median price and the
 * 30-day listing churn "are counted off public pages". NOTHING COUNTS
 * ANYTHING OFF ANY PAGE. The only implementation behind getSignalsService()
 * is MockMarketSignalsService; every figure on this screen is modelled, the
 * observed-looking ones included.
 *
 * The sentence described the plan rather than the code, and the plan is the
 * problem: Etsy's API Terms, Prohibited Behavior item 24, forbids automated
 * systems that access, analyse or scrape the Etsy Site unless Etsy authorises
 * it in writing. A live adapter written against lib/signals/interface.ts and
 * pointed at etsy.com would put this product inside that clause, and the only
 * thing that was ever stopping it was that nobody had written one.
 *
 * tests/unit/signals-boundary.test.ts now stops it: nothing reachable from
 * lib/signals/ may import a network module or send a request, proved
 * statically over the import closure and again at runtime with fetch trapped.
 *
 * ── THE SPLIT THE PAGE STILL MAKES, AND WHY IT IS STILL RIGHT ────────────
 *
 * Two kinds of figure, distinguished by what they WOULD be if the model were
 * replaced by observation. Active listings, reviews, median price and churn
 * are single values a shop page shows to anyone; monthly sales and revenue
 * are not, so they stay ranges with confidence attached and the page says out
 * loud that only the shop owner can see the real ones. Today both kinds are
 * modelled, and the page says THAT out loud too — it is the first thing in
 * the subtitle and the first line of the provenance panel.
 *
 * The vocabulary is Analyse / Compare / Track, never "spy".
 */

import { getSignalsService } from '@/lib/signals'
import type { CompetitorShop } from '@/lib/signals/interface'
import { loadListings } from '@/domain/listings/load'
import type { ShopContext } from '@/lib/permissions'

export interface TagGap {
  tag: string
  /** How many of the competitor's listings use it. */
  theirCount: number
  /** How many of yours do. Zero is the interesting case. */
  yourCount: number
}

export interface CompetitorComparison {
  /** Your own shop's observable figures, for the same columns. */
  yourListings: number
  yourMedianPrice: number | null
  /** Tags they lean on that you use rarely or not at all. */
  gaps: TagGap[]
}

export interface CompetitorsView {
  shops: CompetitorShop[]
  selected: CompetitorShop | null
  comparison: CompetitorComparison | null
  /** Set when a name was asked for and nothing matched. */
  notFound: string | null
  mode: 'MOCK' | 'LIVE'
}

export async function getCompetitors(
  ctx: ShopContext,
  query: { shop?: string } = {},
): Promise<CompetitorsView | null> {
  const signals = getSignalsService()
  /*
   * No market-signals source on this deployment, so there is nothing to
   * compute and nothing to show. `null` and not an empty view: an empty view
   * renders the screen with holes in it, which says "this figure is missing"
   * when the truth is "this feature is not built". See lib/signals/index.ts.
   */
  if (!signals) return null

  const shops = await signals.listCompetitors()

  const asked = query.shop?.trim()
  const selected = asked ? await signals.getCompetitor(asked) : (shops[0] ?? null)

  return {
    shops,
    selected,
    comparison: selected ? await compare(ctx, selected) : null,
    /*
     * A name that matched nothing is reported as such rather than falling back
     * to the first shop. The adapter used to answer any string with the same
     * figures, so a typo produced a confident profile for a shop that does not
     * exist — the page has to be able to say "not observed".
     */
    notFound: asked && !selected ? asked : null,
    mode: signals.mode,
  }
}

async function compare(ctx: ShopContext, them: CompetitorShop): Promise<CompetitorComparison> {
  const { listings } = await loadListings(ctx)
  const active = listings.filter((l) => l.state === 'ACTIVE')

  const yourTags = new Map<string, number>()
  for (const listing of active) {
    for (const tag of new Set(listing.tags.map((t) => t.toLowerCase()))) {
      yourTags.set(tag, (yourTags.get(tag) ?? 0) + 1)
    }
  }

  return {
    yourListings: active.length,
    yourMedianPrice: medianOf(active.map((l) => l.price)),
    gaps: them.topTags.map((t) => ({
      tag: t.tag,
      theirCount: t.count,
      yourCount: yourTags.get(t.tag.toLowerCase()) ?? 0,
    })),
  }
}

/**
 * Null for an empty catalogue.
 *
 * Not zero. A shop with no listings has no median price, and $0.00 beside a
 * competitor's $42 reads as ruinous undercutting rather than as an empty shop.
 */
export function medianOf(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
  return Math.round(median * 100) / 100
}
