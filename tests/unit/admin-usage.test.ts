import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  BAND_COPY,
  BAND_ORDER,
  NEAR_THRESHOLD,
  assessUsage,
  atOrOverLimit,
  bandFor,
  countByBand,
  firstOfNextMonth,
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

const PAGE = join('app', '(admin)', 'admin', 'usage', 'page.tsx')
const MODEL = join('domain', 'admin', 'usage.ts')
const READS = join('lib', 'repositories', 'admin-reads-every-shop.ts')

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
    aiGenerationsThisMonth: 5,
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
    expect(query).toContain('.from(schema.aiGenerations)')
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
        const path = join(dir, entry)
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
        for (const [value, unit] of [
          [plan.limits.listings, 'listings'],
          [plan.limits.aiGenerations, 'AI generations|generations'],
        ] as const) {
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
    expect(meterFor(entry, 'aiGenerations').meter.limit).toBe(limitFor('SOLO', 'aiGenerations'))
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

  it('states that a failed generation is never counted, and why structurally', () => {
    /*
     * D37 by construction rather than by filter: ai_generations.status is
     * DRAFT | ACCEPTED | REJECTED with no failure state, so a generation that
     * failed leaves no row to count. Asserted against the schema, so this goes
     * red if a FAILED status is ever added without the screen being revisited.
     */
    const schema = readFileSync(join('db', 'schema', 'index.ts'), 'utf8')
    const table = schema.slice(
      schema.indexOf('export const aiGenerations'),
      schema.indexOf('export const aiGenerations') + 900,
    )
    expect(table).toContain('DRAFT | ACCEPTED | REJECTED')
    expect(table).not.toContain('FAILED')
    expect(readFileSync(PAGE, 'utf8')).toMatch(/failed AI generation is never counted/i)
  })

  it('counts a REJECTED draft, because it spent the allowance', () => {
    // The seller declined something that was produced. Excluding it would
    // understate what they used and overstate what is left.
    expect(readFileSync(PAGE, 'utf8')).toMatch(/rejected draft does count/i)
    expect(code(READS)).not.toContain("aiGenerations.status")
  })
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
    expect(counted.find((entry) => entry.band === 'OVER')?.count).toBe(0)
    expect(counted.find((entry) => entry.band === 'UNDER')?.count).toBe(1)
  })

  it('counts an empty platform as every band at zero, not as an empty list', () => {
    expect(countByBand([], 'listings').length).toBe(BAND_ORDER.length)
  })

  it('counts the two metrics independently', () => {
    const entry = row({
      plan: 'SOLO',
      activeListings: solo.limits.listings + 1,
      aiGenerationsThisMonth: 1,
    })
    const assessed = [assessUsage(entry, NOW)]
    expect(countByBand(assessed, 'listings').find((b) => b.band === 'OVER')?.count).toBe(1)
    expect(countByBand(assessed, 'aiGenerations').find((b) => b.band === 'OVER')?.count).toBe(0)
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
    const rows = [
      assessUsage(row({ plan: 'FREE', activeListings: 500, aiGenerationsThisMonth: 0 }), NOW),
    ]
    expect(atOrOverLimit(rows)).toEqual([])

    /*
     * The fixture matters and the first draft got it wrong: the default row
     * has five generations, which is exactly Free's monthly allowance, so the
     * shop was on the list for its AI meter and the assertion failed for the
     * right reason on the wrong meter. Pinned here so the next reader does not
     * repeat it — and the converse is asserted, because a filter that excluded
     * the whole shop rather than the one meter would be worse than the bug.
     */
    const alsoAtAiLimit = [
      assessUsage(
        row({ plan: 'FREE', activeListings: 500, aiGenerationsThisMonth: free.limits.aiGenerations }),
        NOW,
      ),
    ]
    expect(atOrOverLimit(alsoAtAiLimit).length).toBe(1)
  })
})

/* ──────────────────────── the reset date ─────────────────────────────────── */

describe('the monthly allowance resets on a calendar date', () => {
  it('is the first of next month, and never zoned (D24)', () => {
    expect(firstOfNextMonth(new Date('2026-09-23T23:59:00Z'))).toBe('2026-10-01')
    expect(firstOfNextMonth(new Date('2026-01-01T00:00:00Z'))).toBe('2026-02-01')
  })

  it('rolls the year over in December', () => {
    expect(firstOfNextMonth(new Date('2026-12-15T00:00:00Z'))).toBe('2027-01-01')
  })
})

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
