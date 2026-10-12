import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { getSignalsService, marketSignalsMode } from '@/lib/signals'
import { resetPublicDemoRequest } from '@/lib/demo-request'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE RESEARCH SECTION MAY NOT CLAIM AN OBSERVATION WHILE THE ONLY
 *   IMPLEMENTATION BEHIND IT IS A MOCK.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A commit before this one found four sentences that presented modelled
 * figures as measurements — a VERIFIED badge over a listing count captioned
 * "Counted from public shop pages", and three like it. They were found by eye,
 * from screenshots, which is why they stopped at four. Fifty-six remained, and
 * twenty-five of those were in lib/signals/mock.ts: the one file every
 * Research screen reads its provenance strings out of, so the same claim was
 * arriving on five pages from one place nobody had looked.
 *
 * ── WHY THIS IS TIED TO THE DATA SOURCE, NOT TO A LIST OF WORDS ───────────
 *
 * "Observed" is not a forbidden word. It is a word this product has not EARNED
 * yet, and the difference has to be in the test or the test is a style rule
 * that someone will eventually be right to delete.
 *
 * So the vocabulary rules below are gated on a fact read out of lib/signals:
 * whether any implementation of MarketSignalsService declares a mode other
 * than MOCK. Today none does, and the rules apply. The day somebody writes an
 * adapter against a source that may legally exist, `only a mock implements the
 * market-signals interface` fails and says to come back here — and the
 * vocabulary rules switch themselves off, because by then the pages would be
 * describing something that happens.
 *
 * That release is deliberate and it is the reason this is not a lint rule.
 *
 * ── WHAT IT READS, AND WHAT IT CANNOT READ ───────────────────────────────
 *
 * Rendered copy on the research surfaces, with comments stripped by `code()`.
 * Nothing under tests/ is ever swept, which is what keeps this file from
 * matching its own documentation — eight guards in this repo have been
 * switched off rather than fixed for exactly that reason, so the patterns are
 * free to be written out in full below.
 *
 * It reads source rather than rendering the pages because the claim lives in
 * the copy: a rendered snapshot would pass with the sentence intact anywhere
 * the test did not happen to look.
 */

/* ------------------------------------------------- what is behind the seam */

interface Implementation {
  file: string
  className: string
  /** The `readonly mode` the class declares, or null if it declares none. */
  mode: string | null
}

const SIGNALS_DIR = 'lib/signals'

function signalsFiles(): string[] {
  return readdirSync(SIGNALS_DIR)
    .map((entry) => posixJoin(SIGNALS_DIR, entry))
    .filter((file) => statSync(file).isFile() && file.endsWith('.ts'))
    .sort()
}

/**
 * Every class implementing MarketSignalsService, with the mode it declares.
 *
 * Read off the source rather than imported, because an implementation that
 * exists and is not wired into getSignalsService() is still the thing this
 * test is asking about: somebody has written an adapter, and the copy rules
 * need re-reading whether or not the factory has caught up.
 */
function implementations(): Implementation[] {
  const out: Implementation[] = []
  for (const file of signalsFiles()) {
    const source = code(file)
    for (const match of source.matchAll(
      /class\s+(\w+)\s+implements\s+MarketSignalsService\s*\{([\s\S]*?)\n\}/g,
    )) {
      const mode = /readonly\s+mode\s*=\s*'(\w+)'/.exec(match[2] ?? '')
      out.push({ file, className: match[1] ?? '', mode: mode?.[1] ?? null })
    }
  }
  return out
}

const IMPLEMENTATIONS = implementations()
const OBSERVATION_SOURCES = IMPLEMENTATIONS.filter((i) => i.mode !== 'MOCK')

/* ------------------------------------------------------- the swept surfaces */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

function researchSurfaces(): string[] {
  return [
    ...walk('app/(dashboard)/research'),
    ...walk('components/research'),
    ...signalsFiles(),
  ].sort()
}

const SURFACES = researchSurfaces()

/*
 * The four entries in the provenance catalogue that Research badges open.
 *
 * lib/provenance/methodology.ts is NOT swept whole, on purpose: grossSales,
 * orders, activeListings and the operator entries are counted — from Etsy's
 * own responses, or from rows in our own tables — and "counted" is the correct
 * word in all of them. The vocabulary was never the problem. Using it for
 * figures nobody counted was, so only the four research-keyed entries are
 * held to the rules.
 */
const RESEARCH_METHODOLOGY_KEYS = [
  'keywordDemand',
  'keywordCompetition',
  'keywordOpportunity',
  'competitorSales',
]

