/*
 * Cost settings: the boundary, and the one field that may be blank.
 *
 * The bound worth guarding hardest is `adSpend`. Etsy exposes no ads endpoint,
 * so nobody can check what a seller spent — and a blank field silently stored
 * as 0 would improve every profit figure downstream while looking like a
 * default. Blank has to survive the round trip as null.
 */

import { describe, expect, it, afterEach } from 'vitest'
import { parseCostSettings, CostValidationError, problemFromQuery, describeProblem } from '@/domain/costs/validate'
import { COST_FIELDS } from '@/domain/costs/types'
import { demoSellerCosts } from '@/domain/costs/demo'

const VALID = {
  defaultRulePercent: '38',
  shippingPerOrder: '4.20',
  labourTotal: '1200',
  otherCosts: '310.50',
  adSpend: '1142',
}

describe('parseCostSettings', () => {
  it('stores a percent typed as 0–100 as a fraction', () => {
    expect(parseCostSettings(VALID).defaultRulePercent).toBeCloseTo(0.38, 10)
  })

  it('keeps a blank ad spend as null rather than zero', () => {
    const parsed = parseCostSettings({ ...VALID, adSpend: '' })
    expect(parsed.adSpend).toBeNull()
    // The distinction the whole field exists for.
    expect(parsed.adSpend).not.toBe(0)
  })

  it('accepts an explicit zero ad spend as zero', () => {
    expect(parseCostSettings({ ...VALID, adSpend: '0' }).adSpend).toBe(0)
  })

  it('accepts a blank in any field, because every cost may be unset', () => {
    /*
     * This asserted the opposite — that a blank shipping cost was REJECTED —
     * and that was the defect, one level down. Four of the five fields were
     * `nullable: false`, so a seller could not clear a cost and a new seller's
     * empty form could not be parsed at all. Which is exactly why
     * domain/costs/store.ts had to invent a starting point for them, and what
     * it invented was the Willow & Fern figures.
     *
     * Blank is now how a seller says "I have not told you" and how they
     * retract a cost. A typed 0 is still a zero — asserted below.
     */
    expect(parseCostSettings({ ...VALID, shippingPerOrder: '' }).shippingPerOrder).toBeNull()
    expect(parseCostSettings({ ...VALID, defaultRulePercent: '' }).defaultRulePercent).toBeNull()

    // And a bad value in a field left blank elsewhere still fails: accepting
    // blank is not accepting anything.
    expect(() => parseCostSettings({ ...VALID, shippingPerOrder: 'abc' })).toThrow(
      CostValidationError,
    )
    expect(() => parseCostSettings({ ...VALID, defaultRulePercent: '500' })).toThrow(
      CostValidationError,
    )
  })

  it('rejects text, and says which field', () => {
    try {
      parseCostSettings({ ...VALID, labourTotal: 'lots' })
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(CostValidationError)
      expect((error as CostValidationError).report.field.key).toBe('labourTotal')
      expect((error as CostValidationError).report.problem).toBe('NOT_A_NUMBER')
    }
  })

  it('rejects a value outside the field bounds, both ends', () => {
    for (const field of COST_FIELDS) {
      const under = { ...VALID, [field.key]: String(field.min - 1) }
      const over = { ...VALID, [field.key]: String(field.max + 1) }
      expect(() => parseCostSettings(under), `${field.key} under ${field.min}`).toThrow()
      expect(() => parseCostSettings(over), `${field.key} over ${field.max}`).toThrow()
    }
  })

  it('rejects a negative cost even though the form marks the field min=0', () => {
    // Client attributes are a convenience. This is the boundary that decides.
    expect(() => parseCostSettings({ ...VALID, shippingPerOrder: '-5' })).toThrow(
      CostValidationError,
    )
  })

  it('ignores extra fields a caller invents', () => {
    const parsed = parseCostSettings({ ...VALID, shopId: 'someone-elses-shop', grossRevenue: '0' })
    expect(Object.keys(parsed).sort()).toEqual(COST_FIELDS.map((f) => f.key).sort())
  })
})

