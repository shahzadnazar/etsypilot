/*
 * The AI provider contract.
 *
 * Server-only. Nothing in this module is importable from a client component,
 * and no implementation ever returns a credential, a prompt, or a raw model
 * response to a caller above the domain layer.
 *
 * The shape of the request is the hardening. A provider is handed FACTS, each
 * one carrying its provenance, and there is no free-text field through which a
 * caller could smuggle an unlabelled claim into the prompt. So "AI receives
 * structured application data rather than inventing facts" is not a convention
 * the prompt builder observes — it is the only thing the type permits.
 *
 * Note what is absent, deliberately:
 *
 *   - No `temperature`, `topP` or `systemPrompt` parameter. A caller cannot
 *     loosen the guardrails from the outside.
 *   - No method that returns free text about metrics. Every task here rewrites
 *     the seller's own words or explains a finding the domain already computed.
 *   - No `predictImpact`, no `forecast`, no `rankingAdvice`. There is nowhere to
 *     put such a request, so no future call site can make one.
 */

import type { ProvenanceType } from '@/lib/provenance/types'

/**
 * One fact the model is allowed to know.
 *
 * `value` is a string because it is going into a prompt, and the conversion
 * happens where the provenance is still attached — not at some later call site
 * holding a bare number.
 */
export interface PromptFact {
  label: string
  value: string
  provenance: ProvenanceType
  /** Required for ESTIMATED. Rendered into the prompt beside the value. */
  caveat?: string
}

export interface DraftListingRequest {
  kind: 'DRAFT_LISTING'
  /** The seller's own current text. The only prose the model may rewrite. */
  current: { title: string; tags: string[]; description: string }
  /** Terms the seller saved. Candidate additions, never mandatory. */
  candidateTerms: string[]
  /** Preserved verbatim. A draft that drops one is rejected, not repaired. */
  lockedTerms: string[]
  tone: 'WARM' | 'PLAIN' | 'PREMIUM'
  rewriteDescription: boolean
  /** Hard constraints stated in the prompt AND enforced after the response. */
  guardrails: string[]
  /** Everything numeric the model may refer to, with its class. */
  facts: PromptFact[]
}

export interface ExplainIssueRequest {
  kind: 'EXPLAIN_ISSUE'
  /** The rule as the domain defines it. The model may not invent a new one. */
  rule: { label: string; why: string; fix: string; severity: string }
  /** Listing titles affected. Evidence, not decoration. */
  affected: string[]
  facts: PromptFact[]
}

export interface RecommendActionRequest {
  kind: 'RECOMMEND_ACTION'
  /** The finding the domain produced, verbatim. */
  finding: { title: string; explanation: string; diagnosis: string }
  /** The evidence lines already computed and shown on screen. */
  evidence: string[]
  facts: PromptFact[]
}

export type AiRequest = DraftListingRequest | ExplainIssueRequest | RecommendActionRequest

export interface DraftListingResponse {
  title: string
  tags: string[]
  description: string | null
  /** One sentence per change, each naming what changed and why. */
  rationale: string[]
}

export interface ProseResponse {
  /** Plain language, no headings, no markdown. */
  text: string
  /** Which of the supplied evidence lines the text relies on. */
  citedEvidence: string[]
}

export interface AiProvider {
  readonly mode: 'MOCK' | 'LIVE'
  readonly model: string
  draftListing(request: DraftListingRequest): Promise<DraftListingResponse>
  explainIssue(request: ExplainIssueRequest): Promise<ProseResponse>
  recommendAction(request: RecommendActionRequest): Promise<ProseResponse>
}
