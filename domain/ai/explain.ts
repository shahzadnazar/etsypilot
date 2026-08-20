/*
 * Issue explanations and action recommendations.
 *
 * These are the two places where AI writes prose the seller reads as guidance
 * rather than as listing copy, so they carry the tightest constraint in the
 * product: the model is given the finding the domain already computed and the
 * evidence already on screen, and it may say nothing that is not traceable to
 * one of them.
 *
 * Both go through the same validator as a listing draft. A recommendation that
 * cited evidence it was never given, or predicted a result, is withheld — and
 * what the seller sees instead is the domain's own explanation, unassisted.
 * Degrading to the plain version is always available, because the plain version
 * is what the AI was decorating in the first place.
 */

import { getAiProvider } from '@/lib/ai'
import type { AiProvider, ExplainIssueRequest, RecommendActionRequest } from '@/lib/ai/interface'
import type { Action } from '@/domain/action-center/types'
import type { RuleResult } from '@/domain/audit/service'
import { countFact } from './facts'
import { validateProse } from './validate'

export interface Explanation {
  /** What to show. Never empty — falls back to the domain's own words. */
  text: string
  /** True when the model's version was used; false when it was withheld. */
  aiAssisted: boolean
  /** Present when the model's version was withheld. Shown in a dev/debug view. */
  withheldBecause: string[]
}

export async function explainRule(
  result: RuleResult,
  provider: AiProvider = getAiProvider(),
): Promise<Explanation> {
  const plain = `${result.rule.why} ${result.rule.fix}`

  const request: ExplainIssueRequest = {
    kind: 'EXPLAIN_ISSUE',
    rule: {
      label: result.rule.label,
      why: result.rule.why,
      fix: result.rule.fix,
      severity: result.rule.severity,
    },
    affected: result.findings.slice(0, 5).map((f) => f.title),
    facts: [
      countFact('Listings flagged by this rule', result.count),
      {
        label: 'Verified revenue behind those listings',
        value: result.revenueAtRisk.toFixed(2),
        provenance: 'VERIFIED',
      },
    ],
  }

  try {
    const response = await provider.explainIssue(request)
    const validation = validateProse(request, response)
    if (!validation.ok) {
      return {
        text: plain,
        aiAssisted: false,
        withheldBecause: validation.findings.filter((f) => f.severity === 'BLOCKING').map((f) => f.detail),
      }
    }
    return { text: response.text, aiAssisted: true, withheldBecause: [] }
  } catch {
    // The AI being unavailable must never cost the seller the explanation.
    return { text: plain, aiAssisted: false, withheldBecause: [] }
  }
}

export async function recommendForAction(
  action: Action,
  provider: AiProvider = getAiProvider(),
): Promise<Explanation> {
  const plain = action.explanation

  /*
   * The evidence line, exactly as the card renders it. The model is given the
   * seller's own screen and nothing more, so a recommendation cannot rest on
   * something the seller cannot see.
   */
  const evidence = [`${action.evidence.summary} (${action.evidence.source})`]

  const request: RecommendActionRequest = {
    kind: 'RECOMMEND_ACTION',
    finding: {
      title: action.title,
      explanation: action.explanation,
      /*
       * The evidence's provenance class, not a cause. EtsyPilot never tells the
       * model why something happened, because the product never claims to know.
       */
      diagnosis: action.evidence.provenance,
    },
    evidence,
    facts: [countFact('Pieces of evidence supplied', evidence.length)],
  }

  try {
    const response = await provider.recommendAction(request)
    const validation = validateProse(request, response)
    if (!validation.ok) {
      return {
        text: plain,
        aiAssisted: false,
        withheldBecause: validation.findings.filter((f) => f.severity === 'BLOCKING').map((f) => f.detail),
      }
    }
    return { text: response.text, aiAssisted: true, withheldBecause: [] }
  } catch {
    return { text: plain, aiAssisted: false, withheldBecause: [] }
  }
}
