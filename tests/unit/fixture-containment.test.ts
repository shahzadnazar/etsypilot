import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   NO FIXTURE REACHES A REAL SELLER. EVERY DOMAIN FOLDER, EVERY SCREEN.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This guard started twice before, each time scoped to the slice in hand:
 * DEMO_COST_INPUTS across domain/costs, then fourteen symbols across
 * domain/action-center and domain/shop-pulse. Both went green while the same
 * class of defect sat one directory away. What a sweep does not cover, it
 * endorses.
 *
 * ── WHAT A LIVE SELLER WAS SEEING WHEN THIS FILE WAS WRITTEN ─────────────
 *
 * Measured in a browser on 7 Oct 2026, on an account with two listings, two
 * orders and no Etsy connection:
 *
 *   /settings/security   "Google sign-in — Connected as
 *                        salman@willowandfern.com", three active sessions in
 *                        Dhaka with Sign out buttons, and a failed sign-in —
 *                        under a header reading "Everything below is a true
 *                        description of this account".
 *   /settings/audit-log  eight immutable records by "Salman", including "AI
 *                        draft accepted, then published · Linen table runner ·
 *                        Reached Etsy: Yes · 1 of 1".
 *   /dashboard           "Gross sales $74.00 ▼ 99.6% vs baseline $20,287.00".
 *   /listings            a listing that lapsed 53 days ago labelled
 *                        "Expiring", and one lapsing in 3 days labelled
 *                        "Active" — both from a frozen clock.
 *   /analytics/experiments  "Price +8% on the linen range · 0 listings".
 *   /listings/change-history and /listings/ai-copilot: HTTP 500.
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 *
 * A figure-bearing symbol from the demo dataset may appear in exactly two
 * kinds of file: the dataset that defines it, and a module whose name is
 * `demo.ts` (or one named `-demo.ts`) which checks `isDemoMode()` itself. Everywhere
 * else is a fixture on a path to a real seller.
 */

/** Directories swept. Everything a seller's request can reach. */
const ROOTS = ['domain', 'app', 'components']

/**
 * The figure-bearing symbols. NOT the module.
 *
 * ── THE FIVE THIS LIST USED TO NAME AND EXCUSE ───────────────────────────
 *
 * It said: "PERIOD_START, PERIOD_END, PERIOD_DAYS, BASELINE_START,
 * BASELINE_END … the first five are the product's reporting window, which
 * every domain service legitimately imports. Banning the module would force
 * them somewhere else purely to get the guard green, which is how a guard
 * teaches people to route around it."
 *
 * The objection was right and the conclusion was wrong, and this is the first
 * time in this project a check named the defect beside the one it was testing
 * and argued itself out of covering it. There was a third option, already in
 * the tree: domain/clock.ts had taken `DEMO_NOW` — the constant sitting in the
 * same file, two lines away — and put it behind a function that checks the
 * mode. Neither banning the import nor permitting it; asking instead.
 *
 * What the excuse cost, measured on 12 October 2026 on a live shop with 87
 * synced orders running to the previous day: all six money screens reported on
 * 14 July to 12 August and counted 15 orders worth $830.00. Fifty-one orders
 * worth $3,843.80 were invisible. The dashboard printed "▲ 26.5% vs the period
 * before" from two windows that had both closed two months earlier.
 *
 * The five are now reached through `reportingWindow()`, `baselineWindow()` and
 * `previousWindow()` in domain/clock.ts, which derive them from `nowIso()` —
 * and in demo mode reproduce these exact constants, which is asserted in
 * tests/unit/reporting-window.test.ts. So they are ordinary fixtures here,
 * with no allowance, like everything else in this list.
 */
const FIXTURES = [
  // The reporting window. See the note above for why these took eleven months
  // to get into this list.
  'PERIOD_START',
  'PERIOD_END',
  'PERIOD_DAYS',
  'BASELINE_START',
  'BASELINE_END',
  // Two instants that were living in domain/ as bare literals until the sweep
  // that found the window: the audit's clock and the demo shop's stats import.
  'DEMO_AUDIT_NOW',
  'DEMO_STATS_IMPORT_AT',
  /*
   * The billing clock, the fourth frozen "now" in this product. It is
   * 2026-08-20 in lib/billing/mock.ts and domain/billing/service.ts read it as
   * `today` in every mode, so a live seller's proration was counted from
   * August. domain/billing/demo.ts is the one place it may be read.
   */
  'BILLING_NOW',
  'DEMO_EVENTS',
  'DEMO_COUNTS',
  'DEMO_COST_INPUTS',
  'DEMO_TOTALS',
  'DEMO_BASELINE',
  'DEMO_ACTOR_ID',
  'DEMO_NOW',
  'NARRATIVE',
  'buildDemoListings',
  'buildDemoOrders',
  'narrativeGroups',
  'demoConfirmedCosts',
  'demoUnmatchedOrderIds',
  'demoChangeJobs',
  'demoAuditRecords',
  'demoCostCoverage',
  'isEmptyDataset',
  'DEMO_LAST_SYNCED',
  'DEMO_GENERATIONS_USED',
  /*
   * DEMO_PLAN is in lib/billing/mock.ts now, which this sweep does not read —
   * the fixture lives with the fixture. It stays on this list so that moving
   * it back into domain/ fails here.
   */
  'DEMO_PLAN',
  'demoShops',
  'demoLists',
  'demoSyncState',
]

