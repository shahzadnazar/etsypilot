/*
 * Notification preferences (artboards 74–75 and 104).
 *
 * Two rules from the design, both enforced by the shape rather than by copy:
 *
 *   1. The event list is CLOSED. Every notification EtsyPilot can send is one
 *      of these, so there is nowhere to add a marketing email later without
 *      adding an event to this table and having to name it.
 *
 *   2. Nothing here is opt-out-once-and-still-arrives. Each event has an in-app
 *      channel and an email channel, both independently off-able, and the
 *      digest has its own switch beside them.
 *
 * The digest's rule is stated on the page and honoured in the domain: if
 * nothing crossed the baseline that week, no email is sent. A digest with
 * nothing in it trains a seller to ignore the next one.
 */

import { getEtsyService } from '@/lib/etsy'
import type { ShopContext } from '@/lib/permissions'

export const NOTIFICATION_EVENTS = [
  'MARGIN_ALERT',
  'BULK_JOB',
  'SYNC_FAILURE',
  'PLAN_LIMIT',
  'WEEKLY_DIGEST',
] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export interface EventSpec {
  key: NotificationEvent
  label: string
  detail: string
  /** True where turning it off would hide something the seller must act on. */
  criticalEmail: boolean
}

export const EVENT_SPECS: EventSpec[] = [
  {
    key: 'MARGIN_ALERT',
    label: 'Low margin or below-cost alerts',
    detail:
      'When a listing’s price stops covering its cost and fees. Uses your entered costs, so it is only as good as those.',
    criticalEmail: false,
  },
  {
    key: 'BULK_JOB',
    label: 'Bulk job finished or failed',
    detail: 'Including a job refused at the gate, which sends nothing to Etsy.',
    criticalEmail: false,
  },
  {
    key: 'SYNC_FAILURE',
    label: 'Sync failures and expired access',
    detail:
      'An expired token stops every reading in the product. This one is worth leaving on — nothing else tells you the figures have stopped moving.',
    criticalEmail: true,
  },
  {
    key: 'PLAN_LIMIT',
    label: 'Plan limits reached',
    detail: 'When new bulk jobs pause. Nothing is deleted, and you choose what to remove.',
    criticalEmail: false,
  },
  {
    key: 'WEEKLY_DIGEST',
    label: 'Weekly Shop Pulse digest',
    detail: 'One email a week summarising Shop Pulse. Never marketing.',
    criticalEmail: false,
  },
]

export const DIGEST_DAYS = ['MON', 'THU', 'SUN'] as const
export type DigestDay = (typeof DIGEST_DAYS)[number]

export const DIGEST_DAY_LABEL: Record<DigestDay, string> = {
  MON: 'Monday',
  THU: 'Thursday',
  SUN: 'Sunday',
}

export const DIGEST_SECTIONS = [
  'PULSE_CHANGES',
  'PROFIT_SUMMARY',
  'ACTION_CENTER',
  'SEASONAL_WINDOWS',
] as const
export type DigestSection = (typeof DIGEST_SECTIONS)[number]

export const DIGEST_SECTION_LABEL: Record<DigestSection, string> = {
  PULSE_CHANGES: 'Shop Pulse changes and diagnoses',
  PROFIT_SUMMARY: 'Profit and coverage summary',
  ACTION_CENTER: 'Open Action Center items',
  SEASONAL_WINDOWS: 'Seasonal windows opening soon',
}

export interface NotificationPreferences {
  /** Per event: in-app and email, independently. */
  channels: Record<NotificationEvent, { inApp: boolean; email: boolean }>
  digestDay: DigestDay
  digestSections: DigestSection[]
  /** Warn below this net margin, as a percentage. */
  marginFloorPercent: number
  /** Warn when stock falls under this. */
  stockFloor: number
  quietHoursFrom: string
  quietHoursTo: string
}

export interface NotificationsView {
  preferences: NotificationPreferences
  email: string
  events: EventSpec[]
  /** What the digest would contain if it were sent right now. */
  nextDigest: { wouldSend: boolean; reason: string }
}

export function defaultPreferences(): NotificationPreferences {
  return {
    channels: {
      MARGIN_ALERT: { inApp: true, email: true },
      BULK_JOB: { inApp: true, email: false },
      SYNC_FAILURE: { inApp: true, email: true },
      PLAN_LIMIT: { inApp: true, email: false },
      WEEKLY_DIGEST: { inApp: false, email: true },
    },
    digestDay: 'THU',
    digestSections: ['PULSE_CHANGES', 'PROFIT_SUMMARY', 'ACTION_CENTER'],
    marginFloorPercent: 10,
    stockFloor: 3,
    quietHoursFrom: '21:00',
    quietHoursTo: '08:00',
  }
}

const STORE_KEY = Symbol.for('etsypilot.notifications.store')

function store(): Map<string, NotificationPreferences> {
  const g = globalThis as unknown as Record<symbol, Map<string, NotificationPreferences> | undefined>
  const existing = g[STORE_KEY]
  if (existing) return existing
  const fresh = new Map<string, NotificationPreferences>()
  g[STORE_KEY] = fresh
  return fresh
}

export function readPreferences(shopId: string): NotificationPreferences {
  const existing = store().get(shopId)
  return existing ? structuredClone(existing) : defaultPreferences()
}

export function writePreferences(shopId: string, prefs: NotificationPreferences): void {
  store().set(shopId, structuredClone(prefs))
}

/** Test helper. */
export function resetPreferences(): void {
  store().clear()
}

export async function getNotifications(
  ctx: ShopContext,
  email: string,
): Promise<NotificationsView> {
  const preferences = readPreferences(ctx.shopId)
  const shop = await getEtsyService().getShop(ctx.shopId)

  return {
    preferences,
    email,
    events: EVENT_SPECS,
    nextDigest: digestDecision(preferences, shop.activeListingCount),
  }
}

/**
 * Whether this week's digest would go out.
 *
 * "Nothing crossed your baseline, so nothing is sent" is a rule the product
 * keeps, not a promise it makes. A shop with nothing in it gets no email at
 * all, which is why the empty case is decided here rather than at send time.
 */
export function digestDecision(
  prefs: NotificationPreferences,
  listingCount: number,
): { wouldSend: boolean; reason: string } {
  if (!prefs.channels.WEEKLY_DIGEST.email) {
    return { wouldSend: false, reason: 'The weekly digest is off, so no email is scheduled.' }
  }
  if (prefs.digestSections.length === 0) {
    return {
      wouldSend: false,
      reason: 'Every section is unticked, so the digest would be an empty email. Nothing is sent.',
    }
  }
  if (listingCount === 0) {
    return {
      wouldSend: false,
      reason: 'There is nothing in the shop to summarise yet, so no digest is sent.',
    }
  }
  return {
    wouldSend: true,
    reason: `Next ${DIGEST_DAY_LABEL[prefs.digestDay]}, if something crossed your baseline. If nothing did, no email is sent — a digest with nothing in it trains you to ignore the next one.`,
  }
}
