import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { addToWaitlist, countWaitlist } from '@/lib/repositories/waitlist'
import { getDb } from '@/lib/db'

/**
 * The waitlist: pre-account data, so the usual protection does not apply.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * The claims: one address is one row however it is capitalised, a second
 * submission refreshes rather than duplicates, a blank field on a resubmission
 * does not erase what was given before, and nothing in the repository can be
 * used to ask whether a given address is on the list.
 */

async function clean() {
  await getDb().execute(sql`delete from waitlist_signups where email like '%@wl.test'`)
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need DATABASE_URL pointing at a migrated database.')
  }
  await clean()
})

afterAll(clean)
beforeEach(clean)

describe('one address, one row', () => {
  it('adds a signup', async () => {
    const before = await countWaitlist()
    const result = await addToWaitlist({ email: 'a@wl.test', shopUrl: 'etsy.com/shop/a' })
    expect(result.added).toBe(true)
    expect(await countWaitlist()).toBe(before + 1)
  })

  it('updates rather than duplicating, whatever the capitalisation', async () => {
    await addToWaitlist({ email: 'Case@WL.test' })
    const before = await countWaitlist()

    const second = await addToWaitlist({ email: 'case@wl.test', shopUrl: 'etsy.com/shop/case' })
    expect(second.added, 'a second submission created a second row').toBe(false)
    expect(await countWaitlist()).toBe(before)

    const rows = await getDb().execute<{ email: string; shop_url: string | null }>(
      sql`select email, shop_url from waitlist_signups where lower(email) = 'case@wl.test'`,
    )
    const row = (rows as unknown as { email: string; shop_url: string | null }[])[0]!
    // The first spelling is theirs; the later submission only filled the gap.
    expect(row.email).toBe('Case@WL.test')
    expect(row.shop_url).toBe('etsy.com/shop/case')
  })

  it('and a blank field on a resubmission does not erase what was given', async () => {
    await addToWaitlist({ email: 'keep@wl.test', shopUrl: 'etsy.com/shop/keep' })
    await addToWaitlist({ email: 'keep@wl.test', shopUrl: '' })

    const rows = await getDb().execute<{ shop_url: string | null }>(
      sql`select shop_url from waitlist_signups where lower(email) = 'keep@wl.test'`,
    )
    expect((rows as unknown as { shop_url: string | null }[])[0]!.shop_url).toBe(
      'etsy.com/shop/keep',
    )
  })

  it('refuses an address the database can see is not one', async () => {
    await expect(addToWaitlist({ email: 'not-an-address' })).rejects.toThrow()
  })
})

describe('the list cannot be read back', () => {
  it('exports no way to ask whether an address is on it', async () => {
    /*
     * The protection that replaces shop scoping. A read-by-address would turn
     * the public form into a membership oracle: submit an address, see whether
     * it was already there, and anybody can check anybody.
     */
    const repo = await import('@/lib/repositories/waitlist')
    expect(Object.keys(repo).sort()).toEqual(['addToWaitlist', 'countWaitlist'])
  })

  it('and the row id reveals nothing about the rest of the list', async () => {
    await addToWaitlist({ email: 'id1@wl.test' })
    await addToWaitlist({ email: 'id2@wl.test' })
    const rows = await getDb().execute<{ id: string }>(
      sql`select id from waitlist_signups where email like '%@wl.test'`,
    )
    const ids = (rows as unknown as { id: string }[]).map((r) => r.id)
    // Random uuids, not a sequence somebody could count or walk.
    for (const id of ids) expect(id).toMatch(/^wl_[0-9a-f-]{36}$/)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
