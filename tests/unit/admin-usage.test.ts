import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import {
  BAND_COPY,
  BAND_ORDER,
  NEAR_THRESHOLD,
  assessUsage,
  atOrOverLimit,
  bandFor,
  countByBand,
  planInForce,
  unmeasurable,
  type UsageRow,
} from '@/domain/admin/usage'
import { PLANS } from '@/domain/billing/plans'
import { limitFor } from '@/domain/billing/usage'
import { OPERATOR_NAV } from '@/domain/admin/navigation'

/*
 * PLAN USAGE ACROSS EVERY SHOP.
 *
 * The screen's one real claim is that its figures are USAGE. Three ways to
 * break that, and the first is the one that nearly happened:
 *
 *   READ A STORED COUNTER   `usage_records.used` exists and nothing writes it.
 *                           A screen reading it reports a number that is not
 *                           usage, and a blank that is not zero.
 *   RESTATE A LIMIT         D46. The limit belongs to the plan.
 *   PRESENT IT AS A FINE    D37. A quota is a boundary, not a penalty, and a
 *                           limit that only says what STOPPED reads as a fault.
 *
 * Comments are stripped, and the sweeps match a shape rather than a word.
 */

const PAGE = 'app/(admin)/admin/usage/page.tsx'
const MODEL = 'domain/admin/usage.ts'
const READS = 'lib/repositories/admin-reads-every-shop.ts'

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const NOW = new Date('2026-09-23T12:00:00Z')

function row(overrides: Partial<UsageRow> = {}): UsageRow {
  return {
    shopId: 'shop-1',
    shopName: 'A Shop',
    ownerEmail: 'a@example.com',
    isDemo: false,
    plan: 'SOLO',
    activeListings: 10,
    ...overrides,
  }
}

const solo = PLANS.find((plan) => plan.key === 'SOLO')!
const free = PLANS.find((plan) => plan.key === 'FREE')!

const meterFor = (entry: ReturnType<typeof assessUsage>, metric: string) =>
  entry.meters.find((m) => m.meter.metric === metric)!

/* ─────────────────── counted, not read from a counter ───────────────────── */

describe('the figures are counts, not a stored counter', () => {
  it('READS NO `used` COLUMN from usage_records', () => {
    /*
     * The defect this screen was one decision away from shipping. The table
     * has a `used` column and it looked like the obvious source; grepping for
     * its writers found NONE, so every row in it came from a seed. Reading it
     * would have reported figures that are not usage — stale where rows exist
     * and blank where they do not, with the blank indistinguishable from a
     * shop that has genuinely used nothing.
     */
    const source = code(READS)
    const query = source.slice(
      source.indexOf('export async function adminListUsage'),
      source.indexOf('export async function adminListUsage') + 2200,
    )
    expect(query.length).toBeGreaterThan(100) // positive control
    expect(query).not.toContain('usageRecords')
    expect(query).toContain('.from(schema.listings)')
    /*
     * It also asserted `.from(schema.aiGenerations)`. That query went with the
     * AI meter (D95) — not because counting was wrong, but because there is
     * nothing left to count. What the rule is about survives in the line
     * above: the figures come from the rows that ARE the usage.
     */
  })

  it('CONFIRMS NOTHING IN THE PRODUCT WRITES THAT COUNTER', () => {
    /*
     * The claim above rests on a grep, so the grep is the test. If something
     * starts maintaining usage_records, this goes red and the screen should be
     * reconsidered — reading a counter that is kept current is the better
     * answer, and this is what would tell anyone that it had become available.
     */
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next') continue
        const path = posixJoin(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(path)) files.push(path)
      }
    }
    for (const root of ['app', 'domain', 'lib']) walk(root)

    const writers = files.filter((file) => {
      const source = code(file)
      return /\.(insert|update)\(\s*schema\.usageRecords/.test(source)
    })
    expect(writers).toEqual([])
  })

  it('says on the page that the figures are counted', () => {
    // Not a footnote: a reader who assumes these came from a billing counter
    // will trust them differently from one who knows they were counted now.
    expect(readFileSync(PAGE, 'utf8')).toMatch(/These figures are counts/i)
  })
})

/* ───────────────────── the limits are not restated ───────────────────────── */