/**
 * Files allowed to name a fixture, each of which must check the mode itself.
 *
 * One per aggregate, and the naming is the point: a `demo.ts` beside the
 * service it serves is greppable,
 * and a reviewer asking "can the fixture reach a real shop" has one list to
 * read rather than a convention to trust.
 */
const ALLOWED = [
  'domain/action-center/demo.ts',
  'domain/audit/demo.ts',
  'domain/billing/demo.ts',
  'domain/connect/demo.ts',
  'domain/analytics/experiments-demo.ts',
  'domain/audit-log/demo.ts',
  'domain/change-history/demo.ts',
  'domain/clock.ts',
  'domain/costs/demo.ts',
  'domain/security/demo.ts',
  'domain/shop/demo.ts',
  'domain/shop-pulse/demo.ts',
]

/**
 * Known, reviewed and deliberately left.
 *
 * Not a convenience list. Each entry names a leak that is real, the screen it
 * reaches, and why it was not fixed in the sweep that found it — so the next
 * person reads a decision rather than an omission, and deleting the entry is
 * what closing it looks like.
 */
const KNOWN_REMAINING: { file: string; symbol: string; why: string }[] = [
  {
    file: 'app/api/billing/webhook/route.ts',
    symbol: 'DEMO_SHOP_ID',
    why:
      'Every verified billing webhook is applied to the demo shop id, because a ' +
      'provider event carries a customer reference and nothing maps one to a shop. ' +
      'Not a display leak — no seller screen reads it — but a correctness bug in ' +
      'billing, and the fix is a customer→shop mapping, which is its own slice. ' +
      'Today it is harmless only because no real subscription exists.',
  },
  {
    file: 'domain/research/service.ts',
    symbol: 'demoLists',
    why:
      'Keyword lists ("Autumn gifting", "Evergreen") are returned for every shop ' +
      'and shown as the seller\u2019s own saved lists on /research/keywords. Nothing ' +
      'stores a real one yet, so gating this means building keyword-list ' +
      'persistence — a table, a repository and a writer — which is the research ' +
      'slice rather than a line to delete. Ranked below the fixed leaks because a ' +
      'saved search term is scratch data: no money, no security claim, nothing a ' +
      'seller would act on believing it came from their shop.',
  },
  {
    file: 'domain/ai/service.ts',
    symbol: 'demoLists',
    why:
      'The same lists, read into the AI copilot as the generation\u2019s keyword ' +
      'source ("List: Autumn gifting"). The locked terms beside it — the demo ' +
      'shop\u2019s brand name and a material from its catalogue — WERE fixed in this ' +
      'sweep, because those reach the model and come back inside generated copy. ' +
      'The list name is displayed, not generated from, and goes with the research ' +
      'slice above.',
  },
  {
    file: 'domain/ai/service.ts',
    symbol: 'DEMO_GENERATIONS_USED',
    why:
      'The AI usage counter shown against the plan allowance is a constant, so a ' +
      'real seller sees a quota partly consumed by generations they never ran. ' +
      'Needs a usage table to fix, same shape as the keyword lists, and it is a ' +
      'number about their account rather than about their shop — which is why it ' +
      'ranks above the lists and below anything financial.',
  },
  {
    file: 'domain/connect/service.ts',
    symbol: 'demoSyncState',
    why:
      'A staged sync-progress animation (reading listings, then orders, with ' +
      'percentages) rendered on /settings/shops?sync=1 after a connect attempt. ' +
      'It is a progress display for a sync that is not actually being tracked, so ' +
      'replacing it needs the sync to report progress — the sync slice. Reachable ' +
      'only from a query parameter after an action the seller just took, which is ' +
      'why it is last: nothing is claimed about their data by it.',
  },
  {
    file: 'app/(dashboard)/settings/shops/page.tsx',
    symbol: 'demoSyncState',
    why:
      'The call site of the above. Listed separately so that fixing the service ' +
      'without fixing the page, or the reverse, cannot leave a green guard — the ' +
      'entry has to be deleted from both ends for this list to stay honest.',
  },
  {
    file: 'domain/admin/metrics.ts',
    symbol: 'demoShops',
    why:
      'The operator console\u2019s fleet metrics. Not a seller surface at all — it is ' +
      'behind the operator boundary, read by staff who know the deployment has no ' +
      'real fleet yet. Last by harm for that reason, and it closes when the ' +
      'operator console reads lib/repositories/admin-reads-every-shop.ts for all ' +
      'of its figures rather than most of them.',
  },
]

