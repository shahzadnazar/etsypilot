/*
 * AI listing drafts.
 *
 * The rule is "AI may draft but never publish". This file makes that structural
 * rather than procedural, in three ways:
 *
 *   1. An AiDraft has no publish method and no write path of its own. The only
 *      way a draft reaches Etsy is `toBulkOperation()`, which produces a DRAFT
 *      bulk operation — which then has to go through validate, diff and
 *      confirm() like every other write. There is one writer in this product
 *      and AI does not get a second one.
 *
 *   2. Every field the model produced carries AI_DRAFT provenance and a
 *      `source` naming what it was built from. A draft field with no stated
 *      source will not construct.
 *
 *   3. There is no field for predicted impact. Not an optional one, not a
 *      nullable one — none. "Estimated impact is not predicted. Track results
 *      in the experiment tracker after publishing." A type with nowhere to put
 *      a prediction cannot grow one by accident.
 *
 * Phase 7 hardens the prompt side. This is the shape the hardening plugs into.
 */

import type { FieldChange } from '@/domain/bulk-editor/types'

export type DraftStatus = 'AWAITING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EDITED'

export type Tone = 'WARM' | 'PLAIN' | 'PREMIUM'

/** Where a drafted element came from. Required — see rule 2 above. */
export interface DraftSource {
  /** Short label shown under the field, e.g. 'keyword list "Autumn gifting"'. */
  label: string
  kind: 'KEYWORD_LIST' | 'CURRENT_LISTING' | 'LOCKED_TERM' | 'SELLER_THRESHOLD'
}

export interface DraftedTitle {
  text: string
  characterCount: number
  sources: DraftSource[]
}

export interface DraftedTags {
  /** The full resulting tag set, so the diff is over sets, not instructions. */
  tags: string[]
  added: string[]
  removed: string[]
  sources: DraftSource[]
}

export interface DraftedDescription {
  text: string
  sources: DraftSource[]
}

export interface GenerationInputs {
  keywordListId: string | null
  keywordListName: string | null
  tone: Tone
  /** Preserved exactly as written. Brand and material terms. */
  lockedTerms: string[]
  rewriteDescription: boolean
  guardrails: string[]
}

export const DEFAULT_GUARDRAILS = [
  'Stay under 140 characters',
  'No competitor brand names',
  'No unverifiable claims (“best”, “#1”)',
] as const

/** Why a generated draft was withheld. Never a bare failure. */
export interface RejectedDraft {
  listingId: string
  listingTitle: string
  /** The blocking findings, in the seller's words. */
  reasons: string[]
  /** Stated on the screen: the live listing was not touched. */
  note: string
}

export interface AiDraft {
  id: string
  shopId: string
  listingId: string
  listingTitle: string
  status: DraftStatus
  inputs: GenerationInputs
  /** What is live on Etsy right now. VERIFIED, and never modified here. */
  current: { title: string; tags: string[]; description: string }
  title: DraftedTitle
  tags: DraftedTags
  description: DraftedDescription | null
  /** Plain-language account of every change and the reason for it. */
  rationale: string[]
  /**
   * Advisory findings from output validation — matters of judgement rather
   * than rule breaks. Blocking findings never reach here: a draft that broke a
   * rule is withheld entirely, so there is no shape for a "mostly fine" draft.
   */
  advisories: string[]
  /** Which provider produced it, recorded for the audit trail. */
  producedBy: string
  createdAt: string
  /*
   * Deliberately absent: predictedImpact, expectedLift, rankingForecast.
   * See rule 3 above. Do not add them.
   */
}

export interface GenerationQuota {
  used: number
  limit: number
  /** Calendar date the allowance resets, YYYY-MM-DD. Never zoned (D24). */
  resetsOn: string
  planName: string
  /** What the next tier offers, for the honest upgrade path. */
  nextTier: { name: string; limit: number } | null
}

export function quotaExhausted(q: GenerationQuota): boolean {
  return q.used >= q.limit
}

/**
 * The changes a draft would make, in bulk-editor terms.
 *
 * Returns field changes only. It cannot return an operation, because building
 * one requires a ShopContext and an id, which is the caller's business — and
 * because the resulting operation must be a DRAFT that a human still has to
 * confirm.
 */
export function draftChanges(draft: AiDraft): FieldChange[] {
  const changes: FieldChange[] = []
  if (draft.tags.added.length > 0) changes.push({ kind: 'TAGS', mode: 'ADD', tags: draft.tags.added })
  if (draft.tags.removed.length > 0) changes.push({ kind: 'TAGS', mode: 'REMOVE', tags: draft.tags.removed })
  return changes
}