/** The slice of the catalogue for one metric key. */
function methodologyEntry(key: string): string | null {
  const source = code('lib/provenance/methodology.ts')
  const at = source.indexOf(`\n  ${key}: {`)
  if (at === -1) return null
  const end = source.indexOf('\n  },', at)
  return end === -1 ? null : source.slice(at, end)
}

/* ------------------------------------------------------------- the patterns */

interface Claim {
  pattern: RegExp
  why: string
  /** A sentence this pattern must match, so a broken regex cannot pass. */
  control: string
}

/*
 * Assertions of observation. Each one is a claim that something outside this
 * product was looked at, and nothing outside this product is looked at.
 *
 * "sample" and "sample data" are deliberately absent: they are the words the
 * copy now uses, and they claim nothing. It is the ACT — sampled, sampling, a
 * sampler — that does not happen.
 */
const OBSERVATION_CLAIMS: Claim[] = [
  {
    pattern: /\bobserv(e|ed|es|ing|ation|ations)\b/i,
    why: 'nothing is observed; every figure is generated from the term it was handed',
    control: 'Counted from listings observed to match the term.',
  },
  {
    pattern: /\bsampl(ed|ing|er)\b/i,
    why: 'there is no sampler and no sampling window',
    control: 'Counted from public category and search pages, sampled weekly.',
  },
  {
    pattern: /\bcounted\b/i,
    why: 'nothing is counted off any page',
    control: 'These are counted off the shop’s own public pages.',
  },
  {
    pattern: /\ba count of\b/i,
    why: 'nothing is counted off any page',
    control: 'A count of what was visible when sampled.',
  },
  {
    pattern: /\bpublicly visible\b/i,
    why: 'the figure is modelled, whatever a shop page happens to show',
    control: 'Price, reviews, favourites and age are publicly visible.',
  },
  {
    pattern: /\bvisible on Etsy\b/i,
    why: 'nothing on these screens is on Etsy',
    control: 'Publicly visible on Etsy right now.',
  },
  {
    pattern: /\bon Etsy right now\b/i,
    why: 'nothing on these screens is on Etsy',
    control: 'Publicly visible on Etsy right now. Observed, not modelled.',
  },
  {
    pattern: /\bpublic marketplace signals\b/i,
    why: 'it names a source that does not exist; /data/sources calls this "Modelled sample data"',
    control: 'Source category: Public marketplace signals',
  },
  {
    pattern: /\blast (updated|observed|refreshed|sampled)\b/i,
    why: 'a modelled figure has no observation time, and no model run has a date either',
    control: 'Last updated 20 August 2026',
  },
]

/*
 * And Etsy named as the source of one of these figures.
 *
 * Separate from the list above because it is a different untruth: not "this
 * was measured" but "Etsy told us". Every one of these is affirmative —
 * "nothing here is Etsy data" is the sentence the pages are supposed to carry,
 * so a pattern that caught it would have to be argued with rather than obeyed.
 */
