import { describe, expect, it, vi } from 'vitest'
import { consumeGeneration, generateDraft, getCopilotView } from '@/domain/ai/service'
import { DEFAULT_GUARDRAILS, draftChanges, quotaExhausted, type AiDraft, type GenerationInputs } from '@/domain/ai/types'
import { createDraft } from '@/domain/bulk-editor/service'
import { MockAiProvider, type Misbehaviour } from '@/lib/ai/mock'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID, buildDemoListings } from '@/lib/etsy/demo-dataset'
import { AppError } from '@/lib/errors/types'
import type { ShopContext } from '@/lib/permissions'

const CTX: ShopContext = { shopId: DEMO_SHOP_ID, actorId: DEMO_ACTOR_ID, readOnly: true }
const listings = buildDemoListings()

const INPUTS: GenerationInputs = {
  keywordListId: 'list-autumn-gifting',
  keywordListName: 'Autumn gifting',
  tone: 'WARM',
  lockedTerms: ['Willow & Fern', '14k gold filled'],
  rewriteDescription: false,
  guardrails: [...DEFAULT_GUARDRAILS],
}

async function attempt(
  overrides: Partial<Parameters<typeof generateDraft>[0]> = {},
  misbehave?: Misbehaviour,
) {
  return generateDraft({
    shopId: DEMO_SHOP_ID,
    listing: listings[0]!,
    inputs: INPUTS,
    terms: ['birth month jewelry', 'dainty flower charm'],
    now: '2026-08-20T00:00:00.000Z',
    provider: new MockAiProvider(misbehave),
    ...overrides,
  })
}

async function draftFor(overrides: Partial<Parameters<typeof generateDraft>[0]> = {}): Promise<AiDraft> {
  const outcome = await attempt(overrides)
  if (outcome.kind !== 'DRAFT') {
    throw new Error(`expected a draft, got: ${outcome.rejected.reasons.join(' | ')}`)
  }
  return outcome.draft
}

describe('AI drafts, never publishes', () => {
  it('starts awaiting review and has no way to reach Etsy on its own', async () => {
    const draft = await draftFor()
    expect(draft.status).toBe('AWAITING_REVIEW')
    const op = createDraft({
      id: 'op-from-draft',
      ctx: CTX,
      changes: draftChanges(draft),
      listings: [listings[0]!],
      now: '2026-08-20T00:00:00.000Z',
    })
    expect(op.state).toBe('DRAFT')
    expect(op.approvalState).toBeNull()
  })

  it('has no field for a predicted outcome', async () => {
    const draft = (await draftFor()) as unknown as Record<string, unknown>
    for (const forbidden of ['predictedImpact', 'expectedLift', 'rankingForecast', 'estimatedSales']) {
      expect(forbidden in draft).toBe(false)
    }
  })

  it('names a source for every drafted element and records who produced it', async () => {
    const draft = await draftFor()
    expect(draft.title.sources.length).toBeGreaterThan(0)
    expect(draft.tags.sources.length).toBeGreaterThan(0)
    expect(draft.producedBy.length).toBeGreaterThan(0)
  })
})

/*
 * The Phase 7 tests. Each one hands the service a provider that breaks a rule
 * on purpose and asserts the draft never reaches the seller — a guardrail
 * nobody has watched fail is a guardrail nobody has tested.
 */
describe('output validation withholds a draft that breaks a rule', () => {
  const cases: [Misbehaviour, string][] = [
    ['INVENT_METRIC', 'not in the facts'],
    ['RANKING_CLAIM', 'ranking'],
    ['FORECAST', 'predict'],
    ['DROP_LOCKED_TERM', 'locked term'],
    ['UNVERIFIABLE_CLAIM', 'Nothing supports it'],
    ['NAME_COMPETITOR', 'Named another shop'],
    ['TOO_MANY_TAGS', 'Etsy allows 13'],
    ['NO_RATIONALE', 'without saying what changed'],
  ]

  // Carries a locked term, so the dropped-term case has something to drop.
  const LISTING = {
    ...listings[0]!,
    title: 'Willow & Fern Birth Flower Necklace, 14k gold filled pendant',
    // Eleven tags, so the over-tagging case actually exceeds Etsy's thirteen.
    tags: Array.from({ length: 11 }, (_, i) => `tag ${String.fromCharCode(97 + i)}`),
  }

  for (const [misbehaviour, expected] of cases) {
    it(`withholds a draft that would ${misbehaviour.toLowerCase().replace(/_/g, ' ')}`, async () => {
      const outcome = await attempt({ listing: LISTING }, misbehaviour)
      expect(outcome.kind).toBe('REJECTED')
      if (outcome.kind !== 'REJECTED') return
      expect(outcome.rejected.reasons.join(' ')).toContain(expected)
      // Two things the seller is told, every time.
      expect(outcome.rejected.note).toContain('live listing was not touched')
      expect(outcome.rejected.note).toContain('not counted against your allowance')
    })
  }

  it('withholds the whole draft rather than repairing part of it', async () => {
    const outcome = await attempt({ listing: LISTING }, 'RANKING_CLAIM')
    expect(outcome.kind).toBe('REJECTED')
    // There is no shape for a partially-trusted draft: the union has two arms.
    if (outcome.kind === 'REJECTED') expect('draft' in outcome).toBe(false)
  })

  it('lets a clean draft through', async () => {
    const outcome = await attempt({ listing: LISTING })
    expect(outcome.kind).toBe('DRAFT')
  })
})

