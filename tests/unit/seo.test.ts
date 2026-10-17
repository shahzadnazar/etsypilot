/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE CANONICAL TAG THIS DEPLOYMENT IS NOT ALLOWED TO GUESS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Canonical links, Open Graph cards, robots.txt's Sitemap directive and every
 * sitemap entry need the same thing: an absolute origin. No domain has been
 * bought — `.env.example` ships NEXT_PUBLIC_APP_URL empty and says why — so
 * each of those features has to answer the same question, and this file
 * asserts both halves of the answer:
 *
 *   UNSET  Nothing is emitted. No canonical, no absolute card URLs, no
 *          Sitemap line, an empty sitemap. A canonical pointing at a host
 *          this deployment does not control tells a crawler the real page
 *          lives somewhere that does not answer.
 *   SET    All of it appears, resolved against that origin and nothing else.
 *
 * The second half is the one worth having. A test that only checked the
 * absence would also pass against a module that emitted nothing ever.
 *
 * `localhost:3000` is in here as a named defect rather than an abstraction:
 * it was the default of the one other place in this codebase that read this
 * variable, and it sent a seller's browser to their own machine mid-checkout.
 */

import { readFileSync } from 'node:fs'

import { afterEach, describe, expect, it } from 'vitest'

import { absoluteUrl, canonical, hasSiteOrigin, siteOrigin } from '@/lib/seo/site'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL
})

function withOrigin(value: string | undefined): void {
  if (value === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = value
}

describe('the site origin', () => {
  it('is unset in this repository, which is the state the rest of this file tests', () => {
    /*
     * An anti-vacuity check AND a tripwire. The day somebody buys a domain and
     * sets this, the assertions below about absence become descriptions of a
     * state the deployment has left — and this line turns red to say so,
     * rather than the suite quietly testing nothing.
     */
    withOrigin(ORIGINAL)
    expect(
      ORIGINAL ?? '',
      'an origin is configured — re-read the omit branches in lib/seo/site.ts',
    ).toBe('')
  })

  it('reads nothing from an empty, blank or malformed value', () => {
    for (const value of [undefined, '', '   ', 'not a url', 'cobaltrank.com', 'ftp://x.test']) {
      withOrigin(value)
      expect(siteOrigin(), String(value)).toBeNull()
      expect(hasSiteOrigin()).toBe(false)
      expect(absoluteUrl('/')).toBeNull()
    }
  })

  it('normalises a configured value to its origin', () => {
    // A trailing slash, a path, a query — all of them are somebody's .env, and
    // none of them should end up doubled inside a canonical URL.
    for (const value of ['https://example.test', 'https://example.test/', 'https://example.test/x?y=1']) {
      withOrigin(value)
      expect(siteOrigin(), value).toBe('https://example.test')
      expect(absoluteUrl('/pricing')).toBe('https://example.test/pricing')
    }
  })
})

describe('page metadata', () => {
  it('emits no canonical and no cards while there is no origin', () => {
    withOrigin(undefined)
    expect(canonical('/')).toEqual({})
  })

  it('emits a canonical, an Open Graph url and a Twitter card once there is one', () => {
    withOrigin('https://example.test')
    const meta = canonical('/pricing')

    expect(meta.alternates?.canonical).toBe('https://example.test/pricing')
    expect(String(meta.metadataBase)).toBe('https://example.test/')
    expect(meta.openGraph).toMatchObject({ type: 'website', url: 'https://example.test/pricing' })
    expect(meta.twitter).toMatchObject({ card: 'summary' })
  })

  it('claims no social account it does not have', () => {
    /*
     * A `twitter:site` or `twitter:creator` handle that resolves to nobody is
     * the same class of claim as a contact address that bounces — and the card
     * is `summary` rather than `summary_large_image` because this product
     * ships no OG image, and an empty large card is a broken-looking preview.
     */
    withOrigin('https://example.test')
    const twitter = canonical('/') .twitter as Record<string, unknown>
    expect(twitter.site).toBeUndefined()
    expect(twitter.creator).toBeUndefined()
    expect(twitter.card).toBe('summary')
  })

  it('gives the landing page a title and a description of a usable length', () => {
    /*
     * Not a style rule: a title past ~60 characters and a description past
     * ~160 are truncated in a search result, and the truncation lands wherever
     * it lands. Both are checked against the source because `generateMetadata`
     * is not what this page uses.
     */
    const page = readFileSync('app/(marketing)/page.tsx', 'utf8')
    const title = page.match(/title:\s*'([^']+)'/)?.[1]
    expect(title, 'the page has no title').toBeTruthy()
    expect(title!.length).toBeLessThanOrEqual(60)

    const description = page.match(/description:\s*\n?\s*'([^']+)'/)?.[1]
    expect(description, 'the page has no description').toBeTruthy()
    expect(description!.length).toBeGreaterThan(70)
    expect(description!.length).toBeLessThanOrEqual(170)
  })

  it('spreads the canonical helper on both public pages', () => {
    for (const file of ['app/(marketing)/page.tsx', 'app/(marketing)/pricing/page.tsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/\.\.\.canonical\('\/[a-z]*'\)/)
    }
  })
})

