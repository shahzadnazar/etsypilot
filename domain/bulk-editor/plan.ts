/*
 * Bulk operation planning: select → validate → diff → confirm.
 *
 * The half of the bulk editor with no Etsy in it.
 *
 * Split out of service.ts for a reason the Next build found rather than one
 * anyone argued in the abstract. The wizard is a client component and needs
 * createDraft, validateOperation and applicableItems. Importing them from
 * service.ts pulled getEtsyService — and through it the server-only Etsy
 * adapter and its token store — into the browser bundle's module graph, and
 * the build said so.
 *
 * Deleting the `server-only` marker would have made the build pass and the
 * guarantee false. D28 says change the architecture, never the property: the
 * planning half, which is pure and belongs on both sides of the wire, lives
 * here, and everything that talks to Etsy stays in service.ts.
 *
 * The confirm gate is not weakened by the split and is not meant to be.
 * `confirm` is still the only function that returns a ConfirmedOperation, and
 * it still requires the fingerprint of the diff the user actually saw plus
 * their explicit acknowledgement. It lives on this side because deciding is not
 * applying — and `applyOperation`, which accepts nothing but a
 * ConfirmedOperation, is on the other.
 */

import { AppError } from '@/lib/errors/types'
import type { EtsyListing } from '@/lib/etsy/interface'
import { assertCanWrite, type ShopContext } from '@/lib/permissions'
import { assertTransition } from './state-machine'
import { summarise, validateListing, type ValidationContext } from './validate'
import type {
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

