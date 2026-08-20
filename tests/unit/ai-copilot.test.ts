import { describe, expect, it } from 'vitest'
import { consumeGeneration, generateDraft, getCopilotView } from '@/domain/ai/service'
import { DEFAULT_GUARDRAILS, draftChanges, quotaExhausted, type GenerationInputs } from '@/domain/ai/types'
import { createDraft } from '@/domain/bulk-editor/service'
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

function draftFor(overrides: Partial<Parameters<typeof generateDraft>[0]> = {}) {
  return generateDraft({
    shopId: DEMO_SHOP_ID,
    listing: listings[0]!,
    inputs: INPUTS,
    terms: ['birth month jewelry', 'dainty flower charm'],
    now: '2026-08-20T00:00:00.000Z',
    ...overrides,
  })
}

describe('AI drafts, never publishes', () => {
  it('starts awaiting review and has no way to reach Etsy on its own', () => {
    const draft = draftFor()
    expect(draft.status).toBe('AWAITING_REVIEW')
    // The only route to a write is a bulk operation, which starts as a DRAFT.
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

  it('has no field for a predicted outcome', () => {
    const draft = draftFor() as unknown as Record<string, unknown>
    for (const forbidden of ['predictedImpact', 'expectedLift', 'rankingForecast', 'estimatedSales']) {
      expect(forbidden in draft).toBe(false)
    }
  })

  it('names a source for every drafted element', () => {
    const draft = draftFor()
    expect(draft.title.sources.length).toBeGreaterThan(0)
    expect(draft.tags.sources.length).toBeGreaterThan(0)
    for (const source of [...draft.title.sources, ...draft.tags.sources]) {
      expect(source.label.length).toBeGreaterThan(0)
    }
  })

  it('explains every change it made', () => {
    const draft = draftFor()
    expect(draft.rationale.length).toBeGreaterThan(0)
    // As many reasons as changes, at minimum.
    expect(draft.rationale.length).toBeGreaterThanOrEqual(
      draft.tags.added.length + draft.tags.removed.length,
    )
  })
})

describe('guardrails hold', () => {
  it('preserves a locked term verbatim, even where it repeats', () => {
    const listing = {
      ...listings[0]!,
      title: 'Willow & Fern Gold Necklace, Handmade Gift, Willow & Fern Studio Gift',
    }
    const draft = draftFor({ listing })
    expect(draft.title.text).toContain('Willow & Fern')
  })

  it('keeps the title within the character guardrail', () => {
    const listing = { ...listings[0]!, title: `${'A very long segment, '.repeat(12)}end` }
    const draft = draftFor({ listing })
    expect(draft.title.characterCount).toBeLessThanOrEqual(140)
  })

  it('never proposes more than Etsy’s thirteen tags', () => {
    const listing = { ...listings[0]!, tags: Array.from({ length: 11 }, (_, i) => `existing ${i}`) }
    const draft = draftFor({
      listing,
      terms: Array.from({ length: 20 }, (_, i) => `new term ${i}`),
    })
    expect(draft.tags.tags.length).toBeLessThanOrEqual(13)
  })

  it('leaves the live listing untouched in the draft object', () => {
    const listing = listings[0]!
    const draft = draftFor({ listing })
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
      // Never framed as a fault.
      expect(app.message).not.toMatch(/error|failed|denied/i)
    }
  })

  it('counts a successful generation and nothing else', () => {
    const quota = { used: 3, limit: 60, resetsOn: '2026-09-01', planName: 'Solo', nextTier: null }
    expect(consumeGeneration(quota).used).toBe(4)
    // The original is untouched — a caller cannot lose count by reusing it.
    expect(quota.used).toBe(3)
  })
})

describe('the copilot view', () => {
  it('queues drafts that are each approved individually', async () => {
    const view = await getCopilotView(CTX)
    expect(view.draft.status).toBe('AWAITING_REVIEW')
    expect(view.quota.limit).toBeGreaterThan(0)
    for (const q of view.queue) {
      expect(['APPROVED', 'AWAITING_REVIEW']).toContain(q.status)
    }
  })
})