describe('limits come from the plan (D46)', () => {
  it('RESTATES NO LIMIT as a literal, in the model or on the page', () => {
    /*
     * Matched as a number followed by its unit rather than as a digit run —
     * a bare digit sweep flags arithmetic, which cost a round in the
     * subscriptions step.
     */
    for (const file of [MODEL, PAGE]) {
      const source = code(file)
      for (const plan of PLANS) {
        // One metric now. `[plan.limits.aiGenerations, 'generations']` was the
        // second pair, and D95 removed the limit it read.
        for (const [value, unit] of [[plan.limits.listings, 'listings']] as const) {
          if (value === 0) continue
          const spellings = [String(value), value.toLocaleString('en-US')].join('|')
          expect(source, `${file} :: ${plan.key} ${value}`).not.toMatch(
            new RegExp(`(${spellings})\\s*(${unit})`, 'i'),
          )
        }
      }
    }
  })

  it('measures each meter against the plan’s own figure', () => {
    const entry = assessUsage(row({ plan: 'SOLO' }), NOW)
    expect(meterFor(entry, 'listings').meter.limit).toBe(limitFor('SOLO', 'listings'))
    expect(entry.meters.map((m) => m.meter.metric)).toEqual(['listings'])
  })

  it('builds the meters from the SELLER’s model, not a second one', () => {
    // buildMeters carries `pauses` and `continues` with the limit, which is
    // what stops the operator screen paraphrasing a boundary as a punishment.
    /*
     * The VALUE import, not the path. Mutation-tested: replacing the import
     * with `import type { … }` plus a locally defined buildMeters left the
     * path assertion green, because a type-only import from the same module
     * contains the same string. What is actually required is that the
     * function comes from there.
     */
    expect(code(MODEL)).toMatch(/import \{\s*buildMeters[^}]*\}\s*from '@\/domain\/billing\/usage'/)
    expect(code(MODEL)).toContain('buildMeters({')
  })
})

/* ─────────────────── D37: a boundary, not a penalty ──────────────────────── */

describe('a quota reads as a boundary, not a fine (D37)', () => {
  it('CARRIES WHAT CONTINUES, not only what pauses', () => {
    const entry = assessUsage(row({ plan: 'SOLO', activeListings: solo.limits.listings + 5 }), NOW)
    const listings = meterFor(entry, 'listings')
    expect(listings.band).toBe('OVER')
    expect(listings.meter.pauses.length).toBeGreaterThan(0)
    expect(listings.meter.continues.length).toBeGreaterThan(0)
    // The sentence that does the work: nothing is removed.
    expect(listings.meter.continues).toMatch(/nothing is removed|unaffected/i)
  })

  it('RENDERS BOTH HALVES when a meter is at or over its limit', () => {
    const source = code(PAGE)
    const both = source.indexOf('{meter.pauses}')
    expect(both).toBeGreaterThan(-1)
    // On the same line, so one cannot be rendered without the other.
    const line = source.slice(both - 120, both + 120)
    expect(line).toContain('{meter.continues}')
  })

  /*
   * ── TWO TESTS ABOUT GENERATIONS WERE HERE, AND BOTH ARE GONE ────────────
   *
   * 'states that a failed generation is never counted, and why structurally'
   * read db/schema's ai_generations.status — DRAFT | ACCEPTED | REJECTED,
   * with no failure state, so a generation that failed left no row to count —
   * and 'counts a REJECTED draft, because it spent the allowance' held the
   * other direction. Both asserted copy on a screen that no longer prints it,
   * against a query that no longer runs (D95).
   *
   * The ai_generations table is still in the schema and will stay: an applied
   * migration is never edited. Nothing counts it, and nothing on this screen
   * mentions it, which is what tests/unit/egress-boundary.test.ts asserts
   * from the other side — no code may insert into it either.
   *
   * The second one also recorded a lesson worth keeping where it is cheap to
   * keep: a guard about ONE query has to be asked of that query. Written as a
   * file-wide sweep, it went red on the AI-activity screen legitimately
   * GROUPING by status. The two assertions above still slice
   * adminListUsage out of the repository file for exactly that reason.
   */
})

/* ────────────────────────────── the bands ───────────────────────────────── */

