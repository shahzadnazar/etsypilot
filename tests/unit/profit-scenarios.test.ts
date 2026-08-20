import { describe, expect, it } from 'vitest'
import { getProfitView, totalsFrom } from '@/domain/profit/service'
import { buildScenarios, computeScenario, inputRows, SCENARIO_SHAPES } from '@/domain/profit/scenarios'
import { missingDataFrom, reconcile } from '@/domain/profit/reconciliation'
import type { SellerAssumptions, VerifiedTotals } from '@/domain/profit/types'
import { DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'

const ctx = { shopId: DEMO_SHOP_ID, actorId: 'demo-user-salman', readOnly: true }
const view = await getProfitView(ctx)

const verified: VerifiedTotals = {
  grossRevenue: 18420.65, etsyFees: 2984.1, paymentProcessing: 622,
  offsiteAds: 412.35, orderCount: 438,
}
const assumptions: SellerAssumptions = {
  shippingPerOrder: 2.6187, cogsPercent: 0.3798, labourTotal: 1020, otherCosts: 302.05,
}

describe('a seller can never adjust a verified figure', () => {
  it('marks every verified row locked and every assumption editable', () => {
    const rows = inputRows(verified, assumptions, 'USD')
    const locked = rows.filter((r) => r.locked).map((r) => r.key)
    const editable = rows.filter((r) => !r.locked).map((r) => r.key)

    expect(locked).toEqual(['sales', 'averagePrice', 'etsyFees', 'ads'])
    expect(editable).toEqual(['cogs', 'shipping', 'labour', 'other'])
  })

  it('says why a locked row is locked', () => {
    const rows = inputRows(verified, assumptions, 'USD')
    const fees = rows.find((r) => r.key === 'etsyFees')
    expect(fees?.note).toContain('cannot be edited')
  })

  it('leaves fees untouched when only the assumptions change', () => {
    const a = computeScenario(verified, assumptions, { scenario: 'BASE', coverage: 0.62, missingData: [] })
    const doubledCosts = { ...assumptions, cogsPercent: assumptions.cogsPercent * 2 }
    const b = computeScenario(verified, doubledCosts, { scenario: 'BASE', coverage: 0.62, missingData: [] })

    const fees = (r: typeof a) => Math.abs(r.lines.find((l) => l.key === 'etsyFees')!.amount)
    expect(fees(a)).toBe(fees(b))
    expect(fees(a)).toBeCloseTo(verified.etsyFees, 2)
  })
})

describe('a projected fee is not a verified one', () => {
  it('keeps the verified badge in the base scenario', () => {
    const base = computeScenario(verified, assumptions, { scenario: 'BASE', coverage: 0.62, missingData: [] })
    expect(base.lines.find((l) => l.key === 'etsyFees')?.provenance.type).toBe('VERIFIED')
  })

  it('relabels projected lines CALCULATED once volume is varied', () => {
    const optimistic = computeScenario(verified, assumptions, {
      scenario: 'OPTIMISTIC', coverage: 0.62, missingData: [],
    })
    const fees = optimistic.lines.find((l) => l.key === 'etsyFees')
    // Etsy never confirmed a hypothetical, so the badge must not say it did.
    expect(fees?.provenance.type).toBe('CALCULATED')
    expect(fees?.provenance.methodology).toContain('Projected')
  })

  it('scales fees with volume, because more sales means more fees', () => {
    const base = computeScenario(verified, assumptions, { scenario: 'BASE', coverage: 0.62, missingData: [] })
    const up = computeScenario(verified, assumptions, { scenario: 'OPTIMISTIC', coverage: 0.62, missingData: [] })
    const fees = (r: typeof base) => Math.abs(r.lines.find((l) => l.key === 'etsyFees')!.amount)
    expect(fees(up)).toBeCloseTo(fees(base) * SCENARIO_SHAPES.OPTIMISTIC.salesMultiplier, 1)
  })

  it('keeps seller lines as SELLER_INPUT in every scenario', () => {
    for (const kind of ['CONSERVATIVE', 'BASE', 'OPTIMISTIC'] as const) {
      const r = computeScenario(verified, assumptions, { scenario: kind, coverage: 0.62, missingData: [] })
      expect(r.lines.find((l) => l.key === 'cogs')?.provenance.type, kind).toBe('SELLER_INPUT')
    }
  })
})

describe('scenarios order sensibly', () => {
  it('conservative is worst, optimistic best, base between', () => {
    const { comparison } = buildScenarios(verified, assumptions, { coverage: 0.62, missingData: [] })
    const [cons, base, opt] = comparison
    expect(cons!.netProfit).toBeLessThan(base!.netProfit)
    expect(base!.netProfit).toBeLessThan(opt!.netProfit)
  })

  it('every scenario still reconciles: gross minus costs equals net', () => {
    const { results } = buildScenarios(verified, assumptions, { coverage: 0.62, missingData: [] })
    for (const kind of ['CONSERVATIVE', 'BASE', 'OPTIMISTIC'] as const) {
      const r = results[kind]
      const costs = r.lines
        .filter((l) => l.key !== 'gross' && l.key !== 'net')
        .reduce((s, l) => s + Math.abs(l.amount), 0)
      expect(Math.round((r.grossRevenue - costs) * 100) / 100, kind).toBeCloseTo(r.netProfit, 1)
    }
  })

  it('states the basis of each scenario rather than only its number', () => {
    const { comparison } = buildScenarios(verified, assumptions, { coverage: 0.62, missingData: [] })
    expect(comparison.map((c) => c.basis)).toEqual([
      'Costs high, sales flat', 'Your confirmed inputs', 'Costs low, sales up 8%',
    ])
  })
})

describe('reconciliation never guesses', () => {
  it('leaves profit null wherever cost is null', () => {
    for (const row of view.reconciliation.rows) {
      if (row.cost === null) expect(row.profit, row.orderId).toBeNull()
    }
  })

  it('gives every exception a way out', () => {
    const exceptions = view.reconciliation.rows.filter((r) => r.status !== 'MATCHED')
    expect(exceptions.length).toBeGreaterThan(0)
    for (const row of exceptions) {
      expect(row.resolutions.length, row.orderId).toBeGreaterThan(0)
      expect(row.reason, row.orderId).toBeTruthy()
      expect(row.resolutions.some((r) => r.kind === 'PRIMARY'), row.orderId).toBe(true)
    }
  })

  it('gives matched rows no exception noise', () => {
    const matched = view.reconciliation.rows.filter((r) => r.status === 'MATCHED')
    expect(matched.length).toBeGreaterThan(0)
    for (const row of matched) {
      expect(row.resolutions).toHaveLength(0)
      expect(row.reason).toBeUndefined()
    }
  })

  it('quantifies the order value it had to exclude', () => {
    expect(view.reconciliation.excludedValue).toBeGreaterThan(0)
  })

  it('distinguishes a missing cost from a missing invoice', () => {
    const partial = view.reconciliation.rows.find((r) => r.status === 'PARTIAL')
    const unmatched = view.reconciliation.rows.find((r) => r.status === 'UNMATCHED')
    expect(partial?.reason).toContain('No product cost')
    expect(unmatched?.reason).toContain('Supplier invoice missing')
    expect(partial?.resolutions[0]?.label).not.toBe(unmatched?.resolutions[0]?.label)
  })
})

describe('missing data is a first-class state', () => {
  it('gives every gap a resolution, including the one we cannot fix', () => {
    const items = view.results.BASE.missingData
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      expect(item.resolutions.length, item.code).toBeGreaterThan(0)
      expect(item.detail, item.code).toBeTruthy()
    }
  })

  it('names the ads gap even though EtsyPilot cannot close it', () => {
    const ads = view.results.BASE.missingData.find((m) => m.code === 'ADS_NOT_PER_LISTING')
    expect(ads).toBeDefined()
    // Not resolvable by us, so the way out is an explanation.
    expect(ads?.resolutions[0]?.kind).toBe('SECONDARY')
    expect(ads?.resolutions[0]?.href).toContain('methodology')
  })

  it('says net profit is a floor when coverage is incomplete', () => {
    const gap = view.results.BASE.missingData.find((m) => m.code === 'NO_PRODUCT_COST')
    expect(gap?.detail).toContain('floor')
  })

  it('drops a gap once it no longer applies', () => {
    const summary = reconcile({ orders: [], listings: [], costs: new Map() })
    const items = missingDataFrom({ summary, listingsWithoutCost: 0, labourRecorded: true })
    expect(items.map((i) => i.code)).toEqual(['ADS_NOT_PER_LISTING'])
  })
})

