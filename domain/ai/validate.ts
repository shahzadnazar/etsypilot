/*
 * Output validation — the hardening.
 *
 * A prompt is an instruction. This is a check. Everything the system prompt
 * forbids is re-tested here against what actually came back, because a model
 * that follows the rules 99 times out of 100 will break one of them in front of
 * a seller eventually, and the rule that matters is the one that holds on the
 * bad day.
 *
 * Findings are BLOCKING or ADVISORY:
 *
 *   BLOCKING   the draft is never shown. Not repaired, not partially applied —
 *              a rewrite that invented a metric cannot be trusted about the
 *              parts that look fine either.
 *   ADVISORY   shown to the seller alongside the draft, because it is a matter
 *              of judgement rather than a rule (a long title, a dropped term
 *              the seller may have wanted dropped).
 *
 * The status is DERIVED from the findings, never assigned and then adjusted.
 * That is the Phase 4 lesson: a rule added later must be able to block, and it
 * cannot if some earlier line has already decided the verdict.
 */

import { allowedNumbers, normaliseNumeral, numeralsIn } from '@/lib/ai/prompt'
import type { AiRequest, DraftListingResponse, ProseResponse } from '@/lib/ai/interface'

export type FindingSeverity = 'BLOCKING' | 'ADVISORY'

export interface ValidationFinding {
  code: string
  severity: FindingSeverity
  /** What is wrong, quoting the offending text. */
  detail: string
  /** Which part of the output. */
  field: 'title' | 'tags' | 'description' | 'rationale' | 'text'
}

export interface ValidationResult {
  ok: boolean
  findings: ValidationFinding[]
}

/* --------------------------------------------------------------- patterns */

/**
 * Claims about Etsy's ranking.
 *
 * Deliberately broad. A false positive costs one regeneration; a false negative
 * puts a claim about a private algorithm in front of a seller who will act on
 * it. The asymmetry decides the threshold.
 */
