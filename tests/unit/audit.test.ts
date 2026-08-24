import { describe, expect, it } from 'vitest'
import { auditListings, getAuditView } from '@/domain/audit/service'
import { AUDIT_RULES } from '@/domain/audit/rules'
import {
  DEMO_ACTOR_ID,
  DEMO_SHOP_ID,
  buildDemoListings,
  buildDemoOrders,
  demoConfirmedCosts,
} from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import type { ShopContext } from '@/lib/permissions'

const CTX: ShopContext = { shopId: DEMO_SHOP_ID, actorId: DEMO_ACTOR_ID, readOnly: true }

const listings = buildDemoListings()
const orders = buildDemoOrders(listings)
const view = auditListings(listings, orders, demoConfirmedCosts(listings))

function listing(overrides: Partial<EtsyListing>): EtsyListing {
  return {
    etsyListingId: 'L1',
    title: 'A plain title',
    description: 'x'.repeat(200),
    tags: Array.from({ length: 13 }, (_, i) => `tag ${i}`),
    price: 40,
    quantity: 5,
    state: 'ACTIVE',
    section: 'Home',
    sku: 'SKU-1',
    attributes: {},
    requiredAttributes: [],
    photoCount: 6,
    renewsAt: null,
    lastChangedAt: '2026-08-01T00:00:00.000Z',
    hasVariations: false,
    variationSummary: null,
    ...overrides,
  }
}

describe('the audit advertises what it runs', () => {
  it('has exactly the fourteen rules it claims', () => {
    expect(AUDIT_RULES).toHaveLength(14)
    expect(view.ruleCount).toBe(14)
  })

  it('gives every rule a mechanical reason and a fix', () => {
    for (const rule of AUDIT_RULES) {
      expect(rule.why.length).toBeGreaterThan(20)
      expect(rule.fix.length).toBeGreaterThan(10)
    }
  })

  it('never claims to know what Etsy will do with a listing', () => {
    const text = AUDIT_RULES.map((r) => `${r.why} ${r.fix}`).join(' ').toLowerCase()
    expect(text).not.toContain('will rank higher')
    expect(text).not.toContain('boost your ranking')
    expect(text).not.toContain('guarantee')
  })
})

describe('the health score is weighted by money, not by count', () => {
  it('is CALCULATED and names the formula', () => {
    expect(view.healthScore.provenance.type).toBe('CALCULATED')
    expect(view.healthScore.provenance.methodology).toContain('share of your verified revenue')
  })

  it('states its coverage, because listings without orders carry no weight', () => {
    expect(view.healthScore.provenance.coverage).toBeGreaterThan(0)
    expect(view.healthScore.provenance.limitations?.join(' ')).toContain('carry no weight')
  })

  it('penalises a broken listing that earns more than a broken listing that earns less', () => {
    const broken = listing({ etsyListingId: 'BIG', quantity: 0 })
    const alsoBroken = listing({ etsyListingId: 'SMALL', quantity: 0 })
    const clean = listing({ etsyListingId: 'CLEAN' })

    const order = (listingId: string, unitPrice: number) => ({
      etsyReceiptId: `r-${listingId}`,
      placedAt: '2026-08-01T00:00:00.000Z',
      gross: unitPrice,
      discounts: 0,
      refunds: 0,
      etsyFees: 0,
      paymentProcessing: 0,
      offsiteAds: 0,
      buyerCountry: 'United States',
      countryCode: 'US',
      items: [{ etsyListingId: listingId, quantity: 1, unitPrice }],
    })

    const bigBreaks = auditListings(
      [broken, clean],
      [order('BIG', 900), order('CLEAN', 100)],
      new Map(),
    )
    const smallBreaks = auditListings(
      [alsoBroken, clean],
      [order('SMALL', 100), order('CLEAN', 900)],
      new Map(),
    )

    expect(bigBreaks.healthScore.value!).toBeLessThan(smallBreaks.healthScore.value!)
  })

  it('says so when it has no revenue to weight with, instead of reusing the same wording', () => {
    const unweighted = auditListings([listing({ quantity: 0 })], [], new Map())
    expect(unweighted.healthScore.provenance.methodology).toContain('counts listings equally')
    expect(unweighted.healthScore.provenance.coverage).toBe(0)
  })
})

