import { readFileSync } from 'node:fs'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SWEEP THAT PROVES A SELLER REPOSITORY CANNOT READ ACROSS SHOPS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Shared because it is one rule and there are now three repositories under
 * it, with three more aggregates to come. The listings slice had this inline
 * with a hardcoded floor of eight statements; extracting a statement into
 * lib/repositories/sync-state.ts dropped the count to seven and turned the
 * guard red for a change that moved no risk at all.
 *
 * Lowering the number would have been the wrong repair, and this repo has
 * already written down why: "a total moves whenever a card is added, and the
 * honest-looking response to a number that keeps drifting is to lower it."
 * So the floor is gone and the rule is per statement — which is what it was
 * always meant to be. The positive control is that the sweep FINDS statements
 * in every file it is pointed at; a file with none fails, which is the shape a
 * sweep measuring nothing would take.
 */

/** Source with comments removed — otherwise prose can satisfy the sweep. */
export function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

export interface ExportedFunction {
  name: string
  params: string
}

/** Every `export ... function name(` in the file, with its parameter list. */
export function exportedFunctions(source: string): ExportedFunction[] {
  const out: ExportedFunction[] = []
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)) {
    out.push({ name: match[1] ?? '', params: match[2] ?? '' })
  }
  return out
}

export interface Statement {
  kind: string
  offset: number
  chain: string
}

/**
 * Each drizzle statement in the file, with the text up to the next one.
 *
 * "Up to the next one" is the whole trick: a statement's predicate sits in the
 * `.where()` that follows it, so the slice between two statements is exactly
 * the chain belonging to the first.
 */
export function statements(source: string): Statement[] {
  const found = [...source.matchAll(/\.(select|insert|update|delete)\(/g)]
  return found.map((match, index) => ({
    kind: match[1] ?? '',
    offset: match.index ?? 0,
    chain: source.slice(match.index ?? 0, found[index + 1]?.index ?? source.length),
  }))
}

/**
 * A statement carries a shop predicate, or writes shopId, or is scoped by a
 * column this file already established belongs to one shop.
 *
 * ── THE THREE WAYS, AND WHY THE THIRD IS NOT A LOOPHOLE ───────────────────
 *
 * 1. `eq(schema.<table>.shopId, shopId)` — the ordinary case.
 * 2. An INSERT has no WHERE to carry a predicate; its scope is the `shopId`
 *    it writes into the row, which is what this requires of it instead.
 * 3. `eq(schema.shops.id, shopId)` — the shops table's own key IS the shop id.
 *
 * Nothing else counts. A statement scoped only by, say, `orderId` would fail
 * even though the order belongs to one shop, because that reasoning holds only
 * as long as the id came from a scoped read — and a guard that accepted it
 * would accept the version where it did not.
 */
export function isScoped(statement: Statement): boolean {
  /*
   * `shopId,` OR `shopId }` — both are the shorthand property, and the first
   * spelling of this accepted only the first. A batched insert written as
   * `.values(batch.map((row) => ({ ...row, shopId })))` is scoped and was
   * rejected, which is a guard failing on correct code: the kind that gets
   * reworded until it passes, taking what it watched for with it.
   */
  if (statement.kind === 'insert') return /\bshopId\s*[,}]/.test(statement.chain)
  /*
   * Two patterns, and `.id` is allowed ONLY on `schema.shops`. The first
   * spelling of this was `schema.\w+\.(shopId|id)`, which would have accepted
   * `eq(schema.orderItems.id, shopId)` — comparing a row id to a shop id,
   * matching nothing, and passing the guard. A hole in a guard is worse than
   * the absence of one.
   */
  return (
    /eq\(schema\.\w+\.shopId,\s*shopId\)/.test(statement.chain) ||
    /eq\(schema\.shops\.id,\s*shopId\)/.test(statement.chain)
  )
}
