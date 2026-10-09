import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   ACCEPTANCE RECORDS. ONE APPEND, TWO READS, NO UPDATE, NO DELETE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file is the whole write surface for `terms_acceptances`, and the
 * absences are the design:
 *
 *   NO UPDATE.  An acceptance says a named person agreed to an exact document
 *               at an exact time. Every field is part of that statement, so
 *               there is nothing in a row that could be legitimately changed —
 *               a correction is a new acceptance of the corrected document,
 *               which is what the version hash makes happen by itself.
 *   NO DELETE.  Etsy's API Terms §4 makes this the evidence that Application
 *               Terms were executed with each seller. Evidence that the
 *               product can delete is not evidence.
 *
 * `tests/unit/legal-claims.test.ts` sweeps domain/, app/ and lib/ for an
 * update or delete against this table and fails on one, so the absence is
 * enforced rather than merely documented — the same guard shape the audit
 * records use.
 *
 * ── A REPEAT ACCEPT IS A NO-OP INSERT, NOT AN UPDATE ──────────────────────
 *
 * `onConflictDoNothing` against the (shop, user, version) unique index. A
 * seller who double-clicks, or who re-accepts an unchanged document, keeps the
 * FIRST timestamp — which is the one that answers "when did they agree to
 * this" — and gains no second row. Deliberately not `onConflictDoUpdate`: that
 * would be an UPDATE against an append-only table and would quietly move the
 * date of an agreement.
 */

import { and, desc, eq } from 'drizzle-orm'

import * as schema from '@/db/schema'
import { getDb } from '@/lib/db'

export interface AcceptanceDocument {
  slug: string
  title: string
  hash: string
}

export interface TermsAcceptance {
  shopId: string
  userId: string
  version: string
  documents: AcceptanceDocument[]
  acceptedAt: string
}

/** A random id, so one row says nothing about any other. */
function acceptanceId(): string {
  return `ta_${crypto.randomUUID()}`
}

/**
 * Record that this user, for this shop, accepted this exact version.
 *
 * Returns true when a row was written and false when the same acceptance was
 * already there — the caller uses that only to decide what to say, never to
 * decide whether the seller is covered.
 */
export async function appendTermsAcceptance(input: {
  shopId: string
  userId: string
  version: string
  documents: AcceptanceDocument[]
}): Promise<boolean> {
  const written = await getDb()
    .insert(schema.termsAcceptances)
    .values({
      id: acceptanceId(),
      shopId: input.shopId,
      userId: input.userId,
      version: input.version,
      documents: input.documents,
    })
    .onConflictDoNothing()
    .returning({ id: schema.termsAcceptances.id })

  return written.length > 0
}

/**
 * Has this shop accepted this exact version?
 *
 * Scoped by shop and not by user, because the gate protects a SHOP: the
 * question at connect time is whether this shop's Application Terms are in
 * place, and a shop with two members does not need both of them to click
 * before either can sync. Which human accepted is still recorded on the row.
 */
export async function shopHasAcceptedVersion(shopId: string, version: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: schema.termsAcceptances.id })
    .from(schema.termsAcceptances)
    .where(
      and(
        eq(schema.termsAcceptances.shopId, shopId),
        eq(schema.termsAcceptances.version, version),
      ),
    )
    .limit(1)

  return Boolean(row)
}

/** The most recent acceptance for a shop, whichever version it was. */
export async function latestAcceptance(shopId: string): Promise<TermsAcceptance | null> {
  const [row] = await getDb()
    .select({
      shopId: schema.termsAcceptances.shopId,
      userId: schema.termsAcceptances.userId,
      version: schema.termsAcceptances.version,
      documents: schema.termsAcceptances.documents,
      acceptedAt: schema.termsAcceptances.acceptedAt,
    })
    .from(schema.termsAcceptances)
    .where(eq(schema.termsAcceptances.shopId, shopId))
    .orderBy(desc(schema.termsAcceptances.acceptedAt))
    .limit(1)

  if (!row) return null
  return {
    shopId: row.shopId,
    userId: row.userId,
    version: row.version,
    documents: row.documents,
    acceptedAt: row.acceptedAt.toISOString(),
  }
}
