import { describe, expect, it } from 'vitest'
import { csvCell, toCsv, transactionsExport } from '@/domain/export/csv'
import { PLANS, AGENCY_NOTE, planOf } from '@/domain/billing/plans'
import { getBillingView } from '@/domain/billing/service'
import { enforce } from '@/domain/billing/usage'
import { ETSY_SCOPES, overallPercent, selectedScopeStrings } from '@/domain/connect/types'
import { checklistComplete, demoSyncState, setupChecklist } from '@/domain/connect/service'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'
import type { TransactionRow } from '@/domain/profit/types'

const CTX: ShopContext = { shopId: DEMO_SHOP_ID, actorId: DEMO_ACTOR_ID, readOnly: true }

/* ------------------------------------------------------------------ export */

const ROWS: TransactionRow[] = [
  {
    orderId: '3001',
    listingTitle: 'Birth flower necklace',
    placedAt: '2026-08-01T00:00:00.000Z',
    gross: 42,
    fees: 4.2,
    cost: 16,
    profit: 21.8,
    status: 'MATCHED',
    resolutions: [],
  },
  {
    orderId: '3002',
    listingTitle: 'Ceramic mug',
    placedAt: '2026-08-02T00:00:00.000Z',
    gross: 28,
    fees: 2.8,
    cost: null,
    profit: null,
    status: 'PARTIAL',
    reason: 'No product cost set for this listing.',
    resolutions: [],
  },
]

const SPEC = transactionsExport({
  periodStart: '2026-07-14T00:00:00.000Z',
  periodEnd: '2026-08-12T23:59:59.999Z',
  currency: 'USD',
  coveragePercent: 83,
})

describe('provenance survives the export', () => {
  const csv = toCsv(SPEC, ROWS)
  const lines = csv.split('\r\n')
  const header = lines.find((l) => l.startsWith('Order,')) ?? ''

  it('pairs every value column with its own source column', () => {
    expect(header).toContain('Gross,Gross — source')
    expect(header).toContain('Cost,Cost — source')
    expect(header).toContain('Profit,Profit — source')
  })

  it('exports an unknown value as an empty cell, never a zero', () => {
    const headerCells = header.split(',')
    const partial = (lines.find((l) => l.startsWith('3002')) ?? '').split(',')
    const cellFor = (name: string) => partial[headerCells.indexOf(name)]

    // Assert on the two cells under test, not on the row as a whole: the
    // timestamp column contains "0.00" and would pass a substring check for
    // the wrong reason.
    expect(cellFor('Cost')).toBe('')
    expect(cellFor('Profit')).toBe('')
    expect(cellFor('Cost — source')).toBe('Unavailable')
    expect(cellFor('Profit — source')).toBe('Unavailable')

    // And the matched row does carry its figures, so the empties mean something.
    const matched = (lines.find((l) => l.startsWith('3001')) ?? '').split(',')
    expect(matched[headerCells.indexOf('Cost')]).toBe('16')
    expect(matched[headerCells.indexOf('Profit — source')]).toBe('CALCULATED')
  })

  it('states what the file leaves out, inside the file', () => {
    expect(csv).toContain('Not included in this file:')
    expect(csv).toContain('They are not zero.')
    expect(csv).toContain('Etsy does not expose ad spend per listing')
  })

  it('carries the period and coverage as context, so the file stands alone', () => {
    expect(csv).toContain('2026-07-14 to 2026-08-12 (UTC)')
    expect(csv).toContain('83% of order value')
  })

  it('neutralises a cell a spreadsheet would execute', () => {
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('+44 7700 900000')).toBe("'+44 7700 900000")
    expect(csvCell('-5')).toBe("'-5")
    expect(csvCell('plain')).toBe('plain')
  })

  it('escapes quotes and commas per RFC 4180', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
  })
})

/* ----------------------------------------------------------------- billing */

