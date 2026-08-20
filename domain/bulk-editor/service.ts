/*
 * Bulk operation service.
 *
 * The write path is the point of this module. Read it as one sequence:
 *
 *   createDraft → validate → review (fingerprint) → confirm → apply
 *
 * `applyOperation` accepts only a `ConfirmedOperation`, and `confirm` is the
 * only function that returns one. It requires the fingerprint of the diff the
 * user actually saw plus their explicit acknowledgement. So the sentence
 * "nothing is sent to Etsy until you confirm on the review step" is enforced by
 * the type system, not by the order in which a caller happens to do things.
 */

import { AppError, Errors } from '@/lib/errors/types'
import { getEtsyService } from '@/lib/etsy'
import type { EtsyListing, EtsyService, ListingWriteRequest } from '@/lib/etsy/interface'
import type { DomainEvent, EventType } from '@/lib/events/types'
import { assertCanWrite, type ShopContext } from '@/lib/permissions'
import { assertTransition } from './state-machine'
import { summarise, validateListing, type ValidationContext } from './validate'
import type {
  ApplyProgress,
  BulkOperation,
  ConfirmedOperation,
  FieldChange,
  OperationItem,
  ValidationSummary,
} from './types'

/** How long a rollback point stays usable. Stated on the confirm dialog. */
export const ROLLBACK_WINDOW_DAYS = 30

/* ------------------------------------------------------------- 1. select */

export function createDraft(args: {
  id: string
  ctx: ShopContext
  changes: FieldChange[]
  listings: EtsyListing[]
  now: string
}): BulkOperation {
  return {
    id: args.id,
    shopId: args.ctx.shopId,
    actorId: args.ctx.actorId,
    state: 'DRAFT',
    changes: args.changes,
    items: args.listings.map((l) => ({
      listingId: l.etsyListingId,
      title: l.title,
      sku: l.sku,
      status: 'PENDING' as const,
      diffs: [],
      notes: [],
      attempts: 0,
    })),
    createdAt: args.now,
    approvalState: null,
  }
}

/* ----------------------------------------------------------- 2. validate */

export function validateOperation(
  operation: BulkOperation,
  listings: EtsyListing[],
  ctx: ValidationContext,
  now: string,
): { operation: BulkOperation; summary: ValidationSummary } {
  assertTransition(operation.state, 'VALIDATING')

  const byId = new Map(listings.map((l) => [l.etsyListingId, l]))
  const items = operation.items.map((item) => {
    const listing = byId.get(item.listingId)
    if (!listing) {
      return {
        ...item,
        status: 'BLOCKED' as const,
        notes: [
          {
            code: 'LISTING_GONE',
            message: 'This listing is no longer in your shop.',
            remedy: 'It may have been deleted on Etsy since you selected it.',
          },
        ],
      }
    }
    return validateListing(listing, operation.changes, ctx)
  })

  const validated: BulkOperation = {
    ...operation,
    state: 'READY',
    items,
    validatedAt: now,
    fingerprint: fingerprintOf(items),
    rollbackExpiresAt: undefined,
  }

  return { operation: validated, summary: summarise(items) }
}

/* -------------------------------------------------------------- 3. diff */

/** The items that will actually be written. Blocked and skipped are excluded. */
export function applicableItems(operation: BulkOperation): OperationItem[] {
  return operation.items.filter((i) => i.status === 'READY' || i.status === 'WARNING')
}

/**
 * A stable fingerprint of the exact change set.
 *
 * Order-independent and value-sensitive, so re-validating an unchanged
 * catalogue reproduces it and any real difference breaks it.
 */
export function fingerprintOf(items: OperationItem[]): string {
  const canonical = items
    .filter((i) => i.status === 'READY' || i.status === 'WARNING')
    .map((i) => `${i.listingId}:${i.diffs.map((d) => `${d.field}=${d.before}>${d.after}`).join(',')}`)
    .sort()
    .join('|')

  // Small, stable, non-cryptographic. This detects drift, it does not defend
  // against an adversary - the server re-validates before writing regardless.
  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    hash = (Math.imul(31, hash) + canonical.charCodeAt(i)) | 0
  }
  return `fp_${(hash >>> 0).toString(16)}_${canonical.length}`
}

