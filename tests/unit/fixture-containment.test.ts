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
 * PERIOD_START, PERIOD_END, PERIOD_DAYS, BASELINE_START, BASELINE_END and
 * DEMO_SHOP_ID's siblings live in the demo dataset too; the first five are the
 * product's reporting window, which every domain service legitimately imports.
 * Banning the module would force them somewhere else purely to get the guard
 * green, which is how a guard teaches people to route around it.
 */
const FIXTURES = [
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
    file: 'domain/billing/plans.ts',
    symbol: 'DEMO_PLAN',
    why:
      'Every deployment runs MockBillingProvider — there is no payment provider ' +
      'wired up — so the plan on /settings/billing is the demo plan for everyone. ' +
      'This is not a fixture leaking into a live path; it is the whole billing ' +
      'surface being unimplemented, and the page says so. Fixing it means ' +
      'integrating a provider, which is a product decision, not a sweep.',
  },
  {
    file: 'domain/billing/service.ts',
    symbol: 'DEMO_PLAN',
    why:
      'The call site of the above, listed for the same reason the shops page is: ' +
      'a half-fix must not be able to leave this list looking complete. Both go ' +
      'when a real billing provider lands.',
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
