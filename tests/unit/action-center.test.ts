import { describe, expect, it } from 'vitest'
import { getActions } from '@/domain/action-center/service'
import { compareActions, matchesFilter, type Action } from '@/domain/action-center/types'
import { DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'

const ctx = { shopId: DEMO_SHOP_ID, actorId: 'demo-user-salman', readOnly: true }

describe('action center', () => {
  it('every action has a destination — no dead ends', async () => {
    const { actions } = await getActions(ctx)
    expect(actions.length).toBeGreaterThan(0)
    for (const a of actions) {
      expect(a.destination.href).toBeTruthy()
      expect(a.destination.label).toBeTruthy()
    }
  })

  it('every action names its evidence with a provenance class', async () => {
    const { actions } = await getActions(ctx)
    for (const a of actions) {
      expect(a.evidence.summary).toBeTruthy()
      expect(a.evidence.source).toBeTruthy()
      expect(a.evidence.provenance).toBeTruthy()
    }
  })

  it('covers all four lifecycle states from artboard 108', async () => {
    const { actions } = await getActions(ctx)
    const statuses = actions.map((a) => a.status)
    expect(statuses).toContain('OPEN')
    expect(statuses).toContain('IN_PROGRESS')
    expect(statuses).toContain('COMPLETED')
    expect(statuses).toContain('DISMISSED')
  })

  it('a dismissed action keeps its reason so it can be restored', async () => {
    const { actions } = await getActions(ctx)
    const dismissed = actions.find((a) => a.status === 'DISMISSED')
    expect(dismissed?.dismissedReason).toBeTruthy()
    expect(dismissed?.dismissedAt).toBeTruthy()
    expect(dismissed?.dismissedBy).toBeTruthy()
  })

  it('a completed action carries its operation ID and a measured outcome', async () => {
    const { actions } = await getActions(ctx)
    const done = actions.find((a) => a.status === 'COMPLETED')
    expect(done?.operationId).toBeTruthy()
    expect(done?.completedAt).toBeTruthy()
    expect(done?.outcome).toContain('measured')
  })

  it('an in-progress action reports partial counts', async () => {
    const { actions } = await getActions(ctx)
    const wip = actions.find((a) => a.status === 'IN_PROGRESS')
    expect(wip?.progress?.total).toBeGreaterThan(wip?.progress?.current ?? 0)
  })

  it('counts each filter independently', async () => {
    const { actions, counts } = await getActions(ctx)
    expect(counts.OPEN).toBe(actions.filter((a) => matchesFilter(a, 'OPEN')).length)
    expect(counts.DONE).toBe(1)
    expect(counts.DISMISSED).toBe(1)
  })

  it('sorts open work above the record, then by severity', () => {
    const base: Omit<Action, 'id' | 'status' | 'severity' | 'priority'> = {
      shopId: 's',
      title: 't',
      explanation: 'e',
      evidence: { summary: 's', provenance: 'VERIFIED', source: 'x' },
      destination: { label: 'go', href: '/x' },
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    const unsorted: Action[] = [
      { ...base, id: '3', status: 'DISMISSED', severity: 'CRITICAL', priority: 1 },
      { ...base, id: '2', status: 'OPEN', severity: 'ATTENTION', priority: 5 },
      { ...base, id: '1', status: 'OPEN', severity: 'CRITICAL', priority: 9 },
    ]
    const sorted = [...unsorted].sort(compareActions)

    // A dismissed CRITICAL sorts below an open ATTENTION: the record is not work.
    expect(sorted.map((a) => a.id)).toEqual(['1', '2', '3'])
  })
})

describe('Shop Pulse feeds the same queue', () => {
  it('turns pulse findings into actions rather than a parallel list', async () => {
    const { actions } = await getActions(ctx)
    expect(actions.some((a) => a.id.startsWith('ACT-PULSE-'))).toBe(true)
  })

  it('surfaces the unexplained drop and refuses to name a cause', async () => {
    const { actions } = await getActions(ctx)
    const unknown = actions.find((a) => a.title.includes('no recorded change'))
    expect(unknown).toBeDefined()
    expect(unknown?.explanation).toContain('not guessing at a cause')
    expect(unknown?.destination.href).toBe('/shop-pulse')
  })

  it('does not make work out of a ruled-out finding', async () => {
    const { actions } = await getActions(ctx)
    expect(actions.some((a) => a.title.toLowerCase().includes('tags replaced'))).toBe(false)
  })

  it('describes a correlation as a correlation, never a cause', async () => {
    const { actions } = await getActions(ctx)
    const correlated = actions.filter((a) => a.id.startsWith('ACT-PULSE-'))
    for (const a of correlated) {
      const text = `${a.title} ${a.explanation}`.toLowerCase()
      expect(text).not.toContain('caused')
      expect(text).not.toContain('because etsy')
    }
  })
})

describe('the unexplained finding is never truncated away', () => {
  it('keeps every UNKNOWN finding even when larger correlated ones exist', async () => {
    const { actions } = await getActions(ctx)
    const pulseActions = actions.filter((a) => a.id.startsWith('ACT-PULSE-'))
    const unknowns = pulseActions.filter((a) => a.title.includes('no recorded change'))
    expect(unknowns.length).toBeGreaterThan(0)
  })

  it('ranks the unexplained drop above the correlated ones', async () => {
    const { actions } = await getActions(ctx)
    const pulseActions = actions.filter((a) => a.id.startsWith('ACT-PULSE-'))
    expect(pulseActions[0]?.title).toContain('no recorded change')
  })
})
