import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHEN EACH AGGREGATE WAS LAST READ. ONE ROW PER (SHOP, AGGREGATE).
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The listings slice answered "has this shop been synced" from
 * shops.last_synced_at, which was right while listings were the only
 * aggregate reading our own tables. Orders is the second and it breaks that
 * column: after a listings sync it is set, so an orders reader is told YES and
 * finds an empty table.
 *
 * That failure lands hardest on the Action Center, whose entire job is to say
 * what needs attention. "Nothing needs your attention" and "nothing has been
 * read yet" are opposite messages, and one timestamp cannot tell them apart.
 *
 * shops.last_synced_at is NOT replaced. It keeps its own meaning — the most
 * recent sync of anything — which is what the app shell's "Synced 7 min ago"
 * wants and what the shell already reads. Every sync writes both.
 */

import { and, eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'

/**
 * The aggregates that read from our own tables.
 *
 * A closed union rather than a string, so a typo is a compile error instead of
 * a row nobody reads. Listings and orders exist; the other three are named
 * here because the sync-state row is the first thing each will need, and a
 * reader asking for one that does not sync yet should fail to compile rather
 * than silently read NOT_SYNCED forever.
 */
export const SYNC_AGGREGATES = ['LISTINGS', 'ORDERS'] as const
export type SyncAggregate = (typeof SYNC_AGGREGATES)[number]

/** Any transaction or the pool — so a sync can write this inside its own BEGIN. */
type Queryable = Pick<ReturnType<typeof getDb>, 'insert' | 'select' | 'update'>

/** When this aggregate last synced for this shop, or null if it never has. */
export async function readAggregateSyncedAt(
  shopId: string,
  aggregate: SyncAggregate,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ lastSyncedAt: schema.syncState.lastSyncedAt })
    .from(schema.syncState)
    .where(and(eq(schema.syncState.shopId, shopId), eq(schema.syncState.aggregate, aggregate)))
    .limit(1)
  return row?.lastSyncedAt ? row.lastSyncedAt.toISOString() : null
}

/**
 * Record that this aggregate synced, and refresh the shop's own timestamp.
 *
 * ── TAKES A TRANSACTION, AND MUST ─────────────────────────────────────────
 *
 * Called from inside a sync's BEGIN, beside the rows it describes. A timestamp
 * committed separately from its rows would claim a catalogue that is not there
 * — the one value the listings slice established must never be optimistic.
 *
 * `shops.last_synced_at` is written to the SAME instant rather than to max(),
 * because this call is always the most recent sync by construction: it happens
 * at the end of one.
 */
export async function writeAggregateSyncedAt(
  tx: Queryable,
  shopId: string,
  aggregate: SyncAggregate,
  syncedAt: Date,
): Promise<void> {
  await tx
    .insert(schema.syncState)
    .values({ shopId, aggregate, lastSyncedAt: syncedAt })
    .onConflictDoUpdate({
      target: [schema.syncState.shopId, schema.syncState.aggregate],
      set: { lastSyncedAt: syncedAt },
    })

  await tx
    .update(schema.shops)
    .set({ lastSyncedAt: syncedAt })
    .where(eq(schema.shops.id, shopId))
}
