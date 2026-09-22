/*
 * Security headers.
 *
 * The Content-Security-Policy is built per request because it carries a nonce.
 * Everything that does not vary sits in next.config.ts, where it costs nothing.
 *
 * The CSP below was not written from a template — it was measured. A strict
 * `script-src 'self'; style-src 'self'` was served in Report-Only mode and the
 * pages were loaded with the console captured. Two things violated it:
 *
 *   31 x script-src   Next's own inline hydration scripts, plus the theme
 *                     bootstrap. Their content differs per page, so a hash list
 *                     cannot work; a nonce is the only mechanism that does.
 *  173 x style-src    Inline `style="..."` ATTRIBUTES, which React sets for
 *                     anything computed — a bar's width, a chart's offset.
 *                     Chromium says it plainly: "hashes do not apply to event
 *                     handlers, style attributes and javascript: navigations".
 *                     No nonce and no hash can permit those. Only
 *                     'unsafe-inline' can.
 *
 * So `style-src-attr 'unsafe-inline'` is deliberate and it is the narrow form:
 * it permits style ATTRIBUTES only. `style-src 'self'` still refuses a <style>
 * block and any external stylesheet. Writing one broad `style-src 'self'
 * 'unsafe-inline'` would have permitted both, for the same one requirement.
 *
 * `strict-dynamic` lets the nonced Next bootstrap load the chunks it needs
 * without listing every chunk URL, while still refusing anything a script did
 * not deliberately load.
 *
 * There is no third-party origin anywhere in this policy, which is only
 * possible because the font is self-hosted (D51). A CSP that has to name
 * fonts.googleapis.com is a CSP with a hole in it, and the browser check that
 * fails on any off-origin request is what keeps this list at 'self'.
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { AUTH_COOKIE_OPTIONS, isLiveAuth, supabaseCredentials } from '@/lib/auth/supabase-config'
import { checkAdminRoute } from '@/lib/security/admin-route'
import { cspFor } from '@/lib/security/csp'
import { checkCsrf } from '@/lib/security/csrf'
import { rateLimit } from '@/lib/security/rate-limit'

/**
 * A path no route will ever match, used to make /admin genuinely disappear.
 *
 * MEASURED, not assumed. The first version of this returned
 * `new NextResponse(null, { status: 404 })`, and the comment above it claimed
 * to be "indistinguishable from a route that was never written". Probing the
 * running server said otherwise:
 *
 *     /admin            404, 0 bytes, no content-type
 *     /administrators   404, 9501 bytes, text/html
 *
 * Same status, obviously different responses. The empty body WAS the tell:
 * anyone could separate "refused" from "never existed" with one curl, which is
 * precisely the reconnaissance a 404-instead-of-403 exists to deny.
 *
 * Rewriting to a path with no route makes Next render its ordinary not-found
 * page, so the two answers become the same answer.
 */
const NOWHERE = '/_etsypilot_no_such_route'

/**
 * The caller, for rate limiting.
 *
 * `x-forwarded-for` is set by whatever proxy sits in front, and its FIRST
 * entry is the client — later entries are proxies, and the whole header is
 * attacker-controlled when nothing trusted rewrites it. That is acceptable
 * here: the worst case is an attacker spreading their own requests across
 * forged keys, which costs them the same effort as using more IPs, while a
 * genuine seller behind a corporate NAT still gets a stable key.
 *
 * It is NOT acceptable for anything that grants access, which is why this is
 * used only to shed load and never to identify anyone.
 */
function callerKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}

