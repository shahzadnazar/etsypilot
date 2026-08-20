import { describe, expect, it } from 'vitest'
import { MockMarketSignalsService } from '@/lib/signals/mock'
import { applyListToListings, demoLists, getKeywordView } from '@/domain/research/service'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID, buildDemoListings } from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'

const CTX: ShopContext = { shopId: DEMO_SHOP_ID, actorId: DEMO_ACTOR_ID, readOnly: true }
const signals = new MockMarketSignalsService()

describe('modelled signals never look like Etsy data', () => {
  it('classifies every demand figure as ESTIMATED with limitations', async () => {
    const k = await signals.getKeyword('birth flower necklace', 'United States')
    expect(k.demand.provenance.type).toBe('ESTIMATED')
    expect(k.demand.provenance.limitations?.length).toBeGreaterThan(0)
    expect(k.demand.provenance.limitations?.join(' ')).toContain('Etsy publishes no search volume')
    expect(k.demand.provenance.confidence).toBeTruthy()
  })

  it('returns a range, never a single figure', async () => {
    const k = await signals.getKeyword('birth flower necklace', 'United States')
    expect(k.demand.value).not.toBeNull()
    expect(k.demand.value!.max).toBeGreaterThan(k.demand.value!.min)
  })

  it('returns UNAVAILABLE with a null value for a term with too little observation', async () => {
    const k = await signals.getKeyword('november birth flower chrysanthemum', 'United States')
    expect(k.demand.provenance.type).toBe('UNAVAILABLE')
    expect(k.demand.value).toBeNull()
    // No score over a missing input.
    expect(k.opportunity).toBeNull()
  })

  it('is deterministic — the same term returns the same range twice', async () => {
    const a = await signals.getKeyword('hand thrown mug set', 'United States')
    const b = await signals.getKeyword('hand thrown mug set', 'United States')
    expect(a.demand.value).toEqual(b.demand.value)
  })

  it('labels opportunity CALCULATED, not ESTIMATED — it is a formula over estimates', async () => {
    const k = await signals.getKeyword('birth flower necklace', 'United States')
    expect(k.opportunity?.provenance.type).toBe('CALCULATED')
    expect(k.opportunity?.provenance.methodology).toContain('divided by')
  })

  it('never claims to know Etsy ranking', async () => {
    const k = await signals.getKeyword('birth flower necklace', 'United States')
    const text = [
      k.demand.provenance.methodology,
      k.competition.provenance.methodology,
      ...(k.competition.provenance.limitations ?? []),
      ...(k.opportunity?.provenance.limitations ?? []),
    ].join(' ')
    expect(text).toMatch(/do not model Etsy ranking|Not a prediction of ranking/)
    expect(text).not.toMatch(/will rank|guaranteed|ranking algorithm we/)
  })

  it('drops competition and trend on a sparse related term rather than filling them in', async () => {
    const related = await signals.getRelated('birth flower necklace', 'United States')
    const sparse = related.find((r) => r.demand.value === null)
    expect(sparse).toBeDefined()
    expect(sparse?.competition).toBeNull()
    expect(sparse?.opportunity).toBeNull()
    expect(sparse?.trend30d).toBeNull()
  })

  it('leaves a gap in the history rather than interpolating across it', async () => {
    const k = await signals.getKeyword('birth flower necklace', 'United States')
    expect(k.history).toHaveLength(12)
    // Nulls are allowed and meaningful; a number is never substituted for one.
    for (const point of k.history) {
      expect(point.index === null || point.index > 0).toBe(true)
    }
  })
})

describe('keyword lists hand off to the bulk editor, they do not write', () => {
  it('produces a DRAFT operation with no confirmation', () => {
    const list = demoLists(DEMO_SHOP_ID)[0]!
    const listings = buildDemoListings().slice(0, 5)
    const op = applyListToListings({
      ctx: CTX,
      list,
      listings,
      now: '2026-08-20T00:00:00.000Z',
      operationId: 'op-from-list',
    })

    expect(op.state).toBe('DRAFT')
    expect(op.items).toHaveLength(5)
    // Every item starts PENDING — nothing has been validated, let alone applied.
    expect(op.items.every((i) => i.status === 'PENDING')).toBe(true)
    expect(op.changes).toEqual([{ kind: 'TAGS', mode: 'ADD', tags: list.terms }])
  })

  it('scopes the operation to the caller’s shop, not the list’s claimed shop', () => {
    const list = { ...demoLists(DEMO_SHOP_ID)[0]!, shopId: 'some-other-shop' }
    const op = applyListToListings({
      ctx: CTX,
      list,
      listings: buildDemoListings().slice(0, 2),
      now: '2026-08-20T00:00:00.000Z',
      operationId: 'op-cross',
    })
    expect(op.shopId).toBe(DEMO_SHOP_ID)
  })
})

describe('the keyword view', () => {
  it('assembles signals, related terms and the shop’s own lists', async () => {
    const view = await getKeywordView(CTX, 'birth flower necklace')
    expect(view.signals.term).toBe('birth flower necklace')
    expect(view.related.length).toBeGreaterThan(0)
    expect(view.lists.length).toBeGreaterThan(0)
    expect(view.savedTerms).toContain('birth flower necklace')
  })
})
