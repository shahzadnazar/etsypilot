/*
 * Rolling a job back.
 *
 * Same gate as the bulk editor, for the same reason: the seller confirms a
 * SPECIFIC set of listings, and the set is re-planned and fingerprinted at
 * apply time. If the catalogue moved between the confirmation and the write,
 * the operation is REFUSED rather than quietly applied to whatever is left.
 *
 * That refusal is the behaviour artboard 109's BE-2288 record describes. It is
 * a real code path, not an illustration.
 */

import { appendAuditRecord } from '@/domain/audit-log/store'
import { AppError } from '@/lib/errors/types'
import { assertCanWrite, type ShopContext } from '@/lib/permissions'
import type { EtsyListing } from '@/lib/etsy/interface'
import { driftOf, type DriftReport } from './service'
import { appendChangeJob } from './store'
import type { AuditRecord } from '@/domain/audit-log/types'
import type { ChangeItem, ChangeJob } from './types'

/**
 * A fingerprint of exactly what would be restored.
 *
 * Order-independent and value-sensitive, so re-planning an unchanged catalogue
 * reproduces it and any real difference breaks it. Small and non-cryptographic
 * on purpose: it detects drift, it does not defend against an adversary — the
 * server re-plans before writing regardless.
 */
export function rollbackFingerprint(drift: DriftReport): string {
  const canonical = drift.restorable
    .map(({ item }) => `${item.listingId}:${item.field}=${item.after}>${item.before}`)
    .sort()
    .join('|')

  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    hash = (Math.imul(31, hash) + canonical.charCodeAt(i)) | 0
  }
  return `rb_${(hash >>> 0).toString(16)}_${drift.restorable.length}`
}

/*
 * Why a rollback was refused, as a closed set.
 *
 * The route needs to turn a refusal into a query parameter, and the first
 * attempt matched on the error's MESSAGE — so a copy edit would silently
 * reclassify a refusal, and the page would explain the wrong thing. The reason
 * is part of the error now.
 */
export const REFUSAL_REASONS = [
  'NOT_ACKNOWLEDGED',
  'NOTHING_LEFT',
  'CATALOGUE_MOVED',
  'READ_ONLY',
] as const
export type RefusalReason = (typeof REFUSAL_REASONS)[number]

export class RollbackRefused extends AppError {
  readonly reason: RefusalReason

  constructor(reason: RefusalReason, message: string, recovery: string) {
    super({ kind: 'VALIDATION', code: `ROLLBACK_${reason}`, message, recovery })
    this.reason = reason
  }
}

export function refusalFromQuery(value: string | undefined): RefusalReason | null {
  return REFUSAL_REASONS.includes(value as RefusalReason) ? (value as RefusalReason) : null
}

export const REFUSAL_COPY: Record<RefusalReason, { title: string; detail: string }> = {
  NOT_ACKNOWLEDGED: {
    title: 'The rollback was not confirmed.',
    detail:
      'Tick the box that names how many listings will be restored, then try again. Nothing was changed.',
  },
  NOTHING_LEFT: {
    title: 'There is nothing left to restore in this job.',
    detail:
      'Every listing it changed has since been edited on Etsy, so restoring would overwrite newer work. Nothing was changed.',
  },
  CATALOGUE_MOVED: {
    title: 'Your listings changed while you were confirming.',
    detail:
      'The rollback was refused and nothing was sent to Etsy. The panel below shows what would be restored now.',
  },
  READ_ONLY: {
    title: 'This shop is read-only.',
    detail:
      'Demo mode cannot write to Etsy, so the rollback was refused before anything was sent. It is recorded in the audit log.',
  },
}

export interface RollbackRequest {
  job: ChangeJob
  listings: EtsyListing[]
  /** The fingerprint the confirmation screen displayed. */
  confirmedFingerprint: string
  /** The explicit acknowledgement. Absent means the seller did not tick it. */
  acknowledged: boolean
  actor: string
  /*
   * The demo shop's fixed clock, used for the restored VALUES.
   *
   * Audit records are stamped with the real time instead — see recordedAt
   * below. Two refusals a minute apart both stamped DEMO_NOW produced two
   * records with the same `id@at` address, and the log's drawer opens a record
   * by that address. A record that cannot be addressed cannot be read, which
   * is most of what a log is for.
   */
  now: string
}

/**
 * Apply a rollback, or refuse it.
 *
 * Refuses on four counts, and every one of them leaves an audit record saying
 * nothing reached Etsy:
 *
 *   - the shop cannot write (demo mode)
 *   - the acknowledgement was not given
 *   - there is nothing restorable
 *   - the catalogue moved since the confirmation
 */
