/*
 * The demo shop's change history (artboard 44).
 *
 * Built from REAL listings out of the catalogue, so the drift check on the
 * rollback panel is a genuine comparison rather than a staged one: a job's
 * recorded `after` value is compared against what the listing holds now, and
 * three of them deliberately do not match.
 *
 * That is the difference between demonstrating a safety rail and drawing one.
 * If the recorded values were invented, "3 listings have changed on Etsy since
 * this job" would be a sentence rather than a measurement.
 */

import type { EtsyListing } from '@/lib/etsy/interface'
import type { ChangeItem, ChangeJob } from './types'

/** How many of the price-raised listings are made to look edited since. */
const DRIFTED = 3

export function demoChangeJobs(listings: EtsyListing[]): ChangeJob[] {
  const active = listings.filter((l) => l.state === 'ACTIVE')
  if (active.length === 0) return []

  const priced = active.slice(0, 122)
  const priceItems: ChangeItem[] = priced.map((listing, index) => {
    const before = round2(listing.price / 1.08)
    /*
     * The first DRIFTED listings record an `after` that is NOT what the
     * listing holds today — somebody edited them on Etsy afterwards. The
     * rollback planner finds that by comparison; nothing here flags it.
     */
    const after = index < DRIFTED ? round2(listing.price + 2) : listing.price
    return {
      listingId: listing.etsyListingId,
      listingTitle: listing.title,
      field: 'price',
      before: money(before),
      after: money(after),
      // One genuinely failed at apply time, which is what "1 failed" counts.
      status: index === 121 ? 'FAILED' : 'SUCCEEDED',
      ...(index === 121
        ? { error: 'Edited on Etsy while this job ran, so it was left alone.' }
        : {}),
    }
  })

  const autumn = active.slice(140, 158)
  const tagItems: ChangeItem[] = autumn.map((listing) => ({
    listingId: listing.etsyListingId,
    listingTitle: listing.title,
    field: 'tags',
    before: `${listing.tags.length} tags`,
    after: `${listing.tags.length} tags`,
    status: 'SUCCEEDED',
  }))

  const rewritten = active[3]
  const titleItems: ChangeItem[] = rewritten
    ? [
        {
          listingId: rewritten.etsyListingId,
          listingTitle: rewritten.title,
          field: 'title',
          before: 'Ceramic mug',
          after: rewritten.title,
          status: 'SUCCEEDED',
        },
      ]
    : []

  const old = active[200]
  const expiredItems: ChangeItem[] = old
    ? [
        {
          listingId: old.etsyListingId,
          listingTitle: old.title,
          field: 'tags',
          before: '9 tags',
          after: `${old.tags.length} tags`,
          status: 'SUCCEEDED',
        },
      ]
    : []

  return [
    {
      id: '4821',
      at: '2026-08-12T09:41:00.000Z',
      actor: 'Salman R.',
      source: 'BULK_EDIT',
      summary: 'Price +8%, tags',
      items: priceItems,
      linkedExperiment: { name: 'Autumn price test', startedAt: '2026-08-12T00:00:00.000Z' },
    },
    {
      id: '4809',
      at: '2026-08-10T06:00:00.000Z',
      actor: 'Automation',
      source: 'SCHEDULED',
      summary: 'Autumn tags added',
      items: tagItems,
    },
    {
      id: '4788',
      at: '2026-08-08T14:12:00.000Z',
      actor: 'Maya K.',
      source: 'AI_ASSISTED',
      summary: 'Title rewritten',
      items: titleItems,
    },
    {
      /*
       * Outside the rollback window on every plan, so "Expired" is a state the
       * table can actually render. It was unreachable while the only demo jobs
       * were four days old.
       */
      id: '4520',
      at: '2026-05-02T11:05:00.000Z',
      actor: 'Salman R.',
      source: 'BULK_EDIT',
      summary: 'Spring tags added',
      items: expiredItems,
    },
  ]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}
