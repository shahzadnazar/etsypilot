/*
 * The audit log's one structural guarantee.
 *
 * "Refused only" and the Reached Etsy column must be able to disagree about
 * nothing, because a dispute is argued from both at once. They read one field,
 * and these tests are what stop a `refused: boolean` from being added beside it
 * later "for convenience".
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { demoAuditRecords } from '@/domain/audit-log/demo-records'
import { costChangeRecord } from '@/domain/audit-log/events'
import { appendAuditRecord, readAuditRecords, resetAuditRecords } from '@/domain/audit-log/store'
import { getAuditLogView, recordKey } from '@/domain/audit-log/service'
import { isRefusal, reachedLabel, type AuditRecord } from '@/domain/audit-log/types'
import { defaultCostSettings } from '@/domain/costs/store'
import { shopContext } from '@/lib/permissions'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'

const CTX = shopContext(
  { userId: DEMO_ACTOR_ID, email: 'a@b.c', name: 'A', shopId: DEMO_SHOP_ID, isDemo: true },
  DEMO_SHOP_ID,
)

describe('reachedLabel', () => {
  it('says Yes only when every item succeeded', () => {
    expect(reachedLabel({ kind: 'SENT', succeeded: 12, attempted: 12 })).toBe('Yes · 12 of 12')
    expect(reachedLabel({ kind: 'SENT', succeeded: 8, attempted: 9 })).toBe('Partly · 8 of 9')
    // The word cannot be written independently of the counts, which is the
    // point: a row cannot claim "Yes" over 8 of 9.
    expect(reachedLabel({ kind: 'SENT', succeeded: 0, attempted: 9 })).toBe('Partly · 0 of 9')
  })

  it('distinguishes nothing-sent from never-going-to-send', () => {
    expect(reachedLabel({ kind: 'NOTHING_SENT' })).toBe('No · nothing sent')
    expect(reachedLabel({ kind: 'NOT_APPLICABLE', reason: 'AUTHORISATION' })).toBe('— authorisation')
    expect(reachedLabel({ kind: 'NOT_APPLICABLE', reason: 'ETSYPILOT_ONLY' })).toBe('— EtsyPilot only')
    expect(reachedLabel({ kind: 'NOT_APPLICABLE', reason: 'READ_ONLY' })).toBe('— read only')
  })
})

describe('isRefusal', () => {
  const record = (reached: AuditRecord['reached']): AuditRecord => ({
    ...demoAuditRecords()[0]!,
    reached,
  })

  it('is exactly "meant to reach Etsy and sent nothing"', () => {
    expect(isRefusal(record({ kind: 'NOTHING_SENT' }))).toBe(true)
    expect(isRefusal(record({ kind: 'SENT', succeeded: 8, attempted: 9 }))).toBe(false)
    /*
     * Not a refusal. Confirming a diff never intended to send anything, and
     * counting it as refused would put an authorisation step in the list a
     * seller opens to find out what EtsyPilot would not do.
     */
    expect(isRefusal(record({ kind: 'NOT_APPLICABLE', reason: 'AUTHORISATION' }))).toBe(false)
  })
})

describe('the demo log', () => {
  it('records refusals, which is what it is for', () => {
    const refusals = demoAuditRecords().filter(isRefusal)
    expect(refusals).toHaveLength(2)
    expect(refusals.map((r) => r.action).sort()).toEqual([
      'Apply refused',
      'Write refused — demo mode',
    ])
  })

  it('explains every refusal in words', () => {
    for (const record of demoAuditRecords().filter(isRefusal)) {
      // A refusal with no reason is a dead end in the surface a dispute uses.
      expect(record.explanation, record.id).toBeTruthy()
      expect(record.explanation!.length).toBeGreaterThan(40)
    }
  })

  it('gives every record a unique address', () => {
    const keys = demoAuditRecords().map(recordKey)
    // BE-2291 appears twice — confirm and apply — so the id alone is not one.
    expect(new Set(keys).size).toBe(keys.length)
    expect(demoAuditRecords().filter((r) => r.id === 'BE-2291')).toHaveLength(2)
  })

  it('never shows a diff for something that was actually applied', () => {
    for (const record of demoAuditRecords()) {
      if (record.wouldHaveChanged.length > 0) expect(isRefusal(record), record.id).toBe(true)
    }
  })
})

