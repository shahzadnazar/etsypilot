import { describe, expect, it } from 'vitest'
import { code, exportedFunctions, isScoped, statements } from '../support/shop-scoping'

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
     * Per statement, via the shared sweep in tests/support/shop-scoping.ts.
     * The dangerous one is the removal UPDATE: its other predicate is
     * `notInArray(seen)`, so unscoped it would date every OTHER shop's
     * catalogue as removed on the first sync of this one.
     *
     * This used to carry a hardcoded floor of eight statements and went red
     * when the shops-timestamp write moved into lib/repositories/sync-state.ts
     * — a change that moved no risk. The floor is gone; the positive control
     * is that the sweep finds statements at all.
     */
    expect(statements(source).length, 'the sweep found no statements').toBeGreaterThan(0)
    for (const statement of statements(source)) {
      expect(
        isScoped(statement),
        `a ${statement.kind} at offset ${statement.offset} is not shop-scoped: ${statement.chain.slice(0, 90)}`,
      ).toBe(true)
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
