/*
 * AI copilot service.
 *
 * The generator here is deterministic and rule-based, not a model call. That is
 * the right shape for Phase 6: the surfaces, the diff, the approval gate and
 * the quota are what the phase is for, and Phase 7 swaps the body of
 * `generateDraft` for a real prompt without changing a single call site.
 *
 * Two invariants hold whichever generator runs, and both are tested:
 *
 *   - Locked terms survive verbatim. A draft that dropped the shop's own brand
 *     name from a title would be a rewrite the seller never asked for.
 *   - No drafted field carries a number the model invented. The only figures on
 *     this screen are character counts, which are counted, and keyword demand,
 *     which comes from the signals service with its own ESTIMATED badge.
 */

import { getEtsyService } from '@/lib/etsy'
import { DEMO_NOW } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import { Errors } from '@/lib/errors/types'
import type { ShopContext } from '@/lib/permissions'
import { demoLists } from '@/domain/research/service'
import {
  DEFAULT_GUARDRAILS,
  type AiDraft,
  type DraftSource,
  type GenerationInputs,
  type GenerationQuota,
  quotaExhausted,
} from './types'

const MAX_TITLE = 140

export interface CopilotView {
  draft: AiDraft
  quota: GenerationQuota
  /** Drafts queued behind this one. Each is approved individually. */
  queue: { listingId: string; title: string; status: AiDraft['status'] }[]
}

export async function getCopilotView(ctx: ShopContext, listingId?: string): Promise<CopilotView> {
  const etsy = getEtsyService()
  const { listings } = await etsy.getListings(ctx.shopId, { limit: 500 })

  const target = listingId
    ? listings.find((l) => l.etsyListingId === listingId)
    : listings.find((l) => l.tags.length < 13) ?? listings[0]
  if (!target) throw Errors.notFound('listing')

  const list = demoLists(ctx.shopId)[0]
  const inputs: GenerationInputs = {
    keywordListId: list?.id ?? null,
    keywordListName: list?.name ?? null,
    tone: 'WARM',
    lockedTerms: ['Willow & Fern', '14k gold filled'],
    rewriteDescription: false,
    guardrails: [...DEFAULT_GUARDRAILS],
  }

  const queue = listings
    .filter((l) => l.tags.length < 13 && l.etsyListingId !== target.etsyListingId)
    .slice(0, 6)
    .map((l, i) => ({
      listingId: l.etsyListingId,
      title: l.title,
      status: (i < 3 ? 'APPROVED' : 'AWAITING_REVIEW') as AiDraft['status'],
    }))

  return {
    draft: generateDraft({ shopId: ctx.shopId, listing: target, inputs, terms: list?.terms ?? [], now: DEMO_NOW }),
    quota: demoQuota(),
    queue,
  }
}

/**
 * Produce a draft.
 *
 * Phase 7 replaces the body. The signature is the contract: listing text and
 * the seller's own saved terms in, a fully-sourced draft out, and no parameter
 * anywhere through which a metric could be supplied or requested.
 */
export function generateDraft(args: {
  shopId: string
  listing: EtsyListing
  inputs: GenerationInputs
  terms: string[]
  now: string
}): AiDraft {
  const { listing, inputs, terms } = args

  const listSource: DraftSource = {
    label: inputs.keywordListName ? `keyword list “${inputs.keywordListName}”` : 'your saved terms',
    kind: 'KEYWORD_LIST',
  }
  const currentSource: DraftSource = { label: 'your current title', kind: 'CURRENT_LISTING' }
  const lockedSource: DraftSource = { label: 'locked terms preserved', kind: 'LOCKED_TERM' }

  const title = rewriteTitle(listing.title, inputs.lockedTerms)
  const tags = retag(listing.tags, terms, listing.title)

  const rationale: string[] = []
  if (title.removedDuplicate) {
    rationale.push(
      `Removed the duplicated “${title.removedDuplicate}” so the title reads once and stays under ${MAX_TITLE} characters.`,
    )
  }
  for (const added of tags.added) {
    rationale.push(`Added “${added}” — a term from your saved list that the listing does not already use.`)
  }
  for (const removed of tags.removed) {
    rationale.push(`Dropped “${removed}” from tags because it already appears in the title.`)
  }
  if (rationale.length === 0) rationale.push('No change was needed — the listing already satisfies every guardrail.')

  return {
    id: `draft-${listing.etsyListingId}`,
    shopId: args.shopId,
    listingId: listing.etsyListingId,
    listingTitle: listing.title,
    status: 'AWAITING_REVIEW',
    inputs,
    current: { title: listing.title, tags: listing.tags, description: listing.description },
    title: {
      text: title.text,
      characterCount: title.text.length,
      sources: [currentSource, ...(inputs.lockedTerms.length > 0 ? [lockedSource] : [])],
    },
    tags: {
      tags: tags.result,
      added: tags.added,
      removed: tags.removed,
      sources: [listSource],
    },
    description: inputs.rewriteDescription
      ? { text: listing.description, sources: [currentSource] }
      : null,
    rationale,
    createdAt: args.now,
  }
}

/**
 * Consume one generation.
 *
 * Throws when the allowance is spent, and the caller is expected to show the
 * limit state rather than degrade quietly. A failed generation must NOT be
 * counted — the design says so explicitly, and it is the difference between a
 * limit and a penalty.
 */
export function consumeGeneration(quota: GenerationQuota): GenerationQuota {
  if (quotaExhausted(quota)) {
    throw Errors.limitReached(
      'AI generations',
      quota.limit,
      quota.resetsOn,
      'Manual editing, audits and bulk edits are unaffected.',
    )
  }
  return { ...quota, used: quota.used + 1 }
}

function rewriteTitle(title: string, lockedTerms: string[]): { text: string; removedDuplicate: string | null } {
  const parts = title.split(',').map((p) => p.trim()).filter(Boolean)
  const seen = new Set<string>()
  let removedDuplicate: string | null = null

  const kept = parts.filter((part) => {
    const key = part.toLowerCase()
    // A locked term is preserved even where it repeats. The seller decided.
    if (lockedTerms.some((t) => key.includes(t.toLowerCase()))) return true
    const word = key.split(/\s+/).at(-1) ?? key
    if (seen.has(word)) {
      removedDuplicate ??= part
      return false
    }
    seen.add(word)
    return true
  })

  let text = kept.join(', ')
  if (text.length > MAX_TITLE) text = text.slice(0, text.lastIndexOf(',', MAX_TITLE))
  return { text, removedDuplicate }
}

function retag(
  current: string[],
  savedTerms: string[],
  title: string,
): { result: string[]; added: string[]; removed: string[] } {
  const titleText = title.toLowerCase()
  const removed = current.filter((t) => t.length > 6 && titleText.includes(t.toLowerCase()))
  const kept = current.filter((t) => !removed.includes(t))

  const added: string[] = []
  for (const term of savedTerms) {
    if (kept.length + added.length >= 13) break
    if (kept.includes(term) || added.includes(term)) continue
    if (term.length > 20) continue // Etsy caps a tag at 20 characters.
    added.push(term)
  }

  return { result: [...kept, ...added], added, removed }
}

function demoQuota(): GenerationQuota {
  return {
    used: 42,
    limit: 60,
    resetsOn: '2026-09-01',
    planName: 'Solo',
    nextTier: { name: 'Growth', limit: 500 },
  }
}
