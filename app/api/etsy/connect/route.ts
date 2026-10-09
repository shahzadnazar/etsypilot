/*
 * GET /api/etsy/connect — start the Etsy OAuth flow.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THIS ROUTE REFUSES CLEANLY WITHOUT AN ETSY API KEY, ON PURPOSE.
 *
 *  With no ETSY_API_KEY set it redirects to Settings → Shop connections with
 *  an honest "not configured" notice instead of sending the seller to an Etsy
 *  page that will reject them. When your key arrives:
 *
 *      ETSY_API_KEY=<your app's keystring>
 *      ETSY_REDIRECT_URI=https://<your-domain>/api/etsy/callback
 *      ETSY_MODE=live
 *
 *  in .env.local, and register that exact redirect URI in the Etsy app
 *  dashboard. docs/ETSY-SETUP.md has the full checklist.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The seller's Etsy password is typed on etsy.com and never reaches this
 * product. That is not a policy we follow; it is a shape — there is no password
 * field anywhere in the codebase to receive one.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { ETSY_SCOPES as SCOPE_CHOICES, selectedScopeStrings } from '@/domain/connect/types'
import { authorizeUrl, createPkcePair, createState } from '@/lib/etsy/oauth'
import { hasAcceptedCurrentTerms, termsAreOfferable } from '@/domain/legal/acceptance'
import { outcomeUrl, writeFlowCookie } from '../_flow'

/** A session is per-request, so this can never be prerendered (D47). */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.redirect(new URL('/', request.url), 303)
  }

  const apiKey = process.env.ETSY_API_KEY
  const redirectUri = process.env.ETSY_REDIRECT_URI
  if (!apiKey || !redirectUri) {
    // Not an error page and not a stack trace. The shop settings screen reads
    // this outcome and explains that the server has no Etsy app configured yet.
    return NextResponse.redirect(outcomeUrl(request, 'not_configured'), 303)
  }

  /*
   * ── ETSY API TERMS §4, ENFORCED BEFORE THE SELLER LEAVES ──────────────
   *
   * "You represent and warrant that you have executed Application Terms with
   * each Etsy seller". This is the first instruction after the deployment is
   * known to have an Etsy app at all, and before a PKCE pair is minted, so a
   * seller with no accepted agreement is never sent to Etsy to authorise one.
   *
   * Two refusals, not one, because they are different facts: the documents
   * are unfinished and nobody can accept them, or they are finished and this
   * shop has not. The seller can act on the second and not on the first, and
   * telling them to accept something that cannot be accepted would be a dead
   * end.
   *
   * The same check runs again in the callback, before the code is exchanged.
   * See domain/legal/acceptance.ts for why both.
   */
  if (!termsAreOfferable()) {
    return NextResponse.redirect(outcomeUrl(request, 'terms_not_published'), 303)
  }
  if (!(await hasAcceptedCurrentTerms(session.shopId))) {
    return NextResponse.redirect(outcomeUrl(request, 'terms_not_accepted'), 303)
  }

  /*
   * Scopes come from the query string, and are therefore untrusted. Only the
   * keys the consent screen actually offers are honoured; anything else is
   * dropped rather than passed through to Etsy. selectedScopeStrings adds the
   * REQUIRED scopes regardless, so a hand-edited URL cannot start a flow that
   * would connect a shop EtsyPilot then cannot read.
   */
  const requested = new URL(request.url).searchParams.get('scopes') ?? ''
  const offered = new Set(SCOPE_CHOICES.map((s) => s.key))
  const keys = requested
    .split(',')
    .map((k) => k.trim())
    .filter((k) => offered.has(k))
  const scopes = selectedScopeStrings(keys)

  const { verifier, challenge } = createPkcePair()
  const state = createState()

  const response = NextResponse.redirect(
    authorizeUrl({ clientId: apiKey, redirectUri, scopes, state, challenge }),
    303,
  )
  // The verifier goes in the cookie; only the one-way challenge goes to Etsy.
  writeFlowCookie(response, { state, verifier, userId: session.userId, scopes })
  return response
}
