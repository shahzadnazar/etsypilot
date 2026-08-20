import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { listingIdFromUrl } from '@/lib/extension/contract'
import { ALLOWED_HOSTS, ALLOWED_PERMISSIONS, FORBIDDEN_APIS } from '@/lib/extension/policy'
import { getListingIntelligence } from '@/domain/extension/service'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID, buildDemoListings } from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'

const CTX: ShopContext = { shopId: DEMO_SHOP_ID, actorId: DEMO_ACTOR_ID, readOnly: true }
const ROOT = process.cwd()

describe('listing detection', () => {
  it('recognises an Etsy listing URL', () => {
    expect(listingIdFromUrl('https://www.etsy.com/listing/1234567890/birth-flower-necklace')).toBe('1234567890')
    expect(listingIdFromUrl('https://etsy.com/listing/42')).toBe('42')
    expect(listingIdFromUrl('https://www.etsy.com/uk/listing/99/thing?ref=x')).toBe('99')
  })

  it('returns null for an Etsy page that is not a listing', () => {
    expect(listingIdFromUrl('https://www.etsy.com/shop/AureliaMade')).toBeNull()
    expect(listingIdFromUrl('https://www.etsy.com/')).toBeNull()
  })

  it('returns null for every other site, including lookalikes', () => {
    // The popup does nothing off etsy.com, and "does nothing" starts here.
    expect(listingIdFromUrl('https://notetsy.com/listing/1')).toBeNull()
    expect(listingIdFromUrl('https://etsy.com.evil.test/listing/1')).toBeNull()
    expect(listingIdFromUrl('https://example.com/listing/1')).toBeNull()
    expect(listingIdFromUrl('not a url')).toBeNull()
  })
})