const RANKING_CLAIMS: [RegExp, string][] = [
  [/\brank(s|ing|ed)?\s+(higher|better|first|top|above)\b/i, 'claims a ranking effect'],
  [/\b(boost|improve|increase|raise)\w*\s+(your\s+)?(ranking|visibility|placement|position|reach|exposure|impressions)\b/i, 'claims a visibility effect'],
  [/\b(etsy(’|')?s?\s+)?(search\s+)?algorithm\b/i, 'refers to Etsy’s algorithm'],
  [/\b(seo|search engine optimi[sz]ation)\b/i, 'frames the change as SEO'],
  [/\bmore\s+(views|traffic|impressions|eyes|buyers|sales|orders)\b/i, 'predicts more traffic or sales'],
  [/\b(will|should|likely to|expect to)\s+\w*\s*(sell|convert|perform|rank|appear)\b/i, 'predicts performance'],
  [/\bfavour(ed|s)?\s+by\s+etsy\b|\bfavored\s+by\s+etsy\b/i, 'claims Etsy favours something'],
]

const FORECASTS: [RegExp, string][] = [
  [/\b\d+\s*[-–—]\s*\d+\s*%\s*(more|increase|lift|uplift|growth)/i, 'forecasts a percentage change'],
  [/\b(expected|projected|estimated|anticipated)\s+(lift|uplift|increase|gain|growth|revenue|sales|views)\b/i, 'forecasts an outcome'],
  [/\bover the next\s+\d+\s*(day|week|month)/i, 'forecasts over a timeframe'],
  [/\bshould see\b|\bcan expect\b|\bwill see\b/i, 'promises a result'],
]

/** Unverifiable claims, forbidden inside listing text itself. */
const UNVERIFIABLE = [
  'best', 'best-selling', 'bestselling', '#1', 'number one', 'top-rated', 'top rated',
  'guaranteed', 'guarantee', 'fastest', 'cheapest', 'highest quality', 'world class',
  'award-winning', 'award winning', 'viral', 'trending now',
]

/** Shops named in the demo data and the design. A live build reads the real set. */
export const KNOWN_COMPETITORS = [
  'Aurelia Made', 'Petal & Pine', 'Nord Atelier', 'Paper Hound', 'Field & Flax', 'Marbled Studio',
]

const MAX_TITLE = 140
const MAX_TAGS = 13
const MAX_TAG_LENGTH = 20

/* ------------------------------------------------------------- validation */

export function validateDraft(
  request: Extract<AiRequest, { kind: 'DRAFT_LISTING' }>,
  response: DraftListingResponse,
): ValidationResult {
  const findings: ValidationFinding[] = []
  const allowed = allowedNumbers(request)

  const surfaces: { field: ValidationFinding['field']; text: string }[] = [
    { field: 'title', text: response.title },
    { field: 'tags', text: response.tags.join(' · ') },
    { field: 'rationale', text: response.rationale.join(' ') },
    ...(response.description ? [{ field: 'description' as const, text: response.description }] : []),
  ]

  for (const { field, text } of surfaces) {
    findings.push(...inventedNumbers(text, allowed, field))
    findings.push(...matchedClaims(text, RANKING_CLAIMS, 'RANKING_CLAIM', field))
    findings.push(...matchedClaims(text, FORECASTS, 'FORECAST', field))
    findings.push(...namedCompetitors(text, field))
  }

  // Unverifiable claims are forbidden in the listing text. The rationale may
  // legitimately contain the word — "removed 'best' because we cannot back it".
  for (const { field, text } of surfaces.filter((s) => s.field !== 'rationale')) {
    findings.push(...unverifiableClaims(text, field))
  }

  for (const term of request.lockedTerms) {
    const present =
      response.title.toLowerCase().includes(term.toLowerCase()) ||
      response.tags.some((t) => t.toLowerCase().includes(term.toLowerCase())) ||
      (response.description?.toLowerCase().includes(term.toLowerCase()) ?? false)
    const wasPresent =
      request.current.title.toLowerCase().includes(term.toLowerCase()) ||
      request.current.tags.some((t) => t.toLowerCase().includes(term.toLowerCase()))
    if (wasPresent && !present) {
      findings.push({
        code: 'LOCKED_TERM_DROPPED',
        severity: 'BLOCKING',
        detail: `The locked term “${term}” was in your listing and is missing from the draft.`,
        field: 'title',
      })
    }
  }

  if (response.title.length > MAX_TITLE) {
    findings.push({
      code: 'TITLE_TOO_LONG',
      severity: 'BLOCKING',
      detail: `The draft title is ${response.title.length} characters; Etsy allows ${MAX_TITLE}.`,
      field: 'title',
    })
  }
  if (response.title.trim().length === 0) {
    findings.push({
      code: 'TITLE_EMPTY',
      severity: 'BLOCKING',
      detail: 'The draft returned an empty title.',
      field: 'title',
    })
  }

  if (response.tags.length > MAX_TAGS) {
    findings.push({
      code: 'TOO_MANY_TAGS',
      severity: 'BLOCKING',
      detail: `The draft has ${response.tags.length} tags; Etsy allows ${MAX_TAGS}.`,
      field: 'tags',
    })
  }
  /*
   * An over-length tag blocks only if the DRAFT introduced it.
   *
   * A tag the seller already had is their listing's problem, not the model's —
   * the listing audit flags it separately. Blocking here would mean a shop with
   * one legacy over-length tag could never get a draft at all, which punishes
   * the seller for the state of their own catalogue.
   */
  for (const tag of response.tags) {
    if (tag.length <= MAX_TAG_LENGTH) continue
    const preexisting = request.current.tags.includes(tag)
    findings.push({
      code: 'TAG_TOO_LONG',
      severity: preexisting ? 'ADVISORY' : 'BLOCKING',
      detail: preexisting
        ? `Your existing tag “${tag}” is ${tag.length} characters; Etsy allows ${MAX_TAG_LENGTH}. The draft kept it as it was.`
        : `The draft added the tag “${tag}”, which is ${tag.length} characters; Etsy allows ${MAX_TAG_LENGTH}.`,
      field: 'tags',
    })
  }
  if (new Set(response.tags.map((t) => t.toLowerCase())).size !== response.tags.length) {
    findings.push({
      code: 'DUPLICATE_TAGS',
      severity: 'BLOCKING',
      detail: 'The draft repeats a tag.',
      field: 'tags',
    })
  }

  const changed =
    response.title !== request.current.title ||
    response.tags.join('|') !== request.current.tags.join('|')
  if (changed && response.rationale.length === 0) {
    findings.push({
      code: 'NO_RATIONALE',
      severity: 'BLOCKING',
      detail: 'The draft changed the listing without saying what changed or why.',
      field: 'rationale',
    })
  }

  const added = response.tags.filter((t) => !request.current.tags.includes(t))
  const unsourced = added.filter(
    (t) =>
      !request.candidateTerms.includes(t) &&
      !request.current.title.toLowerCase().includes(t.toLowerCase()),
  )
  if (unsourced.length > 0) {
    findings.push({
      code: 'UNSOURCED_TAG',
      severity: 'ADVISORY',
      detail: `Added ${unsourced.map((t) => `“${t}”`).join(', ')}, which came from neither your saved terms nor your listing text.`,
      field: 'tags',
    })
  }

  return result(findings)
}

export function validateProse(
  request: Exclude<AiRequest, { kind: 'DRAFT_LISTING' }>,
  response: ProseResponse,
): ValidationResult {
  const findings: ValidationFinding[] = []
  const allowed = allowedNumbers(request)

  findings.push(...inventedNumbers(response.text, allowed, 'text'))
  findings.push(...matchedClaims(response.text, RANKING_CLAIMS, 'RANKING_CLAIM', 'text'))
  findings.push(...matchedClaims(response.text, FORECASTS, 'FORECAST', 'text'))
  findings.push(...namedCompetitors(response.text, 'text'))

  if (response.text.trim().length === 0) {
    findings.push({
      code: 'EMPTY_RESPONSE',
      severity: 'BLOCKING',
      detail: 'The model returned nothing.',
      field: 'text',
    })
  }

  if (request.kind === 'RECOMMEND_ACTION') {
    const evidence = new Set(request.evidence)
    const invented = response.citedEvidence.filter((c) => !evidence.has(c))
    if (invented.length > 0) {
      findings.push({
        code: 'CITED_EVIDENCE_NOT_SUPPLIED',
        severity: 'BLOCKING',
        detail: `Cited evidence that was never provided: ${invented.map((i) => `“${i}”`).join(', ')}.`,
        field: 'text',
      })
    }
    if (response.citedEvidence.length === 0 && request.evidence.length > 0) {
      findings.push({
        code: 'NO_EVIDENCE_CITED',
        severity: 'ADVISORY',
        detail: 'The recommendation cites none of the evidence on screen.',
        field: 'text',
      })
    }
  }

  return result(findings)
}

/* ------------------------------------------------------------------ parts */

function inventedNumbers(
  text: string,
  allowed: Set<string>,
  field: ValidationFinding['field'],
): ValidationFinding[] {
  const found = numeralsIn(text).filter((n) => !allowed.has(normaliseNumeral(n)))
  if (found.length === 0) return []
  return [
    {
      code: 'INVENTED_METRIC',
      severity: 'BLOCKING',
      detail: `Wrote ${[...new Set(found)].map((n) => `“${n}”`).join(', ')}, which is not in the facts it was given.`,
      field,
    },
  ]
}

function matchedClaims(
  text: string,
  patterns: [RegExp, string][],
  code: string,
  field: ValidationFinding['field'],
): ValidationFinding[] {
  const findings: ValidationFinding[] = []
  for (const [pattern, description] of patterns) {
    const match = text.match(pattern)
    if (match) {
      findings.push({
        code,
        severity: 'BLOCKING',
        detail: `“${match[0].trim()}” ${description}. EtsyPilot does not claim knowledge of Etsy’s ranking, and does not predict outcomes.`,
        field,
      })
    }
  }
  return findings
}

function unverifiableClaims(text: string, field: ValidationFinding['field']): ValidationFinding[] {
  const lower = text.toLowerCase()
  const hits = UNVERIFIABLE.filter((claim) =>
    new RegExp(`(^|[^a-z])${escapeRegex(claim)}([^a-z]|$)`, 'i').test(lower),
  )
  if (hits.length === 0) return []
  return [
    {
      code: 'UNVERIFIABLE_CLAIM',
      severity: 'BLOCKING',
      detail: `Wrote ${hits.map((h) => `“${h}”`).join(', ')} into listing text. Nothing supports it, and Etsy prohibits unsubstantiated claims.`,
      field,
    },
  ]
}

function namedCompetitors(text: string, field: ValidationFinding['field']): ValidationFinding[] {
  const hits = KNOWN_COMPETITORS.filter((shop) => text.toLowerCase().includes(shop.toLowerCase()))
  if (hits.length === 0) return []
  return [
    {
      code: 'NAMED_COMPETITOR',
      severity: 'BLOCKING',
      detail: `Named another shop: ${hits.map((h) => `“${h}”`).join(', ')}.`,
      field,
    },
  ]
}

/**
 * Status derived from findings.
 *
 * One expression, no mutation. A rule added below this line still blocks,
 * because nothing has decided `ok` before the findings are complete.
 */
function result(findings: ValidationFinding[]): ValidationResult {
  return { ok: !findings.some((f) => f.severity === 'BLOCKING'), findings }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