describe('verified totals come from the orders', () => {
  it('sums the receipts rather than restating a constant', () => {
    const t = totalsFrom([
      { etsyReceiptId: '#1', placedAt: '', gross: 10, discounts: 0, refunds: 0, etsyFees: 1, paymentProcessing: 0.5, offsiteAds: 0, countryCode: 'US', items: [] },
      { etsyReceiptId: '#2', placedAt: '', gross: 20, discounts: 0, refunds: 0, etsyFees: 2, paymentProcessing: 1, offsiteAds: 3, countryCode: 'US', items: [] },
    ])
    expect(t.grossRevenue).toBe(30)
    expect(t.etsyFees).toBe(3)
    expect(t.offsiteAds).toBe(3)
    expect(t.orderCount).toBe(2)
  })
})

describe('D32 — provenance follows the number as displayed, not its source table', () => {
  it('demotes a ratio derived from verified figures to CALCULATED and names the transform', () => {
    const rows = inputRows(verified, assumptions, 'USD')

    const average = rows.find((r) => r.key === 'averagePrice')
    expect(average?.provenance).toBe('CALCULATED')
    expect(average?.note).toContain('÷')

    const feeRate = rows.find((r) => r.key === 'etsyFees')
    expect(feeRate?.provenance).toBe('CALCULATED')
    expect(feeRate?.note).toContain('÷')
  })

  it('keeps exact aggregates VERIFIED — summing does not demote, dividing does', () => {
    const rows = inputRows(verified, assumptions, 'USD')
    expect(rows.find((r) => r.key === 'sales')?.provenance).toBe('VERIFIED')
    expect(rows.find((r) => r.key === 'ads')?.provenance).toBe('VERIFIED')
  })

  it('gives every input row a provenance, so locked is never mistaken for verified', () => {
    const rows = inputRows(verified, assumptions, 'USD')
    for (const row of rows) {
      expect(row.provenance).toBeTruthy()
    }
    // A locked row that is not verified is exactly the case the badge exists for.
    expect(rows.some((r) => r.locked && r.provenance !== 'VERIFIED')).toBe(true)
  })
})
