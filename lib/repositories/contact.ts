import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   CONTACT MESSAGES. THE SECOND REPOSITORY WITH NO ShopContext.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ./waitlist.ts explains the shape at length and this is the same shape, for
 * the same reason: somebody asking which plan to buy has no shop and no user,
 * so the "forgot to scope this query" compile error that protects every other
 * repository here is simply unavailable.
 *
 * What replaces it:
 *
 *   NO READ PATH.     One write and one count. No find-by-email, no list, no
 *                     "we already have your message" — a read-by-address
 *                     would turn a public form into a membership check anyone
 *                     can run against any address.
 *   RANDOM IDS.       Not a sequence. A sequential id tells whoever receives
 *                     one how many came before and lets them guess the rest.
 *   NOTHING ECHOED.   The route redirects to a fixed outcome and renders none
 *                     of the submitted text back, so the form cannot be used
 *                     to bounce content off this origin.
 *
 * ── AND NO UPSERT, UNLIKE THE WAITLIST ───────────────────────────────────
 *
 * The waitlist collapses a second submission onto the first row, because two
 * rows for one address means two emails the day there is a sender. A second
 * QUESTION is not a duplicate of the first one — it is a second question —
 * and an upsert here would silently discard it. Insert, every time.
 *
 * ── NOTHING IS EMAILED, AND THAT IS WHY THIS TABLE EXISTS ────────────────
 *
 * There is no email sender in this product; domain/billing/trial.ts names the
 * two environment variables it would need and refuses to start a trial until
 * they are set. So this table IS the delivery mechanism rather than a copy of
 * one, and the page says "recorded, nothing sent" instead of "we'll be in
 * touch shortly" — a sentence nothing in this repository could keep.
 */

import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'

export interface ContactMessage {
  name: string
  email: string
  subject: string
  message: string
  /** Which page it came from. Free text, never shown back. */
  source?: string | null
}

/**
 * The bounds the route checks and the CHECK constraints enforce.
 *
 * Exported so the form, the route handler and the tests read one definition
 * rather than three copies that drift — the migration's constraints are the
 * fourth copy and are deliberately the same numbers, so a value this accepts
 * can never be one the database rejects.
 */
export const CONTACT_LIMITS = {
  name: { min: 1, max: 200 },
  email: { min: 3, max: 320 },
  subject: { min: 1, max: 200 },
  message: { min: 1, max: 5000 },
} as const

/** Record a message. Returns nothing a caller may show back to a visitor. */
export async function recordContactMessage(input: ContactMessage): Promise<void> {
  await getDb().execute(sql`
    insert into contact_messages (id, name, email, subject, message, source)
    values (
      ${`cm_${randomUUID()}`},
      ${input.name.trim()},
      ${input.email.trim()},
      ${input.subject.trim()},
      ${input.message.trim()},
      ${input.source?.trim() || null}
    )
  `)
}

/**
 * How many messages are waiting.
 *
 * Internal, like the waitlist's count. Nothing renders it to a visitor; it
 * exists for the tests and for an operator surface that does not exist yet.
 */
export async function countUnhandledContactMessages(): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.contactMessages)
    .where(sql`handled_at is null`)
  return row?.total ?? 0
}