export function applyRollback(
  ctx: ShopContext,
  request: RollbackRequest,
): { job: ChangeJob; restored: number; skipped: number } {
  if (!request.acknowledged) {
    throw new RollbackRefused(
      'NOT_ACKNOWLEDGED',
      REFUSAL_COPY.NOT_ACKNOWLEDGED.title,
      REFUSAL_COPY.NOT_ACKNOWLEDGED.detail,
    )
  }

  const recordedAt = new Date().toISOString()
  const drift = driftOf(request.job, request.listings)
  if (drift.restorable.length === 0) {
    throw new RollbackRefused(
      'NOTHING_LEFT',
      REFUSAL_COPY.NOTHING_LEFT.title,
      REFUSAL_COPY.NOTHING_LEFT.detail,
    )
  }

  const current = rollbackFingerprint(drift)
  if (current !== request.confirmedFingerprint) {
    /*
     * The gate. The seller confirmed a set; this is a different set now.
     * Refusing costs them a click and protects the edits somebody made in
     * between — applying to "whatever is left" would not.
     */
    appendAuditRecord(
      ctx.shopId,
      refusalRecord(request, recordedAt, 'Catalogue moved between confirm and apply.'),
    )
    throw new RollbackRefused(
      'CATALOGUE_MOVED',
      REFUSAL_COPY.CATALOGUE_MOVED.title,
      REFUSAL_COPY.CATALOGUE_MOVED.detail,
    )
  }

  // Demo mode refuses here, and the audit log records that it did.
  if (ctx.readOnly) {
    appendAuditRecord(
      ctx.shopId,
      refusalRecord(request, recordedAt, 'This shop is read-only, so no write was attempted.'),
    )
    throw new RollbackRefused('READ_ONLY', REFUSAL_COPY.READ_ONLY.title, REFUSAL_COPY.READ_ONLY.detail)
  }
  // Belt and braces: the shared gate still runs, so a future context shape that
  // is read-only for a different reason cannot slip past the check above.
  assertCanWrite(ctx)

  const items: ChangeItem[] = drift.restorable.map(({ item }) => ({
    listingId: item.listingId,
    listingTitle: item.listingTitle,
    field: item.field,
    // The rollback's before is the original job's after, and vice versa.
    before: item.after,
    after: item.before,
    status: 'SUCCEEDED',
  }))

  /*
   * A new job, not an edit of the old one. History is append-only, so the
   * record of what was done survives the undoing of it.
   */
  const job: ChangeJob = {
    id: `${request.job.id}-R`,
    at: request.now,
    actor: request.actor,
    source: 'BULK_EDIT',
    summary: `Rolled back job #${request.job.id}`,
    items,
  }
  appendChangeJob(ctx.shopId, request.listings, job)

  appendAuditRecord(ctx.shopId, {
    id: job.id,
    at: recordedAt,
    actor: { name: request.actor, role: 'Owner', session: '2a··f1', device: 'This browser' },
    action: 'Rollback applied',
    detail: `${job.id} · reverted job #${request.job.id}`,
    target: `${items.length} listings`,
    source: 'BULK_JOB',
    reached: { kind: 'SENT', succeeded: items.length, attempted: items.length },
    ...(drift.blocked.length > 0
      ? {
          explanation: `${drift.blocked.length} listings had been edited on Etsy after the original job, so reverting them would have overwritten work EtsyPilot did not make. They were left alone.`,
        }
      : {}),
    sequence: [
      { at: recordedAt, label: 'Rollback confirmed', detail: `Fingerprint ${current} recorded` },
      {
        at: recordedAt,
        label: 'Applied',
        detail: `${items.length} restored, ${drift.blocked.length} skipped`,
      },
    ],
    wouldHaveChanged: [],
    wouldHaveChangedMore: 0,
    origin: `Rolled back from Change history`,
    jobHref: '/listings/change-history',
  })

  return { job, restored: items.length, skipped: drift.blocked.length }
}

function refusalRecord(request: RollbackRequest, at: string, why: string): AuditRecord {
  return {
    id: `${request.job.id}-R`,
    at,
    actor: { name: request.actor, role: 'Owner', session: '2a··f1', device: 'This browser' },
    action: 'Rollback refused',
    detail: `Job #${request.job.id} · nothing sent`,
    target: `${request.job.items.length} listings`,
    source: 'BULK_JOB',
    reached: { kind: 'NOTHING_SENT' },
    explanation: why,
    sequence: [{ at, label: 'Refused at the gate', detail: why, terminal: true }],
    wouldHaveChanged: [],
    wouldHaveChangedMore: 0,
    origin: 'Attempted from Change history',
    jobHref: '/listings/change-history',
  }
}
