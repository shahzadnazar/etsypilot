/*
 * The Simple Calculator engine.
 *
 * Deliberately the least connected file in this codebase. It imports the
 * provenance types and nothing else: no Etsy adapter, no session, no clock, no
 * randomness, no database. A calculator that reads anything is not a
 * calculator, and this one has to keep working on a page with no login, no
 * shop and no network (the free acquisition variant).
 *
 * Three properties, each enforced rather than intended:
 *
 *  1. IT IS SEPARATE FROM PROFIT REALITY.
 *     Not "kept separate by convention" — there is no import edge from this
 *     module to domain/profit, and a test asserts the whole subtree has none.
 *     Profit Reality is an order-level financial model over verified receipts;
 *     this is one calculation over numbers a seller typed. Merging them would
 *     make the trustworthy one look like the arithmetic one.
 *
 *  2. THE FORMULA IS THE RETURN VALUE, NOT A CAPTION.
 *     `formula` is produced by the same function, from the same inputs, in the
 *     same pass as `value`. A component cannot render a formula that disagrees
 *     with the number beside it, because it is not writing one. This is D25 in
 *     miniature: never author the explanation separately from the figure.
 *
 *  3. IT REFUSES RATHER THAN COERCES.
 *     Divide by zero returns a stated refusal, never Infinity, NaN or 0. A
 *     calculator that answers a question it cannot answer is worse than one
 *     that says so, because the reader has no way to tell.
 */

import type { ProvenanceType } from '@/lib/provenance/types'

export const CALCULATIONS = [
  'PERCENTAGE',
  'DISCOUNT',
  'PROFIT',
  'MARGIN',
  'MARKUP',
  'FEE',
  'NET_REVENUE',
  'BREAK_EVEN',
] as const

export type CalculationKind = (typeof CALCULATIONS)[number]

export interface FieldSpec {
  key: 'a' | 'b'
  label: string
  unit: 'CURRENCY' | 'PERCENT'
  placeholder: string
}

export interface CalculationSpec {
  kind: CalculationKind
  label: string
  /** One line, in a seller's terms. Shown on the card. */
  summary: string
  fields: [FieldSpec, FieldSpec]
  /** The shape of the formula, before values are substituted. */
  formulaShape: string
}

export const SPECS: Record<CalculationKind, CalculationSpec> = {
  PERCENTAGE: {
    kind: 'PERCENTAGE',
    label: 'Percentage',
    summary: 'A percentage of an amount.',
    fields: [
      { key: 'a', label: 'Amount', unit: 'CURRENCY', placeholder: '29.00' },
      { key: 'b', label: 'Percentage', unit: 'PERCENT', placeholder: '20' },
    ],
    formulaShape: 'amount × percentage',
  },
  DISCOUNT: {
    kind: 'DISCOUNT',
    label: 'Discount',
    summary: 'Final price after a discount.',
    fields: [
      { key: 'a', label: 'Amount', unit: 'CURRENCY', placeholder: '29.00' },
      { key: 'b', label: 'Discount', unit: 'PERCENT', placeholder: '20' },
    ],
    formulaShape: 'amount × (1 − discount)',
  },
  PROFIT: {
    kind: 'PROFIT',
    label: 'Profit',
    summary: 'Profit from revenue and costs.',
    fields: [
      { key: 'a', label: 'Revenue', unit: 'CURRENCY', placeholder: '100.00' },
      { key: 'b', label: 'Costs', unit: 'CURRENCY', placeholder: '35.00' },
    ],
    formulaShape: 'revenue − costs',
  },
  MARGIN: {
    kind: 'MARGIN',
    label: 'Margin',
    summary: 'Profit margin percentage.',
    fields: [
      { key: 'a', label: 'Revenue', unit: 'CURRENCY', placeholder: '100.00' },
      { key: 'b', label: 'Profit', unit: 'CURRENCY', placeholder: '65.00' },
    ],
    formulaShape: 'profit ÷ revenue',
  },
  MARKUP: {
    kind: 'MARKUP',
    label: 'Markup',
    summary: 'Markup over cost.',
    fields: [
      { key: 'a', label: 'Cost', unit: 'CURRENCY', placeholder: '20.00' },
      { key: 'b', label: 'Selling price', unit: 'CURRENCY', placeholder: '30.00' },
    ],
    formulaShape: '(price − cost) ÷ cost',
  },
  FEE: {
    kind: 'FEE',
    label: 'Fee',
    summary: 'Marketplace or processor fee.',
    fields: [
      { key: 'a', label: 'Amount', unit: 'CURRENCY', placeholder: '100.00' },
      { key: 'b', label: 'Fee rate', unit: 'PERCENT', placeholder: '6.5' },
    ],
    formulaShape: 'amount × rate',
  },
  NET_REVENUE: {
    kind: 'NET_REVENUE',
    label: 'Net revenue',
    summary: 'What is left after a fee.',
    fields: [
      { key: 'a', label: 'Amount', unit: 'CURRENCY', placeholder: '100.00' },
      { key: 'b', label: 'Fee rate', unit: 'PERCENT', placeholder: '6.5' },
    ],
    formulaShape: 'amount × (1 − rate)',
  },
  BREAK_EVEN: {
    kind: 'BREAK_EVEN',
    label: 'Break-even',
    summary: 'Minimum selling price for a target margin.',
    fields: [
      { key: 'a', label: 'Cost', unit: 'CURRENCY', placeholder: '20.00' },
      { key: 'b', label: 'Target margin', unit: 'PERCENT', placeholder: '30' },
    ],
    formulaShape: 'cost ÷ (1 − target margin)',
  },
}

