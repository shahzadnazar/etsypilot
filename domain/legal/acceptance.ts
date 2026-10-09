import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   ETSY'S API TERMS §4: APPLICATION TERMS EXECUTED WITH EACH SELLER.
 *   A FOOTER LINK IS NOT THAT. THIS IS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   "You represent and warrant that you have executed Application Terms with
 *    each Etsy seller that comply with all applicable privacy laws…"
 *   "Failure to maintain transparent and sufficient Application Terms may
 *    result in your Etsy API access being suspended or terminated."
 *
 * Three things follow from "executed with each seller", and each one is a
 * function below:
 *
 *   1. There has to be a per-seller RECORD, not a page. `assertTermsAccepted`
 *      is what the record is for.
 *   2. A MATERIAL CHANGE has to be re-accepted. The version is a content hash,
 *      so this is automatic rather than remembered.
 *   3. The seller must be able to accept something real. `assertTermsOfferable`
 *      refuses while the document still says `[[LEGAL_ENTITY]]`.
 *
 * ── WHERE THE GATE SITS, AND WHY NOT IN THE UI ────────────────────────────
 *
 * A checkbox is a claim about what a browser rendered. The gate is in two
 * server-side places that an Etsy connection cannot happen without:
 *
 *   /api/etsy/connect    before a PKCE pair is minted and before the seller is
 *                        sent to Etsy. Nothing has happened yet, so refusing
 *                        here costs nobody anything.
 *   /api/etsy/callback   before the authorisation code is exchanged. This is
 *                        the one that answers "what stops somebody going
 *                        straight to the callback".
 *
 * On that last point specifically: the callback is already structurally
 * unreachable without the connect route, because the PKCE verifier only exists
 * in the flow cookie that /api/etsy/connect writes, and a callback with no
 * verifier cannot be exchanged. The second check is there anyway, because
 * "unreachable for a reason three files away" is how a gate quietly stops
 * being a gate — and because the check before the exchange is the one that
 * holds if a future flow ever mints a verifier somewhere else.
 *
 * Both sync entry points carry it too (domain/sync/listings.ts and
 * domain/sync/orders.ts), which is the "before their next connect or sync"
 * half of the requirement: a seller whose terms changed after they connected
 * is asked again before any further Etsy data is read.
 *
 * ── DEMO MODE ─────────────────────────────────────────────────────────────
 *
 * The gate returns early in demo mode, and that is not a hole: a demo shop has
 * no Etsy connection, no OAuth token and no seller, so there is no Etsy seller
 * for Application Terms to be executed with. ETSY_MODE=live is the only state
 * in which an Etsy connection exists at all, and the callback already refuses
 * outright in demo mode before this is reached. Asserted by
 * tests/unit/legal-acceptance.test.ts, because a bypass that is correct today
 * must not be allowed to become one that is wrong tomorrow.
 */

import { createHash } from 'node:crypto'

import { Errors } from '@/lib/errors/types'
import { isDemoMode } from '@/lib/etsy'
import { assertNotPublicVisitor } from '@/domain/public-demo'
import type { ShopContext } from '@/lib/permissions'
import { draftState, legalDocuments } from '@/lib/legal/documents'
import {
  appendTermsAcceptance,
  latestAcceptance,
  shopHasAcceptedVersion,
  type AcceptanceDocument,
} from '@/lib/repositories/terms-acceptances'

/** The documents a seller is asked to accept, and their individual hashes. */
export function applicationTermsDocuments(): AcceptanceDocument[] {
  return legalDocuments().map((document) => ({
    slug: document.slug,
    title: document.title,
    hash: document.contentHash,
  }))
}

/**
 * The version a seller accepts: one hash over every document in the set.
 *
 * Over the SET and not per document, because the Application Terms are the
 * Terms of Service and the Privacy Policy together — §4 asks for terms
 * covering what is collected, how it is used, stored, secured and disclosed,
 * and the Privacy Policy is where most of that is written. A seller who
 * accepted a Terms revision but not the Privacy revision beside it has
 * accepted half an agreement.
 *
 * Hashing the hashes rather than the concatenated text, so that the per-
 * document hashes on an acceptance row and the version it was recorded under
 * are provably the same thing.
 */
