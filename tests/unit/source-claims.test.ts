import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { dataSources } from '@/domain/data-sources/service'
import { getBillingProvider } from '@/lib/billing'
import { marketSignalsMode } from '@/lib/signals'
import { TRIAL_TERMS } from '@/domain/billing/plans'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   NO SCREEN MAY NAME A SOURCE THE PRODUCT DOES NOT HAVE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Three times now the product has printed a named external source with no
 * implementation behind it:
 *
 *   'Public marketplace signals'   the source category on the Keyword
 *                                  Explorer and in every Research provenance
 *                                  drawer. There is no sampler; lib/signals
 *                                  has one implementation and it is a
 *                                  generator seeded from the term. (3dbce03)
 *   'public category seasonality'  where the Seasonal calendar said its
 *                                  windows came from. There is no such
 *                                  dataset; they are three windows authored
 *                                  by hand in domain/seasonal/service.ts.
 *   a subscription from a mock     /billing's plan, renewal date, card and
 *                                  four invoices, served by
 *                                  MockBillingProvider on every deployment,
 *                                  plus the "Solo plan" chip on every screen.
 *
 * The first was caught by sweeping copy for the word "observed". Sweeping copy
 * will not catch the fourth, because the fourth will be a name nobody has
 * thought of yet.
 *
 * ── TWO LAYERS, AND THE FIRST IS THE ONE THAT GENERALISES ─────────────────
 *
 * LAYER 1 ties the catalogue to the adapters. domain/data-sources/service.ts
 * is the product's own answer to "where does every figure come from", and each
 * row's `status` is READ from the adapter that serves it rather than written
 * down — that was already the rule when the file was built ("a page that
 * describes the system rather than reading it is true on the day it is written
 * and unowned afterwards"). This layer asserts the reading really happens: the
 * signals row has to agree with marketSignalsMode(), the payments row with
 * getBillingProvider(), the model row with getAiProvider(). A source that
 * disappears from the deployment cannot stay "Connected" in the catalogue, and
 * a source that is added has to appear.
 *
 * LAYER 2 sweeps rendered copy for the FRAMING all three defects used — "from
 * public X", "third-party X", "industry X" — and requires every hit to be on a
 * list that records why it is not a claim about our own figures.
 *
 * ── WHAT I COULD NOT MAKE HOLD ────────────────────────────────────────────
 *
 * A rule general enough to catch any invented source NAME. "Demand from the
 * Etsy Trends feed" uses no public/external/third-party framing and would pass
 * layer 2; so would "sourced from Marmalade Analytics". I tried a pattern over
 * proper-noun-plus-source-noun (`/[A-Z][a-z]+ (feed|index|registry)/`) and it
 * flagged "Etsy Open API", "Etsy Stats import" and "Shop Pulse baseline" —
 * every real source in the product — which is a guard that would be switched
 * off within a week.
 *
 * So layer 2 is narrow by choice: it covers the framing this product has
 * actually reached for three times, and layer 1 is what covers the general
 * case, from the other end. An invented source still has to produce figures,
 * and figures have to come from an adapter; an adapter the catalogue does not
 * report on fails layer 1, and a catalogue row whose status does not come from
 * an adapter fails it too.
 */

const ROOTS = ['app', 'components', 'domain', 'lib']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((root) => walk(root)).sort()

/* ------------------------------------------------- layer 1: the catalogue */

const REAL_ETSY_MODE = process.env.ETSY_MODE

afterEach(() => {
  if (REAL_ETSY_MODE === undefined) delete process.env.ETSY_MODE
  else process.env.ETSY_MODE = REAL_ETSY_MODE
})

function rowFor(key: string) {
  const row = dataSources().find((s) => s.key === key)
  expect(row, `the catalogue has no '${key}' row`).toBeDefined()
  return row!
}

describe('the catalogue of sources is read from the adapters, not written down', () => {
  it('lists every source a figure could come from', () => {
    /*
     * Anti-vacuity. Layer 2 below is satisfied by a product that names no
     * sources at all; this says what the catalogue is expected to contain, so
     * a row quietly disappearing fails here rather than silently widening what
     * the copy sweep permits.
     */
    const keys = dataSources().map((s) => s.key)
    expect(keys).toEqual([
      'etsy-api',
      'cost-setup',
      'signals',
      'payments',
      'seasonality',
      'stats-import',
      'event-log',
      'llm',
      'demo',
    ])
    for (const row of dataSources()) {
      expect(row.name.length, `${row.key} has no name`).toBeGreaterThan(3)
      expect(row.limitations.length, `${row.key} states no limitations`).toBeGreaterThan(30)
    }
  })

  it('the market-signals row says what lib/signals actually is', () => {
    /*
     * This row was the only honest statement about provenance in the product
     * when 3dbce03 was written — `signals === 'MOCK' ? 'Modelled sample data'
     * : 'Live sampling'` — while five Research screens printed modelled
     * figures as observations. It is the ground truth, so it has to keep
     * reading the adapter.
     */
    process.env.ETSY_MODE = 'live'
    expect(marketSignalsMode()).toBe('NONE')
    expect(rowFor('signals').status).toBe('Not built yet — no source')
    expect(rowFor('signals').class).toBe('UNAVAILABLE')

    process.env.ETSY_MODE = 'mock'
    expect(marketSignalsMode()).toBe('MOCK')
    expect(rowFor('signals').status).toBe('Modelled sample data')
  })

  it('the payments row says whether anybody can be charged', () => {
    process.env.ETSY_MODE = 'live'
    expect(getBillingProvider()).toBeNull()
    expect(rowFor('payments').status).toBe('Not connected — billing is not open')
    expect(rowFor('payments').class).toBe('UNAVAILABLE')
  })

  it('and the language-model row says there is no language model', () => {
    /*
     * ── THE ROW THAT READS NOTHING, BECAUSE THERE IS NOTHING TO READ ──────
     *
     * This assertion used to call getAiProvider().mode and expect the status
     * to follow it: 'Rule-based drafter — nothing leaves this machine' or
     * 'Live model'. D95 removed the AI Copilot and the provider with it, so
     * there is no adapter to ask.
     *
     * The row did NOT go with it. /data/sources is the catalogue of what this
     * product reads from, and "there is no language model here" is a fact a
     * seller came to that page to learn — the same reason the email, payment
     * and keyword-provider rows are listed while resolving to nothing. So the
     * row stays and states the absence, and this guard checks the statement
     * against the filesystem rather than against another string: the claim
     * "no AI provider in this product" is true only while no provider module
     * exists, and `lib/ai/` coming back would make the row a lie on the day
     * it is re-created.
     */
    for (const mode of ['live', 'mock']) {
      process.env.ETSY_MODE = mode
      const row = rowFor('llm')
      expect(row.status, `llm status under ETSY_MODE=${mode}`).toBe(
        'Not connected — no AI provider in this product',
      )
      expect(row.class).toBe('UNAVAILABLE')
      expect(row.refresh).toBe('Never')
      /* The row has to say what is NOT sent, not merely that nothing is on. */
      expect(row.limitations).toMatch(/no listing, order or cost of yours is sent/i)
    }

    /* And the claim measured against the product, not against itself. */
    expect(existsSync(posixJoin(process.cwd(), 'lib/ai'))).toBe(false)
    expect(existsSync(posixJoin(process.cwd(), 'domain/ai'))).toBe(false)
  })

  it('every unavailable row says so in its status, not only in its class', () => {
    /*
     * A row whose class is UNAVAILABLE and whose status reads "Connected"
     * would pass every other assertion here and be exactly the defect: a
     * catalogue that contradicts itself about whether a source exists.
     */
    process.env.ETSY_MODE = 'live'
    for (const row of dataSources()) {
      if (row.class !== 'UNAVAILABLE') continue
      expect(
        row.status,
        `${row.key} is UNAVAILABLE but its status does not say so`,
      ).toMatch(/not (connected|built)|never|no source/i)
    }
  })
})

/* ----------------------------------------------------- layer 2: the copy */

interface Framing {
  pattern: RegExp
  why: string
  /** A sentence this pattern must match, so a broken regex cannot pass. */
  control: string
}

const SOURCE_NOUN =
  'signals?|seasonality|data|datasets?|feeds?|index|indices|registers?|benchmarks?|averages?|panels?|clickstreams?|stats'

const EXTERNAL_FRAMING: Framing[] = [
  {
    pattern: new RegExp(
      String.raw`\b(public|external|third-party|industry|aggregated|licensed)[\s-]+(?:\w+[\s-]+)?(?:${SOURCE_NOUN})\b`,
      'i',
    ),
    why: 'names an outside source for a figure',
    control: 'Modelled from public marketplace signals, sampled weekly.',
  },
  {
    pattern: /\b(sourced|supplied|licensed|purchased) from\b/i,
    why: 'attributes a figure to somebody we buy or receive it from',
    control: 'Demand is sourced from a panel of shoppers.',
  },
  {
    pattern: /\baccording to (a |an |the )?(industry|market|public)\b/i,
    why: 'attributes a figure to an outside authority',
    control: 'According to industry benchmarks, 2% is normal.',
  },
]

/**
 * Hits that are NOT a claim about our own figures, each with its reason.
 *
 * Same contract as fixture-containment's KNOWN_REMAINING: an entry has to stay
 * true, and deleting it is what fixing one looks like. Two of them, and both
 * are checked for the sentence that makes them honest — so an entry cannot
 * outlive the context it depends on.
 */
const NOT_OUR_CLAIM: { file: string; why: string; alsoContains: string }[] = [
  {
    file: 'app/(dashboard)/tools/page.tsx',
    why:
      'The Trademark Screening card describes what the tool WOULD do — "check a term ' +
      'against public trademark registers". The tool is marked unbuilt in ' +
      'components/layout/navigation.ts, the card does not link anywhere, and the same ' +
      'file prints the reason: a register is exactly what it does not have. The ' +
      'description of an unbuilt tool is a plan, and the card says it is one.',
    alsoContains: 'Needs a trademark register',
  },
  {
    file: 'components/marketing/sections.tsx',
    why:
      'The FAQ answer about keyword research describes where OTHER tools get a volume ' +
      'number from — "a third-party panel, a clickstream, a model — and most of them do ' +
      'not say which". It is an attribution about somebody else, made in order to say ' +
      'that this product has no such source. The sentence that follows it is the ' +
      'product refusing to ship one.',
    alsoContains: 'will not ship an estimate dressed as a measurement',
  },
]

function offenders(): string[] {
  const out: string[] = []
  const exempt = new Set(NOT_OUR_CLAIM.map((k) => k.file))
  for (const file of files) {
    if (exempt.has(file)) continue
    const text = code(file).replace(/\s+/g, ' ')
    for (const framing of EXTERNAL_FRAMING) {
      const hit = framing.pattern.exec(text)
      if (hit) out.push(`${file}: "${hit[0]}" — ${framing.why}`)
    }
  }
  return out
}

describe('no rendered copy names an outside source for a figure', () => {
  it('sweeps the whole product and can see a claim when there is one', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(files.length).toBeGreaterThan(250)
    expect(files).toContain('app/(dashboard)/billing/page.tsx')
    expect(files).toContain('app/(dashboard)/tools/seasonal-calendar/page.tsx')
    expect(files).toContain('lib/signals/mock.ts')

    const read = files.reduce((n, f) => n + code(f).length, 0)
    expect(read).toBeGreaterThan(400_000)

    for (const framing of EXTERNAL_FRAMING) {
      expect(
        framing.pattern.test(framing.control),
        `${framing.pattern} no longer matches its own control sentence`,
      ).toBe(true)
    }
    // And the framing patterns do not fire on the honest wording that replaced
    // them, which is what a seller actually reads now.
    for (const framing of EXTERNAL_FRAMING) {
      expect(framing.pattern.test('Modelled sample data — nothing here was measured')).toBe(false)
      expect(
        framing.pattern.test(
          "The window dates are CobaltRank's own assumption about when each season runs",
        ),
      ).toBe(false)
    }
  })

  it('finds none outside the two that are not about our own figures', () => {
    expect(
      offenders(),
      'rendered copy names an outside source for a figure — either the product has ' +
        'that source and it belongs in domain/data-sources/service.ts, or the copy ' +
        'should say what the figure really is',
    ).toEqual([])
  })

  it('and both exceptions are still exceptions', () => {
    /*
     * The anti-vacuity half of the allowlist. An entry that names a file with
     * no hit left is a line nobody needs, and worse, it is an exemption
     * covering nothing — so the next person reads a permission that is not
     * being used and assumes the rule is looser than it is.
     */
    for (const known of NOT_OUR_CLAIM) {
      const text = code(known.file).replace(/\s+/g, ' ')
      expect(
        EXTERNAL_FRAMING.some((f) => f.pattern.test(text)),
        `${known.file} no longer names an outside source; delete its NOT_OUR_CLAIM entry`,
      ).toBe(true)
      expect(
        text,
        `${known.file} no longer carries the sentence that makes its exemption honest`,
      ).toContain(known.alsoContains)
      expect(known.why.length, `${known.file} has no reason recorded`).toBeGreaterThan(80)
    }
  })
})

