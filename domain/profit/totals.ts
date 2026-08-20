/*
 * Totals over columns that can contain nulls.
 *
 * The rule: a null propagates. If one line's cost is unknown, the sum of the
 * column is unknown — not the sum of the known parts. A total that quietly adds
 * up the rows it does understand reasserts a number the same page just said it
 * did not have, and it does it in the position a reader trusts most.
 *
 * This is the arithmetic counterpart of Money taking `number | null` with no
 * fallback prop, and of unavailable() returning value: null with no shape for a
 * substitute. Same idea in three places: absence has to survive the pipeline.
 */

/**
 * Sum a column, or return null if any single value is unknown.
 *
 * There is deliberately no `skipNulls` option. A caller who wants the subtotal
 * of the known rows has to say so by filtering first, which puts the decision
 * in the open at the call site instead of hiding it behind a flag.
 */
export function sumOrNull(values: readonly (number | null)[]): number | null {
  let total = 0
  for (const v of values) {
    if (v === null) return null
    total += v
  }
  return round2(total)
}

/** The subtotal of the rows that are known, plus how many were left out. */
export interface PartialSum {
  /** Sum of the known values only. Never presented as the column total. */
  knownTotal: number
  /** How many rows were excluded because their value is unknown. */
  unknownCount: number
}

/**
 * The explicit alternative to sumOrNull, for when a subtotal is genuinely
 * wanted. It cannot be mistaken for a total: it comes back with the count of
 * what it left out, so a caller that renders it has the material to say so.
 */
export function partialSum(values: readonly (number | null)[]): PartialSum {
  let knownTotal = 0
  let unknownCount = 0
  for (const v of values) {
    if (v === null) unknownCount += 1
    else knownTotal += v
  }
  return { knownTotal: round2(knownTotal), unknownCount }
}

export interface LedgerTotals {
  /** Verified on every row, so this one is always a number. */
  gross: number
  /** Verified on every row. */
  fees: number
  /** Null if any order has no confirmed cost. */
  cost: number | null
  /** Null if any order has no confirmed cost. */
  profit: number | null
  /** How many orders are uncosted, for the caption beside the dash. */
  uncostedOrders: number
  /** Order value sitting behind those orders. */
  uncostedGross: number
}

export function ledgerTotals(
  rows: readonly { gross: number; fees: number; cost: number | null; profit: number | null }[],
): LedgerTotals {
  const uncosted = rows.filter((r) => r.cost === null)
  return {
    gross: round2(rows.reduce((s, r) => s + r.gross, 0)),
    fees: round2(rows.reduce((s, r) => s + r.fees, 0)),
    cost: sumOrNull(rows.map((r) => r.cost)),
    profit: sumOrNull(rows.map((r) => r.profit)),
    uncostedOrders: uncosted.length,
    uncostedGross: round2(uncosted.reduce((s, r) => s + r.gross, 0)),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