export interface CalculationInput {
  kind: CalculationKind
  /** Raw strings, as typed. Parsing and refusing both happen here. */
  a: string
  b: string
  currency?: string
}

export interface CalculationResult {
  kind: CalculationKind
  /** The primary figure, already rounded for display. */
  value: number
  unit: 'CURRENCY' | 'PERCENT'
  display: string
  /** e.g. "Savings $5.80". Null where the calculation has no second figure. */
  secondary: string | null
  /**
   * The formula with THIS calculation's values substituted, produced here.
   * Never assembled by a component.
   */
  formula: string
  /**
   * Always CALCULATED. There is no branch that returns VERIFIED: nothing here
   * came from Etsy, and a fee typed by a seller is not an Etsy fee (D49).
   */
  provenance: Extract<ProvenanceType, 'CALCULATED'>
  /** Stated under every result, so the tool never overstates its own basis. */
  basis: string
}

export interface CalculationRefusal {
  /** What the seller must change, addressed to them. */
  message: string
  /** Which field is at fault, so the UI can mark it. */
  field: 'a' | 'b' | null
}

export type Calculation =
  | { ok: true; result: CalculationResult }
  | { ok: false; refusal: CalculationRefusal }

const BASIS = 'Calculated from the values you entered. Not connected to your Etsy account.'

/* ------------------------------------------------------------- formatting */

/*
 * One formatter per currency, kept.
 *
 * `new Intl.NumberFormat(...)` per call is the standard way to make a
 * calculator slow: constructing one costs far more than the arithmetic it
 * formats, and this engine runs on every keystroke. The performance check
 * caught it at 20,000 calculations — 3.8 seconds before, well under a tenth of
 * that after. The map is a pure memo of a pure constructor, so the engine stays
 * deterministic and dependency-free.
 */
const FORMATTERS = new Map<string, Intl.NumberFormat>()

function money(value: number, currency = 'USD'): string {
  let formatter = FORMATTERS.get(currency)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency })
    FORMATTERS.set(currency, formatter)
  }
  return formatter.format(value)
}

