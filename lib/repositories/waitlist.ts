import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE WAITLIST. THE ONE REPOSITORY WITH NO ShopContext, AND THE REASON IS
 *   WORTH STATING RATHER THAN NOTICING.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Every other repository here takes a `ShopContext` as its first argument, so
 * that "forgot to scope this query" is a missing-argument compile error. A
 * waitlist row has no shop and no user — the person has not signed up — so
 * there is no context to take and that protection is simply unavailable.
 *
 * What replaces it:
 *
 *   NO READ PATH AT ALL.  This file exports one write and one count. There is
 *                         deliberately no `findByEmail`, no `listSignups` and
 *                         no "you are number 412". A read-by-address would
 *                         turn the public form into an oracle: submit an
 *                         address, see whether it was already there, and you
 *                         have a membership check anybody can run.
 *   COUNT IS INTERNAL.    `countWaitlist` exists for tests and for an operator
 *                         surface that does not exist yet. Nothing renders it
 *                         to a visitor, and the landing page carries no signup
 *                         count — the product's own rule against invented
 *                         social proof applies to real numbers too, early on,
 *                         because a small true number is still a number
 *                         nobody asked to be part of.
 *   RANDOM IDS.           Not a sequence. A sequential id tells whoever gets
 *                         one how many came before, and lets them guess at the
 *                         rest.
 *
 * ── ONE ADDRESS, ONE ROW ──────────────────────────────────────────────────
 *
 * `onConflictDoUpdate` on the lowercased-email index, so a second submission
 * refreshes the row rather than inserting beside it. Two rows for one person
 * is two emails the day there is a sender, which is the first impression this
 * list exists to get right.
 */

import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'

export interface WaitlistSignup {
  email: string
  shopUrl?: string | null
  /** Which part of the page it came from. Free text, never shown back. */
  source?: string | null
}

/** Was this address accepted, and was it already on the list? */
export interface WaitlistResult {
  /** True when this submission created a row rather than refreshing one. */
  added: boolean
}

/**
 * Add an address, or refresh the row it already has.
 *
 * ── THE RETURN VALUE SAYS NOTHING THE CALLER MAY SHOW ─────────────────────
 *
 * `added` is false for a repeat submission, and the form deliberately renders
 * the SAME confirmation either way. It is returned because the write knows it
 * and a future operator metric will want it, not because the page should
 * branch on it: a form that says "you were already on the list" tells anyone
 * who types an address whether that person signed up.
 */
export async function addToWaitlist(signup: WaitlistSignup): Promise<WaitlistResult> {
  const email = signup.email.trim()
  const shopUrl = signup.shopUrl?.trim() || null
  const source = signup.source?.trim() || null

  /*
   * ── ONE STATEMENT, WRITTEN OUT, BECAUSE THE INDEX IS AN EXPRESSION ──────
   *
   * The unique index is on `lower(email)` rather than on the column, and
   * drizzle's `onConflictDoUpdate` target takes columns — it cannot name an
   * expression index. Rather than add a second, redundant lowercased column
   * purely to satisfy the query builder, the upsert is written out.
   *
   * Nothing is lost by doing so here: this is the one table with no shop, so
   * the static sweep that forbids a shop predicate inside a raw template has
   * nothing to check, and every value below is a bound parameter.
   */
  const rows = await getDb().execute<{ created_at: Date; updated_at: Date }>(sql`
    insert into waitlist_signups (id, email, shop_url, source)
    values (${`wl_${randomUUID()}`}, ${email}, ${shopUrl}, ${source})
    on conflict (lower(email)) do update set
      -- The address is NOT rewritten: somebody resubmitting with different
      -- capitalisation is the same person, and the first spelling is theirs.
      -- A blank field on a second submission must not erase what they gave
      -- the first time, which is what the coalesce order is doing.
      shop_url = coalesce(excluded.shop_url, waitlist_signups.shop_url),
      source = coalesce(waitlist_signups.source, excluded.source),
      updated_at = now()
    returning created_at, updated_at
  `)

  const row = (rows as unknown as { created_at: Date; updated_at: Date }[])[0]
  /*
   * "Added" means the row was created by THIS call, which is true only when
   * the two timestamps are the same instant — the update above always moves
   * `updated_at` and never touches `created_at`.
   */
  const added = row ? new Date(row.created_at).getTime() === new Date(row.updated_at).getTime() : false
  return { added }
}

/**
 * How many people are on the list.
 *
 * Internal. Nothing renders it to a visitor — see the module note — and the
 * landing page carries no signup count at all.
 */
export async function countWaitlist(): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.waitlistSignups)
  return row?.total ?? 0
}