describe('plans describe what exists', () => {
  it('ships three tiers, with Agency held', () => {
    expect(PLANS.map((p) => p.key)).toEqual(['FREE', 'SOLO', 'GROWTH'])
    expect(PLANS.some((p) => p.name === 'Agency')).toBe(false)
  })

  it('sells nothing that is parked', () => {
    const text = PLANS.flatMap((p) => [...p.includes, ...p.excludes]).join(' ').toLowerCase()
    for (const parked of ['team seat', 'client workspace', 'approval queue', 'automation rule', 'white-label']) {
      expect(text).not.toContain(parked)
    }
  })

  it('keeps the agency sentence exactly as approved', () => {
    expect(AGENCY_NOTE).toContain('we will not bill you for something that does not exist yet')
  })

  it('raises Growth to 2,000 listings and 500 generations', () => {
    expect(planOf('GROWTH').limits.listings).toBe(2000)
    expect(planOf('GROWTH').limits.aiGenerations).toBe(500)
    expect(planOf('SOLO').limits.listings).toBe(200)
  })

  it('counts listings rather than stating them', async () => {
    const view = await getBillingView(CTX)
    const meter = view.meters.find((m) => m.label === 'Listings')!
    expect(meter.used).toBeGreaterThan(0)
    expect(view.meters.map((m) => m.label)).toEqual(['Listings', 'AI generations'])
  })

  it('points a blocked limit at a real ceiling and says what pauses', () => {
    const decision = enforce({ plan: 'SOLO', metric: 'listings', used: 200 })
    expect(decision.allowed).toBe(false)
    expect(decision.blocked?.title).toContain('200 listings on Solo')
    expect(decision.blocked?.upgrade?.raisesTo).toBe(2000)
    expect(decision.blocked?.pauses).toContain('pause')
    expect(decision.blocked?.pauses).not.toContain('automation')
  })

  it('offers no upgrade beyond the top tier rather than inventing one', () => {
    const decision = enforce({ plan: 'GROWTH', metric: 'listings', used: 2000 })
    expect(decision.allowed).toBe(false)
    expect(decision.blocked?.upgrade).toBeNull()
  })
})

/* ----------------------------------------------------------------- connect */

describe('connecting a shop never touches a credential', () => {
  it('has no password or token field anywhere in the scope model', () => {
    const json = JSON.stringify(ETSY_SCOPES).toLowerCase()
    for (const forbidden of ['password', 'token', 'secret', 'api_key', 'apikey']) {
      expect(json).not.toContain(forbidden)
    }
  })

  it('says what breaks without each scope, not only what it enables', () => {
    for (const scope of ETSY_SCOPES) {
      expect(scope.withoutIt.length).toBeGreaterThan(10)
      expect(scope.scopes.length).toBeGreaterThan(0)
    }
  })

  it('always includes the required scope, whatever the seller picked', () => {
    expect(selectedScopeStrings([])).toContain('listings_r')
    expect(selectedScopeStrings(['finance'])).toContain('transactions_r')
    // Declining the optional ones is a real choice: they are simply absent.
    expect(selectedScopeStrings([])).not.toContain('transactions_r')
  })

  it('computes overall sync progress from the stages rather than stating it', () => {
    const sync = demoSyncState('Willow & Fern Studio', 404)
    expect(sync.overallPercent).toBe(overallPercent(sync.stages))
    expect(sync.overallPercent).toBeGreaterThan(0)
    expect(sync.overallPercent).toBeLessThan(100)
  })

  it('explains a paused stage instead of stalling silently', () => {
    const sync = demoSyncState('Willow & Fern Studio', 404)
    expect(sync.pausedNotice).toContain('nothing is lost')
    const paused = sync.stages.find((s) => s.status === 'PAUSED')
    expect(paused).toBeDefined()
    // A queued stage carries no fake progress.
    expect(sync.stages.filter((s) => s.status === 'QUEUED').every((s) => s.progress === null)).toBe(true)
  })
})

describe('the setup checklist', () => {
  it('gives every incomplete item a reason and a destination', () => {
    const items = setupChecklist({ hasCosts: false, hasAudit: false, hasSearch: false, listingCount: 404 })
    for (const item of items.filter((i) => !i.done)) {
      expect(item.href.startsWith('/')).toBe(true)
      expect(item.cta.length).toBeGreaterThan(0)
    }
    expect(checklistComplete(items)).toBe(false)
  })

  it('reports complete once every item is done, so the checklist can disappear', () => {
    const items = setupChecklist({ hasCosts: true, hasAudit: true, hasSearch: true, listingCount: 404 })
    expect(checklistComplete(items)).toBe(true)
  })

  it('states what the costs item buys, in D34’s terms', () => {
    const items = setupChecklist({ hasCosts: false, hasAudit: true, hasSearch: true, listingCount: 404 })
    const costs = items.find((i) => i.key === 'costs')
    expect(costs?.detail).toContain('default rule')
    expect(costs?.detail).not.toContain('excluded')
  })
})
