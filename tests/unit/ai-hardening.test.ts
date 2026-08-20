import { describe, expect, it } from 'vitest'
import { SYSTEM_PROMPT, allowedNumbers, renderFacts, renderRequest } from '@/lib/ai/prompt'
import type { DraftListingRequest, ExplainIssueRequest, RecommendActionRequest } from '@/lib/ai/interface'
import { validateDraft, validateProse } from '@/domain/ai/validate'
import { approvalEvents, describeApproval } from '@/domain/ai/audit-trail'
import { explainRule, recommendForAction } from '@/domain/ai/explain'
import { listingFacts, rangeFact, unavailableFact } from '@/domain/ai/facts'
import { MockAiProvider } from '@/lib/ai/mock'
import { auditListings } from '@/domain/audit/service'
import { getActions } from '@/domain/action-center/service'
import { MockMarketSignalsService } from '@/lib/signals/mock'
import {
  DEMO_ACTOR_ID,
  DEMO_SHOP_ID,
  buildDemoListings,
  buildDemoOrders,
  demoConfirmedCosts,
} from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'
import type { AiDraft } from '@/domain/ai/types'

const CTX: ShopContext = { shopId: DEMO_SHOP_ID, actorId: DEMO_ACTOR_ID, readOnly: true }

const REQUEST: DraftListingRequest = {
  kind: 'DRAFT_LISTING',
  current: {
    title: 'Willow & Fern Birth Flower Necklace, 14k gold filled',
    tags: ['birth flower', 'gold necklace'],
    description: 'A delicate pendant, hand-finished in our studio.',
  },
  candidateTerms: ['birth month jewelry', 'dainty flower charm'],
  lockedTerms: ['Willow & Fern'],
  tone: 'WARM',
  rewriteDescription: false,
  guardrails: ['Stay under 140 characters'],
  facts: listingFacts({
    title: 'Willow & Fern Birth Flower Necklace, 14k gold filled',
    tags: ['birth flower', 'gold necklace'],
    description: 'A delicate pendant, hand-finished in our studio.',
  }),
}

function draftResponse(overrides: Partial<Parameters<typeof validateDraft>[1]> = {}) {
  return {
    title: 'Willow & Fern Birth Flower Necklace, 14k gold filled',
    tags: ['birth flower', 'gold necklace', 'birth month jewelry'],
    description: null,
    rationale: ['Added “birth month jewelry” from your saved list.'],
    ...overrides,
  }
}

/* ---------------------------------------------------------------- prompts */