export function applicationTermsVersion(): string {
  const parts = applicationTermsDocuments()
    .map((document) => `${document.slug}:${document.hash}`)
    .sort()
    .join('\n')
  return createHash('sha256').update(parts).digest('hex')
}

/**
 * Refuse to put an unfinished agreement in front of a seller.
 *
 * `[[LEGAL_ENTITY]]` names no party. A checkbox beside a document with a blank
 * where the counterparty should be is not consent to anything, and recording
 * it as an acceptance would be worse than having no record — it would be a
 * false one, in the table whose whole purpose is evidence.
 *
 * So the acceptance flow refuses before it renders, before it writes, and
 * before a seller can be sent to Etsy. A deployment with unfinished documents
 * cannot connect a shop at all, which is the correct and inconvenient answer.
 */
export function assertTermsOfferable(): void {
  const state = draftState()
  if (!state.isDraft) return
  throw Errors.termsNotPublished(state.placeholders)
}

export function termsAreOfferable(): boolean {
  return !draftState().isDraft
}

export interface AcceptanceStatus {
  /** The version a seller would be accepting now. */
  version: string
  /** Null when this shop has never accepted anything. */
  acceptedVersion: string | null
  acceptedAt: string | null
  /** True when the current version is on file for this shop. */
  current: boolean
  /** True when something was accepted, but the documents have changed since. */
  stale: boolean
}

export async function acceptanceStatus(shopId: string): Promise<AcceptanceStatus> {
  const version = applicationTermsVersion()
  const latest = await latestAcceptance(shopId)
  const current = latest ? latest.version === version : false

  return {
    version,
    acceptedVersion: latest?.version ?? null,
    acceptedAt: latest?.acceptedAt ?? null,
    current,
    stale: Boolean(latest) && !current,
  }
}

/**
 * The gate. Throws unless this shop has accepted the documents as they are now.
 *
 * Reads by (shop, version) rather than comparing the latest acceptance, so a
 * seller who accepted v1, then v2, then saw the documents reverted to v1 is
 * still covered for v1 — the question is whether this exact text was agreed
 * to, not whether it was the most recent thing agreed to.
 */
export async function assertTermsAccepted(shopId: string): Promise<void> {
  if (isDemoMode()) return

  /*
   * Checked FIRST, and this order matters. On a deployment whose documents
   * still carry blanks, a seller cannot have a valid acceptance on file and
   * cannot be asked for one — so the refusal they are shown must say the
   * agreement is not ready, not that they failed to accept it.
   */
  assertTermsOfferable()

  if (await shopHasAcceptedVersion(shopId, applicationTermsVersion())) return
  throw Errors.termsNotAccepted()
}

/** Has it been accepted? Same question, for a surface that renders rather than throws. */
export async function hasAcceptedCurrentTerms(shopId: string): Promise<boolean> {
  if (isDemoMode()) return true
  if (!termsAreOfferable()) return false
  return shopHasAcceptedVersion(shopId, applicationTermsVersion())
}

/**
 * Record an acceptance.
 *
 * Refuses on an unfinished document before it writes anything, so the table
 * cannot hold an acceptance of a blank.
 */
export async function recordTermsAcceptance(input: {
  ctx: ShopContext
  userId: string
}): Promise<{ version: string; written: boolean }> {
  /*
   * ── A PUBLIC DEMO VISITOR CANNOT ACCEPT AN AGREEMENT ──────────────────
   *
   * Found by tests/unit/public-demo.test.ts, which sweeps every mutating API
   * route for a write gate and named this one the moment it was written. The
   * sweep was right, and not only on the general principle that a visitor
   * with no account must never write:
   *
   *   An acceptance names a person. The public demo's actor is
   *   `public-demo-visitor`, which is deliberately not a row in `users`, so
   *   an acceptance "by" them would either break the foreign key or — worse,
   *   if someone later relaxed it — put a row in the evidence table attesting
   *   that somebody who does not exist agreed to a contract.
   *
   * In the domain and not in the route, like every other write gate here, so
   * a second surface that records an acceptance cannot forget it.
   */
  assertNotPublicVisitor(input.ctx)
  assertTermsOfferable()

  const version = applicationTermsVersion()
  const written = await appendTermsAcceptance({
    shopId: input.ctx.shopId,
    userId: input.userId,
    version,
    documents: applicationTermsDocuments(),
  })

  return { version, written }
}