/* ------------------------------------------------ the billing claim itself */

describe('and no screen describes a subscription nobody can buy', () => {
  it('there is no billing provider outside the demo', () => {
    process.env.ETSY_MODE = 'live'
    expect(getBillingProvider(), 'live mode has a billing provider').toBeNull()

    process.env.ETSY_MODE = 'mock'
    expect(getBillingProvider(), 'demo mode has no billing provider').not.toBeNull()
    expect(getBillingProvider()!.mode).toBe('MOCK')
  })

  it('the trial copy agrees with the trial terms, which agree with the Terms', () => {
    /*
     * The billing page restated TRIAL_TERMS instead of rendering it, and the
     * restatement drifted: "no card required" and "Nothing charges
     * automatically at the end", against §8 of the Terms of Service — "A
     * payment method is required to start a trial" — and against
     * TRIAL_TERMS.cardRequired in the same repository. Two seller-facing
     * documents disagreeing about the one fact a seller would act on.
     */
    const page = code('app/(dashboard)/billing/page.tsx').replace(/\s+/g, ' ')

    /*
     * "no card required" may appear only as the FALSE BRANCH of a conditional
     * on trialTerms.cardRequired — which is the page deriving the fact rather
     * than asserting it, and is what the fix put there.
     *
     * Not a flat ban on the phrase: this guard has to be satisfiable by
     * correct code. A flat ban would have been satisfiable only by deleting
     * the derivation, which is how eight guards in this repo came to be
     * switched off rather than fixed (D94a).
     */
    for (const match of page.matchAll(/no card required/gi)) {
      const near = page.slice(Math.max(0, match.index - 160), match.index + 40)
      expect(
        near,
        'the billing page states "no card required" without deriving it from trialTerms.cardRequired',
      ).toMatch(/trialTerms\.cardRequired/)
    }

    // This one has no constant behind it and never had: it is a bare claim.
    expect(page, 'the billing page claims nothing charges at the end of the trial').not.toMatch(
      /[Nn]othing charges automatically/,
    )

    // Rendered, not restated: the page prints the approved sentence itself.
    expect(page).toMatch(/trialTerms\.terms/)
    // And the fact the derivation reads is the one the Terms state.
    expect(TRIAL_TERMS.cardRequired, 'TRIAL_TERMS says the trial needs no card').toBe(true)
  })

  it('and nothing falls back to a plan the seller has not bought', () => {
    /*
     * Two routes to "Solo plan" on every screen: MockBillingProvider's
     * subscription, and currentPlan()'s catch branch returning
     * planOf(DEMO_PLAN) on any billing error. The first is gone with the
     * fallback provider; this pins the second, and that DEMO_PLAN now lives
     * with the mock rather than beside the real tiers.
     */
    const service = code('domain/billing/service.ts')
    expect(service, 'the billing service names DEMO_PLAN again').not.toMatch(/\bDEMO_PLAN\b/)
    expect(code('domain/billing/plans.ts'), 'DEMO_PLAN is back beside the real tiers').not.toMatch(
      /export const DEMO_PLAN/,
    )
  })
})
