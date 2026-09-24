import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import {
  ONBOARDING_CAVEAT,
  ONBOARDING_STATES,
  onboardingFunnel,
  planDistribution,
  shopBreakdown,
  signupSeries,
  trialConversion,
  type MetricsInput,
} from '@/domain/admin/metrics'
import { PLANS } from '@/domain/billing/plans'
import { PERMISSIONS, can } from '@/domain/admin/roles'
import { PERMISSION_LABELS } from '@/domain/admin/permissions'
import { OPERATOR_NAV } from '@/domain/admin/navigation'

/*
 * PLATFORM GROWTH METRICS.
 *
 * The screen's defining constraint is what it CANNOT contain. A metrics page
 * that named an account would be read as a leaderboard of sellers, so the
 * guarantee is structural: nothing reaches it that could name one.
 *
 * The other two risks are both about a figure claiming more than it knows —
 * a funnel over a column nothing writes, and a "conversion rate" over a
 * denominator that cannot be known. Both are computed honestly and both say
 * what they are.
 *
 * Comments are stripped, and the sweeps match a shape rather than a word.
 */

const PAGE = 'app/(admin)/admin/metrics/page.tsx'
const MODEL = 'domain/admin/metrics.ts'
const READS = 'lib/repositories/admin-reads-every-shop.ts'

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/**
 * One exported function's body, bounded at the next `export` rather than by a
 * character count.
 *
 * The first draft sliced a fixed 4200 characters and ran past the end of
 * adminReadMetrics into the next function — which legitimately selects an
 * address — so a sweep about THIS query failed on a different one. The same
 * imprecision as an unbounded indexOf, which this build has now hit five
 * times.
 */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`)
  expect(start, name).toBeGreaterThan(-1)
  const next = source.indexOf('\nexport ', start + 1)
  return source.slice(start, next === -1 ? source.length : next)
}

const NOW = new Date('2026-09-23T12:00:00Z')

function input(overrides: Partial<MetricsInput> = {}): MetricsInput {
  return {
    totalAccounts: 100,
    signupsByMonth: [{ month: '2026-09', count: 10 }],
    onboardingCounts: [{ state: 'NOT_STARTED', count: 100 }],
    connectedShops: 40,
    demoShops: 30,
    shopsWithNoConnection: 30,
    totalShops: 100,
    planCounts: [{ plan: 'SOLO', count: 60 }],
    everTrialed: 20,
    trialedAndPaying: 5,
    paying: 50,
    ...overrides,
  }
}

/* ──────────────────── the new permission behaves like the last ───────────── */

describe('metrics.view is an ordinary grantable permission', () => {
  it('is in PERMISSIONS and has a label', () => {
    expect(PERMISSIONS as readonly string[]).toContain('metrics.view')
    expect(PERMISSION_LABELS['metrics.view'].title).toBe('Growth metrics')
  })

  it('is TICKED for SUPER_ADMIN and ADMIN, UNTICKED for MANAGER', () => {
    expect(can('SUPER_ADMIN', 'metrics.view')).toBe(true)
    expect(can('ADMIN', 'metrics.view')).toBe(true)
    expect(can('MANAGER', 'metrics.view')).toBe(false)
    expect(can('USER', 'metrics.view')).toBe(false)
  })

  it('DOES NOT TOUCH THE TWO NON-DELEGATABLE CAPABILITIES', () => {
    // Those are about covering your tracks (D91); this is not one of them.
    const source = code('domain/admin/roles.ts')
    expect(source).toContain("export const SUPER_ADMIN_ONLY = ['audit.view', 'roles.write']")
    const permissions = source.slice(
      source.indexOf('export const PERMISSIONS'),
      source.indexOf('export type Permission'),
    )
    expect(permissions).not.toContain('roles.write')
    expect(permissions).not.toContain('audit.view')
  })

  it('is granted by a migration, to ADMIN only', () => {
    const migration = readFileSync(
      'db/migrations/0007_grant_metrics_view.sql',
      'utf8',
    ).replace(/--.*$/gm, '')
    expect(migration).toContain("'metrics.view'")
    expect(migration).toContain("WHERE \"role\" = 'ADMIN'")
    expect(migration).not.toContain('MANAGER')
    // Additive only, and it cannot overwrite an edited matrix.
    expect(migration).not.toContain('ALTER TABLE')
    expect(migration).toContain('NOT (')
  })
})

/* ───────────────────────── nobody is named ──────────────────────────────── */

describe('no account can be named on this screen', () => {
  it('HAS NO FIELD A NAME COULD OCCUPY, anywhere in the view model', () => {
    /*
     * The structural guarantee. A page that merely declines to render a name
     * could start rendering one; a model with nowhere to put it cannot without
     * the change being visible in the diff.
     */
    const model = code(MODEL)
    for (const field of ['email', 'name:', 'shopName', 'userId', 'accountId', 'ownerEmail']) {
      expect(model, field).not.toContain(field)
    }
  })

  it('SELECTS NO IDENTIFYING COLUMN in the metrics query', () => {
    /*
     * Scoped to the SELECT blocks, not to the whole function. `users.id`
     * appears as a JOIN KEY — you cannot join subscriptions to users without
     * naming the key — and a join key carries nothing into the result. The
     * claim is about what comes BACK, so the sweep is about what is selected.
     */
    const query = functionBody(code(READS), 'adminReadMetrics')
    expect(query.length).toBeGreaterThan(400) // positive control

    const selects = [...query.matchAll(/\.select\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]!)
    expect(selects.length, 'no select found to check').toBeGreaterThan(2)

    for (const select of selects) {
      for (const column of [
        'users.email',
        'users.name',
        'users.displayName',
        'users.id',
        'shops.name',
        'shops.id',
        'shops.ownerId',
      ]) {
        expect(select, `${column} in select(${select.slice(0, 60)}…)`).not.toContain(column)
      }
    }
  })

  it('renders no identifying field on the page either', () => {
    const page = code(PAGE)
    for (const field of ['.email', '.ownerEmail', '.shopName', '.userId']) {
      expect(page, field).not.toContain(field)
    }
  })

  it('FINDS THOSE COLUMNS WHERE THEY REALLY ARE', () => {
    // Positive control for the sweeps above.
    const source = code(READS)
    expect(source).toContain('schema.users.email')
    expect(source).toContain('schema.shops.name')
  })

  it('says on the page that it names nobody, and where to go instead', () => {
    const prose = readFileSync(PAGE, 'utf8').replace(/\s+/g, ' ')
    expect(prose).toMatch(/no account is named here and none can be/i)
    expect(prose).toMatch(/that is what the accounts list is for/i)
  })
})

/* ─────────────────── the funnel reports a column, and says so ────────────── */

describe('the onboarding funnel is honest about its source', () => {
  it('CONFIRMS NOTHING IN THE PRODUCT WRITES THAT COLUMN', () => {
    /*
     * The caveat rests on a grep, so the grep is the test. If something starts
     * maintaining onboarding_state this goes red, and the caveat should come
     * off — which is what would tell anybody it had become true.
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
      return /onboardingState\s*:/.test(source) && /\.(insert|update|values)\(/.test(source)
    })
    // provision.ts sets it once, at creation, which is the default — anything
    // else writing it would mean the funnel had become a measurement.
    expect(writers.filter((file) => !file.includes('provision'))).toEqual([])
  })

  it('SAYS SO ON THE SCREEN rather than presenting it plain', () => {
    expect(ONBOARDING_CAVEAT).toMatch(/not maintained/i)
    expect(ONBOARDING_CAVEAT).toMatch(/not a measurement/i)
    expect(code(PAGE)).toContain('{ONBOARDING_CAVEAT}')
  })

  it('lists every state, including the ones at zero, plus an unknown bucket', () => {
    const funnel = onboardingFunnel(input({ onboardingCounts: [] }))
    expect(funnel.map((bucket) => bucket.key)).toEqual([...ONBOARDING_STATES, 'UNKNOWN'])
    expect(funnel.every((bucket) => bucket.count.value === 0)).toBe(true)
  })

  it('COUNTS AN UNRECOGNISED STATE rather than dropping it', () => {
    // Dropping it would make the buckets add up to less than the account
    // total with nothing on screen to explain the gap.
    const funnel = onboardingFunnel(
      input({
        totalAccounts: 10,
        onboardingCounts: [
          { state: 'NOT_STARTED', count: 7 },
          { state: 'ABANDONED', count: 3 },
        ],
      }),
    )
    expect(funnel.find((bucket) => bucket.key === 'UNKNOWN')?.count.value).toBe(3)
    expect(funnel.reduce((total, bucket) => total + (bucket.count.value ?? 0), 0)).toBe(10)
  })
})

/* ─────────────────────── shares of nothing ──────────────────────────────── */

describe('a share of nothing is not zero (D34)', () => {
  it('RETURNS NULL rather than 0% when there is nothing to take a share of', () => {
    const funnel = onboardingFunnel(input({ totalAccounts: 0, onboardingCounts: [] }))
    for (const bucket of funnel) {
      expect(bucket.percent, bucket.key).toBeNull()
    }
  })

  it('renders the null as a dash with a reason, never as a nought', () => {
    const page = readFileSync(PAGE, 'utf8')
    expect(page).toMatch(/no share, because there is nothing to take a share of/i)
  })

  it('still reports a genuine zero share', () => {
    // The converse: an honest 0% must stay reachable, or "no share" would be
    // hiding a real finding.
    const funnel = onboardingFunnel(
      input({ totalAccounts: 100, onboardingCounts: [{ state: 'COMPLETE', count: 0 }] }),
    )
    expect(funnel.find((bucket) => bucket.key === 'COMPLETE')?.percent).toBe(0)
  })
})

/* ───────────────────────── shops and plans ──────────────────────────────── */

describe('a demo shop is neither connected nor unconnected', () => {
  it('COUNTS IT IN ITS OWN BUCKET', () => {
    const shops = shopBreakdown(input())
    expect(shops.map((bucket) => bucket.key)).toEqual(['CONNECTED', 'NOT_CONNECTED', 'DEMO'])
    expect(shops.find((bucket) => bucket.key === 'DEMO')?.count.value).toBe(30)
  })

  it('EXCLUDES DEMO SHOPS FROM THE CONNECTED COUNT in the query', () => {
    /*
     * The figure this screen exists to report is how many REAL shops are
     * connected. A demo shop has no Etsy behind it by design, and counting it
     * as connected would overstate that by the size of the demo population.
     */
    /*
     * Asked of the CONNECTED filter specifically, not of the function.
     * MUTATION-TESTED: removing the demo exclusion from `connected` left a
     * substring check green, because the `unconnected` filter contains the
     * same clause. The sixth time in this build that a sweep has matched the
     * right string in the wrong place.
     */
    const query = functionBody(code(READS), 'adminReadMetrics')
    const connected = query.slice(query.indexOf('connected: sql'), query.indexOf('unconnected: sql'))
    expect(connected.length, 'connected filter not found').toBeGreaterThan(50)
    expect(connected).toContain('not ${schema.shops.isDemo}')
    expect(connected).toContain('${schema.etsyConnections.shopId} is not null')
    expect(connected).toContain('${schema.etsyConnections.revokedAt} is null')
  })
})

describe('the plan mix covers every plan and the accounts with no record', () => {
  it('lists every plan in PLANS, plus NO_RECORD', () => {
    const plans = planDistribution(input({ planCounts: [] }))
    expect(plans.map((bucket) => bucket.key)).toEqual([...PLANS.map((p) => p.key), 'NO_RECORD'])
  })

  it('does not fold "no billing record" into the free tier', () => {
    const plans = planDistribution(
      input({ totalAccounts: 10, planCounts: [{ plan: null, count: 4 }, { plan: 'FREE', count: 6 }] }),
    )
    expect(plans.find((bucket) => bucket.key === 'FREE')?.count.value).toBe(6)
    expect(plans.find((bucket) => bucket.key === 'NO_RECORD')?.count.value).toBe(4)
  })
})

/* ──────────────────────── trial conversion ─────────────────────────────── */

describe('trial conversion says what it can and cannot know', () => {
  it('COMPUTES OVER VISIBLE TRIALS, not over everyone who ever trialled', () => {
    const rate = trialConversion(input({ everTrialed: 20, trialedAndPaying: 5, paying: 50 }))
    expect(rate.value).toBe(25)
  })

  it('CARRIES THE LIMITATION, because it is not a true conversion rate', () => {
    /*
     * A subscription row carries its current status, not its history, so an
     * account that trialled and converted long ago is indistinguishable from
     * one that never trialled. Reporting this as "conversion" without saying
     * so would be the most quietly wrong number on the screen.
     */
    const rate = trialConversion(input())
    expect(rate.provenance.limitations?.join(' ')).toMatch(/not a true conversion rate/i)
    expect(rate.provenance.limitations?.join(' ')).toMatch(/current status, not its history/i)
  })

  it('carries the coverage against the paying population', () => {
    const rate = trialConversion(input({ everTrialed: 20, trialedAndPaying: 5, paying: 50 }))
    expect(rate.provenance.coverage).toBe(40)
  })

  it('IS UNAVAILABLE, NOT ZERO, when no trial is visible', () => {
    const rate = trialConversion(input({ everTrialed: 0, trialedAndPaying: 0, paying: 10 }))
    expect(rate.provenance.type).toBe('UNAVAILABLE')
    expect(rate.value).toBeNull()
  })

  it('reports a genuine zero when trials exist and none converted', () => {
    const rate = trialConversion(input({ everTrialed: 8, trialedAndPaying: 0, paying: 10 }))
    expect(rate.provenance.type).toBe('CALCULATED')
    expect(rate.value).toBe(0)
  })

  it('IS NEVER VERIFIED, because a ratio is a formula over inputs', () => {
    expect(trialConversion(input()).provenance.type).not.toBe('VERIFIED')
  })
})

/* ────────────────────────── the signup series ───────────────────────────── */

describe('the signup series plots a zero month as zero, not as a gap', () => {
  it('FILLS A MISSING MONTH WITH ZERO, because the month was observed', () => {
    /*
     * The chart breaks its line at null, which means "not observed". A month
     * inside the window we queried that had no signups WAS observed and
     * measured nought — breaking the line there would draw a gap where there
     * is a fact.
     */
    const series = signupSeries(input({ signupsByMonth: [{ month: '2026-09', count: 4 }] }), 3, NOW)
    expect(series).toEqual([
      { month: '2026-07', value: 0 },
      { month: '2026-08', value: 0 },
      { month: '2026-09', value: 4 },
    ])
    expect(series.every((point) => point.value !== null)).toBe(true)
  })

  it('rolls the year backwards in January', () => {
    const series = signupSeries(input({ signupsByMonth: [] }), 3, new Date('2026-01-15T00:00:00Z'))
    expect(series.map((point) => point.month)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('returns exactly the requested number of months, oldest first', () => {
    const series = signupSeries(input({ signupsByMonth: [] }), 12, NOW)
    expect(series).toHaveLength(12)
    expect(series[0]!.month).toBe('2025-10')
    expect(series[11]!.month).toBe('2026-09')
  })
})

/* ───────────────────────── the chart is shared, the claim is not ─────────── */

describe('the chart is the seller app’s, and its claim is not', () => {
  it('REUSES MonthlySeriesChart rather than adding a library', () => {
    expect(code(PAGE)).toContain("from '@/components/charts/monthly-series'")
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
    for (const library of ['recharts', 'chart.js', 'd3', 'victory', 'nivo']) {
      expect(Object.keys(packageJson.dependencies ?? {}), library).not.toContain(library)
    }
  })

  it('CLAIMS NOTHING ABOUT MODELLING, which the demand chart legitimately does', () => {
    /*
     * The reason the drawing was extracted rather than the component reused:
     * DemandChart's caption says "Indexed, modelled monthly", which is true of
     * demand and false of a count. A shared component carrying that copy would
     * have put "modelled" on a figure somebody counted.
     */
    const shared = code('components/charts/monthly-series.tsx')
    for (const claim of ['modelled', 'Indexed', 'demand']) {
      expect(shared, claim).not.toContain(claim)
    }
    const page = readFileSync(PAGE, 'utf8')
    expect(page).toMatch(/Counted, not modelled/i)
  })

  it('leaves the demand chart saying exactly what it said before', () => {
    const demand = readFileSync('components/research/demand-chart.tsx', 'utf8')
    expect(demand).toContain('Indexed, modelled monthly.')
    expect(demand).toMatch(/months of modelled demand for/)
  })

  it('draws one chart, not four', () => {
    // A funnel of four numbers and a plan mix of four say the same thing with
    // more ink and one more thing to misread.
    const page = code(PAGE)
    expect((page.match(/<MonthlySeriesChart/g) ?? []).length).toBe(1)
  })
})

/* ──────────────────── the page is gated and read-only ───────────────────── */

describe('the screen is gated, read-only, and forecasts nothing', () => {
  it('gates itself on metrics.view', () => {
    expect(code(PAGE)).toContain("requireAdmin('metrics.view')")
  })

  it('is offered in the navigation behind the same key', () => {
    const item = OPERATOR_NAV.flatMap((group) => group.items).find(
      (entry) => entry.href === '/admin/metrics',
    )
    expect(item?.gate).toEqual({ kind: 'permission', key: 'metrics.view' })
  })

  it('CONTAINS NO CONTROL', () => {
    const source = code(PAGE)
    for (const control of ['<form', '<button', '<input', 'action=', "'use server'", 'onClick', 'href=']) {
      expect(source, control).not.toContain(control)
    }
  })

  it('INVENTS NO FORECAST', () => {
    /*
     * Every figure is a count of rows that exist over a stated window. A
     * projection or a fitted trend would be a modelled number on a screen of
     * counted ones, and nothing carries the provenance to say so.
     */
    /*
     * SHAPES, NOT WORDS — the fifteenth instance in this build of a guard
     * matching its own documentation. The page says, in words, "Nothing here
     * is a forecast", and a sweep for `forecast` fired on the sentence
     * promising there is none.
     *
     * What is forbidden is a forecast FIGURE: a field, a call, or a fitted
     * line. English prose about their absence has none of those shapes.
     */
    const source = code(MODEL) + code(PAGE)
    const FORECAST_SHAPES: [string, RegExp][] = [
      ['a forecast field or call', /\b(forecast|projection|projected|predicted|expected)\w*\s*[:(=]/i],
      ['a fitted trend', /\b(trendline|regression|extrapolat\w*|slope)\s*[:(=]/i],
      ['a target', /\btarget\s*[:=]/i],
    ]
    for (const [name, pattern] of FORECAST_SHAPES) {
      expect(source, name).not.toMatch(pattern)
    }
    const prose = readFileSync(PAGE, 'utf8').replace(/\s+/g, ' ')
    expect(prose).toMatch(/Nothing here is a forecast/i)
  })

  it('states its window rather than implying one', () => {
    expect(code(PAGE)).toContain('MONTHS')
    expect(code(PAGE)).toContain('last {MONTHS} months')
  })
})
