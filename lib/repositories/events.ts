import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THIS SHOP'S OWN CHANGE LOG. THE INPUT SHOP PULSE AND THE ACTION CENTER
 *   WERE TAKING FROM THE DEMO FIXTURE INSTEAD.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `events` is append-only and has existed since the listings slice. Nothing
 * reads it outside the operator console, and domain/shop-pulse/service.ts
 * filtered `DEMO_EVENTS` — a module-level array of Willow & Fern's price
 * changes, bulk jobs, stockouts and deactivations — on every shop, in every
 * mode. Measured in a browser on a live account with two listings and two
 * orders: four CRITICAL cards, scoped to "3 listings", "12 listings", "the
 * bulk job" and "the section", none of which exist in that shop.
 *
 * ── THE TABLE IS EMPTY TODAY, AND THAT IS THE POINT ───────────────────────
 *
 * Nothing writes `events` yet: the bulk editor, the AI copilot and the sync
 * all still record into module-level stores. So a live shop reads back zero
 * events, and zero is the honest answer — this shop has no recorded change
 * history, which is exactly what Shop Pulse should say about it. The
 * alternative on offer was somebody else's history.
 *
 * When a writer does arrive, it writes here and these readers need no change.
 *
 * ── SHOP SCOPING IS STRUCTURAL ────────────────────────────────────────────
 *
 * Every exported function takes `shopId` first and every statement filters on
 * it. tests/unit/action-center.test.ts runs the shared sweep over this file.
 */

import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import type { DomainEvent, EventType } from '@/lib/events/types'

/**
 * Every event this shop recorded in a window, oldest first.
 *
 * Oldest first because the correlation engine walks them in order and names
 * the first one in a group; "newest first" is a reading order, not a causal
 * one.
 */
export async function readEvents(
  shopId: string,
  window: { since: string; until: string },
): Promise<DomainEvent[]> {
  const rows = await getDb()
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.shopId, shopId),
        gte(schema.events.timestamp, new Date(window.since)),
        lte(schema.events.timestamp, new Date(window.until)),
      ),
    )
    .orderBy(asc(schema.events.timestamp), asc(schema.events.eventId))

  return rows.map(toDomainEvent)
}

/**
 * The most recent event of any of these types, or null.
 *
 * Used by the Action Center to date a completed action from the operation
 * that closed it, rather than from a constant.
 */
export async function latestEventOfType(
  shopId: string,
  types: readonly EventType[],
): Promise<DomainEvent | null> {
  if (types.length === 0) return null
  const rows = await getDb()
    .select()
    .from(schema.events)
    .where(eq(schema.events.shopId, shopId))
    .orderBy(desc(schema.events.timestamp), desc(schema.events.eventId))
    .limit(200)

  const wanted = new Set<string>(types)
  const match = rows.find((row) => wanted.has(row.type))
  return match ? toDomainEvent(match) : null
}

/** How many events this shop has ever recorded. Zero means "no history". */
export async function countEvents(shopId: string): Promise<number> {
  const rows = await getDb()
    .select({ eventId: schema.events.eventId })
    .from(schema.events)
    .where(eq(schema.events.shopId, shopId))
    .limit(1)
  return rows.length
}

type EventRow = typeof schema.events.$inferSelect

/*
 * `listingIds` is deliberately absent.
 *
 * `DomainEvent.listingIds` is set on an event that touched several listings at
 * once, and the table has no column for it — a group event is one row with a
 * null `listing_id`. Returning `[]` here would be a claim that the event
 * touched nothing; leaving it undefined says the row cannot answer, which is
 * true until the column exists.
 */
function toDomainEvent(row: EventRow): DomainEvent {
  return {
    eventId: row.eventId,
    shopId: row.shopId,
    listingId: row.listingId,
    actorId: row.actorId,
    timestamp: row.timestamp.toISOString(),
    type: row.type as EventType,
    source: row.source as DomainEvent['source'],
    field: row.field,
    beforeValue: row.beforeValue,
    afterValue: row.afterValue,
    operationId: row.operationId,
    reason: row.reason,
  }
}
