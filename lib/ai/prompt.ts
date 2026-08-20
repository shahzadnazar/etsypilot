/*
 * Provenance-aware prompts.
 *
 * Two jobs, and the second is the one that matters.
 *
 * 1. Render facts with their class attached, so the model is never handed a
 *    bare number. "438 orders" invites a model to reason about 438; "438
 *    (VERIFIED — Etsy receipts, exact)" tells it what kind of thing that is,
 *    and an ESTIMATED line arrives with its caveat in the same breath.
 *
 * 2. State the prohibitions as rules about the WORLD, not preferences about
 *    style. "Etsy does not publish its ranking algorithm; no one outside Etsy
 *    knows it" is checkable and stable. "Please avoid ranking claims" is a
 *    request, and requests are the first thing a long context erodes.
 *
 * The system prompt is a frozen constant. That is a caching decision as well as
 * a safety one: it is byte-stable, so it sits in front of every cache breakpoint
 * and never invalidates the prefix (shared/prompt-caching.md — stable content
 * first, volatile content last).
 */

import type { AiRequest, PromptFact } from './interface'

/**
 * The rules, in the model's context, on every request.
 *
 * Never interpolated. Never assembled from parts. A system prompt that varies
 * per request is a system prompt a caller can influence.
 */
export const SYSTEM_PROMPT = `You help an Etsy seller improve their own listings inside EtsyPilot.

WHAT YOU ARE WORKING WITH
The seller's own listing text, the seller's own saved keywords, and a list of
FACTS. Each fact carries a class:

  VERIFIED      Etsy returned it for this shop. Exact.
  CALCULATED    A visible formula over visible inputs.
  ESTIMATED     Modelled from public signals. Always a range, never precise.
  SELLER_INPUT  The seller entered it.
  UNAVAILABLE   Etsy does not expose it. It does not exist for you.

RULES — these are facts about the world, not style preferences.

1. Every number you write must appear in the FACTS list, copied exactly. You
   have no other source of numbers. If a number is not in FACTS, you cannot
   know it, and writing one would be inventing a metric.

2. Etsy does not publish its ranking algorithm. Nobody outside Etsy knows how
   listings are ranked. Never state, imply or hint at what will rank higher,
   improve visibility, boost placement, or please the algorithm. You may say
   what a listing can or cannot MATCH — that is mechanical and knowable.

3. Never predict an outcome. No forecast of sales, views, revenue, conversion
   or position, in any timeframe, with any hedge. Results are measured after
   publishing, not estimated before.

4. Never write an unverifiable claim into listing text: "best", "#1",
   "top-rated", "guaranteed", "fastest". Never name another shop or brand.

5. Locked terms are preserved character for character, wherever they appear.

6. An ESTIMATED fact is a range and stays a range. Do not average it, round it
   into a single figure, or describe it as precise.

7. If you cannot do the task within these rules, say so plainly in the
   rationale and change nothing. An unchanged listing is a valid answer.

HOW TO WRITE
Plain sentences. British or American spelling as the seller's text uses. No
marketing voice, no exclamation marks, no headings, no markdown. Address the
seller as "you".`

const CLASS_NOTE: Record<PromptFact['provenance'], string> = {
  VERIFIED: 'VERIFIED — from this shop’s Etsy receipts, exact',
  CALCULATED: 'CALCULATED — computed from the inputs named',
  ESTIMATED: 'ESTIMATED — modelled from public signals, a range',
  SELLER_INPUT: 'SELLER_INPUT — the seller entered this',
  AI_DRAFT: 'AI_DRAFT — not confirmed by anyone yet',
  UNAVAILABLE: 'UNAVAILABLE — Etsy does not expose this; you do not know it',
}

export function renderFacts(facts: PromptFact[]): string {
  if (facts.length === 0) {
    return 'FACTS\n(none — you have no numbers available, so write none)'
  }
  const lines = facts.map((f) => {
    const caveat = f.caveat ? ` [${f.caveat}]` : ''
    return `- ${f.label}: ${f.value}  (${CLASS_NOTE[f.provenance]})${caveat}`
  })
  return `FACTS — the only numbers you may write\n${lines.join('\n')}`
}

