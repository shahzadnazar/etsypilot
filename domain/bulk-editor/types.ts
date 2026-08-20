/*
 * Safe Bulk Editor (PRD 4.6, artboards 40-45).
 *
 * SELECT → CONFIGURE → VALIDATE → DIFF → CONFIRM → APPLY → AUDIT → ROLLBACK
 *
 * The workflow is mandatory, so it is encoded in types rather than in review
 * comments:
 *
 *   - `ConfirmedOperation` is a branded type only `confirm()` can produce, and
 *     `applyOperation()` accepts nothing else. There is no code path from a
 *     draft to a write.
 *   - Confirmation binds to a fingerprint of the exact diff the user reviewed.
 *     If the catalogue moved underneath them, the fingerprint no longer matches
 *     and the apply is refused rather than silently writing something else.
 *   - Every item carries its own before/after and its own outcome, so partial
 *     success is the ordinary case rather than an error path.
 */

import type { ListingState } from '@/lib/etsy/interface'

/* ------------------------------------------------------------- lifecycle */

export const OPERATION_STATES = [
  'DRAFT',
  'VALIDATING',
  'READY',
  'APPLYING',
  'PARTIAL_SUCCESS',
  'COMPLETED',
  'FAILED',
  'ROLLBACK_AVAILABLE',
  'ROLLED_BACK',
] as const

export type OperationState = (typeof OPERATION_STATES)[number]

/* --------------------------------------------------------- configuration */

export interface PriceChange {
  kind: 'PRICE'
  mode: 'PERCENT' | 'FIXED'
  /** +8 means +8% in PERCENT mode, +$8.00 in FIXED mode. */
  amount: number
  /** Round the result to the nearest multiple, e.g. 0.5. */
  roundTo?: number
  /** Exclude listings the change would push under their cost floor. */
  skipBelowCostFloor: boolean
}

export interface TagChange {
  kind: 'TAGS'
  mode: 'ADD' | 'REMOVE' | 'REPLACE'
  tags: string[]
}

export interface QuantityChange {
  kind: 'QUANTITY'
  mode: 'SET' | 'ADJUST'
  amount: number
}

export interface StateChange {
  kind: 'STATE'
  state: Extract<ListingState, 'ACTIVE' | 'INACTIVE'>
}

export type FieldChange = PriceChange | TagChange | QuantityChange | StateChange

/* ------------------------------------------------------------ validation */

export type ItemStatus =
  | 'READY'
  | 'WARNING'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'PENDING'

export interface ValidationNote {
  /** Machine-readable so the UI can group without string matching. */
  code: string
  message: string
  /** What the seller can do about it. Never a bare complaint. */
  remedy?: string
}

/* ------------------------------------------------------------------ diff */

/** One field's exact before and after. Rendered as −/+ rows. */
export interface FieldDiff {
  field: string
  before: string
  after: string
}

export interface OperationItem {
  listingId: string
  title: string
  sku: string | null
  status: ItemStatus
  diffs: FieldDiff[]
  notes: ValidationNote[]
  /** Populated during APPLY. */
  error?: string
  attempts: number
}

/* ------------------------------------------------------------- operation */

export interface BulkOperation {
  id: string
  shopId: string
  actorId: string
  state: OperationState
  changes: FieldChange[]
  items: OperationItem[]
  createdAt: string
  /** Set once validation has run. */
  validatedAt?: string
  /**
   * Fingerprint of the exact diff set the user reviewed. Confirmation binds to
   * it; if the catalogue moved, the apply is refused.
   */
  fingerprint?: string
  appliedAt?: string
  completedAt?: string
  rollbackExpiresAt?: string
  /** D20: approvals are parked, so this stays null in MVP. */
  approvalState: string | null
}

export interface ValidationSummary {
  ready: number
  warnings: number
  blocked: number
  /** Grouped notes, so six identical warnings read as one line with a count. */
  groups: { code: string; message: string; remedy?: string; count: number }[]
}

/* -------------------------------------------------- the confirmation gate */

declare const confirmed: unique symbol

/**
 * An operation that has passed explicit human confirmation.
 *
 * The brand cannot be constructed by hand, cast into, or produced by any
 * function other than `confirm()`. `applyOperation()` accepts only this type,
 * which is what makes "nothing is sent to Etsy until you confirm" a property of
 * the code rather than a promise in the copy.
 */
export type ConfirmedOperation = BulkOperation & { readonly [confirmed]: true }

export interface ApplyProgress {
  total: number
  succeeded: number
  running: number
  warnings: number
  failed: number
  skipped: number
}

export const STATE_LABEL: Record<OperationState, string> = {
  DRAFT: 'Draft',
  VALIDATING: 'Validating',
  READY: 'Ready',
  APPLYING: 'Applying',
  PARTIAL_SUCCESS: 'Partial success',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  ROLLBACK_AVAILABLE: 'Rollback available',
  ROLLED_BACK: 'Rolled back',
}
