/*
 * The demo shop's event history.
 *
 * These are the changes Shop Pulse (artboard 91) diagnoses. The final entry is
 * deliberately absent: the Aug 8-12 dip has no recorded event, which is what
 * produces the UNKNOWN diagnosis. We do not invent a cause for it.
 */

import type { DomainEvent } from '@/lib/events/types'
import { buildDemoListings, DEMO_ACTOR_ID, DEMO_SHOP_ID, narrativeGroups } from './demo-dataset'

/*
 * The four listings the Aug 6 deactivation actually touched.
 *
 * Read from the same narrative grouping the order generator uses, so the event
 * and the sales data it explains cannot describe different listings.
 */
const SEASONAL_LISTING_IDS = narrativeGroups(buildDemoListings()).seasonal.map(
  (l) => l.etsyListingId,
)

function ev(e: Omit<DomainEvent, 'shopId'>): DomainEvent {
  return { ...e, shopId: DEMO_SHOP_ID }
}

export const DEMO_EVENTS: DomainEvent[] = [
  // Jul 24 - price raised on 3 listings. CORRELATED with a 31% order fall.
  ev({
    eventId: 'EV-0001',
    listingId: '1400001006',
    actorId: DEMO_ACTOR_ID,
    timestamp: '2026-07-24T09:12:00.000Z',
    type: 'PRICE_CHANGED',
    source: 'MANUAL',
    field: 'price',
    beforeValue: '29.00',
    afterValue: '34.00',
    operationId: 'OP-8841',
    reason: 'Manual price rise across the linen range',
  }),
  ev({
    eventId: 'EV-0002',
    listingId: '1400001002',
    actorId: DEMO_ACTOR_ID,
    timestamp: '2026-07-24T09:12:00.000Z',
    type: 'PRICE_CHANGED',
    source: 'MANUAL',
    field: 'price',
    beforeValue: '29.00',
    afterValue: '34.00',
    operationId: 'OP-8841',
    reason: 'Manual price rise across the linen range',
  }),
  ev({
    eventId: 'EV-0003',
    listingId: '1400001001',
    actorId: DEMO_ACTOR_ID,
    timestamp: '2026-07-24T09:12:00.000Z',
    type: 'PRICE_CHANGED',
    source: 'MANUAL',
    field: 'price',
    beforeValue: '33.00',
    afterValue: '38.00',
    operationId: 'OP-8841',
    reason: 'Manual price rise across the linen range',
  }),

  // Jul 28 - tags replaced on 12 listings. RULED OUT: different listings.
  ev({
    eventId: 'EV-0004',
    listingId: null,
    actorId: DEMO_ACTOR_ID,
    timestamp: '2026-07-28T06:00:00.000Z',
    type: 'BULK_EDIT_COMPLETED',
    source: 'BULK_EDIT',
    field: 'tags',
    beforeValue: null,
    afterValue: 'autumn gifting tag set',
    operationId: 'BE-2291',
    reason: 'Seasonal tag refresh on the wall art section',
  }),

  // Aug 4 - stockout, restocked Aug 10. CORRELATED, -100% while out.
  ev({
    eventId: 'EV-0005',
    listingId: '1400001004',
    actorId: null,
    timestamp: '2026-08-04T03:20:00.000Z',
    type: 'STOCKOUT',
    source: 'SYNC',
    field: 'quantity',
    beforeValue: '6',
    afterValue: '0',
    operationId: null,
    reason: null,
  }),
  ev({
    eventId: 'EV-0006',
    listingId: '1400001004',
    actorId: DEMO_ACTOR_ID,
    timestamp: '2026-08-10T11:05:00.000Z',
    type: 'RESTOCKED',
    source: 'MANUAL',
    field: 'quantity',
    beforeValue: '0',
    afterValue: '18',
    operationId: null,
    reason: null,
  }),

  // Aug 6 - 4 listings deactivated. CORRELATED, -100% on those listings.
  ev({
    eventId: 'EV-0007',
    listingId: null,
    // The four it actually touched. Shop Pulse groups this event by section;
    // the experiment tracker needs to know whether it landed on ITS listings.
    listingIds: SEASONAL_LISTING_IDS,
    actorId: DEMO_ACTOR_ID,
    timestamp: '2026-08-06T15:41:00.000Z',
    type: 'LISTING_DEACTIVATED',
    source: 'MANUAL',
    field: 'state',
    beforeValue: 'ACTIVE',
    afterValue: 'INACTIVE',
    operationId: null,
    reason: 'Seasonal section retired early',
  }),

  // Aug 12 - the sync that produced the figures on screen.
  ev({
    eventId: 'EV-0008',
    listingId: null,
    actorId: null,
    timestamp: '2026-08-12T14:00:00.000Z',
    type: 'SYNC_COMPLETED',
    source: 'SYNC',
    field: null,
    beforeValue: null,
    afterValue: null,
    operationId: null,
    reason: null,
  }),

  // Note: there is deliberately NO event for the Aug 8-12 shop-wide dip.
  // Shop Pulse reports it as UNKNOWN rather than attributing a cause.
]
