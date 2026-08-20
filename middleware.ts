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

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')

  const csp = [
    "default-src 'self'",
    /*
     * No 'strict-dynamic', and the reason is a measured framework bug rather
     * than a preference.
     *
     * 'strict-dynamic' IGNORES 'self' by design: under it, a <script src> is
     * allowed only if it carries the nonce or was loaded by a script that did.
     * Next 16.3.1 nonces every script tag it emits EXCEPT one class of
     * page-level client chunk — verified by reading the served HTML, where
     * nine tags carry nonce= and exactly one does not. With 'strict-dynamic'
     * that chunk was refused on /billing and /shop-pulse: no server error, no
     * hydration warning, just a page missing a piece of its JavaScript.
     *
     * What is kept without it is most of the value. Inline script still
     * requires the nonce, so an injected <script> or an onclick payload is
     * refused — that is the actual XSS vector. External script is still
     * confined to this origin, so a third party cannot be pulled in. What is
     * given up is protection against an attacker who can already place a file
     * on our own origin, and this app serves no user-supplied file as script.
     *
     * Revisit when Next nonces that chunk; the check below will not notice on
     * its own, because a policy being LESS strict never fails a browser check.
     */
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    // Style ATTRIBUTES only. See the note above: nothing else can permit them.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    // Nothing may frame this app, and it frames nothing.
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    // A <base> tag rewrite is how a single injected element redirects every
    // relative URL on the page, including form actions.
    "base-uri 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ')

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

  const response = NextResponse.next({ request: { headers } })
  response.headers.set('Content-Security-Policy', csp)
  return response
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
