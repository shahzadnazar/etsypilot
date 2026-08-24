/*
 * The listings manager's three derived columns.
 *
 * Status, SEO health and margin are computed rather than stored, and each has a
 * way of quietly lying:
 *
 *   status  "Expiring" is not an Etsy state. A listing that is not live has no
 *           renewal at all, and a row saying "Draft · Renews Sep 2" contradicts
 *           itself across two columns — which is exactly what the demo data
 *           produced before this.
 *   health  runs the SAME rules as the Listing Audit. Two screens grading one
 *           listing differently is worse than neither doing it.
 *   margin  null wherever there is no confirmed cost. Never the default rule's
 *           figure, which the Costs page names as an assumption.
 */

import { describe, expect, it } from 'vitest'
import { getListingsView, marginOf, PAGE_SIZE } from '@/domain/listings/service'
import { auditListings } from '@/domain/audit/service'
import {
  buildDemoListings,
  buildDemoOrders,
  demoConfirmedCosts,
  DEMO_ACTOR_ID,
  DEMO_NOW,
  DEMO_SHOP_ID,
} from '@/lib/etsy/demo-dataset'
import { shopContext } from '@/lib/permissions'

const CTX = shopContext(
  { userId: DEMO_ACTOR_ID, email: 'a@b.c', name: 'A', shopId: DEMO_SHOP_ID, isDemo: true },
  DEMO_SHOP_ID,
)

describe('rows', () => {
  it('never shows a renewal date on a listing that is not live', async () => {
    const view = await getListingsView(CTX, { page: '1' })
    expect(view.total).toBeGreaterThan(100)
    for (const row of view.rows) {
      if (row.status === 'DRAFT' || row.status === 'EXPIRED' || row.status === 'INACTIVE') {
        expect(row.renewsAt, `${row.status} ${row.etsyListingId}`).toBeNull()
      }
    }
  })

  it('reaches every health state, so none of the three is decorative', async () => {
    const all = await getListingsView(CTX, { page: '1' })
    const kinds = new Set<string>()
    for (let page = 1; page <= all.pageCount; page++) {
      const view = await getListingsView(CTX, { page: String(page) })
      for (const row of view.rows) kinds.add(row.health.kind)
    }
    /*
     * "Good" was unreachable: every generated listing carried one 96-character
     * description, so SHORT_DESCRIPTION fired on 450 of 450 and not one listing
     * in the demo shop was clean. An unreachable state is a state nobody has
     * looked at.
     */
    expect([...kinds].sort()).toEqual(['ERRORS', 'GOOD', 'NEEDS_WORK'])
  })

  it('grades a listing exactly as the Listing Audit does', async () => {
    const listings = buildDemoListings()
    const orders = buildDemoOrders(listings)
    const audit = auditListings(listings, orders, demoConfirmedCosts(listings))

    let errored = 0
    for (let page = 1; ; page++) {
      const view = await getListingsView(CTX, { page: String(page) })
      errored += view.rows.filter((r) => r.health.kind === 'ERRORS').length
      if (page >= view.pageCount) break
    }
    // The audit counts listings whose worst finding is an error; so does this.
    expect(errored).toBe(audit.errors)
  })

  it('leaves margin null where no confirmed cost exists', async () => {
    const listings = buildDemoListings()
    const costs = demoConfirmedCosts(listings)
    const view = await getListingsView(CTX, { page: '1' })
    for (const row of view.rows) {
      const hasCost = costs.has(row.etsyListingId)
      expect(row.margin === null, `${row.etsyListingId}`).toBe(!hasCost)
    }
  })
})

describe('marginOf', () => {
  it('subtracts fees as well as cost', () => {
    // 6.5% + 3% + $0.25 + $0.20 listing fee on $100, less a $40 cost.
    const margin = marginOf(100, 40)!
    expect(margin).toBeLessThan(60)
    expect(margin).toBeGreaterThan(48)
  })

  it('reports a loss as a negative margin rather than clamping at zero', () => {
    expect(marginOf(10, 20)!).toBeLessThan(0)
  })

  it('has no margin at all for a zero price', () => {
    // Not 0%, and not -Infinity. There is nothing to be a share OF.
    expect(marginOf(0, 5)).toBeNull()
  })
})

describe('filters', () => {
  it('widens an unrecognised value to ALL rather than matching nothing', async () => {
    const all = await getListingsView(CTX, {})
    const nonsense = await getListingsView(CTX, { status: 'DROP TABLE', health: 'x', section: 'y' })
    expect(nonsense.matching).toBe(all.matching)
    expect(nonsense.filters.status).toBe('ALL')
  })

  it('offers only the statuses and health kinds this catalogue contains', async () => {
    const view = await getListingsView(CTX, {})
    // INACTIVE is a real Etsy state and no listing here has one. Offering it
    // would be a filter that can only ever return an empty table.
    expect(view.statuses).not.toContain('INACTIVE')
    expect(view.statuses.length).toBeGreaterThan(1)
    for (const status of view.statuses) {
      const filtered = await getListingsView(CTX, { status })
      expect(filtered.matching, status).toBeGreaterThan(0)
    }
  })

  it('searches tags, not only titles', async () => {
    const listings = buildDemoListings()
    const tag = listings.find((l) => l.tags.length > 0)!.tags[0]!
    const view = await getListingsView(CTX, { q: tag })
    expect(view.matching).toBeGreaterThan(0)
  })

  it('counts what matches, not what is on the page', async () => {
    const view = await getListingsView(CTX, {})
    expect(view.rows.length).toBe(PAGE_SIZE)
    expect(view.matching).toBe(view.total)
    expect(view.matching).toBeGreaterThan(PAGE_SIZE)
  })

  it('clamps a page past the end instead of showing an empty table', async () => {
    const view = await getListingsView(CTX, { page: '9999' })
    expect(view.page).toBe(view.pageCount)
    expect(view.rows.length).toBeGreaterThan(0)
  })
})

describe('the expiring window', () => {
  it('is measured, and the shop actually contains some', async () => {
    const view = await getListingsView(CTX, {})
    /*
     * Every active listing used to renew on one fixed date, so this count was
     * always zero while DEMO_COUNTS asserted 6 — and the audit's RENEWS_SOON
     * rule could never fire on anything.
     */
    expect(view.counts.expiring).toBeGreaterThan(0)
    const expiring = await getListingsView(CTX, { status: 'EXPIRING' })
    expect(expiring.matching).toBe(view.counts.expiring)
    for (const row of expiring.rows) {
      const days = (Date.parse(row.renewsAt!) - Date.parse(DEMO_NOW)) / 86_400_000
      expect(days).toBeGreaterThanOrEqual(0)
      expect(days).toBeLessThanOrEqual(7)
    }
  })
})
