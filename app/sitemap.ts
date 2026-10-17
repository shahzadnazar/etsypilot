import type { MetadataRoute } from 'next'
import { LEGAL_PAGES } from '@/domain/legal/pages'
import { legalDocumentsInForce } from '@/lib/legal/documents'
import { siteOrigin } from '@/lib/seo/site'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   sitemap.xml, AND THE FOUR PAGES THERE ARE TO LIST.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A sitemap entry is a claim that a URL is a page worth indexing. This product
 * has four of those — `/`, `/pricing`, the public calculator, and whichever
 * legal documents are in force — and listing anything else would be padding a
 * file a crawler reads literally.
 *
 * Every login-gated route is absent for the same reason robots.txt disallows
 * it: a sitemap entry for /dashboard is an invitation to index a redirect to a
 * sign-in form.
 *
 * ── IT RETURNS AN EMPTY SITEMAP WHEN THERE IS NO DOMAIN ──────────────────
 *
 * Sitemap entries must be absolute URLs; the format has no notion of a
 * relative one. With no NEXT_PUBLIC_APP_URL there is no origin to build them
 * from, so the file is served empty rather than built against a guess. An
 * empty sitemap is honest and harmless — robots.txt does not advertise it in
 * that state either — where a sitemap full of `https://cobaltrank.com/...`
 * would be this deployment asserting ownership of a domain it does not have.
 *
 * ── THE LEGAL PAGES ARE CONDITIONAL, AND NOT BY A FLAG HERE ──────────────
 *
 * `legalDocumentsInForce()` is the same function the footer's LegalLinks and
 * the signup acceptance gate use. Those documents still carry `[[LEGAL_ENTITY]]` and
 * friends as marked blanks, and a sitemap entry presents a document as
 * settled — exactly the reason the footer does not link to them unconditionally
 * either. One function decides, in lib/legal/documents.ts, so this file cannot
 * disagree with the footer about which documents exist.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin()
  if (!origin) return []

  const now = new Date()
  const url = (path: string) => new URL(path, `${origin}/`).toString()

  const pages: MetadataRoute.Sitemap = [
    { url: url('/'), lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: url('/pricing'), lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    {
      url: url('/tools/etsy-seller-calculator'),
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]

  if (legalDocumentsInForce()) {
    for (const page of LEGAL_PAGES) {
      pages.push({
        url: url(page.href),
        lastModified: now,
        changeFrequency: 'yearly',
        priority: 0.3,
      })
    }
  }

  return pages
}
