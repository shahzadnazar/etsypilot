/*
 * AI copilot service.
 *
 * The order of operations here IS the hardening:
 *
 *   assemble facts  ->  provider  ->  validate output  ->  draft or refusal
 *
 * There is no path that skips the middle two. `generateDraft` returns either a
 * clean draft or a RejectedDraft explaining what the model did wrong — never a
 * partially-trusted one. A rewrite that invented a metric is not trustworthy
 * about the parts that happen to look fine, and repairing it would mean
 * deciding, on the seller's behalf, which of its claims to believe.
 *
 * Phase 6 built the seam; Phase 7 fills it. The provider is injected, so a test
 * can supply one that misbehaves on purpose and assert the validator catches it
 * — the same reasoning as injecting the Etsy adapter in Phase 4: when a safety
 * property makes something hard to test, change the architecture, never the
 * property.
 */

import { getAiProvider } from '@/lib/ai'
import type { AiProvider, DraftListingRequest } from '@/lib/ai/interface'
import { getEtsyService } from '@/lib/etsy'
import { DEMO_NOW } from '@/lib/etsy/demo-dataset'
import type { EtsyListing } from '@/lib/etsy/interface'
import { Errors } from '@/lib/errors/types'
import type { ShopContext } from '@/lib/permissions'
import { demoLists } from '@/domain/research/service'
import { listingFacts } from './facts'
import { validateDraft } from './validate'
import {
  DEFAULT_GUARDRAILS,
  type AiDraft,
  type DraftSource,
  type GenerationInputs,
  type GenerationQuota,
  type RejectedDraft,
  quotaExhausted,
} from './types'

export interface CopilotView {
  /** The inputs that produced the attempt — shown whether or not it survived. */
  inputs: GenerationInputs
  draft: AiDraft | null
  /** Set when validation withheld the draft. Exactly one of these is non-null. */
  rejected: RejectedDraft | null
  quota: GenerationQuota
  provider: string
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

  const provider = getAiProvider()
  const outcome = await generateDraft({
    shopId: ctx.shopId,
    listing: target,
    inputs,
    terms: list?.terms ?? [],
    now: DEMO_NOW,
    provider,
  })

  const queue = listings
    .filter((l) => l.tags.length < 13 && l.etsyListingId !== target.etsyListingId)
    .slice(0, 6)
    .map((l, i) => ({
      listingId: l.etsyListingId,
      title: l.title,
      status: (i < 3 ? 'APPROVED' : 'AWAITING_REVIEW') as AiDraft['status'],
    }))

  return {
    inputs,
    draft: outcome.kind === 'DRAFT' ? outcome.draft : null,
    rejected: outcome.kind === 'REJECTED' ? outcome.rejected : null,
    quota: demoQuota(),
    provider: provider.mode === 'LIVE' ? provider.model : 'rule-based draft (demo mode)',
    queue,
  }
}

export type DraftOutcome =
  | { kind: 'DRAFT'; draft: AiDraft }
  | { kind: 'REJECTED'; rejected: RejectedDraft }

/**
 * Produce a draft, or refuse to.
 *
 * The provider is a parameter. Nothing here knows or cares whether a model or a
 * rule set produced the text — the validation is identical either way, which is
 * the point: the guarantee cannot weaken when the provider gets better.
 */
export async function generateDraft(args: {
  shopId: string
  listing: EtsyListing
  inputs: GenerationInputs
  terms: string[]
  now: string
  provider?: AiProvider
}): Promise<DraftOutcome> {
  const { listing, inputs, terms } = args
  const provider = args.provider ?? getAiProvider()

  const request: DraftListingRequest = {
    kind: 'DRAFT_LISTING',
    current: { title: listing.title, tags: listing.tags, description: listing.description },
    candidateTerms: terms,
    lockedTerms: inputs.lockedTerms,
    tone: inputs.tone,
    rewriteDescription: inputs.rewriteDescription,
    guardrails: inputs.guardrails,
    facts: listingFacts(listing),
  }

  const response = await provider.draftListing(request)
  const validation = validateDraft(request, response)

  if (!validation.ok) {
    return {
      kind: 'REJECTED',
      rejected: {
        listingId: listing.etsyListingId,
        listingTitle: listing.title,
        reasons: validation.findings
          .filter((f) => f.severity === 'BLOCKING')
          .map((f) => f.detail),
        note: 'The draft was withheld. Your live listing was not touched, and this generation was not counted against your allowance.',
      },
    }
  }

  const listSource: DraftSource = {
    label: inputs.keywordListName ? `keyword list “${inputs.keywordListName}”` : 'your saved terms',
    kind: 'KEYWORD_LIST',
  }
  const currentSource: DraftSource = { label: 'your current title', kind: 'CURRENT_LISTING' }
  const lockedSource: DraftSource = { label: 'locked terms preserved', kind: 'LOCKED_TERM' }

  const added = response.tags.filter((t) => !listing.tags.includes(t))
  const removed = listing.tags.filter((t) => !response.tags.includes(t))

  return {
    kind: 'DRAFT',
    draft: {
      id: `draft-${listing.etsyListingId}`,
      shopId: args.shopId,
      listingId: listing.etsyListingId,
      listingTitle: listing.title,
      status: 'AWAITING_REVIEW',
      inputs,
      current: { title: listing.title, tags: listing.tags, description: listing.description },
      title: {
        text: response.title,
        characterCount: response.title.length,
        sources: [currentSource, ...(inputs.lockedTerms.length > 0 ? [lockedSource] : [])],
      },
      tags: { tags: response.tags, added, removed, sources: [listSource] },
      description: response.description
        ? { text: response.description, sources: [currentSource] }
        : null,
      rationale: response.rationale,
      advisories: validation.findings.filter((f) => f.severity === 'ADVISORY').map((f) => f.detail),
      producedBy: provider.mode === 'LIVE' ? provider.model : provider.mode.toLowerCase(),
      createdAt: args.now,
    },
  }
}

/**
 * Consume one generation.
 *
 * Called only after a draft has passed validation. A failed generation, a
 * refusal and a withheld draft are all free — the design says so, and it is the
 * difference between a limit and a fine.
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

function demoQuota(): GenerationQuota {
  return {
    used: 42,
    limit: 60,
    resetsOn: '2026-09-01',
    planName: 'Growth',
    nextTier: null,
  }
}
