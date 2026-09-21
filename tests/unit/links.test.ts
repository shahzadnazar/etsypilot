/*
 * Every internal link must point at a page that exists.
 *
 * This exists because four did not, and all four were on trust surfaces:
 *
 *   /settings/export      "you can export or delete it from Export & deletion",
 *                         written next to the revoke control. A data-rights
 *                         claim, and a 404.
 *   /data/methodology     the target of every provenance drawer's "Open the
 *                         full methodology →". Eleven anchors, no page.
 *   /onboarding/connect   the demo banner's "Connect my shop" — the one action
 *                         the banner exists to offer.
 *   /listings             on app/not-found.tsx. The 404 page's own recovery
 *                         link was a 404.
 *
 * None was caught by typecheck, by any unit test, or by any browser check,
 * because a Link with a bad href is perfectly valid TypeScript and renders
 * perfectly valid HTML. Nothing is wrong until someone clicks — and nobody
 * clicks the second button on the 404 page.
 *
 * A unit test rather than a browser check on purpose: it needs no server, no
 * build and no browser, so it runs in a second and catches a broken link at
 * the moment it is written.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOBILE_TABS, NAV_FOOTER, NAV_GROUPS, SETTINGS_NAV } from '@/components/layout/navigation'

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.tsx') || path.endsWith('.ts')) out.push(path)
  }
  return out
}

/** Route groups — (dashboard), (public) — are organisation, not URL. */
function routeOf(pagePath: string): string {
  const dir = pagePath.slice('app'.length).replace(/\/page\.tsx$/, '')
  return dir.replace(/\/\([^)]*\)/g, '') || '/'
}

const ROUTES = new Set(
  walk('app')
    .filter((f) => f.endsWith('/page.tsx'))
    .map(routeOf),
)

const API_ROUTES = walk('app')
  .filter((f) => f.endsWith('/route.ts'))
  .map((f) => f.slice('app'.length).replace(/\/route\.ts$/, ''))

function resolves(href: string): boolean {
  if (ROUTES.has(href)) return true
  // A dynamic segment matches anything in that position.
  for (const route of [...ROUTES, ...API_ROUTES]) {
    if (!route.includes('[')) continue
    const pattern = new RegExp(`^${route.replace(/\[[^\]]+\]/g, '[^/]+')}$`)
    if (pattern.test(href)) return true
  }
  return API_ROUTES.includes(href)
}