describe('the prompt states the rules as facts about the world', () => {
  it('says Etsy does not publish its ranking algorithm', () => {
    expect(SYSTEM_PROMPT).toContain('Etsy does not publish its ranking algorithm')
    expect(SYSTEM_PROMPT).toContain('Nobody outside Etsy knows')
  })

  it('forbids numbers that are not in the supplied facts', () => {
    expect(SYSTEM_PROMPT).toContain('Every number you write must appear in the FACTS list')
  })

  it('forbids prediction outright, in any timeframe', () => {
    expect(SYSTEM_PROMPT).toContain('Never predict an outcome')
  })

  it('offers "change nothing" as a valid answer', () => {
    expect(SYSTEM_PROMPT).toContain('An unchanged listing is a valid answer')
  })

  it('is a frozen constant — nothing interpolates into it', () => {
    // A system prompt that varies per request is one a caller can influence.
    expect(SYSTEM_PROMPT).not.toMatch(/\$\{/)
  })
})

describe('facts reach the model with their class attached', () => {
  it('labels each fact with its provenance class', () => {
    const rendered = renderFacts(REQUEST.facts)
    expect(rendered).toContain('VERIFIED')
    expect(rendered).toContain('UNAVAILABLE')
    expect(rendered).toContain('you do not know it')
  })

  it('tells the model explicitly that views and search terms do not exist', () => {
    const rendered = renderFacts(REQUEST.facts)
    expect(rendered).toContain('Etsy does not provide listing views')
    expect(rendered).toContain('does not release the search terms')
  })

  it('keeps an estimate a range, with its caveat, all the way into the prompt', async () => {
    const signals = await new MockMarketSignalsService().getKeyword('birth flower necklace', 'US')
    const fact = rangeFact('Modelled monthly demand', signals.demand)
    expect(fact.value).toMatch(/^[\d,]+–[\d,]+$/)
    expect(fact.provenance).toBe('ESTIMATED')
    expect(fact.caveat).toContain('confidence')
  })

  it('renders an unavailable value as a stated absence, never an omission', () => {
    const fact = unavailableFact('Ad spend per listing', 'Etsy does not expose it.')
    expect(fact.value).toBe('not available')
    expect(renderFacts([fact])).toContain('UNAVAILABLE')
  })

  it('says "write none" when there are no numbers at all', () => {
    expect(renderFacts([])).toContain('write none')
  })
})

describe('the allowed-number set comes from the same facts as the prompt', () => {
  it('permits numbers from the facts and from the seller’s own text', () => {
    const allowed = allowedNumbers(REQUEST)
    expect(allowed.has('13')).toBe(true) // Etsy's tag cap, stated in the prompt
    expect(allowed.has('14')).toBe(true) // "14k" in the seller's own title
    expect(allowed.has('9400')).toBe(false)
  })

  it('normalises separators so 1,204 and 1204 are the same number', () => {
    const request: RecommendActionRequest = {
      kind: 'RECOMMEND_ACTION',
      finding: { title: 't', explanation: '1,204 orders', diagnosis: 'VERIFIED' },
      evidence: [],
      facts: [],
    }
    expect(allowedNumbers(request).has('1204')).toBe(true)
  })

  it('puts the volatile content in the user turn, not the system prompt', () => {
    const rendered = renderRequest(REQUEST)
    expect(rendered).toContain('CURRENT TITLE')
    expect(SYSTEM_PROMPT).not.toContain('CURRENT TITLE')
  })
})

/* ------------------------------------------------------------- validation */

describe('validation catches what the prompt only asks for', () => {
  it('accepts a clean draft', () => {
    expect(validateDraft(REQUEST, draftResponse()).ok).toBe(true)
  })

  it('blocks a number that was never in the facts', () => {
    const result = validateDraft(REQUEST, draftResponse({ rationale: ['About 9,400 searches a month.'] }))
    expect(result.ok).toBe(false)
    expect(result.findings[0]?.code).toBe('INVENTED_METRIC')
  })

  it('blocks every phrasing of a ranking claim', () => {
    const claims = [
      'These tags will rank higher in search.',
      'This improves your visibility on Etsy.',
      'The algorithm favours longer titles.',
      'Good SEO for this listing.',
      'You will get more views.',
    ]
    for (const claim of claims) {
      const result = validateDraft(REQUEST, draftResponse({ rationale: [claim] }))
      expect(result.ok, claim).toBe(false)
    }
  })

  it('blocks a forecast even when it is hedged', () => {
    const forecasts = [
      'You should see more orders soon.',
      'Expected lift over the next 30 days.',
      'You can expect better results.',
    ]
    for (const forecast of forecasts) {
      expect(validateDraft(REQUEST, draftResponse({ rationale: [forecast] })).ok, forecast).toBe(false)
    }
  })

  it('blocks an unverifiable claim in listing text but allows discussing it in the rationale', () => {
    expect(validateDraft(REQUEST, draftResponse({ title: 'Best Birth Flower Necklace' })).ok).toBe(false)
    const discussing = validateDraft(
      REQUEST,
      draftResponse({ rationale: ['Removed “best” — nothing here can support that claim.'] }),
    )
    expect(discussing.ok).toBe(true)
  })

  it('blocks a named competitor', () => {
    const result = validateDraft(REQUEST, draftResponse({ rationale: ['Aurelia Made uses this term.'] }))
    expect(result.ok).toBe(false)
  })

  it('treats an unsourced tag as advisory, not as a rule break', () => {
    const result = validateDraft(
      REQUEST,
      draftResponse({ tags: ['birth flower', 'gold necklace', 'invented term'] }),
    )
    expect(result.ok).toBe(true)
    expect(result.findings.some((f) => f.code === 'UNSOURCED_TAG')).toBe(true)
  })

  it('derives its verdict from the findings — a rule added last can still block', () => {
    // The ordering property: the tag rule runs after several earlier checks
    // have already produced findings, and it still forces ok to false.
    const result = validateDraft(REQUEST, draftResponse({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }))
    expect(result.ok).toBe(false)
    expect(result.findings.some((f) => f.code === 'TOO_MANY_TAGS')).toBe(true)
  })

  it('blocks a recommendation that cites evidence it was never given', () => {
    const request: RecommendActionRequest = {
      kind: 'RECOMMEND_ACTION',
      finding: { title: 'x', explanation: 'y', diagnosis: 'VERIFIED' },
      evidence: ['38 orders in the last 30 days'],
      facts: [],
    }
    const result = validateProse(request, {
      text: 'Revert the price change.',
      citedEvidence: ['A trend we noticed'],
    })
    expect(result.ok).toBe(false)
    expect(result.findings[0]?.code).toBe('CITED_EVIDENCE_NOT_SUPPLIED')
  })

  it('blocks an empty response rather than showing an empty explanation', () => {
    const request: ExplainIssueRequest = {
      kind: 'EXPLAIN_ISSUE',
      rule: { label: 'r', why: 'w', fix: 'f', severity: 'ERROR' },
      affected: [],
      facts: [],
    }
    expect(validateProse(request, { text: '   ', citedEvidence: [] }).ok).toBe(false)
  })
})

/* -------------------------------------------------- explanations fall back */

describe('a withheld explanation degrades to the product’s own words', () => {
  it('uses the model’s version when it passes', async () => {
    const listings = buildDemoListings()
    const view = auditListings(listings, buildDemoOrders(listings), demoConfirmedCosts(listings))
    const result = await explainRule(view.results[0]!, new MockAiProvider())
    expect(result.aiAssisted).toBe(true)
    expect(result.text.length).toBeGreaterThan(0)
  })

  it('falls back to the rule’s own wording when the model claims a ranking effect', async () => {
    const listings = buildDemoListings()
    const view = auditListings(listings, buildDemoOrders(listings), demoConfirmedCosts(listings))
    const rule = view.results[0]!
    const result = await explainRule(rule, new MockAiProvider('RANKING_CLAIM'))
    expect(result.aiAssisted).toBe(false)
    expect(result.text).toContain(rule.rule.why)
    expect(result.withheldBecause.join(' ')).toContain('ranking')
  })

  it('falls back when a recommendation invents a figure', async () => {
    const centre = await getActions(CTX)
    const action = centre.actions[0]!
    const result = await recommendForAction(action, new MockAiProvider('INVENT_METRIC'))
    expect(result.aiAssisted).toBe(false)
    expect(result.text).toBe(action.explanation)
  })

  it('never leaves the seller with nothing, even if the provider throws', async () => {
    const centre = await getActions(CTX)
    const action = centre.actions[0]!
    const broken = {
      mode: 'MOCK' as const,
      model: 'broken',
      draftListing: () => Promise.reject(new Error('down')),
      explainIssue: () => Promise.reject(new Error('down')),
      recommendAction: () => Promise.reject(new Error('down')),
    }
    const result = await recommendForAction(action, broken)
    expect(result.text).toBe(action.explanation)
    expect(result.aiAssisted).toBe(false)
  })
})

/* ------------------------------------------------------------ audit trail */

describe('an approved AI change is recorded as one', () => {
  const draft: AiDraft = {
    id: 'draft-1',
    shopId: DEMO_SHOP_ID,
    listingId: 'L1',
    listingTitle: 'Old title',
    status: 'APPROVED',
    inputs: {
      keywordListId: null,
      keywordListName: null,
      tone: 'WARM',
      lockedTerms: [],
      rewriteDescription: false,
      guardrails: [],
    },
    current: { title: 'Old title', tags: ['a'], description: 'Old description' },
    title: { text: 'New title', characterCount: 9, sources: [] },
    tags: { tags: ['a', 'b'], added: ['b'], removed: [], sources: [] },
    description: null,
    rationale: ['Added “b” from your saved list.'],
    advisories: [],
    producedBy: 'mock',
    createdAt: '2026-08-20T00:00:00.000Z',
  }

  const events = approvalEvents({
    draft,
    approvedBy: DEMO_ACTOR_ID,
    approvedAt: '2026-08-20T10:00:00.000Z',
    operationId: 'op-1',
    eventIdFor: (field) => `ev-${field}`,
  })

  it('writes one event per changed field, not one per draft', () => {
    expect(events.map((e) => e.type).sort()).toEqual(['TAGS_CHANGED', 'TITLE_CHANGED'])
  })

  it('marks every event AI-assisted and names the approver', () => {
    for (const event of events) {
      expect(event.source).toBe('AI_ASSISTED')
      expect(event.actorId).toBe(DEMO_ACTOR_ID)
      expect(event.operationId).toBe('op-1')
    }
  })

  it('keeps the before value, so the change is reversible', () => {
    const title = events.find((e) => e.type === 'TITLE_CHANGED')
    expect(title?.beforeValue).toBe('Old title')
    expect(title?.afterValue).toBe('New title')
  })

  it('records the rationale the seller actually read, and who produced it', () => {
    expect(events[0]?.reason).toContain('Added “b” from your saved list.')
    expect(events[0]?.reason).toContain('drafted by mock')
  })

  it('writes nothing for a field the draft did not change', () => {
    const unchanged = approvalEvents({
      draft: { ...draft, title: { text: 'Old title', characterCount: 9, sources: [] } },
      approvedBy: DEMO_ACTOR_ID,
      approvedAt: '2026-08-20T10:00:00.000Z',
      operationId: 'op-1',
      eventIdFor: (field) => `ev-${field}`,
    })
    expect(unchanged.map((e) => e.type)).toEqual(['TAGS_CHANGED'])
  })

  it('describes the approval in a sentence a seller can read later', () => {
    const text = describeApproval({
      draftId: 'draft-1',
      listingId: 'L1',
      approvedBy: 'Salman R.',
      approvedAt: '2026-08-20T10:00:00.000Z',
      operationId: 'op-1',
      producedBy: 'claude-opus-5',
      rationale: [],
    })
    expect(text).toContain('Salman R.')
    expect(text).toContain('Nothing was published before that approval')
  })
})
