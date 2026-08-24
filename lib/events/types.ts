/*
 * The event model.
 *
 * Event is append-only. Rollback writes a *new* event; it never edits history.
 * This log is the spine of Shop Pulse, rollback, audit history and the Action
 * Center (PRD section 4.9, architecture.md section 6).
 */

export const EVENT_TYPES = [
  'PRICE_CHANGED',
  'TITLE_CHANGED',
  'TAGS_CHANGED',
  'DESCRIPTION_CHANGED',
  'QUANTITY_CHANGED',
  'LISTING_DEACTIVATED',
  'LISTING_REACTIVATED',
  'STOCKOUT',
  'RESTOCKED',
  'BULK_EDIT_STARTED',
  'BULK_EDIT_COMPLETED',
  'BULK_EDIT_FAILED',
  'BULK_EDIT_ROLLED_BACK',
  'AI_CHANGE_APPLIED',
  'COST_RULE_CHANGED',
  'SHOP_CONNECTED',
  'SHOP_DISCONNECTED',
  'SYNC_COMPLETED',
  'SYNC_FAILED',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

/** How the change reached the shop. Surfaced in Change History. */
export type EventSource = 'MANUAL' | 'BULK_EDIT' | 'SCHEDULED' | 'AI_ASSISTED' | 'SYNC' | 'SYSTEM'

export interface DomainEvent {
  eventId: string
  shopId: string
  listingId: string | null
  /*
   * Set on an event that touched SEVERAL listings at once — a section
   * deactivation, a bulk state change — where `listingId` is null because no
   * single listing owns it.
   *
   * Without it a group event is invisible to anything asking "did something
   * else happen to these listings?", which is how Shop Pulse could report a
   * deactivation as the cause of a fall while the experiment tracker reported
   * the seller's title change as the cause of the same fall.
   */
  listingIds?: string[]
  /** D20: actor_id on every row from day one, so multi-user is additive. */
  actorId: string | null
  timestamp: string
  type: EventType
  source: EventSource
  field: string | null
  beforeValue: string | null
  afterValue: string | null
  /** Set for anything a bulk operation produced, so rollback can find its set. */
  operationId: string | null
  reason: string | null
}

export const EVENT_LABEL: Record<EventType, string> = {
  PRICE_CHANGED: 'Price changed',
  TITLE_CHANGED: 'Title changed',
  TAGS_CHANGED: 'Tags changed',
  DESCRIPTION_CHANGED: 'Description changed',
  QUANTITY_CHANGED: 'Quantity changed',
  LISTING_DEACTIVATED: 'Listing deactivated',
  LISTING_REACTIVATED: 'Listing reactivated',
  STOCKOUT: 'Out of stock',
  RESTOCKED: 'Restocked',
  BULK_EDIT_STARTED: 'Bulk edit started',
  BULK_EDIT_COMPLETED: 'Bulk edit completed',
  BULK_EDIT_FAILED: 'Bulk edit failed',
  BULK_EDIT_ROLLED_BACK: 'Bulk edit rolled back',
  AI_CHANGE_APPLIED: 'AI change applied',
  COST_RULE_CHANGED: 'Cost rule changed',
  SHOP_CONNECTED: 'Shop connected',
  SHOP_DISCONNECTED: 'Shop disconnected',
  SYNC_COMPLETED: 'Sync completed',
  SYNC_FAILED: 'Sync failed',
}

export const EVENT_SOURCE_LABEL: Record<EventSource, string> = {
  MANUAL: 'Manual',
  BULK_EDIT: 'Bulk edit',
  SCHEDULED: 'Scheduled',
  AI_ASSISTED: 'AI-assisted',
  SYNC: 'Sync',
  SYSTEM: 'System',
}

/**
 * Diagnosis is NOT provenance.
 *
 * Provenance answers where a number came from. Diagnosis answers whether an
 * event explains a change. They must never be confused, which is why the badge
 * shapes differ (D4).
 */
export const DIAGNOSES = ['CORRELATED', 'RULED_OUT', 'UNKNOWN'] as const
export type Diagnosis = (typeof DIAGNOSES)[number]

export const DIAGNOSIS_LABEL: Record<Diagnosis, string> = {
  CORRELATED: 'CORRELATED',
  RULED_OUT: 'RULED OUT',
  UNKNOWN: 'UNKNOWN',
}

export const DIAGNOSIS_DEFINITION: Record<Diagnosis, string> = {
  CORRELATED:
    'An observable change and an observable outcome moved together inside the comparison window.',
  RULED_OUT: 'The change was tested against the outcome and does not account for it.',
  UNKNOWN: 'A change was observed but the available evidence cannot explain the outcome.',
}
