/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SITE'S OWN URL, WHICH THIS DEPLOYMENT MAY NOT HAVE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Canonical tags, Open Graph cards, Twitter cards, robots.txt's Sitemap line
 * and sitemap.xml's every entry all need one thing: an absolute origin. There
 * is no domain yet — `.env.example` ships NEXT_PUBLIC_APP_URL empty and says
 * why — so every one of those features has to answer the same question, and
 * the answer must be the same everywhere.
 *
 * ── A GUESSED CANONICAL IS WORSE THAN NO CANONICAL ───────────────────────
 *
 * The temptation is `https://cobaltrank.com` or `https://cobaltrank.app`, and
 * either would look finished. Both are somebody else's domain until somebody
 * buys them, and a canonical tag is not decoration: it tells a crawler that
 * the real version of this page lives at that address. Point it at a host this
 * deployment does not control and the correct behaviour for a search engine is
 * to drop this page in favour of one that does not exist — or, worse, to credit
 * whoever does own it.
 *
 * `localhost:3000` is the same mistake wearing work clothes. It was the
 * default of the one other place in this codebase that read this variable, and
 * it sent a seller's browser to their own machine mid-checkout (see
 * app/api/billing/_shared.ts and memory.md).
 *
 * So the rule is: WHERE THERE IS NO CONFIGURED ORIGIN, THE TAG IS OMITTED.
 * Not faked, not defaulted, not relative-with-a-note. The same rule lib/brand.ts
 * applies to a contact address that does not route, for the same reason.
 *
 * ── WHAT A DEPLOYMENT HAS TO DO ──────────────────────────────────────────
 *
 * Set NEXT_PUBLIC_APP_URL to the origin it serves from — `https://example.com`,
 * no trailing slash — and canonical tags, both social cards, the sitemap and
 * robots.txt's Sitemap line all appear, pointing at it. Nothing else changes.
 * tests/unit/seo.test.ts asserts both states: present when it is set, absent
 * when it is not.
 */

import type { Metadata } from 'next'
import { PRODUCT_NAME } from '@/lib/brand'

/**
 * The deployment's own origin, or null when none is configured.
 *
 * Read through `new URL` rather than used as a string, so a value that is not
 * a URL is treated as no value at all instead of being interpolated into a
 * `<link rel="canonical">` as whatever was typed.
 */
export function siteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

/** True when this deployment knows where it lives. */
export function hasSiteOrigin(): boolean {
  return siteOrigin() !== null
}

/**
 * An absolute URL for a path, or null when there is no origin to resolve it
 * against.
 */
export function absoluteUrl(path: string): string | null {
  const origin = siteOrigin()
  if (!origin) return null
  return new URL(path, `${origin}/`).toString()
}

/**
 * The canonical link and the social cards for one page.
 *
 * Returns a `Metadata` fragment to spread into a page's own export. When no
 * origin is configured it returns an EMPTY OBJECT — which is the whole point:
 * spreading nothing adds nothing, so the page ships with no canonical and no
 * absolute card images rather than with invented ones.
 *
 * `metadataBase` is set alongside, because without it Next resolves a relative
 * `openGraph.url` against `http://localhost:3000` at build time and warns —
 * and that warning is the defect this module exists to prevent, printed.
 */
export function canonical(
  path: string,
  options: { title?: string; description?: string } = {},
): Metadata {
  const origin = siteOrigin()
  if (!origin) return {}

  const url = absoluteUrl(path)!

  return {
    metadataBase: new URL(origin),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      siteName: PRODUCT_NAME,
      url,
      ...(options.title ? { title: options.title } : {}),
      ...(options.description ? { description: options.description } : {}),
    },
    twitter: {
      /*
       * `summary` rather than `summary_large_image`. The large card renders a
       * 1200×630 image and this product ships no OG image — an empty large
       * card is a broken-looking link preview, where a summary card falls back
       * to the title and description it does have.
       *
       * There is deliberately no `creator` or `site` handle here either: no
       * account has been registered, and a handle that resolves to nobody is
       * the same class of claim as a contact address that bounces.
       */
      card: 'summary',
      ...(options.title ? { title: options.title } : {}),
      ...(options.description ? { description: options.description } : {}),
    },
  }
}
