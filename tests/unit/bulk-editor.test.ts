import { describe, expect, it } from 'vitest'
import {
  applicableItems,
  applyOperation,
  applyRollback,
  confirm,
  createDraft,
  fingerprintOf,
  planRollback,
  retryableItems,
  validateOperation,
} from '@/domain/bulk-editor/service'
import { assertTransition, canTransition } from '@/domain/bulk-editor/state-machine'
import { proposeChanges, MAX_TAGS } from '@/domain/bulk-editor/configure'
import type { BulkOperation, FieldChange } from '@/domain/bulk-editor/types'
import { buildDemoListings, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import type { EtsyListing, EtsyService, ListingWriteRequest, ListingWriteResult } from '@/lib/etsy/interface'

/**
 * A writable stub, so the apply and rollback paths are testable without
 * pretending MockEtsyService can write - its refusal is a real property we
 * assert separately, not an obstacle to work around.
 */
function writableEtsy(
  behaviour: (r: ListingWriteRequest, i: number) => ListingWriteResult['status'] = () => 'SUCCEEDED',
): EtsyService & { written: ListingWriteRequest[] } {
  const written: ListingWriteRequest[] = []
  return {
    written,
    canWrite: true,
    mode: 'mock',
    async applyListingChanges(_shopId, requests) {
      written.push(...requests)
      return requests.map((r, i) => {
        const status = behaviour(r, i)
        return status === 'FAILED'
          ? { etsyListingId: r.etsyListingId, status, error: 'Edited on Etsy while this job ran.' }
          : { etsyListingId: r.etsyListingId, status }
      })
    },
    getShop: async () => { throw new Error('not needed') },
    getListings: async () => ({ listings: [], total: 0 }),
    getListing: async () => null,
    getOrders: async () => [],
    getSyncProgress: async () => { throw new Error('not needed') },
    getListingViews: async () => ({ value: null, provenance: { type: 'UNAVAILABLE', source: '', methodology: '' } }),
    getAdsPerformance: async () => ({ value: null, provenance: { type: 'UNAVAILABLE', source: '', methodology: '' } }),
  }
}

const NOW = '2026-08-12T12:00:00.000Z'
const demoCtx = { shopId: DEMO_SHOP_ID, actorId: 'demo-user-salman', readOnly: true }
const liveCtx = { shopId: DEMO_SHOP_ID, actorId: 'demo-user-salman', readOnly: false }

const listings = buildDemoListings().filter((l) => l.state === 'ACTIVE').slice(0, 20)
const priceRise: FieldChange[] = [
  { kind: 'PRICE', mode: 'PERCENT', amount: 8, roundTo: 0.5, skipBelowCostFloor: false },
]
const vctx = { costs: new Map<string, number>(), feeRate: 0.162 }

function readyOperation(changes: FieldChange[] = priceRise, ls: EtsyListing[] = listings) {
  const draft = createDraft({ id: 'BE-9001', ctx: liveCtx, changes, listings: ls, now: NOW })
  return validateOperation(draft, ls, vctx, NOW)
}

describe('the workflow cannot be skipped', () => {
  it('only reaches APPLYING from READY', () => {
    expect(canTransition('DRAFT', 'APPLYING')).toBe(false)
    expect(canTransition('VALIDATING', 'APPLYING')).toBe(false)
    expect(canTransition('READY', 'APPLYING')).toBe(true)
    expect(() => assertTransition('DRAFT', 'APPLYING')).toThrow(/cannot move to that step/)
  })

  it('refuses to confirm an unvalidated job', () => {
    const draft = createDraft({ id: 'BE-1', ctx: liveCtx, changes: priceRise, listings, now: NOW })
    expect(() =>
      confirm({ operation: draft, reviewedFingerprint: 'x', acknowledged: true, ctx: liveCtx, now: NOW }),
    ).toThrow(/has not been validated/)
  })

  it('refuses to confirm without an explicit acknowledgement', () => {
    const { operation } = readyOperation()
    expect(() =>
      confirm({
        operation,
        reviewedFingerprint: operation.fingerprint!,
        acknowledged: false,
        ctx: liveCtx,
        now: NOW,
      }),
    ).toThrow(/have not confirmed/)
  })

  it('refuses to confirm a diff that changed since it was reviewed', () => {
    const { operation } = readyOperation()
    expect(() =>
      confirm({
        operation,
        reviewedFingerprint: 'fp_stale_0',
        acknowledged: true,
        ctx: liveCtx,
        now: NOW,
      }),
    ).toThrow(/changed since you reviewed/)
  })

  it('says plainly that nothing was sent when it refuses', () => {
    const { operation } = readyOperation()
    try {
      confirm({ operation, reviewedFingerprint: 'fp_stale_0', acknowledged: true, ctx: liveCtx, now: NOW })
      expect.unreachable()
    } catch (e) {
      expect((e as { recovery: string }).recovery).toContain('Nothing was sent to Etsy')
    }
  })

  it('confirms when validated, acknowledged and unchanged', () => {
    const { operation } = readyOperation()
    const confirmed = confirm({
      operation,
      reviewedFingerprint: operation.fingerprint!,
      acknowledged: true,
      ctx: liveCtx,
      now: NOW,
    })
    expect(confirmed.state).toBe('READY')
  })
})

describe('demo mode cannot write', () => {
  it('refuses at the confirmation gate, before anything is attempted', () => {
    const draft = createDraft({ id: 'BE-2', ctx: demoCtx, changes: priceRise, listings, now: NOW })
    const { operation } = validateOperation(draft, listings, vctx, NOW)
    expect(() =>
      confirm({
        operation,
        reviewedFingerprint: operation.fingerprint!,
        acknowledged: true,
        ctx: demoCtx,
        now: NOW,
      }),
    ).toThrow(/cannot publish to Etsy/)
  })

  it('refuses again at apply, so the gate is not the only guard', async () => {
    const { operation } = readyOperation()
    const confirmed = confirm({
      operation,
      reviewedFingerprint: operation.fingerprint!,
      acknowledged: true,
      ctx: liveCtx,
      now: NOW,
    })
    await expect(applyOperation(confirmed, demoCtx, NOW)).rejects.toThrow(/cannot publish to Etsy/)
  })

  it('the mock adapter refuses writes even when handed a confirmed operation', async () => {
    const { operation } = readyOperation()
    const confirmed = confirm({
      operation,
      reviewedFingerprint: operation.fingerprint!,
      acknowledged: true,
      ctx: liveCtx,
      now: NOW,
    })
    // liveCtx passes the permission gate; the adapter itself still says no.
    await expect(applyOperation(confirmed, liveCtx, NOW)).rejects.toThrow(/cannot publish to Etsy/)
  })
})

describe('the fingerprint detects drift', () => {
  it('is stable for the same change set', () => {
    const a = readyOperation().operation
    const b = readyOperation().operation
    expect(a.fingerprint).toBe(b.fingerprint)
  })

  it('changes when a listing’s value changes', () => {
    // Use listings that actually get written - a blocked listing is excluded
    // from the fingerprint by design, so moving its price proves nothing.
    const clean = listings.slice(0, 3).map((l) => ({ ...l, requiredAttributes: [] }))
    const a = readyOperation(priceRise, clean).operation
    const moved = clean.map((l, i) => (i === 0 ? { ...l, price: l.price + 5 } : l))
    const b = readyOperation(priceRise, moved).operation
    expect(a.fingerprint).not.toBe(b.fingerprint)
  })

  it('ignores blocked and skipped items, which are not being written', () => {
    const items = [
      { listingId: 'a', title: 't', sku: null, status: 'READY' as const, diffs: [{ field: 'Price', before: '1.00', after: '2.00' }], notes: [], attempts: 0 },
      { listingId: 'b', title: 't', sku: null, status: 'BLOCKED' as const, diffs: [], notes: [], attempts: 0 },
    ]
    const withoutBlocked = [items[0]!]
    expect(fingerprintOf(items)).toBe(fingerprintOf(withoutBlocked))
  })
})

describe('validation separates what will happen from what will not', () => {
  it('blocks a listing missing a required attribute', () => {
    const blocked: EtsyListing = {
      ...listings[0]!,
      requiredAttributes: ['Metal purity'],
      attributes: { 'Metal purity': null },
    }
    const { summary } = readyOperation(priceRise, [blocked])
    expect(summary.blocked).toBe(1)
  })

  it('warns rather than silently truncating past the tag limit', () => {
    const full: EtsyListing = { ...listings[0]!, tags: Array.from({ length: MAX_TAGS }, (_, i) => `t${i}`), requiredAttributes: [] }
    const add: FieldChange[] = [{ kind: 'TAGS', mode: 'ADD', tags: ['new tag'] }]
    const { operation, summary } = readyOperation(add, [full])

    expect(summary.warnings).toBe(1)
    // The over-length result is preserved, not quietly trimmed.
    expect(proposeChanges(full, add).tags).toHaveLength(MAX_TAGS + 1)
    expect(operation.items[0]?.notes[0]?.code).toBe('TAG_LIMIT')
  })

  it('excludes below-cost listings when the guard is on, and says so', () => {
    const l = { ...listings[0]!, price: 10, requiredAttributes: [] }
    const drop: FieldChange[] = [
      { kind: 'PRICE', mode: 'PERCENT', amount: -50, skipBelowCostFloor: true },
    ]
    const ctx = { costs: new Map([[l.etsyListingId, 8]]), feeRate: 0.162 }
    const draft = createDraft({ id: 'BE-3', ctx: liveCtx, changes: drop, listings: [l], now: NOW })
    const { operation } = validateOperation(draft, [l], ctx, NOW)

    expect(operation.items[0]?.status).toBe('SKIPPED')
    expect(operation.items[0]?.notes[0]?.code).toBe('BELOW_COST_FLOOR')
    expect(applicableItems(operation)).toHaveLength(0)
  })

  it('blocks a price change that would reach zero', () => {
    const l = { ...listings[0]!, requiredAttributes: [] }
    const wipe: FieldChange[] = [{ kind: 'PRICE', mode: 'PERCENT', amount: -100, skipBelowCostFloor: false }]
    const { summary } = readyOperation(wipe, [l])
    expect(summary.blocked).toBe(1)
  })

  it('blocks a listing that disappeared between selection and validation', () => {
    const draft = createDraft({ id: 'BE-4', ctx: liveCtx, changes: priceRise, listings, now: NOW })
    const { summary } = validateOperation(draft, [], vctx, NOW)
    expect(summary.blocked).toBe(listings.length)
    expect(summary.groups[0]?.code).toBe('LISTING_GONE')
  })

  it('groups repeated notes into one line with a count', () => {
    const full = Array.from({ length: 6 }, (_, i) => ({
      ...listings[0]!,
      etsyListingId: `L-full-${i}`,
      tags: Array.from({ length: MAX_TAGS }, (_, t) => `t${t}`),
      requiredAttributes: [],
    }))
    const add: FieldChange[] = [{ kind: 'TAGS', mode: 'ADD', tags: ['new'] }]
    const { summary } = readyOperation(add, full)
    expect(summary.groups).toHaveLength(1)
    expect(summary.groups[0]?.count).toBe(6)
  })

  it('never writes a blocked item', () => {
    const blocked: EtsyListing = {
      ...listings[0]!,
      requiredAttributes: ['Metal purity'],
      attributes: { 'Metal purity': null },
    }
    const { operation } = readyOperation(priceRise, [blocked, { ...listings[1]!, requiredAttributes: [] }])
    expect(applicableItems(operation).map((i) => i.listingId)).not.toContain(blocked.etsyListingId)
  })
})

describe('configuration is deterministic', () => {
  it('rounds to the configured multiple', () => {
    const l = { ...listings[0]!, price: 38 }
    expect(proposeChanges(l, priceRise).price).toBe(41)
  })

  it('adds only tags that are not already present', () => {
    const l = { ...listings[0]!, tags: ['alpha', 'beta'] }
    const add: FieldChange[] = [{ kind: 'TAGS', mode: 'ADD', tags: ['Alpha', 'gamma'] }]
    expect(proposeChanges(l, add).tags).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('never takes quantity below zero', () => {
    const l = { ...listings[0]!, quantity: 2 }
    const drop: FieldChange[] = [{ kind: 'QUANTITY', mode: 'ADJUST', amount: -10 }]
    expect(proposeChanges(l, drop).quantity).toBe(0)
  })
})

describe('rollback rechecks the current state', () => {
  const applied: BulkOperation = {
    id: 'BE-5',
    shopId: DEMO_SHOP_ID,
    actorId: 'demo-user-salman',
    state: 'COMPLETED',
    changes: priceRise,
    items: [
      { listingId: 'L1', title: 'A', sku: null, status: 'SUCCEEDED', diffs: [{ field: 'Price', before: '38.00', after: '41.00' }], notes: [], attempts: 1 },
      { listingId: 'L2', title: 'B', sku: null, status: 'SUCCEEDED', diffs: [{ field: 'Price', before: '34.00', after: '36.50' }], notes: [], attempts: 1 },
    ],
    createdAt: NOW,
    rollbackExpiresAt: '2026-09-11T12:00:00.000Z',
    approvalState: null,
  }

  const listing = (id: string, price: number): EtsyListing => ({
    ...listings[0]!, etsyListingId: id, price, tags: [], quantity: 0, state: 'ACTIVE',
  })

  it('skips a listing edited on Etsy since the job, rather than overwriting it', () => {
    const plan = planRollback(applied, [listing('L1', 41), listing('L2', 45)], NOW)
    expect(plan.restorable.map((i) => i.listingId)).toEqual(['L1'])
    expect(plan.skipped[0]?.item.listingId).toBe('L2')
    expect(plan.skipped[0]?.reason).toContain('changed on Etsy after this job ran')
  })

  it('skips a listing that no longer exists', () => {
    const plan = planRollback(applied, [listing('L1', 41)], NOW)
    expect(plan.skipped[0]?.reason).toContain('No longer in your shop')
  })

  it('refuses once the rollback window has closed', async () => {
    const plan = planRollback(applied, [listing('L1', 41), listing('L2', 36.5)], '2026-10-01T00:00:00.000Z')
    expect(plan.expired).toBe(true)
    await expect(
      applyRollback({ ...applied, state: 'ROLLBACK_AVAILABLE' }, plan, liveCtx, NOW, writableEtsy()),
    ).rejects.toThrow(/rollback window/)
  })

  it('writes new events rather than deleting the originals', async () => {
    const plan = planRollback(applied, [listing('L1', 41), listing('L2', 36.5)], NOW)
    const result = await applyRollback(
      { ...applied, state: 'ROLLBACK_AVAILABLE' }, plan, liveCtx, NOW, writableEtsy(),
    )

    expect(result.operation.state).toBe('ROLLED_BACK')
    expect(result.events).toHaveLength(2)
    // The rollback event reverses the original: its before is the job's after.
    expect(result.events[0]?.beforeValue).toBe('41.00')
    expect(result.events[0]?.afterValue).toBe('38.00')
    expect(result.events[0]?.type).toBe('BULK_EDIT_ROLLED_BACK')
  })
})

describe('apply produces per-item results and an audit trail', () => {
  it('writes only the applicable items and records an event for each change', async () => {
    const clean = listings.slice(0, 3).map((l) => ({ ...l, requiredAttributes: [] }))
    const { operation } = readyOperation(priceRise, clean)
    const confirmed = confirm({
      operation, reviewedFingerprint: operation.fingerprint!, acknowledged: true, ctx: liveCtx, now: NOW,
    })
    const etsy = writableEtsy()
    const result = await applyOperation(confirmed, liveCtx, NOW, etsy)

    expect(etsy.written).toHaveLength(3)
    expect(result.operation.state).toBe('COMPLETED')
    expect(result.progress.succeeded).toBe(3)
    // Every mutation carries the operation ID, which is what Change History reads.
    expect(result.events.every((e) => e.operationId === 'BE-9001')).toBe(true)
    expect(result.events.every((e) => e.source === 'BULK_EDIT')).toBe(true)
    expect(result.events.every((e) => e.actorId === 'demo-user-salman')).toBe(true)
  })

  it('lands in PARTIAL_SUCCESS when some items fail, and keeps the reason', async () => {
    const clean = listings.slice(0, 3).map((l) => ({ ...l, requiredAttributes: [] }))
    const { operation } = readyOperation(priceRise, clean)
    const confirmed = confirm({
      operation, reviewedFingerprint: operation.fingerprint!, acknowledged: true, ctx: liveCtx, now: NOW,
    })
    const result = await applyOperation(
      confirmed, liveCtx, NOW, writableEtsy((_r, i) => (i === 0 ? 'FAILED' : 'SUCCEEDED')),
    )

    expect(result.operation.state).toBe('PARTIAL_SUCCESS')
    expect(result.progress.failed).toBe(1)
    expect(result.progress.succeeded).toBe(2)
    const failed = result.operation.items.find((i) => i.status === 'FAILED')
    expect(failed?.error).toContain('Edited on Etsy while this job ran')
    // No event for the item that did not land.
    expect(result.events.some((e) => e.listingId === failed?.listingId)).toBe(false)
  })

  it('opens a rollback window on success', async () => {
    const clean = listings.slice(0, 2).map((l) => ({ ...l, requiredAttributes: [] }))
    const { operation } = readyOperation(priceRise, clean)
    const confirmed = confirm({
      operation, reviewedFingerprint: operation.fingerprint!, acknowledged: true, ctx: liveCtx, now: NOW,
    })
    const result = await applyOperation(confirmed, liveCtx, NOW, writableEtsy())
    expect(result.operation.rollbackExpiresAt).toBe('2026-09-11T12:00:00.000Z')
  })
})

describe('partial success is an ordinary outcome', () => {
  it('retries only what failed', () => {
    const op = {
      items: [
        { listingId: 'a', status: 'SUCCEEDED' as const, title: '', sku: null, diffs: [], notes: [], attempts: 1 },
        { listingId: 'b', status: 'FAILED' as const, title: '', sku: null, diffs: [], notes: [], attempts: 1 },
      ],
    } as unknown as BulkOperation
    expect(retryableItems(op).map((i) => i.listingId)).toEqual(['b'])
  })
})

describe('a refusal is not a failure', () => {
  it('records a reason on every item when the whole batch fails', async () => {
    const clean = listings.slice(0, 2).map((l) => ({ ...l, requiredAttributes: [] }))
    const { operation } = readyOperation(priceRise, clean)
    const confirmed = confirm({
      operation, reviewedFingerprint: operation.fingerprint!, acknowledged: true, ctx: liveCtx, now: NOW,
    })

    const unreachable = writableEtsy()
    unreachable.applyListingChanges = async () => {
      const { Errors } = await import('@/lib/errors/types')
      throw Errors.etsyUnavailable()
    }

    const result = await applyOperation(confirmed, liveCtx, NOW, unreachable)
    expect(result.operation.state).toBe('FAILED')
    // Not a silent red job: every item says why.
    expect(result.operation.items.every((i) => i.error)).toBe(true)
    expect(result.operation.items[0]?.error).toContain('could not reach Etsy')
  })
})