/** The user-turn content. Volatile, so it sits after every cache breakpoint. */
export function renderRequest(request: AiRequest): string {
  switch (request.kind) {
    case 'DRAFT_LISTING':
      return [
        'TASK: rewrite this listing’s title and tags.',
        '',
        `CURRENT TITLE (${request.current.title.length} characters)`,
        request.current.title,
        '',
        `CURRENT TAGS (${request.current.tags.length} of 13)`,
        request.current.tags.join(', ') || '(none)',
        '',
        request.rewriteDescription
          ? `CURRENT DESCRIPTION\n${request.current.description}`
          : 'DESCRIPTION: leave unchanged. Do not return one.',
        '',
        `CANDIDATE TERMS (the seller saved these; use the ones that fit, ignore the rest)\n${request.candidateTerms.join(', ') || '(none)'}`,
        '',
        `LOCKED TERMS (preserve exactly)\n${request.lockedTerms.join(', ') || '(none)'}`,
        '',
        `TONE: ${request.tone.toLowerCase()}`,
        '',
        `CONSTRAINTS\n${request.guardrails.map((g) => `- ${g}`).join('\n')}`,
        '- Etsy allows 13 tags, each at most 20 characters.',
        '',
        renderFacts(request.facts),
      ].join('\n')

    case 'EXPLAIN_ISSUE':
      return [
        'TASK: explain this audit finding to the seller in two or three sentences.',
        'Use the rule’s own reasoning. Do not add a reason of your own, and do',
        'not suggest what Etsy will do about it.',
        '',
        `RULE: ${request.rule.label} (${request.rule.severity})`,
        `WHY THE RULE EXISTS: ${request.rule.why}`,
        `THE FIX: ${request.rule.fix}`,
        '',
        `AFFECTED LISTINGS\n${request.affected.map((a) => `- ${a}`).join('\n')}`,
        '',
        renderFacts(request.facts),
      ].join('\n')

    case 'RECOMMEND_ACTION':
      return [
        'TASK: say what the seller should do next, in two or three sentences.',
        'Base it only on the evidence below. Cite the evidence lines you used,',
        'verbatim, in citedEvidence. If the evidence does not support a',
        'recommendation, say that instead.',
        '',
        `FINDING: ${request.finding.title}`,
        `WHAT THE PRODUCT ALREADY SAYS: ${request.finding.explanation}`,
        `DIAGNOSIS: ${request.finding.diagnosis}`,
        '',
        `EVIDENCE\n${request.evidence.map((e) => `- ${e}`).join('\n')}`,
        '',
        renderFacts(request.facts),
      ].join('\n')
  }
}

/**
 * Every numeral the model is permitted to write, extracted from the facts.
 *
 * The validator compares the response against this set. Building it here, from
 * the same facts that went into the prompt, means the permission list and the
 * prompt cannot drift apart.
 */
export function allowedNumbers(request: AiRequest): Set<string> {
  const allowed = new Set<string>()
  for (const fact of request.facts) {
    for (const n of numeralsIn(fact.value)) allowed.add(n)
  }

  if (request.kind === 'DRAFT_LISTING') {
    // Numbers already in the seller's own text stay allowed — a rewrite that
    // preserved "14k" or "925" is not inventing anything.
    for (const n of numeralsIn(request.current.title)) allowed.add(n)
    for (const n of numeralsIn(request.current.description)) allowed.add(n)
    for (const tag of request.current.tags) for (const n of numeralsIn(tag)) allowed.add(n)
    for (const term of [...request.candidateTerms, ...request.lockedTerms]) {
      for (const n of numeralsIn(term)) allowed.add(n)
    }
    for (const g of request.guardrails) for (const n of numeralsIn(g)) allowed.add(n)
    allowed.add('13') // Etsy's tag cap, stated in the constraints.
  }

  if (request.kind === 'EXPLAIN_ISSUE') {
    for (const n of numeralsIn(`${request.rule.why} ${request.rule.fix} ${request.rule.label}`)) {
      allowed.add(n)
    }
    for (const a of request.affected) for (const n of numeralsIn(a)) allowed.add(n)
  }

  if (request.kind === 'RECOMMEND_ACTION') {
    for (const e of request.evidence) for (const n of numeralsIn(e)) allowed.add(n)
    for (const n of numeralsIn(`${request.finding.title} ${request.finding.explanation}`)) {
      allowed.add(n)
    }
  }

  return allowed
}

/** Digit runs, with separators and decimals stripped so 1,204 matches 1204. */
export function numeralsIn(text: string): string[] {
  return (text.match(/\d[\d,.]*/g) ?? []).map(normaliseNumeral)
}

export function normaliseNumeral(raw: string): string {
  const stripped = raw.replace(/,/g, '').replace(/\.$/, '')
  return stripped.replace(/\.0+$/, '')
}
