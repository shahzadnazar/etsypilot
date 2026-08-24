/*
 * Competitor shops (artboard 34).
 *
 * The vocabulary is Analyse / Compare / Track, never "spy" — a design rule
 * with a product reason behind it: everything here is publicly visible on the
 * shop page, and calling it surveillance both overstates what it is and invites
 * a seller to expect more than it can give.
 *
 * The split that matters is between OBSERVED and ESTIMATED, and it is the same
 * split as everywhere else. Active listings, reviews, median price and the
 * 30-day listing churn are counted off public pages. Monthly sales and revenue
 * are modelled, so they are ranges with confidence attached, and the page says
 * out loud that only the shop owner can see the real figures.
 */

import { getSignalsService } from '@/lib/signals'
import type { CompetitorShop } from '@/lib/signals/interface'
import { getEtsyService } from '@/lib/etsy'
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
): Promise<CompetitorsView> {
  const signals = getSignalsService()
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
  const { listings } = await getEtsyService().getListings(ctx.shopId, { limit: 500 })
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
