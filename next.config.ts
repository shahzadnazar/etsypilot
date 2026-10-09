import type { NextConfig } from 'next'

/*
 * A note that belongs next to the build, and package.json cannot hold comments:
 *
 *   `npm run build` uses --webpack, deliberately.
 *
 * Next 16.3.1's Turbopack build emits one <script> tag per page without the CSP
 * nonce — always the chunk it splits the Button component into. Under
 * 'strict-dynamic' (middleware.ts) that tag is refused and the page silently
 * loses a piece of its JavaScript. The webpack build nonces every tag on every
 * page. Cost: 19s -> 44s, measured.
 *
 * `npm run build:turbopack` is kept so re-testing is one command. If the
 * browser checks still pass on that build, the bug is fixed upstream and the
 * default can move back.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  /*
   * Next's own dev overlay, off.
   *
   * It is the floating panel that reads "Route: Dynamic · Bundler: Turbopack ·
   * Route Info · Preferences". It is not EtsyPilot UI, it only ever renders
   * under `next dev`, and it defaults to the top-left — directly over the demo
   * banner, the logo and the first sidebar group, which is the part of the
   * screen a reviewer needs most.
   *
   * It cannot be moved into Settings, because it is not ours: it belongs to the
   * framework and has no equivalent in a production build. So the choice is
   * where it sits or whether it appears, and what it reports — whether a route
   * is static or dynamic — is available from `next build --debug` when it is
   * actually wanted.
   *
   * Next still surfaces compile and runtime errors with this off; only the
   * route indicator goes away. Set it back to `{ position: 'bottom-right' }` to
   * have it without it covering anything.
   */
  devIndicators: false,
  /*
   * The legal pages read docs/legal/*.md at request time, so the deployed
   * server bundle has to contain those files.
   *
   * Next traces what a route imports; it cannot trace what a route READS.
   * lib/legal/documents.ts calls readFileSync on a path built from
   * process.cwd(), which is deliberate — it keeps the markdown the single
   * source of the published text (see that file's header) — and it is exactly
   * the pattern the tracer cannot follow. Without this, /legal/terms builds
   * fine, passes every test, and throws ENOENT the first time somebody loads
   * it in production.
   *
   * extension/manifest.chrome.json for the same reason: /legal/etsy prints the
   * extension's real permission list rather than a remembered one.
   */
  outputFileTracingIncludes: {
    '/legal/*': ['docs/legal/*.md', 'extension/manifest.chrome.json'],
    // The footer decides whether to link these pages by reading the documents,
    // and the footer is on the landing page and the pricing page.
    '/': ['docs/legal/*.md'],
    '/pricing': ['docs/legal/*.md'],
    '/signup': ['docs/legal/*.md'],
    '/api/legal/accept': ['docs/legal/*.md'],
    '/api/etsy/*': ['docs/legal/*.md'],
  },
  /*
   * Headers that do not vary per request. The CSP is NOT here — it carries a
   * nonce, so it is built in middleware.ts.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Belt and braces with the CSP's frame-ancestors, for the one browser
          // that honours this and not that.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Stops a browser second-guessing a Content-Type — the mechanism that
          // turns an uploaded text file into an executed script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          /*
           * A seller's URL can name a listing and carries query state. Sending
           * only the origin to a third party, and nothing at all when leaving
           * HTTPS, keeps that out of someone else's logs.
           */
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          /*
           * This product asks for none of these. Saying so explicitly means an
           * embedded page or a future dependency cannot ask on our behalf.
           */
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
          /*
           * Two years, subdomains included. Only meaningful over HTTPS, which
           * is why it is safe to send in development too — a browser ignores it
           * on http://localhost.
           */
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Isolates this origin from anything that opens it.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ]
  },
}

export default nextConfig
