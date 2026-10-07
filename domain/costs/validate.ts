/*
 * Validating a cost settings form.
 *
 * Client input is never trusted (rules.md). The form's `min`, `max` and `step`
 * attributes are a convenience for someone typing; this is the boundary that
 * decides. Both read COST_FIELDS, so there is one set of bounds rather than two
 * that drift.
 *
 * A rejection carries a FIELD and a REASON, both from closed sets, rather than
 * a sentence. The form POST is a plain browser navigation with no JavaScript
 * involved, so whatever the route reports has to survive a redirect in the
 * query string — and a query string is somewhere the user can type. Two enum
 * values round-trip safely; a message would be text we typed reflected back
 * through a place the reader controls.
 */

import { AppError } from '@/lib/errors/types'
import { COST_FIELDS, type CostFieldSpec, type CostSettings } from './types'

/*
 * REQUIRED is gone. Every cost field may be left blank — blank is how a seller
 * says "I have not told you" and how they retract a cost — so nothing could
 * raise it, and a validation problem no input can produce is a branch with no
 * test behind it.
 */
export const COST_PROBLEMS = ['NOT_A_NUMBER', 'OUT_OF_RANGE'] as const
export type CostProblem = (typeof COST_PROBLEMS)[number]

export type RawCostInput = Record<string, string | undefined>

export interface CostProblemReport {
  field: CostFieldSpec
  problem: CostProblem
}

/** The one place a rejection is turned into words, used by the route and page. */
export function describeProblem(report: CostProblemReport): { message: string; recovery: string } {
  const { field, problem } = report
  const bound = field.kind === 'PERCENT' ? `${field.min}–${field.max}%` : `${field.min}–${field.max}`

  switch (problem) {
    case 'NOT_A_NUMBER':
      return {
        message: `${field.label} could not be read as a number.`,
        recovery: 'Enter digits only, with a decimal point if you need one.',
      }
    case 'OUT_OF_RANGE':
      return {
        message: `${field.label} must be within ${bound}.`,
        recovery: 'Correct the value and save again. Nothing was changed.',
      }
  }
}

/** Look a report back up from a redirect. Anything unrecognised is null. */
export function problemFromQuery(
  field: string | undefined,
  problem: string | undefined,
): CostProblemReport | null {
  const spec = COST_FIELDS.find((f) => f.key === field)
  if (!spec) return null
  if (!COST_PROBLEMS.includes(problem as CostProblem)) return null
  return { field: spec, problem: problem as CostProblem }
}

export class CostValidationError extends AppError {
  readonly report: CostProblemReport

  constructor(report: CostProblemReport) {
    const { message, recovery } = describeProblem(report)
    super({ kind: 'VALIDATION', code: 'COST_SETTINGS_INVALID', message, recovery })
    this.report = report
  }
}

export function parseCostSettings(raw: RawCostInput): CostSettings {
  const out: Partial<CostSettings> = {}

  for (const field of COST_FIELDS) {
    const text = (raw[field.key] ?? '').trim()

    if (text === '') {
      /*
       * Blank stays blank, for every field.
       *
       * This was the reasoning behind `adSpend` alone — "a seller who does not
       * know what they spent on ads must not have a zero written on their
       * behalf, because zero flatters every profit figure downstream of it" —
       * and it is just as true of their COGS percentage, their postage and
       * their labour. Blank is also how a cost is RETRACTED: cost_rules stores
       * a null value for it, which is a retraction rather than a cost of zero.
       */
      out[field.key] = null as never
      continue
    }

    const n = Number(text)
    if (!Number.isFinite(n)) throw new CostValidationError({ field, problem: 'NOT_A_NUMBER' })
    if (n < field.min || n > field.max) {
      throw new CostValidationError({ field, problem: 'OUT_OF_RANGE' })
    }

    // Percents are typed as 0–100 and stored as 0–1, in one place.
    out[field.key] = (field.kind === 'PERCENT' ? n / 100 : round2(n)) as never
  }

  return out as CostSettings
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
