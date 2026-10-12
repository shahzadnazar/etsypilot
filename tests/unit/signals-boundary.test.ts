import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, statSync } from 'node:fs'
import { dirname, normalize } from 'node:path'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { getSignalsService } from '@/lib/signals'
import type { MarketSignalsService } from '@/lib/signals/interface'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   NOTHING UNDER lib/signals/ MAY REACH A NETWORK. NOT ETSY — A NETWORK.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Etsy's API Terms, Prohibited Behavior item 24:
 *
 *     "Use or promote the use of automated systems or browser extensions to
 *      access, analyze, or scrape the Etsy Site, the Etsy API or any Etsy
 *      data … unless expressly authorized in writing by Etsy"
 *
 * lib/signals/interface.ts is the seam a live market-data adapter would be
 * written against, and domain/research/competitors.ts used to describe its
 * observed figures as "counted off public pages". Nothing counts anything off
 * any page today, because the only implementation is a mock — but that
 * sentence described the plan, and the day somebody writes lib/signals/live.ts
 * against this interface and points it at etsy.com, the product is inside item
 * 24. The only thing stopping that was that nobody had got round to it.
 *
 * ── WHY NOT A STRING MATCH ON THE HOSTNAME ───────────────────────────────
 *
 * `expect(source).not.toContain('etsy.com')` is worth very little:
 *
 *   - `'etsy' + '.com'`, a template literal, a constant in another file, a
 *     hostname out of the environment, a URL that arrives as an argument —
 *     every one of them passes.
 *   - It polices a STRING. The property that matters is a CAPABILITY: this
 *     module does not make requests. A live adapter scraping some aggregator
 *     instead of etsy.com directly would sail through a hostname check and
 *     still be an automated system collecting Etsy data.
 *
 * So this file checks the capability, twice, with the two patterns this repo
 * already trusts for exactly these two jobs.
 *
 * ── LAYER 1: THE IMPORT CLOSURE, LIKE THE WRITE-BOUNDARY GUARD ───────────
 *
 * tests/unit/operator-write-boundary.test.ts proves the operator area cannot
 * write by walking every module reachable from it and asking what those
 * modules touch — not by reading the operator files alone. Same here: every
 * module reachable from lib/signals/, transitively, must name no network
 * capability at all. That catches `node:https`, `axios`, `undici`, a socket,
 * a DNS lookup, and an import of the Etsy adapter — none of which contain the
 * string "etsy.com".
 *
 * ── LAYER 2: THE TRAP, LIKE THE LEAK PROBE ───────────────────────────────
 *
 * app/api/leakprobe exists because reading code is not the same as watching
 * it run. So the service is actually CALLED — every method on the interface —
 * with `fetch` replaced by something that throws. A module that builds a
 * request string cleverly enough to defeat layer 1 still has to call
 * something to send it.
 *
 * The two layers close each other's gap, and that is the argument for having
 * both: a request either goes through `fetch`, which layer 2 catches whatever
 * the URL was built from, or through an imported module, which layer 1 sees
 * even if the request itself is assembled at runtime.
 */

/* ───────────────────────────────── layer 1: the import closure ───────── */

const SEEDS = ['lib/signals/index.ts', 'lib/signals/interface.ts', 'lib/signals/mock.ts']

function isFile(candidate: string): boolean {
  return existsSync(candidate) && statSync(candidate).isFile()
}

/*
 * A local resolver rather than a shared one. operator-write-boundary.test.ts
 * has the same walk and says, rightly, that two copies of ONE rule's closure
 * drift apart — but this is a different boundary, and that file's assertions
 * are not mine to touch. The duplication is three functions and is noted
 * rather than hidden.
 */
function resolveImport(specifier: string, from: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = specifier.slice(2)
  else if (specifier.startsWith('.'))
    base = normalize(posixJoin(dirname(from), specifier)).replace(/\\/g, '/')
  else return null // a package: no local module of ours to follow
  for (const candidate of [`${base}.ts`, `${base}.tsx`, posixJoin(base, 'index.ts')]) {
    if (isFile(candidate)) return candidate
  }
  return null
}

/** Local modules this file pulls in, static or dynamic. */
function importsOf(file: string): string[] {
  const found: string[] = []
  for (const match of code(file).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const resolved = resolveImport(match[1]!, file)
    if (resolved) found.push(resolved)
  }
  return found
}

/** Every package specifier this file imports, resolved or not. */
function packagesOf(file: string): string[] {
  return [...code(file).matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)]
    .map((m) => m[1]!)
    .filter((s) => !s.startsWith('@/') && !s.startsWith('.'))
}

function signalsClosure(): string[] {
  const seen = new Set(SEEDS.filter(isFile))
  const queue = [...seen]
  while (queue.length > 0) {
    for (const dependency of importsOf(queue.pop()!)) {
      if (!seen.has(dependency)) {
        seen.add(dependency)
        queue.push(dependency)
      }
    }
  }
  return [...seen].sort()
}

const CLOSURE = signalsClosure()

/*
 * Every way a Node or browser module can open a connection. Names, not
 * hostnames: the question is whether this code CAN reach a network, not
 * which one it would reach.
 */
const NETWORK_CALLS = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  '.request(',
  '.connect(',
]

