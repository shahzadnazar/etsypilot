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
     * 'strict-dynamic' is ON, and getting it there took finding a real bug.
     *
     * It IGNORES 'self' by design: a <script src> is allowed only if it carries
     * the nonce, or was loaded by a script that did. That makes it strictly
     * better than 'self' — an attacker who can write a .js file onto this
     * origin still cannot get it executed — but it also means one un-nonced tag
     * breaks a page.
     *
     * Next 16.3.1's TURBOPACK build emits exactly one such tag. Measured, not
     * guessed: eleven script tags per page, ten with nonce=, one without, and
     * always the same one — the chunk the bundler split the Button component
     * into. It surfaced on /billing and /shop-pulse only, because only there
     * did Button land in a chunk of its own. Nothing reported it: no server
     * error, no hydration warning, no missing markup. The page silently lost a
     * piece of its JavaScript and only the browser console knew.
     *
     * The same source built with WEBPACK nonces all of them, on every page. So
     * this is a Turbopack code path, not a policy mistake and not something our
     * own code can fix — which chunk a component lands in is the bundler's
     * decision, so any app-level workaround would be luck rather than a fix.
     *
     * package.json therefore builds with --webpack. It costs 25 seconds
     * (19s -> 44s, measured) and buys back the strongest script directive
     * available. Revisit when Turbopack nonces that tag: the browser checks
     * assert every script tag carries a nonce AND that no page violates its own
     * policy, so flipping the build back is a one-line experiment with an
     * immediate answer.
     */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
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
