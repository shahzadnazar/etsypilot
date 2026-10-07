import 'server-only'

/*
 * The one place the demo shop's experiments are allowed to leave the fixture.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   MEASURED ON A LIVE ACCOUNT WITH TWO LISTINGS AND NO BULK JOBS:
 *
 *     Inconclusive · Price +8% on the linen range
 *     Hypothesis: A modest rise holds order volume and raises revenue per
 *     order. Started Jul 24, 2026 · primary metric: verified orders ·
 *     0 listings. [Open change #482]
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A hypothesis that seller never formed, about a change they never made,
 * linked to a bulk job that does not exist — and "0 listings", because
 * `narrativeGroups` found none of the demo sets in their catalogue, which is
 * the fixture visibly failing to apply and being shown anyway.
 *
 * Nothing records a real experiment yet. The screen already says so in its own
 * header ("New experiment — Arrives with scheduling. Start one from a bulk job
 * for now."), so outside demo mode this returns none and the empty state the
 * page already has is what a seller sees.
 */

import { isDemoMode } from '@/lib/etsy'
import { DEMO_EVENTS } from '@/lib/etsy/demo-events'
import { DEMO_NOW, narrativeGroups } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import type { StoredOrder } from '@/domain/orders/types'
import { evaluate, type Experiment, type ExperimentResult } from './experiments'

/** Evaluated demo experiments, or an empty list on any other deployment. */
export function demoExperimentResults(
  listings: EtsyListing[],
  orders: readonly StoredOrder[],
): ExperimentResult[] {
  if (!isDemoMode()) return []
  const groups = narrativeGroups(listings)
  return demoExperiments({
    priceGroup: groups.priceGroup.map((l) => l.etsyListingId),
    tagGroup: groups.tagGroup.map((l) => l.etsyListingId),
    seasonal: groups.seasonal.map((l) => l.etsyListingId),
  }).map((experiment) => evaluate(experiment, orders, DEMO_NOW, DEMO_EVENTS))
}

function demoExperiments(groups: {
  priceGroup: string[]
  tagGroup: string[]
  seasonal: string[]
}): Experiment[] {
  return [
    {
      id: 'EXP-1',
      name: 'Price +8% on the linen range',
      hypothesis: 'A modest rise holds order volume and raises revenue per order.',
      startedAt: '2026-07-24T00:00:00.000Z',
      listingIds: groups.priceGroup,
      primaryMetric: 'VERIFIED_ORDERS',
      linkedJobId: '4821',
    },
    {
      id: 'EXP-2',
      name: 'Autumn tags on the home range',
      hypothesis: 'Seasonal gifting tags increase orders before September.',
      startedAt: '2026-07-28T00:00:00.000Z',
      listingIds: groups.tagGroup,
      primaryMetric: 'VERIFIED_ORDERS',
      linkedJobId: '4809',
    },
    {
      id: 'EXP-3',
      name: 'Shorter titles on the seasonal range',
      hypothesis: 'A shorter, clearer title reads better in search results.',
      startedAt: '2026-07-20T00:00:00.000Z',
      listingIds: groups.seasonal,
      primaryMetric: 'VERIFIED_ORDERS',
      linkedJobId: '4788',
    },
  ]
}
