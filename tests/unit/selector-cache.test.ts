import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   NO SELECTOR MAY RETURN A CACHED INSTANCE BEFORE IT HAS ASKED WHAT MODE
 *   THIS REQUEST IS IN.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The mode is per request. lib/demo-mode.ts:
 *
 *     process.env.ETSY_MODE !== 'live' || isPublicDemoRequest()
 *
 * and `isPublicDemoRequest()` reads an AsyncLocalStorage store that
 * getSession() marks for a visitor with a public-demo cookie. So on a live
 * deployment that also serves the public demo — which is every deployment —
 * two requests in the same process get different answers, and a selector that
 * returns a process-wide cached instance before asking hands the second
 * request whatever the first one got.
 *
 * It has now happened twice:
 *
 *   lib/billing/index.ts  the first anonymous visitor cached
 *                         MockBillingProvider and every signed-in seller after
 *                         them was served its invented subscription. Found
 *                         while writing a test for something else (a9fa7ee).
 *   lib/ai/index.ts       measured in one server process, AI_MODE=live with a
 *                         key: demo visitor first and the SELLER got canned
 *                         mock copy; seller first and the public-demo VISITOR
 *                         reached the live model, with their AI Copilot
 *                         returning AI_UNAVAILABLE — the live provider having
 *                         tried. An unauthenticated path to the owner's AI
 *                         spend, with no plan limit in front of it.
 *
 * ── WHAT WAS DECIDED: CACHE PER MODE, NOT GLOBALLY ───────────────────────
 *
 * Three options were on the table.
 *
 *   NOT CACHING AT ALL. Correct, and it costs a new Anthropic client — and
 *   therefore a new HTTPS agent and connection pool — on every request that
 *   drafts. Rejected for that, not for tidiness.
 *
 *   CACHING GLOBALLY. What was there. The cache is keyed on nothing while the
 *   decision is keyed on the request, so it answers a different question from
 *   the one asked.
 *
 *   CACHING PER MODE, which is what lib/etsy/index.ts has always done: an
 *   override for the test seam, one instance per kind, and the decision made
 *   on every call. The cost is one extra object per process and a constraint
 *   on providers — they must hold nothing request-scoped — which is already
 *   true of all five and is the property this rule leans on.
 *
 * ── THE RULE IS ABOUT ORDER, NOT ABOUT ANY PARTICULAR ADAPTER ────────────
 *
 * It names no selector. It finds the modules in lib/ that consult a
 * per-request predicate, works out which of their module-level `let`s are
 * caches (assigned by the module itself) as against overrides (assigned only
 * by an exported setter), and fails when a cache is returned before the
 * consultation. A sixth adapter added next month is covered without anybody
 * adding it to a list.
 */

/** The per-request predicates. Consulting either makes a function mode-aware. */
const REQUEST_SCOPED = ['isDemoMode', 'isPublicDemoRequest']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

const libFiles = walk('lib').sort()