describe('robots.txt', () => {
  it('omits the Sitemap line while there is no origin', () => {
    withOrigin(undefined)
    expect(robots().sitemap).toBeUndefined()
  })

  it('names an absolute sitemap once there is one', () => {
    withOrigin('https://example.test')
    expect(robots().sitemap).toBe('https://example.test/sitemap.xml')
  })

  it('keeps every login-gated area out of the index', () => {
    const rule = robots().rules
    const disallow = (Array.isArray(rule) ? rule[0]! : rule).disallow as string[]

    for (const path of [
      '/api/',
      '/admin',
      '/dashboard',
      '/listings',
      '/profit',
      '/settings',
      '/login',
      '/signup',
    ]) {
      expect(disallow, path).toContain(path)
    }
  })

  it('keeps the demo door out of the index', () => {
    /*
     * It is a GET that sets a cookie and 303s into the product. A crawler
     * following it burns a demo session per visit and then indexes dashboard
     * screens full of sample-shop figures as this site's content — and it is
     * the one route a crawler WILL follow, because the nav, the footer and
     * five sections link to it.
     */
    const rule = robots().rules
    const disallow = (Array.isArray(rule) ? rule[0]! : rule).disallow as string[]
    expect(disallow.some((path) => '/api/demo/enter'.startsWith(path))).toBe(true)
  })

  it('still lets the public calculator be found', () => {
    // It lives in app/(public), not app/(dashboard), so the broad /tools/
    // disallow must not take it with it.
    const rule = robots().rules
    const allow = (Array.isArray(rule) ? rule[0]! : rule).allow as string[]
    expect(allow).toContain('/tools/etsy-seller-calculator')
  })
})

describe('sitemap.xml', () => {
  it('is empty while there is no origin', () => {
    // Sitemap entries must be absolute. With no origin there is nothing true
    // to put in one, and an empty sitemap is honest where a guessed host is
    // this deployment asserting ownership of a domain it does not have.
    withOrigin(undefined)
    expect(sitemap()).toEqual([])
  })

  it('lists the public pages, and only those, once there is one', () => {
    withOrigin('https://example.test')
    const urls = sitemap().map((entry) => entry.url)

    expect(urls).toContain('https://example.test/')
    expect(urls).toContain('https://example.test/pricing')
    expect(urls).toContain('https://example.test/tools/etsy-seller-calculator')

    for (const gated of ['/dashboard', '/login', '/signup', '/admin', '/profit', '/settings']) {
      expect(
        urls.some((url) => url.includes(gated)),
        `${gated} is login-gated and must not be in the sitemap`,
      ).toBe(false)
    }
  })

  it('leaves the legal documents out while they are still drafts', () => {
    /*
     * A sitemap entry presents a document as settled, which is the same reason
     * the footer does not link to them. Both read `legalDocumentsInForce()`, so
     * they cannot disagree — and when the documents ARE finished, this
     * assertion is the one that says to re-read this file.
     */
    withOrigin('https://example.test')
    const urls = sitemap().map((entry) => entry.url)
    expect(urls.some((url) => url.includes('/legal/'))).toBe(false)
  })
})
