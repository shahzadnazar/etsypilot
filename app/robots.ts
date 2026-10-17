import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo/site'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   robots.txt, AND THE ROUTES NO CRAWLER SHOULD BE WALKING.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * There was no robots.txt at all, which means every disallow below was open:
 * the demo door, the whole dashboard, the operator console, the auth flows and
 * every API route.
 *
 * ── WHY EACH DISALLOW IS HERE ────────────────────────────────────────────
 *
 *   /api/demo/enter  A GET that sets a cookie and 303s into the product. A
 *                    crawler following it burns a demo session per visit and
 *                    then indexes dashboard screens full of sample-shop
 *                    figures as if they were this site's content. It is also
 *                    the one route on the public page a crawler WILL follow,
 *                    because the nav, the footer and five sections link to it.
 *   /api/            Everything else under it is a JSON endpoint or a route
 *                    handler with a side effect. Neither belongs in an index.
 *   the app          /dashboard, /listings, /profit, /shop-pulse, /tools,
 *                    /settings, /action-center, /data — all of them redirect a
 *                    stranger to /login, so an indexed URL is a search result
 *                    that leads to a sign-in form.
 *   /admin           The operator console. Not secret — it is gated in code —
 *                    but it has no business in a search index.
 *   /login, /signup  Indexed sign-in pages compete with the page that explains
 *   /reset-password  what the product is, and the reset flow carries tokens in
 *                    its query string.
 *
 * The marketing pages — `/`, `/pricing` and the legal documents — are left
 * allowed, because they are the ones a seller should find.
 *
 * ── THE Sitemap LINE IS OMITTED WHEN THERE IS NO DOMAIN ──────────────────
 *
 * robots.txt's Sitemap directive takes an ABSOLUTE URL; a relative path is
 * invalid and ignored. No domain has been bought, so rather than printing a
 * guess this file leaves the line out until NEXT_PUBLIC_APP_URL is set. See
 * lib/seo/site.ts for why a guessed origin is worse than none.
 */
export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl('/sitemap.xml')

  return {
    rules: [
      {
        userAgent: '*',
        /*
         * `/tools/etsy-seller-calculator` is named explicitly because it is
         * the one route under /tools that is genuinely public — it lives in
         * app/(public), not app/(dashboard). Robots matching is
         * longest-match-wins rather than first-rule-wins, so the specific
         * allow beats the broad disallow below it.
         */
        allow: ['/', '/tools/etsy-seller-calculator'],
        disallow: [
          '/api/',
          '/admin',
          '/dashboard',
          '/listings',
          '/profit',
          '/shop-pulse',
          '/action-center',
          '/tools/',
          '/settings',
          '/data/',
          '/login',
          '/signup',
          '/reset-password',
        ],
      },
    ],
    ...(sitemap ? { sitemap } : {}),
  }
}
