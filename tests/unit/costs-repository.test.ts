import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { posixJoin } from '../support/paths'
import { code, exportedFunctions, isScoped, statements } from '../support/shop-scoping'
import { FIELD_RULES } from '@/lib/repositories/costs'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE COST REPOSITORY CANNOT BE ASKED A QUESTION THAT SPANS SHOPS, AND NO
 *   SELLER FIGURE MAY ORIGINATE FROM THE DEMO FIXTURE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The same sweep the listings and orders repositories get, plus the one this
 * aggregate needs that they did not: costs are the first thing a seller
 * AUTHORS, and the value they were being offered as their own starting point
 * was DEMO_COST_INPUTS — the Willow & Fern designed figures, reverse-derived
 * from artboard 92.
 */

const REPOSITORY = 'lib/repositories/costs.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('every way into the cost repository names a shop', () => {
  const source = code(REPOSITORY)

  it('has statements and exports for the sweep to check', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(statements(source).length).toBeGreaterThan(0)
    expect(exportedFunctions(source).length).toBeGreaterThan(0)
  })

  it('takes shopId as the first parameter of every export', () => {
    for (const fn of exportedFunctions(source)) {
      const first = (fn.params.split(',')[0] ?? '').trim()
      expect(first, `${fn.name} does not take a shop id first`).toMatch(/^shopId\s*:/)
    }
  })

  it('carries a shop predicate on every statement it issues', () => {
    for (const statement of statements(source)) {
      expect(
        isScoped(statement),
        `a ${statement.kind} at offset ${statement.offset} is not shop-scoped: ${statement.chain.slice(0, 90)}`,
      ).toBe(true)
    }
  })

  it('puts no shop predicate inside a raw SQL template', () => {
    /*
     * The first draft read the newest rule per kind with a `distinct on`
     * subquery, which scoped itself as `${schema.costRules.shopId} = ${shopId}`
     * inside an sql`` template — correct, and invisible to the sweep above. A
     * guard that cannot see the predicate is a guard that will not notice its
     * removal, so the reads use plain drizzle and this keeps them that way.
     */
    expect(source).not.toMatch(/sql`[^`]*shopId[^`]*`/)
  })

  it('writes an INSERT, never an UPDATE, because the rows are the audit trail', () => {
    /*
     * Append-only. An UPDATE in place would leave actorId describing only the
     * last writer and discard the history of who changed what — and the trail
     * is the reason cost_rules.actorId exists.
     */
    expect(source).not.toMatch(/\.update\(schema\.costRules\)/)
    expect(source).not.toMatch(/\.delete\(schema\.costRules\)/)
    expect(source, 'the positive control: it does write').toMatch(/\.insert\(schema\.costRules\)/)
  })

  it('retracts a rule with null rather than zero', () => {
    /*
     * `value` is nullable as of migration 0012 precisely so a retracted rule
     * is not a cost of zero. A write path that coerced null to 0 would put the
     * figure back.
     */
    expect(source).toMatch(/value === null \? null : String\(/)
    expect(source).not.toMatch(/value \?\? 0/)
  })
})

describe('the field mapping lives in exactly one place', () => {
  it('covers every CostSettings field once', () => {
    const fields = FIELD_RULES.map((spec) => spec.field).sort()
    expect(fields).toEqual([
      'adSpend',
      'defaultRulePercent',
      'labourTotal',
      'otherCosts',
      'shippingPerOrder',
    ])
    // One rule per field, so no field maps to two cost kinds.
    expect(new Set(FIELD_RULES.map((s) => s.costKind)).size).toBe(FIELD_RULES.length)
  })

  it('and nothing else decides whether a FIXED value is per order or per period', () => {
    /*
     * The wart, fenced. `valueType` says PERCENT or FIXED and says nothing
     * about the basis; SHIPPING is per order while LABOUR, OTHER and ADS are
     * per period. `basis` in FIELD_RULES is the only place that is written
     * down, so a second opinion elsewhere cannot drift from it.
     */
    const elsewhere = walk('domain')
      .concat(walk('lib/repositories'))
      .filter((file) => !file.endsWith('lib/repositories/costs.ts'))
      .filter((file) => /PER_ORDER|PER_PERIOD|OF_PRICE/.test(code(file)))
    expect(elsewhere, 'a second cost-basis vocabulary exists').toEqual([])

    expect(FIELD_RULES.find((s) => s.field === 'shippingPerOrder')?.basis).toBe('PER_ORDER')
    expect(FIELD_RULES.find((s) => s.field === 'labourTotal')?.basis).toBe('PER_PERIOD')
    expect(FIELD_RULES.find((s) => s.field === 'defaultRulePercent')?.basis).toBe('OF_PRICE')
  })
})