/* ----------------------------------------------------------- 4. confirm */

/**
 * The only way to obtain a ConfirmedOperation.
 *
 * Refuses when the operation is not READY, when the fingerprint does not match
 * the diff the user reviewed, or when the acknowledgement is absent. Each
 * refusal is a distinct, user-safe error rather than a boolean false.
 */
export function confirm(args: {
  operation: BulkOperation
  /** The fingerprint the review screen displayed. */
  reviewedFingerprint: string
  /** "I understand this updates N live Etsy listings." */
  acknowledged: boolean
  ctx: ShopContext
  now: string
}): ConfirmedOperation {
  const { operation, reviewedFingerprint, acknowledged, ctx } = args

  // Demo mode cannot write, and says so before anything else happens.
  assertCanWrite(ctx)

  if (operation.state !== 'READY') {
    throw new AppError({
      kind: 'VALIDATION',
      code: 'NOT_READY_TO_CONFIRM',
      message: 'This job has not been validated yet.',
      recovery: 'Run validation and review the changes before publishing.',
      context: { state: operation.state },
    })
  }

  if (!acknowledged) {
    throw new AppError({
      kind: 'VALIDATION',
      code: 'NOT_ACKNOWLEDGED',
      message: 'You have not confirmed that this updates live Etsy listings.',
      recovery: 'Tick the confirmation box to publish, or go back and change the job.',
    })
  }

  if (operation.fingerprint !== reviewedFingerprint) {
    throw new AppError({
      kind: 'VALIDATION',
      code: 'DIFF_CHANGED_SINCE_REVIEW',
      message: 'These listings changed since you reviewed the diff.',
      recovery:
        'Nothing was sent to Etsy. Re-run validation to see the current changes, then publish.',
      context: { reviewed: reviewedFingerprint, current: operation.fingerprint },
    })
  }

  return operation as ConfirmedOperation
}

/* ------------------------------------------------------- 5. apply + audit */

export interface ApplyResult {
  operation: BulkOperation
  events: DomainEvent[]
  progress: ApplyProgress
}

/**
 * Apply a confirmed operation.
 *
 * Note the parameter type: there is no overload that takes a plain
 * BulkOperation. Partial success is the ordinary outcome, so the result carries
 * per-item status and the operation lands in PARTIAL_SUCCESS rather than an
 * error path.
 */
