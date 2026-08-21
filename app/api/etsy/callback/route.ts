/*
 * GET /api/etsy/callback — finish the Etsy OAuth flow.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  Register this exact path as the redirect URI in your Etsy app, and put the
 *  same string in ETSY_REDIRECT_URI. Etsy compares them character for
 *  character and its rejection message does not say which part differed.
 *  docs/ETSY-SETUP.md has the checklist.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything this route refuses, and why:
 *
 *   no session          A callback that lands in a signed-out browser cannot
 *                       be attributed to anyone. Nothing is stored.
 *   flow cookie missing The seller took longer than ten minutes, cleared
 *                       cookies, or the callback was opened directly. Either
 *                       way there is no verifier, so the exchange is
 *                       impossible — that is PKCE working, not a bug.
 *   state mismatch      Compared in constant time. This is the check between a
 *                       seller's shop and a CSRF-initiated connection.
 *   different user      The flow cookie names the user who started it. A
 *                       callback completed in someone else's session is exactly
 *                       the cross-account write the brief forbids.
 *   error=access_denied The seller pressed Cancel on Etsy. That is an outcome,
 *                       not a failure, and it is reported as one.
 *
 * The flow cookie is deleted on EVERY path, including the failures. A verifier
 * that survives a failed attempt is a verifier available for a second one.
 *
 * No token, no code and no verifier is ever written to a response, a redirect
 * URL or a log line. The only thing that leaves this route is one of our own
 * outcome codes in a query string.
 */

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { EtsyClient } from '@/lib/etsy/http'
import { log } from '@/lib/observability/logger'
import { exchangeCode, statesMatch } from '@/lib/etsy/oauth'
import { getTokenStore } from '@/lib/etsy/tokens'
import { clearFlowCookie, FLOW_COOKIE, outcomeUrl, readFlowCookie, type ConnectOutcome } from '../_flow'

export const dynamic = 'force-dynamic'

/** Etsy's /users/me shape. Verify on the first live call. */
interface EtsyMePayload {
  user_id: number
  shop_id?: number
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const done = (outcome: ConnectOutcome): NextResponse => {
    const response = NextResponse.redirect(outcomeUrl(request, outcome), 303)
    clearFlowCookie(response)
    return response
  }

  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/', request.url), 303)

  // Etsy reports a declined consent screen here. Nothing was connected, and
  // saying "cancelled" is more useful than saying "failed".
  if (params.get('error')) return done('cancelled')

  // Read through Next's jar rather than parsing the header: the value is JSON
  // and the browser sends it percent-encoded, so a hand-rolled read would fail
  // to parse and report every flow as expired.
  const flow = readFlowCookie((await cookies()).get(FLOW_COOKIE)?.value)
  if (!flow) return done('expired')

  if (!statesMatch(flow.state, params.get('state'))) return done('state_mismatch')
  if (flow.userId !== session.userId) return done('state_mismatch')

  const code = params.get('code')
  if (!code) return done('exchange_failed')

  const apiKey = process.env.ETSY_API_KEY
  const redirectUri = process.env.ETSY_REDIRECT_URI
  if (!apiKey || !redirectUri) return done('not_configured')

  try {
    const tokens = await exchangeCode({
      clientId: apiKey,
      redirectUri,
      code,
      verifier: flow.verifier,
    })

    /*
     * Which shop these tokens belong to comes from Etsy, never from the
     * request. A shopId a caller could supply is a cross-shop write waiting to
     * happen, and this is the one moment in the product where the shop is not
     * already known.
     */
    const client = new EtsyClient({ apiKey, accessToken: async () => tokens.accessToken })
    const me = await client.get<EtsyMePayload>('/users/me')
    /*
     * An Etsy account with no shop. Its own outcome rather than a generic
     * failure: nothing is broken, there is simply nothing to read, and telling
     * someone to "try again shortly" would send them round a loop that cannot
     * succeed.
     */
    if (!me.shop_id) return done('no_shop')

    await getTokenStore().write(String(me.shop_id), {
      ...tokens,
      // The scopes that were asked for and that Etsy granted by completing the
      // flow. Recorded so Settings can say what breaks if one is revoked.
      scopes: flow.scopes,
    })

    return done('connected')
  } catch (error) {
    /*
     * Not swallowed — moved. An OAuthError carries a provider code and an
     * EtsyHttpError carries a status and a path; neither is something to put in
     * front of a seller, and neither is something to put in a URL, which is why
     * the seller gets an outcome code instead.
     *
     * The detail belongs in the server log, and it goes through redact() first:
     * the client already keeps credentials out of every error it builds, and
     * this is the belt to that pair of braces. The cost of being wrong once is
     * a key in a log aggregator forever.
     */
    // The logger redacts; passing the error whole means its name, message AND
    // stack all go through the same pass, rather than only the message.
    log.error('etsy oauth callback failed', error, { path: '/api/etsy/callback' })
    return done('exchange_failed')
  }
}
