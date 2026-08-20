/*
 * Mock AI provider.
 *
 * Deterministic and rule-based. It is what runs in demo mode and in every test,
 * and it exists for a reason beyond "no credentials needed": the validator has
 * to be testable against outputs that break the rules ON PURPOSE, and a real
 * model cannot be asked to reliably misbehave.
 *
 * So this provider has a `misbehave` mode. Given a scenario name it returns a
 * response that invents a metric, claims a ranking effect, forecasts a result,
 * or drops a locked term — and the test asserts the validator catches it. A
 * guardrail nobody has watched fail is a guardrail nobody has tested.
 */

import type {
  AiProvider,
  DraftListingRequest,
  DraftListingResponse,
  ExplainIssueRequest,
  ProseResponse,
  RecommendActionRequest,
} from './interface'

export type Misbehaviour =
  | 'INVENT_METRIC'
  | 'RANKING_CLAIM'
  | 'FORECAST'
  | 'DROP_LOCKED_TERM'
  | 'UNVERIFIABLE_CLAIM'
  | 'NAME_COMPETITOR'
  | 'TOO_MANY_TAGS'
  | 'NO_RATIONALE'

const MAX_TITLE = 140
const MAX_TAGS = 13
const MAX_TAG_LENGTH = 20

export class MockAiProvider implements AiProvider {
  readonly mode = 'MOCK' as const
  readonly model = 'mock-rules-v1'

  /** Test-only. Production code never constructs this with an argument. */
  constructor(private readonly misbehave?: Misbehaviour) {}

  async draftListing(request: DraftListingRequest): Promise<DraftListingResponse> {
    const honest = rewrite(request)
    if (!this.misbehave) return honest

    switch (this.misbehave) {
      case 'INVENT_METRIC':
        return {
          ...honest,
          rationale: [...honest.rationale, 'This term gets about 9,400 searches a month.'],
        }
      case 'RANKING_CLAIM':
        return {
          ...honest,
          rationale: [...honest.rationale, 'These tags will rank higher in Etsy search.'],
        }
      case 'FORECAST':
        return {
          ...honest,
          rationale: [...honest.rationale, 'You should see more views over the next 30 days.'],
        }
      case 'DROP_LOCKED_TERM': {
        const locked = request.lockedTerms[0] ?? ''
        return {
          ...honest,
          title: honest.title.split(locked).join('').replace(/\s{2,}/g, ' ').trim(),
        }
      }
      case 'UNVERIFIABLE_CLAIM':
        return { ...honest, title: `Best ${honest.title}`.slice(0, MAX_TITLE) }
      case 'NAME_COMPETITOR':
        return {
          ...honest,
          rationale: [...honest.rationale, 'Aurelia Made uses this term on every listing.'],
        }
      case 'TOO_MANY_TAGS':
        return {
          ...honest,
          tags: [...honest.tags, 'extra one', 'extra two', 'extra three', 'extra four'],
        }
      case 'NO_RATIONALE':
        return { ...honest, rationale: [] }
    }
  }

  async explainIssue(request: ExplainIssueRequest): Promise<ProseResponse> {
    const count = request.affected.length
    const text =
      this.misbehave === 'RANKING_CLAIM'
        ? `Fixing this will improve your ranking in Etsy search.`
        : `${request.rule.why} ${request.rule.fix} ${
            count > 0
              ? `The listings below are the ones affected; start with the one earning most.`
              : ''
          }`.trim()
    return { text, citedEvidence: [] }
  }

  async recommendAction(request: RecommendActionRequest): Promise<ProseResponse> {
    if (this.misbehave === 'INVENT_METRIC') {
      return { text: 'This cost you about $2,140 last week.', citedEvidence: request.evidence.slice(0, 1) }
    }
    if (this.misbehave === 'FORECAST') {
      return { text: 'Reverting should recover the lost orders within two weeks.', citedEvidence: request.evidence.slice(0, 1) }
    }
    return {
      text: `${request.finding.explanation} The evidence below is what this rests on — check it before acting, and remember a correlation is not a cause.`,
      citedEvidence: request.evidence.slice(0, 2),
    }
  }
}

/* ------------------------------------------------------- the honest rewrite */

function rewrite(request: DraftListingRequest): DraftListingResponse {
  const { title, removedDuplicate } = rewriteTitle(request.current.title, request.lockedTerms)
  const tags = retag(request.current.tags, request.candidateTerms, request.current.title)

  const rationale: string[] = []
  if (removedDuplicate) {
    rationale.push(
      `Removed the duplicated “${removedDuplicate}” so the title reads once and stays under ${MAX_TITLE} characters.`,
    )
  }
  for (const added of tags.added) {
    rationale.push(`Added “${added}” — a term from your saved list that the listing does not already use.`)
  }
  for (const removed of tags.removed) {
    rationale.push(`Dropped “${removed}” from tags because it already appears in the title.`)
  }
  if (rationale.length === 0) {
    rationale.push('No change was needed — the listing already satisfies every constraint.')
  }

  return {
    title,
    tags: tags.result,
    description: request.rewriteDescription ? request.current.description : null,
    rationale,
  }
}

function rewriteTitle(
  title: string,
  lockedTerms: string[],
): { title: string; removedDuplicate: string | null } {
  const parts = title.split(',').map((p) => p.trim()).filter(Boolean)
  const seen = new Set<string>()
  let removedDuplicate: string | null = null

  const kept = parts.filter((part) => {
    const key = part.toLowerCase()
    // A locked term survives even where it repeats. The seller decided.
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
  if (text.length > MAX_TITLE) {
    const cut = text.lastIndexOf(',', MAX_TITLE)
    text = cut > 0 ? text.slice(0, cut) : text.slice(0, MAX_TITLE)
  }
  return { title: text, removedDuplicate }
}

function retag(
  current: string[],
  candidateTerms: string[],
  title: string,
): { result: string[]; added: string[]; removed: string[] } {
  const titleText = title.toLowerCase()
  const removed = current.filter((t) => t.length > 6 && titleText.includes(t.toLowerCase()))
  const kept = current.filter((t) => !removed.includes(t))

  const added: string[] = []
  for (const term of candidateTerms) {
    if (kept.length + added.length >= MAX_TAGS) break
    if (kept.includes(term) || added.includes(term)) continue
    if (term.length > MAX_TAG_LENGTH) continue
    added.push(term)
  }

  return { result: [...kept, ...added], added, removed }
}