const NETWORK_PACKAGES = [
  'node:http',
  'node:https',
  'node:net',
  'node:tls',
  'node:dgram',
  'node:dns',
  'http',
  'https',
  'net',
  'tls',
  'dns',
  'axios',
  'undici',
  'node-fetch',
  'got',
  'superagent',
  'puppeteer',
  'playwright',
  'cheerio',
  'jsdom',
]

/*
 * The adapter, asserted rather than assumed.
 *
 * getSignalsService() returns null outside demo mode now, which is the point
 * of lib/signals/index.ts. This suite runs with ETSY_MODE unset, so it gets
 * the mock — but a null here would make "answered every method and sent
 * nothing" pass by calling nothing at all, which is the shape of vacuous pass
 * this file exists to avoid elsewhere.
 */
function mockService(): MarketSignalsService {
  const signals = getSignalsService()
  expect(signals, 'no market-signals service in this environment').not.toBeNull()
  return signals!
}

describe('lib/signals cannot reach a network — read statically', () => {
  it('finds the closure it is meant to be checking', () => {
    /*
     * The anti-vacuity check, and the one this repo has got wrong eight
     * times: a sweep over an empty set passes every assertion below
     * perfectly. brand.test.ts does this correctly and is the pattern.
     */
    expect(CLOSURE.length).toBeGreaterThanOrEqual(3)
    expect(CLOSURE).toContain('lib/signals/mock.ts')
    expect(CLOSURE).toContain('lib/signals/interface.ts')
    expect(CLOSURE).toContain('lib/signals/index.ts')
    // And the walk really follows edges, rather than returning its seeds.
    expect(CLOSURE.some((f) => !SEEDS.includes(f))).toBe(true)
  })

  it('imports no module that can open a connection', () => {
    const offenders: string[] = []
    for (const file of CLOSURE) {
      for (const specifier of packagesOf(file)) {
        const bare = specifier.split('/')[0]!
        if (NETWORK_PACKAGES.includes(specifier) || NETWORK_PACKAGES.includes(bare)) {
          offenders.push(`${file}: imports ${specifier}`)
        }
      }
    }
    expect(
      offenders,
      'a module reachable from lib/signals can open a network connection; market signals are modelled and must stay modelled',
    ).toEqual([])
  })

  it('calls nothing that sends a request', () => {
    const offenders: string[] = []
    for (const file of CLOSURE) {
      const source = code(file)
      for (const call of NETWORK_CALLS) {
        if (source.includes(call)) offenders.push(`${file}: ${call}`)
      }
    }
    expect(
      offenders,
      'a module reachable from lib/signals makes a request; see this file’s header for why a live adapter here is inside Etsy API Terms item 24',
    ).toEqual([])
  })

  it('does not reach the Etsy adapter either', () => {
    /*
     * Separate from the network check and worth its own line: signals and
     * the Etsy API are two adapters with two switches precisely so modelled
     * figures can never be promoted to Etsy data by an import
     * (lib/signals/index.ts says so at the top). Item 25 is scoped to using
     * the Etsy API to request content for analytics — this keeps the
     * research modules out of that scope by construction rather than by
     * intention.
     */
    const offenders = CLOSURE.filter((file) =>
      importsOf(file).some((dep) => dep.startsWith('lib/etsy/')),
    )
    expect(offenders, 'lib/signals reaches the Etsy adapter').toEqual([])
  })
})

/* ──────────────────────────────────── layer 2: run it with a trap ─────── */

describe('lib/signals cannot reach a network — watched while running', () => {
  const realFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  function trap(): { calls: string[] } {
    const calls: string[] = []
    globalThis.fetch = ((input: unknown) => {
      calls.push(String(input))
      throw new Error(`lib/signals made a network request to ${String(input)}`)
    }) as typeof fetch
    return { calls }
  }

  it('the trap works, so a clean run below means something', () => {
    // The positive control. Without this, a trap that was never installed and
    // a module that never calls out look exactly the same.
    const { calls } = trap()
    expect(() => void fetch('https://example.test/probe')).toThrow(/network request/)
    expect(calls).toEqual(['https://example.test/probe'])
  })

  it('answers every method on the interface without sending anything', async () => {
    const { calls } = trap()
    const signals = mockService()

    /*
     * Every method on MarketSignalsService, because the one that reaches out
     * will be the one nobody listed. The returns are asserted too: a method
     * that threw on its first line would also make no request, and would
     * look identical to a clean pass.
     */
    const keyword = await signals.getKeyword('ceramic mug', 'US')
    expect(keyword.term).toBe('ceramic mug')

    const related = await signals.getRelated('ceramic mug', 'US')
    expect(Array.isArray(related)).toBe(true)

    const competitors = await signals.listCompetitors()
    expect(Array.isArray(competitors)).toBe(true)
    expect(competitors.length).toBeGreaterThan(0)

    const competitor = await signals.getCompetitor(competitors[0]!.name)
    expect(competitor).not.toBeNull()

    const products = await signals.findProducts({ term: 'mug', market: 'US' })
    expect(Array.isArray(products)).toBe(true)

    const niche = await signals.getNiche('ceramic mug', 'US')
    expect(niche).toBeTruthy()

    const suggestions = await signals.suggest('cer', 'US')
    expect(Array.isArray(suggestions)).toBe(true)

    expect(calls, 'lib/signals sent a request while answering').toEqual([])
  })

  it('and says it is a model, so nothing downstream can mistake it for observation', () => {
    expect(mockService().mode).toBe('MOCK')
  })
})
