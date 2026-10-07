import { describe, expect, it } from 'vitest'
import { code, exportedFunctions, isScoped, statements } from '../support/shop-scoping'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SELLER REPOSITORIES CANNOT BE ASKED A QUESTION THAT SPANS SHOPS.
 *
 *   The same guard the listings repository has, over orders and the shared
 *   sync-state table — read from the source, so a function added without a
 *   shop predicate fails here rather than in production on the day two
 *   sellers' orders meet.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── WHY ORDERS NEEDS THIS MORE THAN LISTINGS DID ──────────────────────────
 *
 * `order_items` can be reached two ways: by its own `shop_id`, or by joining
 * through the order it belongs to. The second is the tempting one — the order
 * was already scoped, so the items "must" be — and it is the one that breaks
 * the moment an order id arrives from anywhere but a scoped read. The column
 * exists so the lines can be scoped directly, and this is what makes sure they
 * are.
 *
 * tests/integration/orders-sync.int.ts proves the behaviour, which is stronger
 * evidence. What it cannot do is fail for a function nobody has written yet,
 * and three aggregates are still to come.
 */

const REPOSITORIES = ['lib/repositories/orders.ts', 'lib/repositories/sync-state.ts']

describe.each(REPOSITORIES)('%s names a shop on every statement', (file) => {
  const source = code(file)

  it('has statements for the sweep to check', () => {
    /*
     * The positive control, and it replaces a hardcoded floor the listings
     * guard used to carry. A sweep over a file with no statements passes every
     * assertion below perfectly — which is the exact shape of a check that
     * measures nothing, and this repo has shipped nineteen of those.
     */
    expect(statements(source).length).toBeGreaterThan(0)
    expect(exportedFunctions(source).length).toBeGreaterThan(0)
  })

  it('takes shopId as the first parameter of every export', () => {
    for (const fn of exportedFunctions(source)) {
      const params = fn.params.split(',').map((part) => part.trim())
      /*
       * A function taking a transaction takes it first — it is the thing being
       * written THROUGH, not the thing being written to — so `shopId` is
       * allowed to be second there. It must still be present, which is the
       * assertion that matters, and `tx` is the only name that buys the
       * exception.
       */
      const first = params[0] ?? ''
      const expected = /^tx\s*:/.test(first) ? params[1] ?? '' : first
      expect(expected, `${fn.name} does not name a shop up front`).toMatch(/^shopId\s*:/)
    }
  })

  it('carries a shop predicate on every statement it issues', () => {
    for (const statement of statements(source)) {
      expect(
        isScoped(statement),
        `a ${statement.kind} at offset ${statement.offset} is not shop-scoped: ${statement.chain.slice(0, 90)}`,
      ).toBe(true)
    }
  })

  it('has no export that could reach another shop', () => {
    for (const fn of exportedFunctions(source)) {
      expect(fn.params, `${fn.name} takes no shop id`).toMatch(/shopId/)
    }
  })
})

describe('what the orders upsert must not touch', () => {
  const source = code('lib/repositories/orders.ts')

  it('leaves cost_snapshot out of the conflict set entirely', () => {
    /*
     * Cost rules are their own aggregate. Null in that column already means
     * "no confirmed cost, so this order is excluded from profit rather than
     * given an assumed one", which is right for an order nobody has costed.
     * A sync that wrote it would be inventing a cost; a sync that listed it in
     * the conflict set would erase one that something else had recorded.
     */
    expect(source).not.toMatch(/costSnapshot/)
  })

  it('leaves the order id alone when a receipt is re-synced', () => {
    // order_items carries a foreign key to orders.id. Re-minting it on every
    // sync would orphan every line of every order on the second run.
    const conflict = source.slice(source.indexOf('onConflictDoUpdate'))
    const set = conflict.slice(conflict.indexOf('set:'), conflict.indexOf('countryCode:'))
    expect(set).not.toMatch(/\bid:/)
    expect(set, 'the positive control: this is the order conflict set').toMatch(/gross:/)
  })

  it('can only ever learn a fee, never forget one', () => {
    /*
     * The fee columns are COALESCE(excluded, existing). The sync writes NULL
     * today, so without this a re-run would erase a fee that a ledger import
     * or an operator correction had put there, and the period would silently
     * revert to "fees unknown".
     */
    for (const column of ['etsy_fees', 'payment_processing', 'offsite_ads']) {
      expect(source, `${column} is not coalesced`).toMatch(
        new RegExp(`coalesce\\(excluded\\.${column},`),
      )
    }
  })
})