describe('internal links', () => {
  const sources = [...walk('app'), ...walk('components')]

  it('finds the pages it is meant to be checking', () => {
    // Without this the suite passes brilliantly on an empty set. Same shape as
    // the vacuous passes in D51a and D53b: a check that measures nothing
    // reports no problems.
    expect(ROUTES.size).toBeGreaterThan(10)
    expect(sources.length).toBeGreaterThan(50)
  })

  it('points every href and route table entry at a real page', () => {
    const broken: Record<string, string[]> = {}

    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      const found = [
        // href="/x", href={`/x`}, href={'/x'}
        ...[...text.matchAll(/href=[{"'`]+(\/[^"'`}\s]*)/g)].map((m) => m[1]!),
        // route tables: { href: '/x', ... }
        ...[...text.matchAll(/href:\s*['"`](\/[^'"`]*)/g)].map((m) => m[1]!),
      ]

      for (const raw of found) {
        // Template interpolation is resolved at runtime; a static check cannot
        // follow it and must not pretend to.
        if (raw.includes('${')) continue
        // The nav table is allowed to name unbuilt destinations — that is what
        // the `unbuilt` flag is for, and the test below checks it properly.
        if (file.endsWith('navigation.ts')) continue
        const href = (raw.split('?')[0]!.split('#')[0]!.replace(/\/$/, '')) || '/'
        if (!resolves(href)) (broken[href] ??= []).push(file)
      }
    }

    expect(broken).toEqual({})
  })

  it('lets no page keep its own opinion about what is built', () => {
    /*
     * The Tools hub used to carry `ready: true/false` per tool, beside a list
     * it read from NAV_GROUPS. Two answers to one question: the nav decided
     * what to LIST and the hub decided what to LINK, and nothing would have
     * noticed them disagreeing — a tool could say "Soon" in the sidebar and
     * offer an "Open →" on the hub, or the reverse.
     *
     * That flag is gone and the hub reads `item.unbuilt`. This is what stops it
     * coming back, here rather than in a comment nobody reads (D61a).
     */
    const hub = readFileSync('app/(dashboard)/tools/page.tsx', 'utf8')
    // Comments first. A check for the absence of a string that trips over the
    // comment explaining its absence is this project's most repeated mistake.
    const code = hub.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bready\s*:/)
    expect(code).toContain('tool.unbuilt')
  })

  it('marks a nav item unbuilt if and only if it has no page', () => {
    /*
     * Both directions, deliberately.
     *
     * Forgetting the flag puts a 404 back in the sidebar — the original defect,
     * 21 times over. Leaving the flag on after building the page is quieter and
     * arguably worse: the product grows a feature and the navigation goes on
     * calling it "Soon", so nobody finds it.
     *
     * Neither can survive this, because the filesystem is the authority and the
     * flag is only a claim about it.
     */
    /*
     * SETTINGS_NAV was missing from this list until the settings rail was
     * built. It had been a route table nothing rendered, so nothing checked it
     * either — and two of its hrefs pointed at pages that did not exist.
     */
    const items = [
      ...NAV_GROUPS.flatMap((g) => g.items),
      ...SETTINGS_NAV.flatMap((g) => g.items),
      ...NAV_FOOTER,
      ...MOBILE_TABS,
    ]
    expect(items.length).toBeGreaterThan(30)

    const wrong: Record<string, string> = {}
    for (const item of items) {
      const exists = ROUTES.has(item.href)
      if (item.unbuilt && exists) wrong[item.href] = 'marked unbuilt, but the page exists'
      if (!item.unbuilt && !exists) wrong[item.href] = 'linked, but there is no page'
    }
    expect(wrong).toEqual({})
  })
})

describe('resolutions', () => {
  /*
   * A resolution list must not offer the same destination twice.
   *
   * Profit Reality's "listings without a product cost" carried "Add costs" and
   * "Set a default rule" as separate buttons pointing at the same page — the
   * rule field is ON that page, so the two did the same thing. It hid behind
   * `/profit?tab=costs` and `/profit?tab=costs&rule=default`: different
   * strings, one destination, because the query was read by nothing.
   *
   * React found it, as a duplicate-key warning, once retargeting collapsed the
   * strings. That is a rendering complaint about a product defect, and it only
   * appears in a browser console. This is the same check where it can fail
   * loudly.
   */
  it('offers no destination twice in one list', async () => {
    const { missingDataFrom, reconcile } = await import('@/domain/profit/reconciliation')
    const { buildDemoListings, buildDemoOrders, demoConfirmedCosts, demoUnmatchedOrderIds } =
      await import('@/lib/etsy/demo-dataset')

    const listings = buildDemoListings()
    const orders = buildDemoOrders(listings)
    const costs = demoConfirmedCosts(listings)
    const summary = reconcile({
      orders,
      listings,
      costs,
      unmatchedOrderIds: demoUnmatchedOrderIds(orders),
    })

    const lists: { where: string; hrefs: string[] }[] = [
      ...missingDataFrom({ summary, listingsWithoutCost: 38, labourRecorded: false }).map((item) => ({
        where: item.code,
        hrefs: item.resolutions.map((r) => r.href),
      })),
      ...summary.rows.map((row) => ({
        where: `row ${row.orderId}`,
        hrefs: row.resolutions.map((r) => r.href),
      })),
    ]

    expect(lists.length).toBeGreaterThan(3)
    const duplicated = lists.filter((l) => new Set(l.hrefs).size !== l.hrefs.length)
    expect(duplicated).toEqual([])
  })

  it('keys resolutions by something that is actually unique', async () => {
    // `key={r.href}` was the crash. The key is kind+label now, so this asserts
    // that pair is distinct wherever a list is rendered.
    const { missingDataFrom, reconcile } = await import('@/domain/profit/reconciliation')
    const { buildDemoListings, buildDemoOrders, demoConfirmedCosts, demoUnmatchedOrderIds } =
      await import('@/lib/etsy/demo-dataset')

    const listings = buildDemoListings()
    const orders = buildDemoOrders(listings)
    const summary = reconcile({
      orders,
      listings,
      costs: demoConfirmedCosts(listings),
      unmatchedOrderIds: demoUnmatchedOrderIds(orders),
    })

    const all = [
      ...missingDataFrom({ summary, listingsWithoutCost: 38, labourRecorded: false }).map(
        (i) => i.resolutions,
      ),
      ...summary.rows.map((r) => r.resolutions),
    ]
    for (const list of all) {
      const keys = list.map((r) => `${r.kind}-${r.label}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

/*
 * Every redirect() target must be a real route.
 *
 * This is the same defect class as a broken href, one layer deeper and rather
 * more serious. app/(dashboard)/layout.tsx and about twenty pages run
 * `if (!session) redirect('/login')`, and for the whole life of the project
 * there was NO /login page. Nothing failed, because nothing took that branch:
 * getSession() returns the demo session while AUTH_MODE is unset. The first
 * time real auth was switched on, every screen in the product would have
 * redirected to a 404 — the entire app, unreachable, from one missing file.
 *
 * A redirect to a missing route is invisible in exactly the way a bad href is:
 * valid TypeScript, valid at build, wrong only when someone takes the branch.
 */
describe('redirect targets', () => {
  const sources = [...walk('app'), ...walk('lib'), ...walk('domain'), ...walk('components')]
  const targets = new Map<string, string>()
  let callSites = 0

  for (const file of sources) {
    const text = readFileSync(file, 'utf8')
    // redirect('/x') and redirect(`/x`), internal paths only. A template
    // literal carrying ${...} is skipped: its value is not knowable here.
    for (const match of text.matchAll(/redirect\(\s*['"`](\/[^'"`$]*)['"`]/g)) {
      callSites += 1
      const raw = match[1]!
      // Drop any query string — /settings/extension?download=x is /settings/extension.
      const path = raw.split('?')[0]!.replace(/\/$/, '') || '/'
      if (!targets.has(path)) targets.set(path, file)
    }
  }

  it('finds the redirects it is meant to be checking', () => {
    /*
     * The floor is on CALL SITES, not on distinct paths.
     *
     * Worth writing down, because the first version of this check asserted
     * `targets.size > 5` and failed — there are only TWO distinct redirect
     * targets in the whole product, /login and /dashboard. But /login is
     * reached from 34 separate places. Counting the deduplicated set measured
     * something real and irrelevant; the number that says discovery is working
     * is how many calls were seen.
     */
    expect(callSites).toBeGreaterThan(20)
    expect(targets.size).toBeGreaterThan(1)
  })

  it('points every redirect at a page or route that exists', () => {
    const broken = [...targets.entries()].filter(([path]) => !resolves(path))
    expect(broken.map(([path, file]) => `${path} (${file})`)).toEqual([])
  })

  it('serves the sign-in page every signed-out branch sends people to', () => {
    // Named explicitly rather than left to the sweep above, because this is
    // the one whose absence would take the whole product down.
    expect(ROUTES.has('/login')).toBe(true)
    expect(ROUTES.has('/signup')).toBe(true)
  })
})

describe('links to route handlers', () => {
  /*
   * A <Link> to an API route is prefetched like any other, so Next fetches the
   * CSV, the zip or the OAuth redirect the moment the link enters the viewport.
   * For an export that is wasted work; for /api/etsy/connect it starts a flow
   * nobody asked for, and on an http origin it tripped the CSP's
   * upgrade-insecure-requests and surfaced as ERR_SSL_PROTOCOL_ERROR.
   *
   * Ten of them, none prefetch={false}, found by widening the browser sweep to
   * report console errors other than CSP violations.
   */
  it('never prefetches a route handler', () => {
    const offenders: string[] = []

    for (const file of [...walk('app'), ...walk('components')]) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/<Link\b[\s\S]{0,500}?>/g)) {
        const el = match[0]
        const isApi = el.includes('href="/api/') || el.includes('href={`/api/')
        if (isApi && !el.includes('prefetch={false}')) offenders.push(file)
      }
    }

    expect([...new Set(offenders)]).toEqual([])
  })
})