describe('the store', () => {
  beforeEach(() => resetAuditRecords())

  it('returns newest first', () => {
    const times = readAuditRecords('shop-a').map((r) => r.at)
    expect([...times].sort().reverse()).toEqual(times)
  })

  it('keeps shops apart', () => {
    appendAuditRecord('shop-a', { ...demoAuditRecords()[0]!, id: 'ONLY-A' })
    expect(readAuditRecords('shop-a').some((r) => r.id === 'ONLY-A')).toBe(true)
    expect(readAuditRecords('shop-b').some((r) => r.id === 'ONLY-A')).toBe(false)
  })

  it('hands out a copy, so a caller cannot rewrite history through it', () => {
    const records = readAuditRecords('shop-a')
    records.splice(0, records.length)
    expect(readAuditRecords('shop-a').length).toBeGreaterThan(0)
  })
})

describe('cost changes become records', () => {
  it('records nothing when nothing changed', () => {
    const settings = defaultCostSettings()
    expect(costChangeRecord({ before: settings, after: settings, actor: 'Salman' })).toBeNull()
  })

  it('records an EtsyPilot-only change, never a send', () => {
    const before = defaultCostSettings()
    const record = costChangeRecord({
      before,
      after: { ...before, defaultRulePercent: 0.38 },
      actor: 'Salman',
      at: '2026-08-13T09:00:00.000Z',
    })
    expect(record).not.toBeNull()
    expect(record!.reached).toEqual({ kind: 'NOT_APPLICABLE', reason: 'ETSYPILOT_ONLY' })
    // And therefore not a refusal, whatever the filter is doing.
    expect(isRefusal(record!)).toBe(false)
    expect(record!.detail).toContain('→')
  })

  it('names a blank ad spend as "not set" rather than printing nothing', () => {
    const before = defaultCostSettings()
    const record = costChangeRecord({
      before,
      after: { ...before, adSpend: 1142 },
      actor: 'Salman',
      at: '2026-08-13T09:00:00.000Z',
    })
    expect(record!.detail).toContain('not set → $1,142.00')
  })
})

describe('the view', () => {
  beforeEach(() => resetAuditRecords())

  function view(query: Parameters<typeof getAuditLogView>[1] = {}) {
    return getAuditLogView(CTX, query)
  }

  it('counts every record, not the filtered ones', async () => {
    const filtered = await view({ filter: 'REFUSED' })
    expect(filtered.records.every(isRefusal)).toBe(true)
    expect(filtered.records.length).toBe(filtered.refusedCount)
    expect(filtered.total).toBeGreaterThan(filtered.refusedCount)
  })

  it('treats an unrecognised source as no filter at all', async () => {
    const all = await view()
    const nonsense = await view({ source: 'DROP TABLE' })
    // Never an empty table with no explanation, which is what a naive
    // equality filter on an unknown value would produce.
    expect(nonsense.records.length).toBe(all.records.length)
    expect(nonsense.source).toBe('ALL')
  })

  it('searches the operation id, the actor and the detail', async () => {
    expect((await view({ q: 'BE-2288' })).records.length).toBeGreaterThan(0)
    expect((await view({ q: 'fingerprint' })).records.length).toBeGreaterThan(0)
    expect((await view({ q: 'nothing at all like this' })).records).toHaveLength(0)
  })

  it('opens the drawer on the addressed record, not the first with that id', async () => {
    const all = await view()
    const confirm = all.records.find((r) => r.action === 'Diff confirmed')!
    const opened = await view({ record: recordKey(confirm) })
    expect(opened.selected?.action).toBe('Diff confirmed')
  })

  it('states retention for every plan that keeps records', async () => {
    const v = await view()
    expect(v.retentionByPlan.length).toBeGreaterThan(1)
    for (const entry of v.retentionByPlan) expect(entry.days).toBeGreaterThan(0)
  })
})