export async function applyOperation(
  operation: ConfirmedOperation,
  ctx: ShopContext,
  now: string,
  /*
   * The adapter is injected rather than reached for. The domain does not care
   * which implementation is installed, and Phase 11 swaps it without touching
   * this file.
   */
  etsy: EtsyService = getEtsyService(),
): Promise<ApplyResult> {
  assertCanWrite(ctx)
  assertTransition(operation.state, 'APPLYING')

  const targets = applicableItems(operation)

  const requests: ListingWriteRequest[] = targets.map((item) => ({
    etsyListingId: item.listingId,
    changes: changesFromDiffs(item),
  }))

  let results
  try {
    results = await etsy.applyListingChanges(ctx.shopId, requests)
  } catch (error) {
    /*
     * A refusal is not a failure.
     *
     * Permission and validation errors say something true about why nothing
     * happened - demo mode cannot write, the token was revoked - and swallowing
     * them into a generic FAILED job would leave the seller with a red job and
     * no reason. Only an external-service failure becomes a failed run.
     */
    if (
      error instanceof AppError &&
      (error.kind === 'AUTHORIZATION' || error.kind === 'VALIDATION' || error.kind === 'AUTHENTICATION')
    ) {
      throw error
    }

    const reason = error instanceof AppError ? error.message : 'EtsyPilot could not reach Etsy.'
    return {
      operation: {
        ...operation,
        state: 'FAILED',
        completedAt: now,
        // The reason is recorded per item, so the audit trail says what happened.
        items: operation.items.map((item) =>
          item.status === 'READY' || item.status === 'WARNING'
            ? { ...item, status: 'FAILED' as const, error: reason, attempts: item.attempts + 1 }
            : item,
        ),
      },
      events: [],
      progress: emptyProgress(operation.items.length),
    }
  }

  const byId = new Map(results.map((r) => [r.etsyListingId, r]))
  const items: OperationItem[] = operation.items.map((item) => {
    const result = byId.get(item.listingId)
    if (!result) return item
    return {
      ...item,
      status: result.status === 'SUCCEEDED' ? 'SUCCEEDED' : result.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED',
      ...(result.error ? { error: result.error } : {}),
      attempts: item.attempts + 1,
    }
  })

  // Every mutation leaves an event carrying the operation ID. This is what
  // Change History reads and what rollback replays.
  const events: DomainEvent[] = items
    .filter((i) => i.status === 'SUCCEEDED')
    .flatMap((item) =>
      item.diffs.map((diff, index) => ({
        eventId: `${operation.id}-${item.listingId}-${index}`,
        shopId: ctx.shopId,
        listingId: item.listingId,
        actorId: ctx.actorId,
        timestamp: now,
        type: eventTypeFor(diff.field),
        source: 'BULK_EDIT' as const,
        field: diff.field.toLowerCase(),
        beforeValue: diff.before,
        afterValue: diff.after,
        operationId: operation.id,
        reason: null,
      })),
    )

  const progress = progressOf(items)
  const state = progress.failed > 0 ? 'PARTIAL_SUCCESS' : 'COMPLETED'

  return {
    operation: {
      ...operation,
      state,
      items,
      appliedAt: now,
      completedAt: now,
      rollbackExpiresAt: addDays(now, ROLLBACK_WINDOW_DAYS),
    },
    events,
    progress,
  }
}

/* -------------------------------------------------------- 6. retry failed */

/** Retry only what failed. Succeeded items are never rewritten. */
export function retryableItems(operation: BulkOperation): OperationItem[] {
  return operation.items.filter((i) => i.status === 'FAILED')
}

/* ---------------------------------------------------------- 7. rollback */

export interface RollbackPlan {
  /** Listings that still hold the value this job wrote. */
  restorable: OperationItem[]
  /**
   * Listings changed on Etsy since the job ran. Skipped rather than
   * overwritten - restoring them would silently discard the newer edit.
   */
  skipped: { item: OperationItem; reason: string }[]
  expiresAt: string | undefined
  expired: boolean
}

/**
 * Plan a rollback against the CURRENT state of the shop.
 *
 * The recheck is the whole point. A rollback that assumes nothing moved since
 * the job would quietly destroy any edit made in between.
 */
export function planRollback(
  operation: BulkOperation,
  currentListings: EtsyListing[],
  now: string,
): RollbackPlan {
  const byId = new Map(currentListings.map((l) => [l.etsyListingId, l]))
  const restorable: OperationItem[] = []
  const skipped: { item: OperationItem; reason: string }[] = []

  for (const item of operation.items) {
    if (item.status !== 'SUCCEEDED') continue

    const listing = byId.get(item.listingId)
    if (!listing) {
      skipped.push({ item, reason: 'No longer in your shop.' })
      continue
    }

    const drifted = item.diffs.find((d) => currentValue(listing, d.field) !== d.after)
    if (drifted) {
      skipped.push({
        item,
        reason: `${drifted.field} was changed on Etsy after this job ran.`,
      })
      continue
    }

    restorable.push(item)
  }

  return {
    restorable,
    skipped,
    expiresAt: operation.rollbackExpiresAt,
    expired: operation.rollbackExpiresAt ? operation.rollbackExpiresAt < now : false,
  }
}