export async function middleware(request: NextRequest) {
  const url = new URL(request.url)

  /*
   * CSRF first, before any work is done for the request.
   *
   * In middleware rather than per-route on purpose: a route added later is
   * covered without anyone remembering. Verified against the real attack — a
   * cross-origin POST to /api/billing/cancel used to return 303.
   */
  const verdict = checkCsrf({
    method: request.method,
    path: url.pathname,
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    self: url.origin,
  })
  if (!verdict.allowed) {
    // 403 with nothing in it. The reason is for our log, not for whoever sent
    // it — telling an attacker which check refused them is free reconnaissance.
    return new NextResponse(null, { status: 403 })
  }

  /*
   * THEN the admin gate — after CSRF, which is untouched above.
   *
   * This is the FIRST of two checks and deliberately the weaker one. Middleware
   * runs on the Edge runtime, which cannot reach Postgres (postgres-js is a TCP
   * driver), so it cannot resolve MANAGER — that role lives in a column. What
   * it CAN do without a database is tell a signed-out visitor from a signed-in
   * one, and that covers every anonymous probe and the whole of demo mode.
   *
   * The authoritative check is requireAdmin() in each operator page,
   * server-side, with the database available. Two independent checks is the
   * point: middleware is not the only way a route can be reached, so the pages
   * would need their own check even if this one could see everything.
   *
   * 404 and never 403. A 403 confirms /admin exists.
   */
  const adminRoute = checkAdminRoute({
    pathname: url.pathname,
    liveAuth: isLiveAuth(),
    cookieNames: request.cookies.getAll().map((c) => c.name),
  })
  const hideAdminRoute = adminRoute.matched && !adminRoute.reachable

  /*
   * Then rate limiting, and only for /api. Pages are cheap and a seller
   * clicking around a dashboard must never be throttled; the API routes are
   * where a loop costs real work (/api/export runs the whole profit domain).
   */
  if (url.pathname.startsWith('/api/')) {
    const decision = rateLimit(callerKey(request), url.pathname, Date.now())
    if (!decision.allowed) {
      return new NextResponse(null, {
        status: 429,
        // Say when, exactly. A 429 without Retry-After invites a retry loop,
        // which is the thing being defended against.
        headers: { 'Retry-After': String(decision.retryAfter) },
      })
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  /*
   * Built by lib/security/csp.ts, which is a pure function of (nonce,
   * environment) and therefore testable without starting a server.
   *
   * It became a separate module after the production policy was applied to
   * `next dev` as well, where Turbopack's un-nonced chunks and Next's inline
   * dev styles produced 34 violations and an unstyled page. Every check in this
   * project runs against a production build, so nothing saw it (D63).
   */
  /*
   * Read from the request, not from NODE_ENV. A production build served over
   * http — every browser check in this project, and any self-hosted deployment
   * behind a plaintext proxy — must not be told to upgrade its own requests.
   */
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const isHttps = (forwardedProto ?? new URL(request.url).protocol.replace(':', '')) === 'https'
  const csp = cspFor({
    nonce,
    isDev: process.env.NODE_ENV !== 'production',
    isHttps,
  })

  /*
   * The nonce goes on the REQUEST headers twice, for two different readers.
   *
   *   x-nonce                  the root layout reads this, to nonce the theme
   *                            bootstrap. It is a Server Component, and a
   *                            request header is the only channel it has.
   *   Content-Security-Policy  NEXT ITSELF reads this, and applies the nonce to
   *                            the <script> tags it emits.
   *
   * The second one was missing at first, and the failure is worth recording
   * because it is invisible without a browser. `strict-dynamic` IGNORES
   * 'self' — that is its defined behaviour, not a quirk — so a same-origin
   * <script src> with no nonce is refused like any other. Two pages out of
   * eight (/billing and /shop-pulse) silently lost a chunk, with nothing in the
   * server log and nothing in the markup to see. Only the browser console said
   * so.
   */
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', csp)

  /*
   * The refused /admin request is rewritten here rather than returned early, so
   * the 404 page still carries the nonce and the CSP. A response that skipped
   * this block would be the only page in the product served without a policy —
   * and a differently-shaped response is the leak this is trying to close.
   */
  const response = hideAdminRoute
    ? NextResponse.rewrite(new URL(NOWHERE, request.url), { request: { headers } })
    : NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)

  /*
   * Session refresh — LAST, and deliberately so.
   *
   * It sits AFTER the CSRF check, not before it. docs/SECURITY-REVIEW.md
   * records that the billing mutation routes were forgeable and are inert today
   * only because no auth cookie exists for a forged request to ride. THIS STEP
   * CREATES THAT COOKIE. Refreshing before the origin check would mint the
   * cookie for a request that is about to be refused — doing work for an
   * attacker and, worse, extending a session on their say-so. Nothing above
   * this line was reordered, relaxed or exempted.
   *
   * It also runs on every path including /login and /signup, and must: a
   * refresh is not a redirect. This middleware sends nobody anywhere, so a
   * signed-out seller can always reach the sign-in form. The moment this file
   * grows a redirect, that stops being true by accident.
   */
  await refreshSession(request, response)
  return response
}

/**
 * Keep a Supabase session alive across requests.
 *
 * Supabase access tokens are short-lived. A Server Component cannot set a
 * cookie, so if nothing refreshed here, a seller would be signed out whenever
 * their token expired mid-visit. getUser() revalidates with Supabase and writes
 * any rotated cookies onto the RESPONSE, which is the one place in a request
 * that can carry them back to the browser.
 *
 * Three guards, all of which must hold before a single network call is made:
 * auth has to be live, the project credentials have to exist, and the request
 * must actually carry a Supabase cookie. Without the last one every anonymous
 * page view — the marketing calculator, the sign-in form itself — would make a
 * round trip to Supabase to be told nobody is signed in.
 *
 * Failures are swallowed on purpose. Supabase being unreachable must not turn
 * every page in the product into a 500; the seller's existing cookie simply
 * stays as it is until the next request.
 */
async function refreshSession(request: NextRequest, response: NextResponse): Promise<void> {
  if (!isLiveAuth()) return
  const credentials = supabaseCredentials()
  if (!credentials) return
  if (!request.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return

  try {
    const supabase = createServerClient(credentials.url, credentials.key, {
      cookies: {
        getAll: () => request.cookies.getAll().map((c) => ({ name: c.name, value: c.value })),
        setAll: (list) => {
          for (const cookie of list) {
            /*
             * Supabase's options first, ours second, so httpOnly, sameSite and
             * secure cannot be loosened by whatever the library passes. lax
             * rather than strict: strict drops the cookie on the return leg of
             * Etsy's OAuth callback (D87).
             */
            response.cookies.set({ ...cookie.options, ...AUTH_COOKIE_OPTIONS, name: cookie.name, value: cookie.value })
          }
        },
      },
    })

    // getUser(), never getSession(): getUser revalidates the token with
    // Supabase, while getSession trusts a cookie the browser handed over —
    // which is the thing being defended against.
    await supabase.auth.getUser()
  } catch {
    // Deliberately silent. See above.
  }
}

export const config = {
  /*
   * Everything except static assets and image optimisation. Those are served
   * straight from disk, carry no markup, and running middleware over them
   * would spend a per-request nonce on a file that cannot execute one.
   */
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