const ETSY_AS_SOURCE: Claim[] = [
  {
    pattern: /\bfrom Etsy\b(?!\s+Stats)/i,
    why: 'these figures do not come from Etsy, through the API or otherwise',
    control: 'Demand from Etsy search, refreshed hourly.',
  },
  {
    pattern: /\bEtsy (reports|returned|publishes this|says)\b/i,
    why: 'Etsy was never asked for any of this',
    control: 'A count of listings Etsy reports as active.',
  },
  {
    pattern: /\baccording to Etsy\b/i,
    why: 'Etsy was never asked for any of this',
    control: 'According to Etsy, demand rose 18%.',
  },
  {
    pattern: /\bEtsy['’]s own (figures|data|index|numbers)\b/i,
    why: 'Etsy was never asked for any of this',
    control: 'A count of what was visible, and Etsy’s own index.',
  },
]

function offendersFor(claims: Claim[], files: string[]): string[] {
  const out: string[] = []
  for (const file of files) {
    const text = code(file).replace(/\s+/g, ' ')
    for (const claim of claims) {
      const hit = claim.pattern.exec(text)
      if (hit) out.push(`${file}: "${hit[0]}" — ${claim.why}`)
    }
  }
  return out
}

/* ------------------------------------------------------------------- tests */

describe('the market-signals seam, and what the copy is therefore allowed to say', () => {
  it('finds the implementations it is reasoning about', () => {
    /*
     * The anti-vacuity check for the release condition. If the parse returns
     * nothing — the class moved, `implements` became a type annotation,
     * lib/signals was reorganised — then OBSERVATION_SOURCES is empty for the
     * wrong reason and every rule below would still pass.
     */
    expect(IMPLEMENTATIONS.length, 'no MarketSignalsService implementation found at all').toBe(1)
    expect(IMPLEMENTATIONS[0]!.className).toBe('MockMarketSignalsService')
    expect(IMPLEMENTATIONS[0]!.file).toBe('lib/signals/mock.ts')
    // A class whose mode could not be read is the dangerous case: unknown, not
    // absent, and it must not be silently treated as a mock.
    for (const impl of IMPLEMENTATIONS) {
      expect(impl.mode, `${impl.className} declares no readable mode`).not.toBeNull()
      expect(['MOCK', 'LIVE']).toContain(impl.mode)
    }
  })

  it('only a mock implements the market-signals interface', () => {
    /*
     * THE RELEASE. When this fails, somebody has written a real adapter, and
     * the three vocabulary tests below have switched themselves off. Read them
     * before deleting anything: a figure that is genuinely observed may say so,
     * and the pages will need their copy put back rather than left as-is.
     *
     * Also read tests/unit/signals-boundary.test.ts, which says what such an
     * adapter may not be: Etsy's Prohibited Behavior item 24 forbids automated
     * access to the Etsy site, so nothing reachable from lib/signals may send a
     * request at all today.
     */
    expect(
      OBSERVATION_SOURCES.map((i) => `${i.file}:${i.className}`),
      'an implementation declares a mode other than MOCK — re-read this file',
    ).toEqual([])
  })

  it('and no signals service exists outside the demo', () => {
    /*
     * The other half of the same fact, and the one a seller meets. There was
     * no gate here at all: `if (!instance) instance = new Mock...`, so a
     * connected shop on a live deployment got a mock's figures with no demo
     * badge on them, because the badge asks isDemoMode() too.
     */
    const previous = process.env.ETSY_MODE
    resetPublicDemoRequest()
    try {
      process.env.ETSY_MODE = 'live'
      expect(getSignalsService(), 'live mode has a market-signals service').toBeNull()
      expect(marketSignalsMode()).toBe('NONE')

      process.env.ETSY_MODE = 'mock'
      expect(getSignalsService(), 'demo mode has no market-signals service').not.toBeNull()
      expect(marketSignalsMode()).toBe('MOCK')
    } finally {
      if (previous === undefined) delete process.env.ETSY_MODE
      else process.env.ETSY_MODE = previous
    }
  })
})

describe('no Research copy claims an observation while nothing is observed', () => {
  it('sweeps the surfaces it is meant to sweep', () => {
    // A sweep over an empty set passes every assertion below perfectly.
    expect(SURFACES.length).toBeGreaterThanOrEqual(10)
    expect(SURFACES).toContain('app/(dashboard)/research/keywords/page.tsx')
    expect(SURFACES).toContain('app/(dashboard)/research/competitors/page.tsx')
    expect(SURFACES).toContain('components/research/modelled-notice.tsx')
    expect(SURFACES).toContain('lib/signals/mock.ts')

    // And the text really is being read, not an empty string per file.
    const total = SURFACES.reduce((n, f) => n + code(f).length, 0)
    expect(total).toBeGreaterThan(40_000)

    for (const key of RESEARCH_METHODOLOGY_KEYS) {
      expect(methodologyEntry(key), `${key} is not in the provenance catalogue`).not.toBeNull()
    }
  })

  it('every pattern matches the sentence it was written for', () => {
    /*
     * The positive control. A sweep whose regexes are broken — an escaped
     * boundary, a stray character class, a pattern narrowed during a cleanup —
     * reports nothing and reads exactly like a clean surface. Each control
     * below is a sentence this product actually shipped, or close to one.
     */
    for (const claim of [...OBSERVATION_CLAIMS, ...ETSY_AS_SOURCE]) {
      expect(
        claim.pattern.test(claim.control),
        `${claim.pattern} no longer matches its own control sentence`,
      ).toBe(true)
    }
    // And the sweep mechanism itself finds a planted claim.
    expect(offendersFor(OBSERVATION_CLAIMS, ['lib/signals/interface.ts']).length).toBe(0)
  })

  it('claims no observation anywhere on the research surfaces', () => {
    if (OBSERVATION_SOURCES.length > 0) {
      // Released. See `only a mock implements the market-signals interface`.
      expect(OBSERVATION_SOURCES.map((i) => i.mode)).toContain('LIVE')
      return
    }

    expect(
      offendersFor(OBSERVATION_CLAIMS, SURFACES),
      'rendered copy on a Research surface claims something was observed, counted or sampled',
    ).toEqual([])
  })

  it('claims none in the four provenance entries those screens open', () => {
    if (OBSERVATION_SOURCES.length > 0) {
      expect(OBSERVATION_SOURCES.map((i) => i.mode)).toContain('LIVE')
      return
    }

    const offenders: string[] = []
    for (const key of RESEARCH_METHODOLOGY_KEYS) {
      const entry = (methodologyEntry(key) ?? '').replace(/\s+/g, ' ')
      for (const claim of OBSERVATION_CLAIMS) {
        const hit = claim.pattern.exec(entry)
        if (hit) offenders.push(`${key}: "${hit[0]}" — ${claim.why}`)
      }
    }
    expect(
      offenders,
      'a provenance drawer behind a Research badge claims an observation',
    ).toEqual([])
  })

  it('and names Etsy as the source of none of these figures', () => {
    if (OBSERVATION_SOURCES.length > 0) {
      expect(OBSERVATION_SOURCES.map((i) => i.mode)).toContain('LIVE')
      return
    }

    expect(
      offendersFor(ETSY_AS_SOURCE, SURFACES),
      'rendered copy on a Research surface credits Etsy with a figure Etsy was never asked for',
    ).toEqual([])
  })
})

describe('and nothing on these screens carries a timestamp', () => {
  /*
   * The structural half, which is the part that cannot be edited back in by
   * accident. "Last updated", "last observed" and "model last refreshed" were
   * three renderings of ONE authored constant in mock.ts, so correcting the
   * three labels would have left the fourth caller to find it.
   *
   * The field is gone from the interfaces instead, which is why this is an
   * assertion about shape rather than about words.
   */
  it('lib/signals contains no instant for anything to be observed at', () => {
    const offenders: string[] = []
    for (const file of signalsFiles()) {
      // A month key is YYYY-MM and carries no time; an instant has the T.
      const hit = /['"`]\d{4}-\d{2}-\d{2}T[\d:.]+Z?['"`]/.exec(code(file))
      if (hit) offenders.push(`${file}: ${hit[0]}`)
    }
    expect(
      offenders,
      'lib/signals carries a timestamp literal; a modelled figure has no observation time',
    ).toEqual([])
  })

  it('and no signals type offers a field for one', () => {
    const iface = code('lib/signals/interface.ts')
    // Anti-vacuity: the file is the one with the interfaces in it.
    expect(iface).toContain('interface KeywordSignals')
    expect(iface).toContain('interface CompetitorShop')
    expect(iface).toContain('interface NicheSignals')
    expect(iface).toContain('interface ProductSignals')

    expect(iface, 'a signals type declares a timestamp field again').not.toMatch(
      /^\s*(observedAt|sampledAt|freshness|updatedAt)\s*[?:]/m,
    )
  })

  it('and no research surface renders one from a provenance record', () => {
    const offenders = SURFACES.filter((file) =>
      /formatDateTime\(|formatRelative\(/.test(code(file)),
    )
    expect(
      offenders,
      'a Research surface formats a date; the only dates available to it are authored constants',
    ).toEqual([])
  })
})

describe('what a seller sees instead, on every one of the five screens', () => {
  const PAGES = walk('app/(dashboard)/research').filter((f) => f.endsWith('/page.tsx'))

  it('finds all five, including any added since', () => {
    expect(PAGES.length).toBe(5)
    expect(PAGES).toContain('app/(dashboard)/research/keyword-lists/page.tsx')
  })

  it('each one renders the unbuilt state rather than an empty screen', () => {
    /*
     * The compiler forces each page to HANDLE the absent view, because the
     * domain entry points return null. It does not force the page to say
     * anything useful about it, and `return null` would type-check perfectly.
     *
     * UNBUILT, not UNAVAILABLE: the feature has no source, as opposed to
     * having one that returned nothing. components/research/not-built.tsx
     * carries the distinction and the reason it matters.
     */
    for (const page of PAGES) {
      const source = code(page)
      expect(source, `${page} does not import the unbuilt state`).toMatch(
        /from '@\/components\/research\/not-built'/,
      )
      expect(source, `${page} never renders <ResearchNotBuilt>`).toMatch(/<ResearchNotBuilt/)
    }
  })
})
