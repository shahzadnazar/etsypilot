import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
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
