/*
 * Rollback is the most destructive thing this product does, so it is the most
 * gated.
 *
 * Four refusals, and each one exists because the alternative is silent damage:
 *
 *   NOT_ACKNOWLEDGED  the seller did not tick the box naming the count
 *   NOTHING_LEFT      every listing has moved, so restoring overwrites newer work
 *   CATALOGUE_MOVED   the set changed between confirming and applying
 *   READ_ONLY         demo mode cannot write, and the log records that it did not
 *
 * The one worth being hardest about is CATALOGUE_MOVED. A rollback that applied
 * to "whatever is left" after the confirmed set changed would be a write the
 * seller never agreed to, aimed at listings they never saw.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { getChangeHistory, driftOf } from '@/domain/change-history/service'
import { applyRollback, rollbackFingerprint, RollbackRefused, refusalFromQuery } from '@/domain/change-history/rollback'
import { outcomeLabel, outcomeOf, type ChangeJob } from '@/domain/change-history/types'
import { demoChangeHistory, resetChangeJobs } from '@/domain/change-history/demo'
import { readAuditRecords, resetAuditRecords } from '@/domain/audit-log/store'
import { recordKey } from '@/domain/audit-log/service'
import { isRefusal } from '@/domain/audit-log/types'
import { buildDemoListings, DEMO_ACTOR_ID, DEMO_NOW, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import { shopContext, type ShopContext } from '@/lib/permissions'

const SESSION = {
  userId: DEMO_ACTOR_ID,
  email: 'a@b.c',
  name: 'A',
  shopId: DEMO_SHOP_ID,
  isDemo: true, kind: 'SELLER' as const,
}
const DEMO_CTX = shopContext(SESSION, DEMO_SHOP_ID)
const LIVE_CTX: ShopContext = { ...DEMO_CTX, readOnly: false }

const listings = buildDemoListings()

function jobFor(id: string): ChangeJob {
  const job = demoChangeHistory(listings)!.find((j) => j.id === id)
  if (!job) throw new Error(`no job ${id}`)
  return job
}

function request(job: ChangeJob, overrides: Record<string, unknown> = {}) {
  const drift = driftOf(job, listings)
  return {
    job,
    listings,
    confirmedFingerprint: rollbackFingerprint(drift),
    acknowledged: true,
    actor: 'Salman',
    now: DEMO_NOW,
    ...overrides,
  }
}

describe('outcome', () => {
  it('names a failure before anything else', async () => {
    const job = jobFor('4821')
    expect(outcomeOf(job).failed).toBe(1)
    expect(outcomeLabel(job)).toBe('1 failed')
  })

  it('never says Approved over a job with a failure in it', async () => {
    const ai = { ...jobFor('4788'), items: [...jobFor('4788').items] }
    expect(outcomeLabel(ai)).toBe('Approved')
    const broken: ChangeJob = {
      ...ai,
      items: [{ ...ai.items[0]!, status: 'FAILED' as const }],
    }
    expect(outcomeLabel(broken)).toBe('1 failed')
  })
})

describe('drift', () => {
  it('finds the listings that changed on Etsy after the job', async () => {
    const drift = driftOf(jobFor('4821'), listings)
    // Measured by comparing the recorded value against the live listing, not
    // read from a flag on the job.
    expect(drift.blocked.length).toBe(3)
    expect(drift.blocked[0]!.reason).toContain('changed on Etsy')
  })

  it('excludes items that never landed — a failure has nothing to restore', async () => {
    const job = jobFor('4821')
    const drift = driftOf(job, listings)
    const failed = job.items.filter((i) => i.status === 'FAILED').length
    expect(drift.restorable.length + drift.blocked.length).toBe(job.items.length - failed)
  })

  it('blocks a listing that has left the shop', async () => {
    const job = jobFor('4788')
    const drift = driftOf(job, [])
    expect(drift.restorable).toHaveLength(0)
    expect(drift.blocked[0]!.reason).toContain('No longer in your shop')
  })
})

describe('the rollback gate', () => {
  beforeEach(() => {
    resetChangeJobs()
    resetAuditRecords()
  })

  it('refuses without the acknowledgement', async () => {
    await expect(
      applyRollback(LIVE_CTX, request(jobFor('4821'), { acknowledged: false })),
    ).rejects.toThrow(RollbackRefused)
  })

  it('refuses a fingerprint that does not match the current set', async () => {
    try {
      await applyRollback(LIVE_CTX, request(jobFor('4821'), { confirmedFingerprint: 'rb_dead_1' }))
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(RollbackRefused)
      expect((error as RollbackRefused).reason).toBe('CATALOGUE_MOVED')
    }
  })

  it('records a refusal in the audit log as nothing sent', async () => {
    resetAuditRecords()
    try {
      await applyRollback(LIVE_CTX, request(jobFor('4821'), { confirmedFingerprint: 'rb_dead_1' }))
    } catch {
      /* expected */
    }
    const refusals = (await readAuditRecords(DEMO_SHOP_ID)).filter(isRefusal)
    expect(refusals.some((r) => r.action === 'Rollback refused')).toBe(true)
  })

  it('refuses in demo mode, and says nothing was sent', async () => {
    try {
      await applyRollback(DEMO_CTX, request(jobFor('4821')))
      throw new Error('should have refused')
    } catch (error) {
      expect(error).toBeInstanceOf(RollbackRefused)
      expect((error as RollbackRefused).reason).toBe('READ_ONLY')
    }
    const record = (await readAuditRecords(DEMO_SHOP_ID)).find((r) => r.action === 'Rollback refused')
    expect(record?.reached).toEqual({ kind: 'NOTHING_SENT' })
  })

  it('applies only what it confirmed, and appends rather than deletes', async () => {
    const job = jobFor('4821')
    const before = demoChangeHistory(listings)!.length
    const result = await applyRollback(LIVE_CTX, request(job))

    const drift = driftOf(job, listings)
    expect(result.restored).toBe(drift.restorable.length)
    expect(result.skipped).toBe(drift.blocked.length)

    const after = demoChangeHistory(listings)!
    expect(after.length).toBe(before + 1)
    // The job it reversed is still there. History is append-only.
    expect(after.some((j) => j.id === job.id)).toBe(true)
    expect(after.some((j) => j.id === `${job.id}-R`)).toBe(true)
  })

  it('writes the rollback the other way round', async () => {
    const job = jobFor('4821')
    await applyRollback(LIVE_CTX, request(job))
    const rollback = demoChangeHistory(listings)!.find((j) => j.id === `${job.id}-R`)!
    const original = job.items.find((i) => i.listingId === rollback.items[0]!.listingId)!
    // The rollback's after is the original's before, which is the whole point.
    expect(rollback.items[0]!.after).toBe(original.before)
    expect(rollback.items[0]!.before).toBe(original.after)
  })

  it('gives each audit record its own address', async () => {
    try {
      await applyRollback(DEMO_CTX, request(jobFor('4821')))
    } catch {
      /* expected */
    }
    try {
      await applyRollback(DEMO_CTX, request(jobFor('4821'), { confirmedFingerprint: 'rb_dead_1' }))
    } catch {
      /* expected */
    }
    /*
     * Through recordKey, not a hand-rolled copy of the format.
     *
     * The first version of this test built `id@at` itself — the address BEFORE
     * the sequence was added — so it asserted uniqueness of a format the
     * product no longer uses, and failed or passed depending on whether the two
     * refusals landed in the same millisecond. A test that re-implements the
     * thing it is testing is testing its own copy.
     */
    const keys = (await readAuditRecords(DEMO_SHOP_ID)).map(recordKey)
    expect(keys.length).toBeGreaterThan(8)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('refusalFromQuery', () => {
  it('accepts only the closed set', async () => {
    expect(refusalFromQuery('READ_ONLY')).toBe('READ_ONLY')
    expect(refusalFromQuery('<script>')).toBeNull()
    expect(refusalFromQuery(undefined)).toBeNull()
  })
})

describe('the view', () => {
  beforeEach(() => resetChangeJobs())

  it('reads the rollback window from the plan, not a constant', async () => {
    const view = await getChangeHistory(DEMO_CTX)
    expect(view.rollbackWindowDays).toBe(view.plan.limits.rollbackDays)
  })

  it('reaches both an available and an expired rollback state', async () => {
    const view = await getChangeHistory(DEMO_CTX)
    const kinds = new Set(view.rows.map((r) => r.rollback.kind))
    // "Expired" was unreachable while every demo job was four days old.
    expect(kinds.has('AVAILABLE')).toBe(true)
    expect(kinds.has('WINDOW_CLOSED')).toBe(true)
  })

  it('counts down from the job date rather than reporting the whole window', async () => {
    const view = await getChangeHistory(DEMO_CTX)
    const days = view.rows
      .map((r) => (r.rollback.kind === 'AVAILABLE' ? r.rollback.daysLeft : null))
      .filter((d): d is number => d !== null)
    expect(new Set(days).size).toBeGreaterThan(1)
  })
})