function percent(value: number): string {
  // Two decimals only when they carry information: 65% not 65.00%.
  const rounded = Math.round(value * 100) / 100
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}%`
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/* --------------------------------------------------------------- parsing */

/**
 * Parse one field, or refuse.
 *
 * Refuses rather than coercing: an empty box is not zero, "abc" is not zero,
 * and a calculator that treats them as zero produces a confident wrong answer.
 */
function parse(raw: string, field: FieldSpec): { ok: true; value: number } | { ok: false; refusal: CalculationRefusal } {
  const trimmed = raw.trim().replace(/[$,\s]/g, '').replace(/%$/, '')

  if (trimmed === '') {
    return { ok: false, refusal: { message: `Enter ${field.label.toLowerCase()}.`, field: field.key } }
  }

  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    return {
      ok: false,
      refusal: { message: `${field.label} must be a number.`, field: field.key },
    }
  }
  if (value < 0) {
    return {
      ok: false,
      refusal: { message: `${field.label} cannot be negative.`, field: field.key },
    }
  }

  return { ok: true, value }
}

/* ------------------------------------------------------------- the engine */

export function calculate(input: CalculationInput): Calculation {
  const spec = SPECS[input.kind]
  const currency = input.currency ?? 'USD'

  const first = parse(input.a, spec.fields[0])
  if (!first.ok) return { ok: false, refusal: first.refusal }
  const second = parse(input.b, spec.fields[1])
  if (!second.ok) return { ok: false, refusal: second.refusal }

  const a = first.value
  const b = second.value

  const ok = (result: Omit<CalculationResult, 'kind' | 'provenance' | 'basis'>): Calculation => ({
    ok: true,
    result: { ...result, kind: input.kind, provenance: 'CALCULATED', basis: BASIS },
  })

  switch (input.kind) {
    case 'PERCENTAGE': {
      const value = round2((a * b) / 100)
      return ok({
        value,
        unit: 'CURRENCY',
        display: money(value, currency),
        secondary: null,
        formula: `${money(a, currency)} × ${percent(b)} = ${money(value, currency)}`,
      })
    }

    case 'DISCOUNT': {
      if (b > 100) {
        return {
          ok: false,
          refusal: { message: 'A discount over 100% would mean paying the buyer.', field: 'b' },
        }
      }
      const value = round2(a * (1 - b / 100))
      const saved = round2(a - value)
      return ok({
        value,
        unit: 'CURRENCY',
        display: money(value, currency),
        secondary: `Savings ${money(saved, currency)}`,
        formula: `${money(a, currency)} × (1 − ${percent(b)}) = ${money(value, currency)}`,
      })
    }

    case 'PROFIT': {
      const value = round2(a - b)
      return ok({
        value,
        unit: 'CURRENCY',
        display: money(value, currency),
        // A loss is named, not shown as a smaller positive number.
        secondary: value < 0 ? `A loss of ${money(Math.abs(value), currency)}` : null,
        formula: `${money(a, currency)} − ${money(b, currency)} = ${money(value, currency)}`,
      })
    }

    case 'MARGIN': {
      if (a === 0) {
        return {
          ok: false,
          refusal: { message: 'Margin needs revenue above 0 — there is nothing to be a share of.', field: 'a' },
        }
      }
      const value = round2((b / a) * 100)
      return ok({
        value,
        unit: 'PERCENT',
        display: percent(value),
        secondary: null,
        formula: `${money(b, currency)} ÷ ${money(a, currency)} = ${percent(value)}`,
      })
    }

    case 'MARKUP': {
      if (a === 0) {
        return {
          ok: false,
          refusal: { message: 'Markup needs a cost above 0 — there is nothing to mark up.', field: 'a' },
        }
      }
      const value = round2(((b - a) / a) * 100)
      return ok({
        value,
        unit: 'PERCENT',
        display: percent(value),
        secondary: value < 0 ? 'The selling price is below cost.' : null,
        formula: `(${money(b, currency)} − ${money(a, currency)}) ÷ ${money(a, currency)} = ${percent(value)}`,
      })
    }

    case 'FEE': {
      const value = round2((a * b) / 100)
      return ok({
        value,
        unit: 'CURRENCY',
        display: money(value, currency),
        secondary: `Leaves ${money(round2(a - value), currency)}`,
        formula: `${money(a, currency)} × ${percent(b)} = ${money(value, currency)}`,
      })
    }

    case 'NET_REVENUE': {
      const fee = round2((a * b) / 100)
      const value = round2(a - fee)
      return ok({
        value,
        unit: 'CURRENCY',
        display: money(value, currency),
        secondary: `Fee ${money(fee, currency)}`,
        formula: `${money(a, currency)} − (${money(a, currency)} × ${percent(b)}) = ${money(value, currency)}`,
      })
    }

    case 'BREAK_EVEN': {
      if (b >= 100) {
        return {
          ok: false,
          refusal: {
            // The honest refusal: the arithmetic diverges, it does not fail.
            message: 'A target margin of 100% or more has no break-even price — the price would never be enough.',
            field: 'b',
          },
        }
      }
      const value = round2(a / (1 - b / 100))
      return ok({
        value,
        unit: 'CURRENCY',
        display: money(value, currency),
        secondary: `Covers ${money(a, currency)} of cost`,
        formula: `${money(a, currency)} ÷ (1 − ${percent(b)}) = ${money(value, currency)}`,
      })
    }
  }
}

/** For the "Copy result" control. Copies the formula, not the bare number. */
export function clipboardText(result: CalculationResult): string {
  const parts = [result.formula]
  if (result.secondary) parts.push(result.secondary)
  parts.push(result.basis)
  return parts.join('\n')
}

/** Worked examples from the design, used on the cards and in tests. */
export const WORKED_EXAMPLES: { kind: CalculationKind; a: string; b: string; expect: string }[] = [
  { kind: 'DISCOUNT', a: '29', b: '20', expect: '$23.20' },
  { kind: 'PROFIT', a: '100', b: '35', expect: '$65.00' },
  { kind: 'MARGIN', a: '100', b: '65', expect: '65%' },
  { kind: 'MARKUP', a: '20', b: '30', expect: '50%' },
  { kind: 'BREAK_EVEN', a: '20', b: '30', expect: '$28.57' },
  { kind: 'FEE', a: '100', b: '6.5', expect: '$6.50' },
]
