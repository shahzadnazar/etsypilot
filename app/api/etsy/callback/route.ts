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
import { isDemoMode } from '@/lib/etsy'
import { log } from '@/lib/observability/logger'
import { exchangeCode, statesMatch } from '@/lib/etsy/oauth'
import { connectEtsyShop, EtsyConnectionError } from '@/lib/repositories/etsy-connection'
import { clearFlowCookie, FLOW_COOKIE, outcomeUrl, readFlowCookie, type ConnectOutcome } from '../_flow'

export const dynamic = 'force-dynamic'

/** Etsy's /users/me shape. Verify on the first live call. */
interface EtsyMePayload {
  user_id: number
  shop_id?: number
}

/**
 * The fields of Etsy's /shops/{id} this route needs.
 *
 * The same two lib/etsy/live.ts reads, and deliberately only those two.
 * `shop_name` and `currency_code` are what the seller's own shop row should
 * take from Etsy. THERE IS NO TIMEZONE IN THIS PAYLOAD — live.ts hardcodes
 * 'UTC' and says why (D24: UTC is the product's single basis) — so the
 * timezone column keeps whatever it had rather than being written with a
 * value Etsy never sent.
 */
interface EtsyShopPayload {
  shop_name: string
  currency_code: string
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
  /*
   * ── THE FLOW'S USER MUST BE THE SIGNED-IN USER ─────────────────────────
   *
   * Without this, anyone who obtains a callback URL completes a connection
   * INTO THEIR OWN ACCOUNT using another seller's Etsy grant — and now that
   * the connection writes the session's shop row, that is precisely a
   * cross-account write.
   *
   * It reports `state_mismatch`, the SAME outcome as a bad state, and that is
   * deliberate rather than lazy: a distinct code would tell whoever sent the
   * request which of the two checks refused them, which is free reconnaissance
   * for the same reason middleware returns a 403 with no body. The seller who
   * legitimately hits this reads "that connection could not be verified",
   * which is true.
   *
   * Logged, because unlike a stale state this one cannot happen by accident —
   * a flow cookie is scoped to /api/etsy and httpOnly, so a mismatch means the
   * cookie and the session came from different places.
   */
  if (flow.userId !== session.userId) {
    log.warn('etsy callback completed in a different session than started it', {
      path: '/api/etsy/callback',
    })
    return done('state_mismatch')
  }

  const code = params.get('code')
  if (!code) return done('exchange_failed')

  const apiKey = process.env.ETSY_API_KEY
  const redirectUri = process.env.ETSY_REDIRECT_URI
  if (!apiKey || !redirectUri) return done('not_configured')

  /*
   * ── THE OTHER HALF OF THE is_demo RULE ────────────────────────────────
   *
   * A successful connection sets `shops.is_demo = false`, which removes the
   * demo banner and the D11 provenance override from every figure on that
   * seller's screens. If ETSY_MODE is not 'live', getEtsyService() still
   * serves the Willow & Fern catalogue — so the seller would be shown sample
   * data presented as their own shop, with nothing saying otherwise.
   *
   * One direction of the rule is "a shop that has become real must not keep
   * claiming demo figures". This is the other direction, and handling only
   * one would read as fixed while shipping the opposite lie. Refused BEFORE
   * the code is exchanged, so no token is minted for a connection that will
   * not be saved.
   *
   * docs/ETSY-SETUP.md and the connect route both already say to set
   * ETSY_API_KEY and ETSY_MODE=live together; this is that pairing enforced
   * rather than documented.
   */
  if (isDemoMode()) return done('demo_mode')

  try {
    const tokens = await exchangeCode({
      clientId: apiKey,
      redirectUri,
      code,
      verifier: flow.verifier,
    })

    /*
     * ══════════════════════════════════════════════════════════════════════
     *   WHICH ETSYPILOT SHOP THESE TOKENS BELONG TO IS RESOLVED FROM THE
     *   SESSION. WHICH ETSY SHOP THEY GRANT ACCESS TO COMES FROM ETSY.
     *   NEITHER IS SUPPLIED BY THE REQUEST.
     * ══════════════════════════════════════════════════════════════════════
     *
     * This comment used to say only the second half, and that instinct was
     * right and incomplete. It argued — correctly — that a shopId a caller
     * could supply is a cross-shop write waiting to happen. Then it used
     * `String(me.shop_id)` as the storage key, and `etsy_connections.shop_id`
     * is a FOREIGN KEY to `shops.id`, which holds `shop_<uuid>`. Two different
     * namespaces, so every real connection failed the key:
     *
     *   our shop ids    ['shop_72d56f17-b51f-4978-beed-7c609eed1ac4', ...]
     *   callback wrote  '48123456'
     *   result          there is no shop in EtsyPilot with that id
     *
     * The fix is NOT to accept a shop id from the request. `session.shopId`
     * comes from getSession(), which resolves the caller's own shop from their
     * memberships server-side — there is no query parameter, header or cookie
     * field a caller can set to change it. So the property the old comment was
     * protecting is intact, and the key is now one the foreign key recognises.
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
    const etsyShopId = String(me.shop_id)

    /*
     * The seller's real shop is no longer called "My demo shop", so its name
     * and currency come from Etsy. Fetched with the token just issued, which
     * is also the first proof that the grant actually works — a connection
     * saved from a token that cannot read the shop would fail at the next
     * screen instead of here.
     */
    const shop = await client.get<EtsyShopPayload>(`/shops/${etsyShopId}`)

    try {
      await connectEtsyShop({
        shopId: session.shopId,
        etsyShopId,
        shop: { name: shop.shop_name, currency: shop.currency_code },
        tokens,
        // The scopes that were asked for and that Etsy granted by completing
        // the flow. Recorded so Settings can say what breaks if one is revoked.
        scopes: flow.scopes,
      })
    } catch (error) {
      /*
       * The repository's refusals, each mapped to copy a seller can act on.
       * Anything else falls through to the outer catch, which logs it redacted
       * and reports exchange_failed — the repository has already made sure
       * that "anything else" never carries a sealed token in its message.
       */
      if (error instanceof EtsyConnectionError) {
        if (error.failure === 'ETSY_SHOP_TAKEN') return done('shop_already_linked')
        log.error('etsy callback could not resolve the session shop', error, {
          path: '/api/etsy/callback',
        })
        return done('exchange_failed')
      }
      throw error
    }

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