/**
 * Files that DEFINE a fixture rather than consume one.
 *
 * `domain/audit-log/demo-records.ts` exports `demoAuditRecords`; flagging it
 * for naming its own export would be the nineteenth instance of a guard
 * matching its own subject. They are datasets that happen to live beside a
 * domain, and the thing the sweep is about is who READS them.
 */
const DATASETS = ['domain/audit-log/demo-records.ts', 'domain/change-history/demo-jobs.ts']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((root) => walk(root)).sort()

describe('no demo fixture is reachable from a live seller screen', () => {
  it('sweeps every domain folder, not just the ones a slice touched', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(files.length).toBeGreaterThan(150)
    const domains = new Set(
      files.filter((f) => f.startsWith('domain/')).map((f) => f.split('/')[1]),
    )
    // Every aggregate that exists, so adding one cannot quietly go unswept.
    expect(domains.size).toBeGreaterThan(15)
    for (const allowed of ALLOWED) {
      expect(files, `${allowed} is missing`).toContain(allowed)
    }
  })

  it('finds no fixture outside the demo modules', () => {
    const known = new Set(KNOWN_REMAINING.map((k) => `${k.file} → ${k.symbol}`))
    const offenders: string[] = []

    for (const file of files) {
      if (ALLOWED.includes(file) || DATASETS.includes(file)) continue
      const source = code(file)
      for (const fixture of FIXTURES) {
        if (!new RegExp(`\\b${fixture}\\b`).test(source)) continue
        const entry = `${file} → ${fixture}`
        if (!known.has(entry)) offenders.push(entry)
      }
    }

    expect(offenders, 'a demo fixture is on a live path').toEqual([])
  })

  it('and every allowed module checks the mode itself', () => {
    for (const allowed of ALLOWED) {
      expect(code(allowed), `${allowed} does not check the mode`).toMatch(/isDemoMode\(\)/)
    }
  })

  it('and each allowed module is actually serving a fixture', () => {
    /*
     * The positive control. An allowlist entry that names no fixture is a line
     * nobody needs, and more importantly it means the sweep above is measuring
     * deletion rather than containment — the shape where a guard passes
     * because the thing it watches is gone.
     */
    const idle = ALLOWED.filter(
      (f) => !FIXTURES.some((x) => new RegExp(`\\b${x}\\b`).test(code(f))),
    )
    expect(idle, 'an allowlisted module serves no fixture').toEqual([])
  })

  it('and every known-remaining entry is still true', () => {
    /*
     * A deliberate exception has to stay a real one. If somebody fixes a leak
     * and leaves its entry here, the next reader is told a defect exists that
     * does not — and the list stops being worth reading.
     */
    for (const known of KNOWN_REMAINING) {
      expect(
        code(known.file),
        `${known.file} no longer uses ${known.symbol}; delete its KNOWN_REMAINING entry`,
      ).toMatch(new RegExp(`\\b${known.symbol}\\b`))
      expect(known.why.length, `${known.file} has no reason recorded`).toBeGreaterThan(80)
    }
  })
})

