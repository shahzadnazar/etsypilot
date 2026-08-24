/*
 * Find hot products (artboard 21).
 *
 * Every column on this screen is one of two things and the table must never let
 * them look alike:
 *
 *   OBSERVED   title, shop, price, reviews, favourites, age. Publicly visible
 *              on the listing, so a plain value with no range.
 *   ESTIMATED  monthly sales, monthly revenue. Modelled from public signals,
 *              so a RANGE, always, and UNAVAILABLE where observation is thin.
 *
 * The opportunity score is CALCULATED over the estimates, and null wherever
 * they are unavailable — a score over a missing input is a number invented to
 * fill a column, and this column sorts the table.
 */

import { getSignalsService } from '@/lib/signals'
import type { ProductQuery, ProductSignals } from '@/lib/signals/interface'

export const PRODUCT_SORTS = ['OPPORTUNITY', 'REVENUE', 'REVIEWS', 'NEWEST'] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

export const SORT_LABEL: Record<ProductSort, string> = {
  OPPORTUNITY: 'Opportunity score',
  REVENUE: 'Estimated revenue',
  REVIEWS: 'Reviews',
  NEWEST: 'Newest listings',
}

export interface OpportunitiesView {
  term: string
  market: string
  products: ProductSignals[]
  /** Everything the model has, before this screen's filters. */
  total: number
  sort: ProductSort
  filters: AppliedFilters
  /** Products excluded because nothing could be modelled for them. */
  unmodelled: number
  observedAt: string
  mode: 'MOCK' | 'LIVE'
}

export interface AppliedFilters {
  minPrice: number | null
  maxPrice: number | null
  minSales: number | null
  maxAgeMonths: number | null
  digital: boolean | null
}

export async function getOpportunities(
  query: Record<string, string | undefined> = {},
): Promise<OpportunitiesView> {
  const signals = getSignalsService()
  const market = query.market?.trim() || 'United States'
  const term = query.q?.trim() ?? ''
  const filters = parseFilters(query)

  const all = await signals.findProducts({ term: '', market })
  const products = await signals.findProducts({
    term,
    market,
    ...(filters.minPrice !== null ? { minPrice: filters.minPrice } : {}),
    ...(filters.maxPrice !== null ? { maxPrice: filters.maxPrice } : {}),
    ...(filters.minSales !== null ? { minSales: filters.minSales } : {}),
    ...(filters.maxAgeMonths !== null ? { maxAgeMonths: filters.maxAgeMonths } : {}),
    ...(filters.digital !== null ? { digital: filters.digital } : {}),
  } satisfies ProductQuery)

  return {
    term,
    market,
    products: sortProducts(products, sortOf(query.sort)),
    total: all.length,
    sort: sortOf(query.sort),
    filters,
    unmodelled: products.filter((p) => p.opportunity === null).length,
    observedAt: all[0]?.observedAt ?? '',
    mode: signals.mode,
  }
}

function sortOf(value: string | undefined): ProductSort {
  return PRODUCT_SORTS.includes(value as ProductSort) ? (value as ProductSort) : 'OPPORTUNITY'
}

/**
 * Sort, with unmodelled rows pinned to the bottom of ESTIMATE-keyed orders.
 *
 * The split is between what the sort key is, not what the row is:
 *
 *   opportunity, revenue   modelled, so a row with neither cannot be ranked by
 *                          them and goes last. Sorting it as zero would say it
 *                          is the worst, which is a claim nobody made.
 *   age, reviews           observed on the listing itself, so an unmodelled row
 *                          ranks by them like any other.
 *
 * NEWEST is what makes the distinction necessary. The newest listings are
 * exactly the ones too new to model, and pinning them to the bottom would empty
 * the one order they should lead.
 */
export function sortProducts(products: ProductSignals[], sort: ProductSort): ProductSignals[] {
  const rank = (p: ProductSignals): number | null => {
    switch (sort) {
      case 'OPPORTUNITY':
        return p.opportunity?.value ?? null
      case 'REVENUE':
        return p.monthlyRevenue.value?.min ?? null
      case 'REVIEWS':
        return p.reviews
      case 'NEWEST':
        return -p.ageMonths
    }
  }

  return [...products].sort((a, b) => {
    const left = rank(a)
    const right = rank(b)
    if (left === null && right === null) return 0
    if (left === null) return 1
    if (right === null) return -1
    return right - left
  })
}

function parseFilters(query: Record<string, string | undefined>): AppliedFilters {
  return {
    minPrice: numberOr(query.minPrice, 0, 100_000),
    maxPrice: numberOr(query.maxPrice, 0, 100_000),
    minSales: numberOr(query.minSales, 0, 100_000),
    maxAgeMonths: numberOr(query.maxAge, 0, 600),
    digital: query.digital === 'true' ? true : query.digital === 'false' ? false : null,
  }
}

/** Null for anything unparseable or out of range. A filter is never guessed. */
function numberOr(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined || value.trim() === '') return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return n
}