describe('problem round trip', () => {
  it('recovers a report from the two query values', () => {
    const report = problemFromQuery('adSpend', 'OUT_OF_RANGE')
    expect(report?.field.key).toBe('adSpend')
    expect(describeProblem(report!).message).toContain('Ad spend')
  })

  it('refuses anything not in the closed sets', () => {
    expect(problemFromQuery('adSpend', '<script>')).toBeNull()
    expect(problemFromQuery('__proto__', 'REQUIRED')).toBeNull()
    expect(problemFromQuery(undefined, undefined)).toBeNull()
  })
})

describe('the demo fixture cannot leave demo mode', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   WHAT REPLACED THE MAP STORE, AND WHY THESE ARE THE TESTS NOW.
   * ══════════════════════════════════════════════════════════════════════
   *
   * `domain/costs/store.ts` held five scalars in a module-level Map and its
   * read fell back to DEMO_COST_INPUTS for any shop it had never seen. Three
   * tests here covered that store: read-back per shop, the demo ad spend
   * staying null, and the read handing out a copy.
   *
   * The store is gone. Read-back and cross-shop isolation are now facts about
   * a real table, so they moved to tests/integration/costs.int.ts where a
   * database can answer them — a Map test could only ever prove the Map. The
   * copy test went with the Map: a query returns a fresh object every time.
   *
   * What stays here is the containment that has no database in it: the demo
   * figures must be unreachable outside demo mode. That was the actual defect
   * — measured in a browser, a real account in live mode was offered
   * `shippingPerOrder 2.6187214611872145` as its own average postage.
   */
  afterEach(() => {
    delete process.env.ETSY_MODE
  })

  it('serves the demo costs in demo mode', () => {
    delete process.env.ETSY_MODE
    const costs = demoSellerCosts()
    expect(costs, 'demo mode must still get the fixture').not.toBeNull()
    expect(costs?.defaultRulePercent).toBeGreaterThan(0)
    expect(costs?.shippingPerOrder).toBeGreaterThan(0)
  })

  it('and refuses to serve them in live mode', () => {
    process.env.ETSY_MODE = 'live'
    expect(demoSellerCosts(), 'the fixture reached a live deployment').toBeNull()
  })

  it('leaves the demo ad spend unknown rather than zero, in demo mode', () => {
    /*
     * The one cost line the fixture itself declines to invent, and the reason
     * CostSettings.adSpend was nullable before any of the others: "Etsy
     * exposes no ads endpoint, so the honest states are 'the seller typed a
     * figure' and 'nobody knows' — not zero, which would silently improve the
     * profit waterfall."
     */
    delete process.env.ETSY_MODE
    expect(demoSellerCosts()?.adSpend).toBeNull()
  })
})

describe('a blank cost field means not set, for every field', () => {
  it('accepts a blank anywhere and records null, never zero', () => {
    /*
     * Four of the five fields were `nullable: false`, so a seller could not
     * clear one and a new seller's blank form could not be parsed at all —
     * which is why the store had to invent a starting point. With all five
     * nullable, blank round-trips as "not set" and 0 stays available as the
     * different statement it is.
     */
    const blank = parseCostSettings({})
    expect(blank).toEqual({
      defaultRulePercent: null,
      shippingPerOrder: null,
      labourTotal: null,
      otherCosts: null,
      adSpend: null,
    })
  })

  it('and keeps a typed zero as a zero', () => {
    // The converse. Without it, a parser that returned null for everything
    // would satisfy the assertion above.
    const zeroes = parseCostSettings({
      defaultRulePercent: '0',
      shippingPerOrder: '0',
      labourTotal: '0',
      otherCosts: '0',
      adSpend: '0',
    })
    expect(zeroes).toEqual({
      defaultRulePercent: 0,
      shippingPerOrder: 0,
      labourTotal: 0,
      otherCosts: 0,
      adSpend: 0,
    })
  })
})
