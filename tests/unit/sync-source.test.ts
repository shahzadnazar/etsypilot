import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT DECIDES WHERE A SELLER'S DATA COMES FROM — AND WHAT MUST NOT.
 *
 *   `ETSY_MODE` decides, through isDemoMode(). `shops.is_demo` (which is
 *   `ctx.readOnly`) must not, and this is the file that will notice if it
 *   starts to.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The two flags look interchangeable and disagree in the case that actually
 * happens: a LIVE deployment where a brand-new signup's shop is still flagged
 * `is_demo` because they have not connected Etsy yet. Branching on `is_demo`
 * would send that seller into MockEtsyService, which refuses outright — so the
 * symptom would not be invented figures, it would be a dead listings page for
 * every new account on the day of launch.
 *
 * Both halves are asserted: that the branch IS on isDemoMode(), and that
 * readOnly does NOT appear in the decision. The second is the one that catches
 * the mistake, because the first would still pass if someone added an `||`.
 */

const SOURCE_FILE = 'domain/sync/source.ts'

/** Source with comments removed — otherwise the prose above would satisfy the sweep. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('the data source decision', () => {
  const source = code(SOURCE_FILE)

  it('branches on isDemoMode(), which is ETSY_MODE', () => {
    expect(source).toMatch(/if\s*\(isDemoMode\(\)\)/)
    expect(source, 'the positive control: this is the right file').toMatch(/shopDataSource/)
  })

  it('never branches on ctx.readOnly or is_demo', () => {
    /*
     * The decision body only, not the signature: the function takes a
     * ShopContext and reads ctx.shopId from it, which is correct and must not
     * be flagged. What must never appear is the SHOP's demo flag.
     */
    const body = source.slice(source.indexOf('export async function shopDataSource'))
    expect(body).not.toMatch(/readOnly/)

    /*
     * `isDemo(?!Mode)` because the first spelling of this assertion was
     * `/isDemo/` and it failed against CORRECT code: `isDemo` is a prefix of
     * `isDemoMode`, the very function that is supposed to be there. A guard
     * that cannot tell the right answer from the wrong one is worse than
     * none — it gets reworded until it passes, and what it was watching for
     * goes with it.
     */
    expect(body).not.toMatch(/isDemo(?!Mode)/)
    expect(body).not.toMatch(/is_demo/)
    expect(body, 'the positive control: the body was found').toMatch(/readShopSyncState/)
  })

  it('is what the app shell reads the shop from, not the adapter', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE SHELL ASKING THE ADAPTER FOR THE SHOP WAS A 500 ON EVERY SELLER
     *   SCREEN IN A LIVE DEPLOYMENT.
     * ══════════════════════════════════════════════════════════════════════
     *
     * app/(dashboard)/layout.tsx called getEtsyService().getShop() for a name
     * and a sync time that are both columns on `shops`. With no ETSY_API_KEY
     * LiveEtsyService throws ETSY_NOT_CONFIGURED, so the layout failed before
     * any page reached its own data — measured in a browser, where /listings
     * rendered "Something went wrong on our side" and the never-synced empty
     * state was unreachable.
     *
     * Guarded statically because the symptom is invisible in demo mode, which
     * is what every browser suite runs in: the mock answers getShop happily,
     * so a regression here would pass every existing check.
     */
    const layout = code('app/(dashboard)/layout.tsx')
    expect(layout, 'the shell is back to asking the adapter for the shop').not.toMatch(
      /getEtsyService\(\)/,
    )
    expect(layout, 'the positive control: this is the shell').toMatch(/AppShell/)
    expect(layout).toMatch(/shopHeader\(ctx\)/)
  })

  it('reads nothing from the database in demo mode', async () => {
    /*
     * Behavioural, and the sharpest of the three: the static sweep above
     * cannot see what readShopSyncState does. This asserts the demo branch
     * returns before any database handle is asked for — the same property the
     * integration suite asserts end to end with a getDb spy, held here too so
     * it is checked in `npm test` with no database at all.
     */
    vi.resetModules()
    process.env.ETSY_MODE = 'demo'
    const db = await import('@/lib/db')
    const getDb = vi.spyOn(db, 'getDb')

    const { shopDataSource } = await import('@/domain/sync/source')
    const result = await shopDataSource({ shopId: 'shop_x', actorId: 'user_x', readOnly: true })

    expect(result.source).toEqual({ kind: 'DEMO' })
    expect(result.currency).toBeNull()
    expect(getDb, 'demo mode touched the database').not.toHaveBeenCalled()
  })

  it('does not treat a never-synced shop as demo', async () => {
    /*
     * The converse, and the whole reason this file exists. In live mode a
     * read-only (is_demo) shop must still go to the database — it must NOT
     * come back DEMO. Without a database here the call throws rather than
     * answering, and that is the measurement: it got past the demo branch.
     */
    vi.resetModules()
    process.env.ETSY_MODE = 'live'

    const { shopDataSource } = await import('@/domain/sync/source')
    const demoShop = { shopId: 'shop_x', actorId: 'user_x', readOnly: true }

    await expect(shopDataSource(demoShop)).rejects.toThrow()
  })
})

afterEach(() => {
  delete process.env.ETSY_MODE
  vi.restoreAllMocks()
})
