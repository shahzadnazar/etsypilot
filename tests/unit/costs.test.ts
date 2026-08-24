/*
 * Cost settings: the boundary, and the one field that may be blank.
 *
 * The bound worth guarding hardest is `adSpend`. Etsy exposes no ads endpoint,
 * so nobody can check what a seller spent — and a blank field silently stored
 * as 0 would improve every profit figure downstream while looking like a
 * default. Blank has to survive the round trip as null.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { parseCostSettings, CostValidationError, problemFromQuery, describeProblem } from '@/domain/costs/validate'
import { COST_FIELDS } from '@/domain/costs/types'
import { defaultCostSettings, readCostSettings, resetCostSettings, writeCostSettings } from '@/domain/costs/store'

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

  it('rejects a blank in a field that is not nullable', () => {
    expect(() => parseCostSettings({ ...VALID, shippingPerOrder: '' })).toThrow(CostValidationError)
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

describe('cost settings store', () => {
  beforeEach(() => resetCostSettings())

  it('reads back what was written, per shop', () => {
    const settings = parseCostSettings(VALID)
    writeCostSettings('shop-a', settings)
    expect(readCostSettings('shop-a').defaultRulePercent).toBeCloseTo(0.38, 10)
    // A second shop must not see it. Cross-shop reads are the one thing this
    // store cannot be allowed to get wrong.
    expect(readCostSettings('shop-b')).toEqual(defaultCostSettings())
  })

  it('starts the demo shop with an unknown ad spend, not a zero', () => {
    expect(defaultCostSettings().adSpend).toBeNull()
  })

  it('hands out a copy, so a caller cannot mutate the store through it', () => {
    writeCostSettings('shop-a', parseCostSettings(VALID))
    const first = readCostSettings('shop-a')
    first.defaultRulePercent = 0.99
    expect(readCostSettings('shop-a').defaultRulePercent).toBeCloseTo(0.38, 10)
  })
})