describe('the popup shows the same figures as the app, with the same badges', () => {
  it('gives a listing the seller owns verified figures and a health score', async () => {
    const own = buildDemoListings()[0]!
    const view = await getListingIntelligence(CTX, own.etsyListingId)

    expect(view).not.toBeNull()
    expect(view!.isOwnListing).toBe(true)
    expect(view!.health).not.toBeNull()
    expect(view!.health!.provenance).toBe('CALCULATED')
    expect(view!.metrics.some((m) => m.provenance === 'VERIFIED')).toBe(true)
  })

  it('never estimates listing views, in the popup either', async () => {
    const own = buildDemoListings()[0]!
    const view = await getListingIntelligence(CTX, own.etsyListingId)
    const views = view!.metrics.find((m) => m.label === 'Listing views')

    expect(views?.provenance).toBe('UNAVAILABLE')
    expect(views?.display).toBeNull()
    expect(views?.methodology).toContain('does not expose')
  })

  it('gives another shop’s listing estimates only, and no health score', async () => {
    const view = await getListingIntelligence(CTX, '999999999')

    expect(view!.isOwnListing).toBe(false)
    // A score built from public data would look like the same number and mean
    // something different.
    expect(view!.health).toBeNull()
    expect(view!.metrics.every((m) => m.provenance !== 'VERIFIED')).toBe(true)
    expect(view!.metrics.some((m) => m.provenance === 'ESTIMATED')).toBe(true)
  })

  it('carries confidence and limitations on every estimate', async () => {
    const view = await getListingIntelligence(CTX, '999999999')
    for (const metric of view!.metrics.filter((m) => m.provenance === 'ESTIMATED')) {
      expect(metric.methodology.length).toBeGreaterThan(20)
      expect(metric.confidence ?? metric.limitations?.length).toBeTruthy()
    }
  })

  it('recommends from the audit and never predicts an outcome', async () => {
    const own = buildDemoListings().find((l) => l.tags.length < 13)!
    const view = await getListingIntelligence(CTX, own.etsyListingId)
    const text = `${view!.recommendation ?? ''} ${view!.metrics.map((m) => m.methodology).join(' ')}`

    expect(text).not.toMatch(/will rank|expected lift|predicted|you will earn|guarantee/i)
  })

  it('offers navigation, never an action that writes', async () => {
    const own = buildDemoListings()[0]!
    const view = await getListingIntelligence(CTX, own.etsyListingId)

    expect(view!.actions.length).toBeGreaterThan(0)
    for (const action of view!.actions) {
      // Every quick action is a link into the app, where the confirmation gate
      // still applies. None of them is a request that changes anything.
      expect(action.href).toMatch(/^https?:\/\//)
      expect(action.href).not.toContain('/api/')
    }
  })
})

/*
 * The acceptance criterion, checked against the artefact that actually ships.
 *
 * Not against the source: the source is what a reviewer reads, the package is
 * what a seller installs, and Phase 9 passes or fails on the second one.
 */
describe('the packaged extension holds no credentials', () => {
  const built = path.join(ROOT, 'extension', 'build')

  function ensureBuilt(): void {
    if (fs.existsSync(path.join(built, 'chrome', 'manifest.json'))) return
    execFileSync('node', ['extension/build.mjs'], { cwd: ROOT, stdio: 'pipe' })
  }

  function filesIn(dir: string): string[] {
    return fs
      .readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((e) => e.isFile())
      .map((e) => path.join(e.parentPath ?? dir, e.name))
  }

  for (const browser of ['chrome', 'firefox']) {
    it(`${browser}: requests only activeTab and etsy.com`, () => {
      ensureBuilt()
      const manifest = JSON.parse(fs.readFileSync(path.join(built, browser, 'manifest.json'), 'utf8'))

      expect(manifest.permissions ?? []).toEqual([...ALLOWED_PERMISSIONS])
      expect(manifest.host_permissions ?? []).toEqual([...ALLOWED_HOSTS])
      for (const script of manifest.content_scripts ?? []) {
        expect(script.matches).toEqual([...ALLOWED_HOSTS])
      }
      // The permission that would let it run everywhere.
      expect(JSON.stringify(manifest)).not.toContain('<all_urls>')
    })

    it(`${browser}: ships no forbidden browser API`, () => {
      ensureBuilt()
      const bundle = filesIn(path.join(built, browser))
        .map((f) => fs.readFileSync(f, 'utf8'))
        .join('\n')

      for (const api of FORBIDDEN_APIS) {
        expect(bundle, `${browser} bundle uses ${api}`).not.toContain(api)
      }
    })

    it(`${browser}: ships nothing shaped like a credential`, () => {
      ensureBuilt()
      const bundle = filesIn(path.join(built, browser))
        .map((f) => fs.readFileSync(f, 'utf8'))
        .join('\n')

      for (const pattern of [
        /\bsk_(live|test)_[A-Za-z0-9]/,
        /\bwhsec_[A-Za-z0-9]/,
        /\bsk-ant-[A-Za-z0-9]/,
        /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
        /(api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*['"][^'"]{8,}/i,
      ]) {
        expect(bundle).not.toMatch(pattern)
      }

      // The specific ones this product holds server-side.
      expect(bundle).not.toContain('ETSY_API_SECRET')
      expect(bundle).not.toContain('STRIPE_SECRET_KEY')
      expect(bundle).not.toContain('ANTHROPIC_API_KEY')
    })

    it(`${browser}: talks to the app and to nowhere else`, () => {
      ensureBuilt()
      const bundle = filesIn(path.join(built, browser))
        .map((f) => fs.readFileSync(f, 'utf8'))
        .join('\n')

      /*
       * The invariant is "exactly one non-Etsy host, and it is the app the
       * build was configured with" — not a literal origin. This test used to
       * hardcode localhost:3000 and failed the moment a build was made against
       * a different port, which would have taught the next reader to relax the
       * assertion rather than to check the artefact.
       */
      const configured = fs
        .readFileSync(path.join(built, browser, 'dist/extension/src/client.js'), 'utf8')
        .match(/APP_ORIGIN = '([^']+)'/)?.[1]
      expect(configured, 'the build did not substitute an app origin').toBeTruthy()

      const hosts = new Set(
        (bundle.match(/https?:\/\/[^"'`\s)]+/g) ?? []).map((u) => new URL(u.replace(/[*].*$/, '')).origin),
      )
      const nonEtsy = [...hosts].filter((h) => h !== 'https://www.etsy.com' && h !== 'https://etsy.com')
      expect(nonEtsy).toEqual([new URL(configured!).origin])

      // In particular: it never calls Etsy's API. That is the server's job,
      // because the server is where the credentials are.
      expect(bundle).not.toContain('openapi.etsy.com')
      expect(bundle).not.toContain('api.etsy.com')
    })
  }
})

/*
 * CORS, checked against the route itself.
 *
 * The route is the thing standing between a seller's session cookie and any
 * page they happen to have open. A browser will send that cookie to this
 * endpoint from anywhere; only the absence of CORS headers stops the response
 * being READ. So the header logic is tested by origin, not assumed.
 */
describe('the endpoint answers only the extension', () => {
  async function headersFor(origin: string | null, ids: string): Promise<Headers> {
    const previous = process.env.EXTENSION_IDS
    process.env.EXTENSION_IDS = ids
    try {
      // Imported inside the test so the env var is read at call time.
      const { GET } = await import('@/app/api/extension/listing/route')
      const request = new Request('http://localhost/api/extension/listing?listingId=1', {
        headers: origin ? { origin } : {},
      })
      const response = await GET(request)
      return response.headers
    } finally {
      if (previous === undefined) delete process.env.EXTENSION_IDS
      else process.env.EXTENSION_IDS = previous
    }
  }

  it('grants CORS to an allow-listed extension id', async () => {
    const headers = await headersFor('chrome-extension://abcdefabcdefabcd', 'abcdefabcdefabcd')
    expect(headers.get('access-control-allow-origin')).toBe('chrome-extension://abcdefabcdefabcd')
    expect(headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('grants nothing to any other origin, however plausible', async () => {
    for (const origin of [
      'https://evil.test',
      'https://www.etsy.com',
      'chrome-extension://someoneelsesextension',
      null,
    ]) {
      const headers = await headersFor(origin, 'abcdefabcdefabcd')
      expect(headers.get('access-control-allow-origin'), `${origin}`).toBeNull()
    }
  })

  it('varies on Origin even when it grants nothing', async () => {
    // Otherwise a permissive response cached for the extension could be
    // replayed to a page that was never allowed to read it.
    const headers = await headersFor('https://evil.test', 'abcdefabcdefabcd')
    expect(headers.get('vary')).toContain('Origin')
  })

  it('never lets a shop’s figures be cached by a shared proxy', async () => {
    const headers = await headersFor('chrome-extension://abcdefabcdefabcd', 'abcdefabcdefabcd')
    expect(headers.get('cache-control')).toBe('private, no-store')
  })

  it('allow-lists nothing when no extension id is configured', async () => {
    const headers = await headersFor('chrome-extension://abcdefabcdefabcd', '')
    expect(headers.get('access-control-allow-origin')).toBeNull()
  })
})