/**
 * Rollback is itself a write, so it goes through the same gate: it produces new
 * events rather than deleting old ones. History is append-only.
 */
export async function applyRollback(
  operation: BulkOperation,
  plan: RollbackPlan,
  ctx: ShopContext,
  now: string,
  etsy: EtsyService = getEtsyService(),
): Promise<ApplyResult> {
  assertCanWrite(ctx)
  assertTransition(operation.state, 'ROLLED_BACK')

  if (plan.expired) {
    throw new AppError({
      kind: 'VALIDATION',
      code: 'ROLLBACK_EXPIRED',
      message: 'The rollback window for this job has closed.',
      recovery: `Rollback points are kept for ${ROLLBACK_WINDOW_DAYS} days. You can still make the change manually.`,
    })
  }

  await etsy.applyListingChanges(
    ctx.shopId,
    plan.restorable.map((item) => ({
      etsyListingId: item.listingId,
      changes: reverseChangesFromDiffs(item),
    })),
  )

  const events: DomainEvent[] = plan.restorable.flatMap((item) =>
    item.diffs.map((diff, index) => ({
      eventId: `${operation.id}-rollback-${item.listingId}-${index}`,
      shopId: ctx.shopId,
      listingId: item.listingId,
      actorId: ctx.actorId,
      timestamp: now,
      type: 'BULK_EDIT_ROLLED_BACK' as const,
      source: 'BULK_EDIT' as const,
      field: diff.field.toLowerCase(),
      // Reversed: the rollback's "before" is the job's "after".
      beforeValue: diff.after,
      afterValue: diff.before,
      operationId: operation.id,
      reason: 'Rolled back',
    })),
  )

  return {
    operation: { ...operation, state: 'ROLLED_BACK', completedAt: now },
    events,
    progress: progressOf(operation.items),
  }
}

/* ------------------------------------------------------------- internals */

function changesFromDiffs(item: OperationItem): ListingWriteRequest['changes'] {
  const changes: ListingWriteRequest['changes'] = {}
  for (const diff of item.diffs) {
    if (diff.field === 'Price') changes.price = Number(diff.after)
    if (diff.field === 'Tags') changes.tags = diff.after.split(', ').filter(Boolean)
    if (diff.field === 'Quantity') changes.quantity = Number(diff.after)
    if (diff.field === 'State') changes.state = diff.after as EtsyListing['state']
  }
  return changes
}

function reverseChangesFromDiffs(item: OperationItem): ListingWriteRequest['changes'] {
  return changesFromDiffs({ ...item, diffs: item.diffs.map((d) => ({ ...d, after: d.before })) })
}

function currentValue(listing: EtsyListing, field: string): string {
  switch (field) {
    case 'Price':
      return listing.price.toFixed(2)
    case 'Tags':
      return listing.tags.join(', ')
    case 'Quantity':
      return String(listing.quantity)
    case 'State':
      return listing.state
    default:
      return ''
  }
}

function eventTypeFor(field: string): EventType {
  switch (field) {
    case 'Price':
      return 'PRICE_CHANGED'
    case 'Tags':
      return 'TAGS_CHANGED'
    case 'Quantity':
      return 'QUANTITY_CHANGED'
    case 'State':
      return 'LISTING_DEACTIVATED'
    default:
      return 'BULK_EDIT_COMPLETED'
  }
}

function progressOf(items: OperationItem[]): ApplyProgress {
  return {
    total: items.length,
    succeeded: items.filter((i) => i.status === 'SUCCEEDED').length,
    running: items.filter((i) => i.status === 'PENDING').length,
    warnings: items.filter((i) => i.status === 'WARNING').length,
    failed: items.filter((i) => i.status === 'FAILED').length,
    skipped: items.filter((i) => i.status === 'SKIPPED').length,
  }
}

function emptyProgress(total: number): ApplyProgress {
  return { total, succeeded: 0, running: 0, warnings: 0, failed: total, skipped: 0 }
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString()
}

export { Errors }
