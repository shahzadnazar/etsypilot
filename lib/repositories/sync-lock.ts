import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   ONE REFRESH PER SHOP PER AGGREGATE AT A TIME, ACROSS EVERY PROCESS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The question this answers: two requests arrive a millisecond apart on a shop
 * whose listings are seven hours old. Both reads find it stale, both trigger a
 * refresh, both page the seller's whole catalogue out of Etsy. On a budget of
 * 10,000 requests a day shared by every seller, that is the failure mode that
 * bites in production and never in a test.
 *
 * Two layers, because there are two different races.
 *
 *   SAME PROCESS. The common one, and it happens on every page load rather
 *   than occasionally: Next renders the layout, the page and several
 *   components concurrently, and each one asks where the shop's data comes
 *   from. A double-click, two tabs, or a client refresh after a sync does the
 *   same. domain/sync/refresh.ts holds an in-process promise map for this, so
 *   the second caller awaits the first caller's work instead of starting its
 *   own — and gets its result.
 *
 *   SEPARATE PROCESSES. Two node workers behind one nginx, which is what
 *   `pm2 -i` gives you on a Hostinger VPS, or two instances during a restart.
 *   An in-process map cannot see across that. This is what the advisory lock
 *   below is for.
 *
 * ── WHY A POSTGRES ADVISORY LOCK AND NOT A ROW ────────────────────────────
 *
 * A lease row would need a table, and a table needs a migration, a policy and
 * a reaper for leases whose holder died. An advisory lock needs none of those:
 * Postgres is already the thing both processes share, and a TRANSACTION-scoped
 * lock is released by the database on commit, on rollback, and on the
 * connection dropping — so a worker killed mid-refresh cannot wedge a shop.
 * That last property is why this is `pg_try_advisory_xact_lock` and not the
 * session-scoped `pg_try_advisory_lock`: a session lock survives on a pooled
 * connection that is handed back to the pool still holding it, and the bug
 * that produces is a shop that can never refresh again.
 *
 * ── THE COST, NAMED ───────────────────────────────────────────────────────
 *
 * Transaction-scoped means the transaction stays open while the refresh runs,
 * and the refresh is network I/O against Etsy. So one pooled connection sits
 * idle-in-transaction for the length of the Etsy fetch — about a second for a
 * 200-listing shop at two requests — and the sync's own write transaction
 * takes a second connection from the same pool. lib/db sets `max: 10`, so at
 * most five refreshes run concurrently per process and a sixth waits for a
 * connection rather than failing.
 *
 * Holding a transaction open across network I/O is normally a thing to avoid.
 * It is accepted here deliberately: the alternatives are a session lock that
 * can leak (above), or a lease table whose crash-recovery story is code we
 * would have to write and test. At four refreshes per shop per day the
 * connection-seconds are not the scarce resource; the Etsy budget is.
 *
 * ── NON-BLOCKING, AND THE LOSER DOES NOT QUEUE ────────────────────────────
 *
 * `try` rather than the blocking form. A loser that waited would hold a
 * connection of its own for the winner's duration and then — without the
 * double-check its caller does inside the lock — immediately fetch the same
 * catalogue again. Returning `BUSY` at once costs nothing and the caller has
 * something true to say: somebody else is reading your shop right now.
 */

import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import type { SyncAggregate } from '@/lib/repositories/sync-state'

/**
 * A lock namespace, so these keys cannot collide with another advisory lock
 * somebody adds later for an unrelated reason.
 */
const NAMESPACE = 'cobaltrank:sync'

export type LockResult<T> = { held: true; value: T } | { held: false }

/**
 * Run `fn` holding the refresh lock for one (shop, aggregate), or report that
 * somebody else holds it.
 *
 * `fn` receives nothing and may do anything, including its own database work on
 * its own connection — the lock does not wrap the write, it serialises the
 * decision to fetch. The sync's atomicity comes from its own transaction, which
 * is where it belongs: lib/repositories/sync-state.ts refuses to stamp a
 * timestamp outside the transaction that wrote the rows it describes.
 */
export async function withAggregateSyncLock<T>(
  shopId: string,
  aggregate: SyncAggregate,
  fn: () => Promise<T>,
): Promise<LockResult<T>> {
  const key = `${NAMESPACE}:${shopId}:${aggregate}`

  return getDb().transaction(async (tx) => {
    /*
     * hashtextextended() rather than hashtext(): the one-argument advisory
     * lock takes a bigint and hashtext returns int4, so hashtext would narrow
     * the keyspace to 2^32 and, worse, sign-extend differently across
     * versions. The seed is fixed at 0 so two processes compute the same key.
     */
    const rows = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as locked`,
    )
    const first = Array.isArray(rows) ? rows[0] : undefined
    if (first?.locked !== true) return { held: false }

    return { held: true, value: await fn() }
  })
}