describe('bands are exact at their edges', () => {
  it('separates OVER from AT_LIMIT', () => {
    expect(bandFor(11, 10)).toBe('OVER')
    expect(bandFor(10, 10)).toBe('AT_LIMIT')
  })

  it(`is NEAR at exactly ${NEAR_THRESHOLD * 100}% and UNDER just below it`, () => {
    expect(bandFor(80, 100)).toBe('NEAR')
    expect(bandFor(79, 100)).toBe('UNDER')
  })

  it('TREATS A LIMIT OF ZERO AS "not offered", never as a cap of nought', () => {
    /*
     * Free connects no shop, so it manages no listings. Banding that as OVER
     * would put every free account on a list headed "past their limit", for a
     * capability the plan never offered.
     */
    expect(free.limits.listings).toBe(0)
    expect(bandFor(0, 0)).toBe('NOT_OFFERED')
    expect(bandFor(12, 0)).toBe('NOT_OFFERED')

    const entry = assessUsage(row({ plan: 'FREE', activeListings: 12 }), NOW)
    expect(meterFor(entry, 'listings').band).toBe('NOT_OFFERED')
  })

  it('has copy for every band and an order covering them all', () => {
    expect(new Set(BAND_ORDER)).toEqual(new Set(Object.keys(BAND_COPY)))
    for (const band of BAND_ORDER) {
      expect(BAND_COPY[band].detail.length, band).toBeGreaterThan(20)
    }
  })

  it('renders a NOT_OFFERED meter with no denominator', () => {
    // "0 / 0" reads as a shop sitting exactly at its cap. The seller's own
    // sidebar meter already makes this distinction.
    expect(code(PAGE)).toContain('meter.limit === 0')
  })
})

/* ────────────────────────── the summaries ────────────────────────────────── */

describe('the summary counts every band, including the empty ones', () => {
  it('SHOWS A ZERO rather than omitting the band', () => {
    const counted = countByBand([assessUsage(row(), NOW)], 'listings')
    expect(counted.map((entry) => entry.band)).toEqual([...BAND_ORDER])
    expect(counted.find((entry) => entry.band === 'OVER')?.count.value).toBe(0)
    expect(counted.find((entry) => entry.band === 'UNDER')?.count.value).toBe(1)
  })

  it('counts an empty platform as every band at zero, not as an empty list', () => {
    expect(countByBand([], 'listings').length).toBe(BAND_ORDER.length)
  })

  it('counts the one metric there is, and names it in the provenance', () => {
    /*
     * 'counts the two metrics independently' — a shop over its listing cap
     * with one AI generation had to be OVER on one meter and UNDER on the
     * other. There is one meter now, so independence is not a property this
     * can have; what is still worth asserting is that the count says which
     * meter it counted, because every operator figure must carry where it
     * came from.
     */
    const entry = row({ plan: 'SOLO', activeListings: solo.limits.listings + 1 })
    const assessed = [assessUsage(entry, NOW)]
    const over = countByBand(assessed, 'listings').find((b) => b.band === 'OVER')!
    expect(over.count.value).toBe(1)
    expect(over.count.provenance.methodology).toMatch(/active listing meter/i)
  })
})

/* ──────────────── an account with no plan is not on Free ─────────────────── */

describe('a shop with no billing record is measured against nothing (D34)', () => {
  it('RESOLVES TO NO PLAN rather than falling through to FREE', () => {
    expect(planInForce(null)).toBeNull()
    expect(planInForce('ENTERPRISE')).toBeNull()
    expect(planInForce('SOLO')).toBe('SOLO')
  })

  it('produces NO METERS for it, rather than meters against a plan it lacks', () => {
    const entry = assessUsage(row({ plan: null, activeListings: 5000 }), NOW)
    expect(entry.plan).toBeNull()
    expect(entry.meters).toEqual([])
  })

  it('is listed separately, so it is not silently absent', () => {
    const rows = [assessUsage(row({ plan: null }), NOW), assessUsage(row({ shopId: 's2' }), NOW)]
    expect(unmeasurable(rows).map((entry) => entry.row.shopId)).toEqual(['shop-1'])
  })

  it('never appears on the at-or-over list, having no limit to exceed', () => {
    const rows = [assessUsage(row({ plan: null, activeListings: 99999 }), NOW)]
    expect(atOrOverLimit(rows)).toEqual([])
  })
})