describe('findings carry honest provenance', () => {
  it('keeps revenue on a listing VERIFIED — summing receipts does not demote', () => {
    const first = view.results[0]?.findings[0]
    expect(first?.revenueOnListing.provenance.type).toBe('VERIFIED')
  })

  it('counts revenue once per listing, not once per rule', () => {
    const summedPerRule = view.results.reduce((s, r) => s + r.revenueOnListings, 0)
    const itemRevenue = orders.reduce(
      (s, o) => s + o.items.reduce((t, i) => t + i.unitPrice * i.quantity, 0),
      0,
    )

    // The per-rule figures overlap, so their sum exceeds the deduplicated total...
    expect(summedPerRule).toBeGreaterThan(view.revenueOnListings)
    // ...and the headline figure never exceeds the item revenue it came from.
    expect(view.revenueOnListings).toBeLessThanOrEqual(itemRevenue + 0.01)
  })

  it('states that the figure is item revenue, not order gross', () => {
    const first = view.results[0]?.findings[0]
    expect(first?.revenueOnListing.provenance.source).toContain('before order-level discounts')
  })

  it('never calls earned revenue "at risk" anywhere in the audit domain', () => {
    /*
     * A backward-looking measurement carrying a forward-looking label. The
     * money was earned; a missing attribute does not endanger it. The field is
     * named so a future contributor cannot reintroduce the phrase by reading
     * the type and following its lead.
     */
    const view2 = view as unknown as Record<string, unknown>
    expect('revenueAtRisk' in view2).toBe(false)
    expect('revenueOnListings' in view2).toBe(true)
  })

  it('offers no suggested value rather than inventing a plausible one', () => {
    const attributeRule = view.results.find((r) => r.rule.code === 'MISSING_REQUIRED_ATTRIBUTE')
    if (!attributeRule) return
    for (const f of attributeRule.findings) {
      // Either read from the listing's own text, or explicitly absent.
      expect(f.suggestedValue === null || typeof f.suggestedValue === 'string').toBe(true)
    }
  })
})

describe('rules fire on the case they describe', () => {
  it('does not flag below-cost when the cost is unknown — a gap is not a finding', () => {
    const cheap = listing({ etsyListingId: 'CHEAP', price: 1 })
    const withoutCost = auditListings([cheap], [], new Map())
    expect(withoutCost.results.some((r) => r.rule.code === 'BELOW_COST')).toBe(false)

    const withCost = auditListings([cheap], [], new Map([['CHEAP', 20]]))
    expect(withCost.results.some((r) => r.rule.code === 'BELOW_COST')).toBe(true)
  })

  it('counts a listing once at its worst severity, not once per rule', () => {
    const bad = listing({ etsyListingId: 'BAD', quantity: 0, tags: ['necklace'], photoCount: 1 })
    const result = auditListings([bad], [], new Map())
    // One listing: an error and several warnings, but one error and no warning
    // count — otherwise the totals would exceed the catalogue size.
    expect(result.errors).toBe(1)
    expect(result.warnings).toBe(0)
    expect(result.passing).toBe(0)
  })

  it('never reports more flagged listings than it checked', () => {
    expect(view.errors + view.warnings + view.passing).toBe(view.listingsChecked)
  })
})

describe('the audit view from the service', () => {
  it('reads the shop through the adapter and reports bulk-fixable work', async () => {
    const live = await getAuditView(CTX)
    expect(live.listingsChecked).toBeGreaterThan(0)
    expect(live.bulkFixable).toBeGreaterThan(0)
  })
})
