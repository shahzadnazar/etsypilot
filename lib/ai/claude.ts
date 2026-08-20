import 'server-only'

/*
 * The live provider — Anthropic's Claude.
 *
 * `import 'server-only'` on the first line is load-bearing: it makes importing
 * this module from a client component a BUILD error, not a review comment. The
 * API key is read from the server environment and never leaves it; no prompt,
 * no key and no raw model response is ever returned to a caller above the
 * domain layer.
 *
 * Structured output is used rather than prose parsing. The model is constrained
 * to a JSON schema, so "the response did not have the shape we expected" stops
 * being a failure mode we have to handle in string-manipulation code — and the
 * validator in domain/ai/validate.ts can then check what the fields SAY.
 *
 * Caching: the system prompt is a frozen constant carrying the guardrails, so
 * it sits in front of the cache breakpoint and the volatile per-request content
 * comes after it. Cost aside, this is why SYSTEM_PROMPT is never interpolated.
 */

import Anthropic from '@anthropic-ai/sdk'
import { Errors } from '@/lib/errors/types'
import type {
  AiProvider,
  DraftListingRequest,
  DraftListingResponse,
  ExplainIssueRequest,
  ProseResponse,
  RecommendActionRequest,
} from './interface'
import { SYSTEM_PROMPT, renderRequest } from './prompt'

const MODEL = 'claude-opus-5'

/** Bounded so a runaway response cannot cost the seller their whole allowance. */
const MAX_TOKENS = 4096

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'The rewritten title. At most 140 characters.' },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'The complete resulting tag set. At most 13, each at most 20 characters.',
    },
    description: {
      type: ['string', 'null'],
      description: 'The rewritten description, or null if it was not to be rewritten.',
    },
    rationale: {
      type: 'array',
      items: { type: 'string' },
      description: 'One sentence per change, naming what changed and why. No predictions.',
    },
  },
  required: ['title', 'tags', 'description', 'rationale'],
  additionalProperties: false,
} as const

const PROSE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'Two or three plain sentences. No markdown.' },
    citedEvidence: {
      type: 'array',
      items: { type: 'string' },
      description: 'Evidence lines used, copied verbatim from the EVIDENCE list.',
    },
  },
  required: ['text', 'citedEvidence'],
  additionalProperties: false,
} as const

export class ClaudeAiProvider implements AiProvider {
  readonly mode = 'LIVE' as const
  readonly model = MODEL
  private client: Anthropic | null = null

  /**
   * The client is built on first use, not at construction.
   *
   * Demo mode must boot with no credentials of any kind, and a constructor that
   * reads ANTHROPIC_API_KEY would make an unconfigured environment fail at
   * import time rather than at the point someone actually asks for a draft.
   */
  private get anthropic(): Anthropic {
    if (this.client) return this.client
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw Errors.aiUnavailable(
        'No AI credentials are configured on the server.',
      )
    }
    this.client = new Anthropic({ apiKey })
    return this.client
  }

  async draftListing(request: DraftListingRequest): Promise<DraftListingResponse> {
    return this.complete<DraftListingResponse>(renderRequest(request), DRAFT_SCHEMA, 'draft')
  }

  async explainIssue(request: ExplainIssueRequest): Promise<ProseResponse> {
    return this.complete<ProseResponse>(renderRequest(request), PROSE_SCHEMA, 'explanation')
  }

  async recommendAction(request: RecommendActionRequest): Promise<ProseResponse> {
    return this.complete<ProseResponse>(renderRequest(request), PROSE_SCHEMA, 'recommendation')
  }

  private async complete<T>(
    userContent: string,
    schema: Record<string, unknown>,
    what: string,
  ): Promise<T> {
    try {
      const response = await this.anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Stable prefix first, volatile content after — the caching contract.
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema },
        },
        messages: [{ role: 'user', content: userContent }],
      })

      /*
       * A refusal is a legitimate outcome, not an exception. It surfaces to the
       * seller as "no draft was produced", which is exactly what happened —
       * and, per the quota rule, it is not counted against their allowance.
       */
      if (response.stop_reason === 'refusal') {
        throw Errors.aiRefused(response.stop_details?.explanation ?? undefined)
      }

      const block = response.content.find((b) => b.type === 'text')
      if (!block || block.type !== 'text') {
        throw Errors.aiUnavailable(`The model returned no ${what}.`)
      }
      return JSON.parse(block.text) as T
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw Errors.aiUnavailable('The AI service is rate limited right now.')
      }
      if (error instanceof Anthropic.AuthenticationError) {
        // Never surface the key, the header, or the provider's message.
        throw Errors.aiUnavailable('The server’s AI credentials were rejected.')
      }
      if (error instanceof Anthropic.APIError) {
        throw Errors.aiUnavailable('The AI service could not be reached.')
      }
      throw error
    }
  }
}
