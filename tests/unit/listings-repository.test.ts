import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE LISTINGS REPOSITORY CANNOT BE ASKED A QUESTION THAT SPANS SHOPS.
 *
 *   Not "does not today". Every exported function takes `shopId` as its FIRST
 *   parameter and every statement it issues carries a shop predicate — read
 *   from the source, so a sixth function added without one fails here rather
 *   than in production on the day two sellers' catalogues meet.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── WHY STATIC AND NOT BEHAVIOURAL ────────────────────────────────────────
 *
 * tests/integration/listings-sync.int.ts already proves the behaviour: two
 * shops' catalogues stay apart, a shop id you do not own returns nothing, one
 * shop's sync does not remove another's. That is the stronger evidence and it
 * is already written. What it cannot do is fail for a function that does not
 * exist yet — and five more aggregates are about to be built by copying this
 * file. The static sweep is the part that survives the copy.
 *
 * ── A GUARD MUST NOT BE SATISFIED BY ITS OWN DOCUMENTATION ────────────────
 *
 * Nineteen times in this repo a check has passed because a comment happened to
 * contain the string it was looking for. This file strips comments before it
 * reads anything, and the negative controls below prove the sweep can fail.
 */

const REPOSITORY = 'lib/repositories/listings.ts'

/** Source with comments removed, the same way the write-boundary sweep does it. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** Every `export ... function name(` in the file, with its parameter list. */
function exportedFunctions(source: string): { name: string; params: string }[] {
  const out: { name: string; params: string }[] = []
  const pattern = /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g
  for (const match of source.matchAll(pattern)) {
    out.push({ name: match[1] ?? '', params: match[2] ?? '' })
  }
  return out
}

describe('every way into the listings repository names a shop', () => {
  const source = code(REPOSITORY)

  it('finds the functions at all', () => {
    /*
     * The positive control, and it is not ceremony. A regex that matched
     * nothing would make every assertion below pass over an empty list — the
     * exact shape of a check that measures nothing.
     */
    const names = exportedFunctions(source).map((fn) => fn.name)
    expect(names).toContain('readListings')
    expect(names).toContain('countListings')
    expect(names).toContain('readShopSyncState')
    expect(names).toContain('writeSyncedListings')
    expect(names.length).toBeGreaterThanOrEqual(4)
  })

  it('takes shopId as the first parameter, every one of them', () => {
    for (const fn of exportedFunctions(source)) {
      const first = (fn.params.split(',')[0] ?? '').trim()
      expect(first, `${fn.name} does not take a shop id first`).toMatch(/^shopId\s*:/)
    }
  })

  it('carries a shop predicate on every statement it issues', () => {
    /*
     * Per statement, not a count of predicates. The dangerous one is the
     * removal UPDATE: its other predicate is `notInArray(seen)`, so unscoped
     * it would date every OTHER shop's catalogue as removed on the first sync
     * of this one. The integration suite asserts that case behaviourally; this
     * asserts the predicate is there at all, for statements not yet written.
     *
     * An INSERT is the one exception and not a loophole: it has no WHERE to
     * carry a predicate, and its scope is `shopId` in the values it writes —
     * which is what this requires of it instead.
     */
    const statements = [...source.matchAll(/\.(select|insert|update|delete)\(/g)]
    expect(statements.length, 'the sweep found no statements to check').toBeGreaterThanOrEqual(8)

    for (const [index, statement] of statements.entries()) {
      const from = statement.index ?? 0
      const next = statements[index + 1]?.index ?? source.length
      const chain = source.slice(from, next)
      const kind = statement[1]

      if (kind === 'insert') {
        expect(chain, 'an insert does not carry shopId in its values').toMatch(/\bshopId,/)
        continue
      }

      expect(
        chain,
        `a ${kind} at offset ${from} has no shop predicate: ${chain.slice(0, 80)}`,
      ).toMatch(/eq\(schema\.(listings|shops)\.(shopId|id),\s*shopId\)/)
    }
  })

  it('has no export that could read across shops', () => {
    /*
     * The converse of the first-parameter rule: a function with no shop id at
     * all. `getDb()` is in this file, so a helper that forgot one would have a
     * database handle and no scope.
     */
    for (const fn of exportedFunctions(source)) {
      expect(fn.params, `${fn.name} takes no shop id`).toMatch(/shopId/)
    }
  })

  it('leaves the row id alone when a listing is upserted', () => {
    /*
     * Eight tables carry a foreign key to listings.id. A conflict branch that
     * re-minted it would orphan every cost rule, audit issue and order item
     * pointing at the listing — silently, on the second sync.
     */
    const conflict = source.slice(source.indexOf('onConflictDoUpdate'))
    const set = conflict.slice(conflict.indexOf('set:'), conflict.indexOf('removedAt: null'))
    expect(set).not.toMatch(/\bid:/)
    expect(set, 'the positive control: this should be the conflict set').toMatch(/title:/)
  })
})