describe('nothing asks the Etsy adapter for a catalogue it may not have', () => {
  /*
   * ── THE OTHER HALF OF THE SAME SWEEP ──────────────────────────────────
   *
   * Two screens returned HTTP 500 to a live seller — /listings/change-history
   * and /listings/ai-copilot — because their services called
   * `etsy.getListings(...)` directly, and the live adapter throws
   * ETSY_NOT_CONFIGURED without an API key. It is the same defect wearing
   * different clothes: a path that works only because the mock is answering.
   *
   * Domain services read through `loadListings` / `loadOrders`, which branch
   * on the data source. The adapter is for the sync and the mode selector.
   */
  const ALLOWED_ADAPTER_CALLERS = [
    // The sync IS the thing that talks to Etsy.
    'domain/sync/listings.ts',
    'domain/sync/orders.ts',
    // The loaders, which is where the branch lives.
    'domain/listings/load.ts',
    'domain/orders/load.ts',
    // Connection management and the mode-dependent shell.
    'domain/sync/source.ts',
  ]

  it('calls getListings only from the sync and the loaders', () => {
    const offenders = files.filter(
      (file) =>
        !ALLOWED_ADAPTER_CALLERS.includes(file) &&
        /\.getListings\s*\(/.test(code(file)) &&
        /getEtsyService\s*\(/.test(code(file)),
    )
    expect(offenders, 'a screen asks the adapter for a catalogue directly').toEqual([])
  })
})

describe('no authored instant stands in for the clock', () => {
  /*
   * ── THE RULE THE SYMBOL SWEEP ABOVE CANNOT EXPRESS ────────────────────
   *
   * A frozen moment does not have to arrive by import. Four of them were
   * written out by hand in domain/, each one past its own sell-by date:
   *
   *   domain/audit/rules.ts       AUDIT_NOW = '2026-08-20T00:00:00.000Z',
   *                               used with no mode check, so on 12 October a
   *                               live shop's audit flagged a listing that had
   *                               renewed on 22 August as "Renews within 7
   *                               days" and said nothing about one renewing on
   *                               16 October. Inverted, and the /listings
   *                               table one click away got both right because
   *                               it reads nowIso().
   *   domain/costs/service.ts     lastImportAt: rows.length > 0 ?
   *                               '2026-08-09…' : null — so any shop with
   *                               receipts was told it had uploaded an Etsy
   *                               Stats file in August. The condition tested
   *                               whether orders exist, not whether an import
   *                               happened.
   *   domain/analytics/experiments.ts
   *                               since: '2026-04-15T00:00:00.000Z' inside a
   *                               live order query — the fixture's baseline
   *                               start, on the one screen whose whole job is
   *                               before-and-after.
   *   domain/ai/service.ts and domain/billing/service.ts
   *                               '2026-09-01' twice, as the date a monthly AI
   *                               allowance resets. Six weeks in the past, on
   *                               two separate screens, from two separate
   *                               literals.
   *
   * None of those names a fixture symbol, so the sweep above was blind to all
   * of them. This rule is about the SHAPE of the thing instead: a date written
   * into the source is either a fact about the outside world that has a date
   * (Etsy's published fee schedule) or it is a clock nobody is winding.
   */
  const INSTANT = /['"`]\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?['"`]/

  /**
   * Instants in domain/ that are NOT a stopped clock, each with its reason.
   *
   * Same contract as KNOWN_REMAINING: an entry has to stay true, and deleting
   * it is what fixing one looks like.
   */
  const KNOWN_INSTANTS: { file: string; why: string }[] = [
    {
      file: 'domain/fees/rules.ts',
      why:
        'FEE_RULES_EFFECTIVE is the date Etsy\u2019s published fee schedule took ' +
        'effect. It is a fact about a document outside this product, it is ' +
        'rendered beside the rates it governs so a seller can check them against ' +
        'the same policy page, and it is correct until Etsy publishes new rates \u2014 ' +
        'at which point the rates change in the same edit. A date that describes ' +
        'the world is not a clock.',
    },
    {
      file: 'domain/research/service.ts',
      why:
        'The created and updated dates on demoLists(), the two sample keyword ' +
        'lists. They are demo-only since getListsView() began returning null ' +
        'outside demo mode, so no live seller sees them \u2014 but the literals still ' +
        'sit in a service rather than in the dataset, and moving them is the ' +
        'keyword-list persistence slice that KNOWN_REMAINING already names for ' +
        'the same symbol. Listed rather than exempted by directory so the two ' +
        'entries go together.',
    },
  ]

  const scoped = files.filter((f) => f.startsWith('domain/'))

  it('sweeps domain/ and can see an instant when there is one', () => {
    /*
     * Anti-vacuity, two ways. The sweep has to be looking at files, and the
     * pattern has to be able to match — a regex broken by an escaping slip
     * reports a clean tree and reads exactly like one.
     */
    expect(scoped.length).toBeGreaterThan(60)
    expect(scoped).toContain('domain/audit/rules.ts')
    expect(scoped).toContain('domain/costs/service.ts')

    expect(INSTANT.test("const x = '2026-08-20T00:00:00.000Z'")).toBe(true)
    expect(INSTANT.test("const x = '2026-09-01'")).toBe(true)
    expect(INSTANT.test('const x = `${month}-15T12:00:00.000Z`')).toBe(false)
    expect(INSTANT.test('const x = nowIso()')).toBe(false)

    // And the exempt files really do still contain one, so the exemptions are
    // not quietly covering nothing.
    for (const known of KNOWN_INSTANTS) {
      expect(
        INSTANT.test(code(known.file)),
        `${known.file} has no instant left; delete its KNOWN_INSTANTS entry`,
      ).toBe(true)
      expect(known.why.length, `${known.file} has no reason recorded`).toBeGreaterThan(80)
    }
  })

  it('finds no stopped clock in domain/', () => {
    const exempt = new Set([...ALLOWED, ...DATASETS, ...KNOWN_INSTANTS.map((k) => k.file)])
    const offenders = scoped.filter((f) => !exempt.has(f) && INSTANT.test(code(f)))
    expect(
      offenders,
      'an authored date literal is on a live path \u2014 read it off domain/clock.ts, ' +
        'or add it to KNOWN_INSTANTS with the reason it is a fact and not a clock',
    ).toEqual([])
  })
})