/* ──────────────────────── at, over, or near ──────────────────────────────── */

describe('the pressing list', () => {
  it('includes OVER, AT_LIMIT and NEAR, and nothing else', () => {
    const rows = [
      assessUsage(row({ shopId: 'over', plan: 'SOLO', activeListings: solo.limits.listings + 1 }), NOW),
      assessUsage(row({ shopId: 'at', plan: 'SOLO', activeListings: solo.limits.listings }), NOW),
      assessUsage(row({ shopId: 'near', plan: 'SOLO', activeListings: Math.ceil(solo.limits.listings * 0.9) }), NOW),
      assessUsage(row({ shopId: 'under', plan: 'SOLO', activeListings: 1 }), NOW),
    ]
    expect(atOrOverLimit(rows).map((entry) => entry.row.shopId)).toEqual(['over', 'at', 'near'])
  })

  it('EXCLUDES a NOT_OFFERED meter, however dramatic it looks', () => {
    /*
     * A Free account with listings has not exceeded an allowance — the plan
     * never offered one. Filing it under "over limit" would send an operator
     * to tell a seller they are over a cap that does not exist.
     */
    const rows = [assessUsage(row({ plan: 'FREE', activeListings: 500 }), NOW)]
    expect(atOrOverLimit(rows)).toEqual([])

    /*
     * The converse used to be asserted on the second meter: the same Free
     * shop, also at its AI allowance, had to appear exactly once — because a
     * filter that excluded the whole SHOP rather than the one METER would be
     * worse than the bug. With one meter per shop that distinction cannot be
     * drawn from a fixture, so it is drawn from a plan that offers the
     * capability: Solo at its listing cap is on the list, which is what makes
     * the exclusion above about NOT_OFFERED rather than about Free.
     */
    const onAPlanThatOffersIt = [
      assessUsage(row({ plan: 'SOLO', activeListings: solo.limits.listings }), NOW),
    ]
    expect(atOrOverLimit(onAPlanThatOffersIt).length).toBe(1)
  })
})

/* ──────────────────────── the reset date ─────────────────────────────────── */

/*
 * firstOfNextMonth() HAD THREE ASSERTIONS HERE, AND NOTHING LEFT CALLS IT.
 *
 * They pinned the first of next month, UTC and unzoned (D24), including the
 * December roll-over — the date the AI generation allowance reset. D95 removed
 * the allowance, the function went with it (domain/admin/usage.ts says where),
 * and a test for a function nobody calls is a test that keeps dead code alive.
 *
 * The one meter left is a capacity: `UsageMeter.resetsOn` is null for it, and
 * tests/unit/billing.test.ts asserts that.
 */

/* ────────────────────── the page is gated and read-only ──────────────────── */

describe('the screen is gated, read-only, and resets nothing', () => {
  it('gates itself on usage.view', () => {
    expect(code(PAGE)).toContain("requireAdmin('usage.view')")
  })

  it('is offered in the navigation behind the same key', () => {
    const item = OPERATOR_NAV.flatMap((group) => group.items).find(
      (entry) => entry.href === '/admin/usage',
    )
    expect(item?.gate).toEqual({ kind: 'permission', key: 'usage.view' })
  })

  it('CONTAINS NO CONTROL — no reset, no top-up, no exemption', () => {
    const source = code(PAGE)
    for (const control of ['<form', '<button', '<input', 'action=', "'use server'", 'onClick']) {
      expect(source, control).not.toContain(control)
    }
  })

  it('says what it cannot do, naming the foreclosed request by name', () => {
    // "Reset this seller's quota" is the first entry on D94a's foreclosed
    // list, and it is the most plausible support request on this screen.
    expect(readFileSync(PAGE, 'utf8')).toMatch(/No quota reset, no top-up/i)
  })

  it('reads no seller content, only counts of it', () => {
    const source = code(PAGE)
    for (const content of ['title', 'description', 'tags', 'output', 'input']) {
      expect(source, content).not.toContain(`.${content}`)
    }
  })
})