describe('no seller figure originates from the demo fixture', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   MEASURED, IN A BROWSER, BEFORE THIS WAS WRITTEN: a real account in
   *   live mode was offered `shippingPerOrder 2.6187214611872145` as its own
   *   average postage. That is DEMO_TOTALS.shipping / DEMO_TOTALS.orderCount.
   * ══════════════════════════════════════════════════════════════════════
   *
   * DEMO_COST_INPUTS is legitimate in exactly two kinds of place: the demo
   * dataset that defines it, and a DEMO-branch that serves the fictional
   * catalogue. Anywhere else it is a fixture on a path to a real seller.
   */
  const ALLOWED = [
    // Defines it.
    'lib/etsy/demo-dataset.ts',
    // The one demo branch that is allowed to hand it out, and says so.
    'domain/costs/demo.ts',
  ]

  it('is imported only where it is defined or deliberately served', () => {
    const importers = walk('app')
      .concat(walk('domain'), walk('lib'), walk('components'))
      .filter((file) => /DEMO_COST_INPUTS/.test(code(file)))
      .sort()

    // The positive control: it still exists and is still used somewhere.
    expect(importers.length).toBeGreaterThan(0)
    expect(importers).toEqual(ALLOWED.slice().sort())
  })

  it('and the demo branch it is served from is reachable only in demo mode', () => {
    const demo = code('domain/costs/demo.ts')
    expect(demo, 'the demo cost source does not check the mode').toMatch(/isDemoMode\(\)/)
  })

  /*
   * ── THE SAME GUARD, FOR THE THING THE SURVEY FOUND ────────────────────
   *
   * `demoUnmatchedOrderIds` is `orders.slice(0, 8)`: the dataset's way of
   * giving Willow & Fern eight receipts with no supplier invoice. /profit and
   * /settings/costs both called it on whatever orders they had loaded, so a
   * live shop's first eight real receipts were marked UNMATCHED and its cost
   * coverage was held down by them.
   *
   * DEMO_COST_INPUTS was the symbol the task named. This is the one the survey
   * found, and the guard is the same guard — which is the argument for having
   * the single-exit module at all rather than a rule people remember.
   */
  it('and the unmatched-receipt fixture is contained the same way', () => {
    const importers = walk('app')
      .concat(walk('domain'), walk('lib'), walk('components'))
      .filter((file) => /demoUnmatchedOrderIds/.test(code(file)))
      .sort()

    expect(importers.length).toBeGreaterThan(0)
    expect(importers).toEqual(ALLOWED.slice().sort())
  })

  /*
   * The Action Center's four authored actions.
   *
   * ACT-0001 told a live seller "4 listings are selling below cost ... Every
   * sale of these four loses money" — CRITICAL, provenance CALCULATED, source
   * "your receipts and cost setup" — about listings nothing had examined.
   * ACT-0002 counted the fictional catalogue; both ACT-0002 and ACT-0003 name
   * "Salman R.", a person in the demo dataset.
   *
   * They are demo furniture and stay exactly as they are IN DEMO MODE. This
   * asserts the gate exists, because the one that was there before was the
   * sync state, and a live shop that had synced passed straight through it.
   */
  /*
   * ── THE SAVE GATE ASKS THE MODE, NOT WHETHER THE SHOP HAS CONNECTED ───
   *
   * The route's first version called `assertCanWrite(ctx)`, which refuses when
   * `ctx.readOnly` is set — and that is `shops.is_demo`, "has this shop ever
   * connected to Etsy". On a live deployment every new signup carries it, so
   * the sellers most in need of entering their costs were refused. Caught in a
   * browser: every shop in the database read `is_demo = t` and the save came
   * back a refusal.
   *
   * What must be refused is a save in DEMO MODE, because domain/costs/load.ts
   * serves the fixture there and a written rule could not be read back — the
   * silent loss this slice removed, re-created in a new place.
   */
  it('and the save gate is the mode, not the shop\u2019s connection status', () => {
    const route = code('app/api/settings/costs/route.ts')
    expect(route, 'the costs route does not check the mode').toMatch(/isDemoMode\(\)/)
    expect(
      route,
      'the costs route refuses a shop that has merely not connected yet',
    ).not.toMatch(/assertCanWrite/)
  })

  it('and the authored actions are gated on the mode, not on the sync state', () => {
    const service = code('domain/action-center/service.ts')
    expect(service, 'the authored actions are not gated on the mode').toMatch(
      /isDemoMode\(\)\s*\n?\s*\?/,
    )
    /*
     * And each one is called INSIDE that gate and nowhere else. Counting
     * occurrences in the whole file would pass on a call that had been moved
     * back out, so the gated block is sliced out and the two counts compared.
     */
    const start = service.indexOf('const authored = isDemoMode()')
    const end = service.indexOf('const actions =', start)
    expect(start, 'the gated block is not where this guard looks').toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const gated = service.slice(start, end)

    for (const call of [
      'belowCost(ctx)',
      'missingCosts(ctx,',
      'renewalsFixed(ctx)',
      'seasonalWindow(ctx)',
    ]) {
      const inFile = service.split(call).length - 1
      const inGate = gated.split(call).length - 1
      expect(inGate, `${call} is not called inside the demo-only list`).toBe(1)
      expect(inFile, `${call} is also called outside the demo-only list`).toBe(1)
    }
  })
})
