/*
 * POST /api/sync/refresh — re-read this seller's Etsy data because a page
 * found it outside Etsy's display window.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SHOP IS READ FROM THE SESSION AND NEVER FROM THE REQUEST.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * There is no shop id in the body, the query string or the path, and there is
 * no code path here that could accept one. That is the whole of this route's
 * authorization story: `shopContext(session, session.shopId)` is the only
 * sanctioned way to build a context (lib/permissions), it throws crossShop()
 * on a mismatch, and with the id coming from the session the mismatch is
 * impossible by construction rather than by a check somebody could delete.
 *
 * It is also why this route is not reachable from the operator console.
 * domain/admin/operator-writes.ts declares the four things an operator may
 * write; a sync is not one of them, and an operator pressing a button here
 * would refresh THEIR OWN shop, not the account they are looking at. No
 * operator screen links to it.
 *
 * ── WHY A POST FROM THE PAGE AND NOT A SYNC INSIDE THE RENDER ─────────────
 *
 * The obvious alternative is for shopDataSource() to refresh inline when it
 * finds stale data, so the page renders fresh in one pass. Rejected:
 *
 *   - It makes a GET write. Every seller screen renders this path, several
 *     times per render, and a page render that mutates cannot be retried,
 *     prefetched or reasoned about. Next prefetches links on hover.
 *   - It blocks first paint on Etsy. The shell, the nav and everything that is
 *     not Etsy content would wait on a network call to a third party.
 *   - It puts the failure inside the render, where the only honest options are
 *     a 500 or a silent fallthrough.
 *
 * With a POST the page paints immediately, says plainly that it is re-reading
 * and why, and the failure is an outcome in a response rather than an
 * exception in a tree.
 *
 * ── WHAT IT RETURNS ───────────────────────────────────────────────────────
 *
 * Always 200 with a JSON outcome per aggregate, except for "no session" and a
 * malformed body. A refresh that Etsy refused is not a failure of this
 * endpoint; the caller is a component that needs to tell the seller which of
 * the five things happened, and an HTTP status cannot carry that. Nothing in
 * the body is ever an error message from the sync — AppError.recovery is
 * written for whoever triggered the action, and these reason codes are mapped
 * in domain/sync/refresh.ts so the component owns the wording.
 */

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { log } from '@/lib/observability/logger'
import { isDemoMode } from '@/lib/etsy'
import { refreshStaleAggregates } from '@/domain/sync/refresh'
import { SYNC_AGGREGATES, type SyncAggregate } from '@/lib/repositories/sync-state'

export const dynamic = 'force-dynamic'

/** The body, which is a list of aggregate names and nothing else. */
function requestedAggregates(body: unknown): readonly SyncAggregate[] | null {
  if (body === null || typeof body !== 'object') return null
  const raw = (body as { aggregates?: unknown }).aggregates
  if (raw === undefined) return SYNC_AGGREGATES
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out: SyncAggregate[] = []
  for (const name of raw) {
    /*
     * Checked against the union rather than cast. An unrecognised name would
     * otherwise reach readAggregateSyncedAt and read a row that can never
     * exist, which looks exactly like "never synced" and would make this
     * endpoint a way to provoke an unbounded number of syncs.
     */
    const match = SYNC_AGGREGATES.find((known) => known === name)
    if (!match) return null
    if (!out.includes(match)) out.push(match)
  }
  return out
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'NOT_SIGNED_IN' }, { status: 401 })
  }

  /*
   * Demo mode never gets here in practice — nothing in the demo is ever
   * outside a window, because the demo reads no Etsy content at all, so no
   * surface renders the thing that calls this. Refused anyway, and refused
   * BEFORE the context is built: a public-demo visitor sharing a process with
   * real sellers is the case lib/demo-mode.ts exists for, and "unreachable"
   * is not a property to rely on at an HTTP boundary.
   */
  if (isDemoMode()) {
    return NextResponse.json({ outcomes: [], skipped: 'DEMO' })
  }

  let parsed: unknown = {}
  try {
    const text = await request.text()
    parsed = text.length === 0 ? {} : JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'MALFORMED_BODY' }, { status: 400 })
  }

  const aggregates = requestedAggregates(parsed)
  if (!aggregates) return NextResponse.json({ error: 'MALFORMED_BODY' }, { status: 400 })

  try {
    const outcomes = await refreshStaleAggregates(shopContext(session, session.shopId), aggregates)
    return NextResponse.json({ outcomes })
  } catch (error) {
    /*
     * refreshStaleAggregates reports the expected failures as outcomes and
     * does not throw them, so anything here is a defect or the database being
     * gone. Logged redacted; the seller is told the refresh did not happen,
     * with no stack trace and no identifier.
     */
    log.error('a refresh request could not be served', error, { path: '/api/sync/refresh' })
    return NextResponse.json({ error: 'REFRESH_FAILED' }, { status: 500 })
  }
}
