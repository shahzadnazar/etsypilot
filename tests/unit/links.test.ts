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