describe('guardrails hold in the drafted output', () => {
  it('preserves a locked term verbatim, even where it repeats', async () => {
    const listing = {
      ...listings[0]!,
      title: 'Willow & Fern Gold Necklace, Handmade Gift, Willow & Fern Studio Gift',
    }
    const draft = await draftFor({ listing })
    expect(draft.title.text).toContain('Willow & Fern')
  })

  it('keeps the title within the character guardrail', async () => {
    const listing = { ...listings[0]!, title: `${'A very long segment, '.repeat(12)}end` }
    const draft = await draftFor({ listing })
    expect(draft.title.characterCount).toBeLessThanOrEqual(140)
  })

  it('never proposes more than Etsy’s thirteen tags', async () => {
    const listing = { ...listings[0]!, tags: Array.from({ length: 11 }, (_, i) => `existing ${i}`) }
    const draft = await draftFor({
      listing,
      terms: Array.from({ length: 20 }, (_, i) => `new term ${i}`),
    })
    expect(draft.tags.tags.length).toBeLessThanOrEqual(13)
  })

  it('leaves the live listing untouched in the draft object', async () => {
    const listing = listings[0]!
    const draft = await draftFor({ listing })
    expect(draft.current.title).toBe(listing.title)
    expect(draft.current.tags).toEqual(listing.tags)
  })
})

describe('the generation quota is a boundary, not a penalty', () => {
  it('refuses once spent, and says what still works', () => {
    const spent = { used: 60, limit: 60, resetsOn: '2026-09-01', planName: 'Solo', nextTier: null }
    expect(quotaExhausted(spent)).toBe(true)
    try {
      consumeGeneration(spent)
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      const app = error as AppError
      expect(app.kind).toBe('PLAN_LIMIT')
      expect(app.recovery).toContain('2026-09-01')
      expect(app.recovery).toContain('unaffected')
      expect(app.message).not.toMatch(/error|failed|denied/i)
    }
  })

  it('counts a successful generation and nothing else', () => {
    const quota = { used: 3, limit: 60, resetsOn: '2026-09-01', planName: 'Solo', nextTier: null }
    expect(consumeGeneration(quota).used).toBe(4)
    expect(quota.used).toBe(3)
  })
})

describe('the copilot view', () => {
  it('returns exactly one of a draft or a rejection', async () => {
    const view = await getCopilotView(CTX)
    // The demo shop always has listings; null means the empty-shop path, which
    // has its own test below.
    if (!view) throw new Error('expected a view for the demo shop')
    expect(view.draft === null).not.toBe(view.rejected === null)
    expect(view.inputs.lockedTerms.length).toBeGreaterThan(0)
    for (const q of view.queue) {
      expect(['APPROVED', 'AWAITING_REVIEW']).toContain(q.status)
    }
  })

  it('runs the rule-based provider in demo mode, never a live model', async () => {
    const view = await getCopilotView(CTX)
    // The demo shop always has listings; null means the empty-shop path, which
    // has its own test below.
    if (!view) throw new Error('expected a view for the demo shop')
    expect(view.provider).toContain('demo mode')
  })
})

describe('a shop with no listings', () => {
  /*
   * The Copilot used to throw notFound('listing') here, so opening it on an
   * empty shop rendered the 500 page: "Something went wrong on our side."
   * Nothing had gone wrong. The shop was new.
   *
   * The distinction the code now makes, and this asserts: an id that matches
   * nothing is still a 404 — a stale link, or a listing deleted on Etsy — while
   * a shop with nothing in it returns null and gets an empty state.
   */
  const EMPTY = { ...CTX }

  it('returns null instead of throwing', async () => {
    const previous = process.env.DEMO_DATASET
    process.env.DEMO_DATASET = 'empty'
    try {
      vi.resetModules()
      const { getCopilotView } = await import('@/domain/ai/service')
      await expect(getCopilotView(EMPTY)).resolves.toBeNull()
    } finally {
      if (previous === undefined) delete process.env.DEMO_DATASET
      else process.env.DEMO_DATASET = previous
      vi.resetModules()
    }
  })
})