/** The body of each top-level `function NAME(` / `export function NAME(`, by brace matching. */
function functionsIn(source: string): { name: string; exported: boolean; body: string }[] {
  const out: { name: string; exported: boolean; body: string }[] = []
  const pattern = /(export\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g
  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length - 1
    let depth = 0
    let end = start
    for (let i = start; i < source.length; i++) {
      const ch = source[i]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    out.push({ name: match[2] ?? '', exported: Boolean(match[1]), body: source.slice(start, end) })
  }
  return out
}

/** Module-level `let x` / `let x: T = …` names. */
function moduleLets(source: string): string[] {
  return [...source.matchAll(/^let\s+(\w+)/gm)].map((m) => m[1] ?? '')
}

/**
 * Local function names that consult a per-request predicate, directly or
 * through another local function.
 *
 * The indirection is not hypothetical: lib/ai's factory called
 * `liveConfigured()`, which called `isDemoMode()`, so a rule that looked only
 * for the predicate's own name would have found nothing in the one file where
 * the defect was.
 */
function modeAwareNames(source: string): Set<string> {
  const fns = functionsIn(source)
  const aware = new Set<string>()
  for (const name of REQUEST_SCOPED) aware.add(name)
  for (let pass = 0; pass < 5; pass++) {
    for (const fn of fns) {
      if (aware.has(fn.name)) continue
      if ([...aware].some((a) => new RegExp(`\\b${a}\\s*\\(`).test(fn.body))) aware.add(fn.name)
    }
  }
  return aware
}

interface Offence {
  file: string
  fn: string
  cache: string
}

function offencesIn(file: string): Offence[] {
  const source = code(file)
  if (!REQUEST_SCOPED.some((p) => new RegExp(`\\b${p}\\b`).test(source))) return []

  const lets = moduleLets(source)
  if (lets.length === 0) return []

  const fns = functionsIn(source)
  const aware = modeAwareNames(source)

  /*
   * A CACHE is a module-level `let` the module assigns itself. An OVERRIDE is
   * one assigned only by an exported setter — a caller put it there, so
   * returning it first is the seam working, not a stale decision.
   */
  const setters = fns.filter((f) => f.exported && /^(set|__set)/.test(f.name))
  const caches = lets.filter((name) => {
    const assignedOutsideSetters = fns
      .filter((f) => !setters.includes(f))
      .some((f) => new RegExp(`\\b${name}\\s*(\\?\\?)?=[^=]`).test(f.body))
    return assignedOutsideSetters
  })

  const out: Offence[] = []
  for (const fn of fns) {
    if (!fn.exported) continue
    // Where this function first consults the mode, directly or indirectly.
    const consults = [...aware]
      .map((a) => fn.body.search(new RegExp(`\\b${a}\\s*\\(`)))
      .filter((i) => i >= 0)
    if (consults.length === 0) continue
    const at = Math.min(...consults)
    const before = fn.body.slice(0, at)
    for (const cache of caches) {
      if (new RegExp(`return\\s+${cache}\\b`).test(before)) {
        out.push({ file, fn: fn.name, cache })
      }
    }
  }
  return out
}

describe('a selector decides before it caches', () => {
  it('finds the selectors it is reasoning about', () => {
    /*
     * Anti-vacuity, and it is the assertion that matters: the sweep is
     * satisfied by a tree with no mode-aware selectors in it at all, and the
     * whole product is built on five of them.
     */
    const modeAware = libFiles.filter((f) =>
      REQUEST_SCOPED.some((p) => new RegExp(`\\b${p}\\b`).test(code(f))),
    )
    expect(libFiles.length).toBeGreaterThan(50)
    expect(modeAware.length).toBeGreaterThanOrEqual(4)
    for (const selector of [
      'lib/etsy/index.ts',
      'lib/ai/index.ts',
      'lib/billing/index.ts',
      'lib/signals/index.ts',
    ]) {
      expect(modeAware, `${selector} no longer consults a per-request mode`).toContain(selector)
    }
  })

  it('reads a function body, an override and a cache apart from each other', () => {
    /*
     * The positive control for the machinery, on text rather than on the
     * tree. Four properties, each of which was wrong in a draft of this file:
     * the brace matcher has to end a body at its own closing brace, the
     * indirection has to be followed, an override must not count as a cache,
     * and a cache returned AFTER the consultation must not count as an
     * offence.
     */
    const sample = `
let override: X | null = null
let liveInstance: X | null = null

function liveConfigured(): boolean {
  if (isDemoMode()) return false
  return true
}

export function getThing(): X {
  if (override) return override
  if (liveConfigured()) {
    liveInstance ??= load()
    return liveInstance
  }
  return fallback()
}

export function setThing(x: X | null): void {
  override = x
}
`
    expect(moduleLets(sample)).toEqual(['override', 'liveInstance'])
    expect(functionsIn(sample).map((f) => f.name)).toEqual([
      'liveConfigured',
      'getThing',
      'setThing',
    ])
    expect(modeAwareNames(sample).has('liveConfigured')).toBe(true)

    // The known-bad shape, which both defects had, assembled here so this
    // file never has to contain it as working code.
    const bad = sample.replace('if (override) return override', 'if (liveInstance) return liveInstance')
    const badFn = functionsIn(bad).find((f) => f.name === 'getThing')!
    const at = badFn.body.search(/\bliveConfigured\s*\(/)
    expect(/return\s+liveInstance\b/.test(badFn.body.slice(0, at))).toBe(true)

    // And the good shape does not trip it.
    const goodFn = functionsIn(sample).find((f) => f.name === 'getThing')!
    const goodAt = goodFn.body.search(/\bliveConfigured\s*\(/)
    expect(/return\s+liveInstance\b/.test(goodFn.body.slice(0, goodAt))).toBe(false)
  })

  it('returns no cached instance ahead of the mode check, in any selector', () => {
    const offences = libFiles.flatMap(offencesIn)
    expect(
      offences.map((o) => `${o.file}: ${o.fn}() returns ${o.cache} before consulting the mode`),
      'a selector hands the second request whatever the first one got — cache per mode, ' +
        'and decide before you cache. See lib/etsy/index.ts for the shape.',
    ).toEqual([])
  })

  it('and every mode-aware selector consults the mode in its factory at all', () => {
    /*
     * The other half, and the vacuity the rule above cannot see on its own: a
     * selector that stopped asking entirely has no consultation point, so it
     * has no "before" and passes. That is the defect without the cache.
     */
    const missing: string[] = []
    for (const file of libFiles) {
      const source = code(file)
      if (!REQUEST_SCOPED.some((p) => new RegExp(`\\b${p}\\b`).test(source))) continue
      const fns = functionsIn(source)
      const aware = modeAwareNames(source)
      const factories = fns.filter((f) => f.exported && /^get/.test(f.name))
      if (factories.length === 0) continue
      const anyConsults = factories.some((f) =>
        [...aware].some((a) => new RegExp(`\\b${a}\\s*\\(`).test(f.body)),
      )
      if (!anyConsults) missing.push(file)
    }
    expect(
      missing,
      'a selector exports a get* factory and never asks what mode the request is in',
    ).toEqual([])
  })
})
