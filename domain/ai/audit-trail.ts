/*
 * The audit trail for applied AI changes.
 *
 * An approved draft becomes ordinary events in the same append-only log as
 * every other change — with two things recorded that a manual edit does not
 * carry: that AI drafted it (`source: 'AI_ASSISTED'`), and who approved it.
 *
 * Both matter for the same reason. Six months from now, "why does this listing
 * say that?" has to be answerable, and "a model wrote it and nobody remembers
 * approving it" is the answer this product exists to prevent. The approver is a
 * person, named, on every row.
 *
 * The events are per-FIELD, not per-draft. Change History shows fields, rollback
 * reverses fields, and Shop Pulse correlates fields — a single "AI draft
 * applied" row would be invisible to all three.
 */

import type { DomainEvent } from '@/lib/events/types'
import type { AiDraft } from './types'

export interface ApprovalRecord {
  draftId: string
  listingId: string
  /** The person who approved. Never a system id, never null. */
  approvedBy: string
  approvedAt: string
  /** The operation that carried it to Etsy, so the trail joins up. */
  operationId: string
  /** Which provider produced the draft. Recorded, so it can be re-examined. */
  producedBy: string
  /** The reasons shown at approval time, kept verbatim. */
  rationale: string[]
}

/**
 * Turn an approved draft into events.
 *
 * `approvedBy` is a required parameter with no default. An audit trail whose
 * actor can be omitted is one that will eventually record a change nobody made.
 */
export function approvalEvents(args: {
  draft: AiDraft
  approvedBy: string
  approvedAt: string
  operationId: string
  eventIdFor: (field: string) => string
}): DomainEvent[] {
  const { draft, approvedBy, approvedAt, operationId } = args
  const events: DomainEvent[] = []

  const base = {
    shopId: draft.shopId,
    listingId: draft.listingId,
    actorId: approvedBy,
    timestamp: approvedAt,
    source: 'AI_ASSISTED' as const,
    operationId,
  }

  if (draft.title.text !== draft.current.title) {
    events.push({
      ...base,
      eventId: args.eventIdFor('title'),
      type: 'TITLE_CHANGED',
      field: 'title',
      beforeValue: draft.current.title,
      afterValue: draft.title.text,
      reason: reasonFor(draft, 'title'),
    })
  }

  const before = draft.current.tags.join(', ')
  const after = draft.tags.tags.join(', ')
  if (before !== after) {
    events.push({
      ...base,
      eventId: args.eventIdFor('tags'),
      type: 'TAGS_CHANGED',
      field: 'tags',
      beforeValue: before,
      afterValue: after,
      reason: reasonFor(draft, 'tags'),
    })
  }

  if (draft.description && draft.description.text !== draft.current.description) {
    events.push({
      ...base,
      eventId: args.eventIdFor('description'),
      type: 'DESCRIPTION_CHANGED',
      field: 'description',
      beforeValue: draft.current.description,
      afterValue: draft.description.text,
      reason: reasonFor(draft, 'description'),
    })
  }

  return events
}

/**
 * The reason line stored on the event.
 *
 * The draft's own rationale, plus the provider — not a generated summary. What
 * is recorded is what the seller read when they approved it, which is the only
 * version of the reasoning that had a human's attention.
 */
function reasonFor(draft: AiDraft, field: string): string {
  const rationale = draft.rationale.join(' ')
  return `AI-assisted ${field} change, approved after review. ${rationale} (drafted by ${draft.producedBy}, checked against the guardrails before display)`
}

/** Rendered in Change History beside the AI-assisted badge. */
export function describeApproval(record: ApprovalRecord): string {
  return `Drafted by ${record.producedBy}, reviewed and approved by ${record.approvedBy}. Nothing was published before that approval.`
}
