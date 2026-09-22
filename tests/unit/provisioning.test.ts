import { beforeEach, describe, expect, it } from 'vitest'
import { provisionAccount, DEMO_SHOP_NAME } from '@/domain/auth/provision'
import type { AccountStore, ShopRow, UserRow } from '@/lib/repositories/accounts'
import { shopContext } from '@/lib/permissions'
import { AppError } from '@/lib/errors/types'
import { MockEtsyService } from '@/lib/etsy/mock'

/*
 * Provisioning runs against an in-memory store, not Postgres.
 *
 * That is the reason lib/repositories/accounts.ts exposes an AccountStore
 * interface at all. The rules worth testing are the idempotency rules — a
 * second shop for one seller is a split identity that surfaces much later as
 * data appearing to vanish — and behind a concrete Drizzle call they could only
 * be exercised against a live database, which this suite deliberately does not
 * require.
 */
function memoryStore(): AccountStore & { users: UserRow[]; shops: ShopRow[]; memberships: unknown[] } {
  const users: UserRow[] = []
  const shops: ShopRow[] = []
  const memberships: { userId: string; shopId: string; role: string }[] = []

  return {
    users,
    shops,
    memberships,
    async findUserById(id) {
      return users.find((u) => u.id === id) ?? null
    },
    async createUser(user) {
      const existing = users.find((u) => u.id === user.id)
      if (existing) return existing // mirrors onConflictDoNothing on the id
      const row: UserRow = {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        displayName: user.displayName ?? null,
      }
      users.push(row)
      return row
    },
    async updateUserName(id, names) {
      const row = users.find((u) => u.id === id)
      if (!row) return null
      row.name = names.name
      row.displayName = names.displayName
      return row
    },
    async findShopByOwnerId(ownerId) {
      return shops.find((s) => s.ownerId === ownerId) ?? null
    },
    async createShop(shop) {
      const row = { id: shop.id, ownerId: shop.ownerId, name: shop.name, isDemo: shop.isDemo }
      shops.push(row)
      return row
    },
    async createMembership(membership) {
      const already = memberships.some(
        (m) => m.userId === membership.userId && m.shopId === membership.shopId,
      )
      if (!already) memberships.push(membership)
    },
  }
}

const ACCOUNT = { userId: 'sb-user-1', email: 'seller@example.com' }

describe('a new account gets a user, a demo shop and a membership', () => {
  it('creates all three, joined to each other', async () => {
    const store = memoryStore()
    const result = await provisionAccount(store, ACCOUNT)

    expect(result.created).toBe(true)
    expect(store.users).toEqual([
      { id: 'sb-user-1', email: 'seller@example.com', name: null, displayName: null },
    ])
    expect(store.shops).toHaveLength(1)
    expect(store.memberships).toEqual([
      { userId: 'sb-user-1', shopId: result.shopId, role: 'OWNER' },
    ])
    // The shop belongs to the account, not to a constant.
    expect(store.shops[0]!.ownerId).toBe('sb-user-1')
  })

  it('marks the shop a demo shop, because no Etsy key exists yet', async () => {
    const store = memoryStore()
    await provisionAccount(store, ACCOUNT)
    expect(store.shops[0]!.isDemo).toBe(true)
    expect(store.shops[0]!.name).toBe(DEMO_SHOP_NAME)
  })

  it('gives each account its OWN shop, not a shared one', async () => {
    // The whole reason the mock's hardcoded-id guard had to go.
    const store = memoryStore()
    const first = await provisionAccount(store, ACCOUNT)
    const second = await provisionAccount(store, { userId: 'sb-user-2', email: 'other@example.com' })

    expect(first.shopId).not.toBe(second.shopId)
    expect(store.shops).toHaveLength(2)
  })

  it('writes nothing outside users, shops and memberships', async () => {
    // Listings and orders come from the Etsy adapter. A seed here would be a
    // second source for data the mock already owns, and the two would drift.
    const store = memoryStore()
    await provisionAccount(store, ACCOUNT)
    expect(Object.keys(store).filter((k) => Array.isArray((store as never)[k])).sort()).toEqual([
      'memberships',
      'shops',
      'users',
    ])
  })
})

describe('the name from sign-up lands on the user row', () => {
  it('stores the full name and seeds a display name from its first word', async () => {
    const store = memoryStore()
    await provisionAccount(store, { ...ACCOUNT, name: 'Farhan Jamal' })
    expect(store.users[0]!.name).toBe('Farhan Jamal')
    expect(store.users[0]!.displayName).toBe('Farhan')
  })

  it('trims, and treats whitespace as no name at all', async () => {
    const store = memoryStore()
    await provisionAccount(store, { ...ACCOUNT, name: '   ' })
    expect(store.users[0]!.name).toBeNull()
  })

  it('leaves both null when sign-in provisions, because sign-in has no name', async () => {
    const store = memoryStore()
    await provisionAccount(store, ACCOUNT)
    expect(store.users[0]!.name).toBeNull()
    expect(store.users[0]!.displayName).toBeNull()
  })

  it('NEVER blanks a stored name on a repeat call', async () => {
    /*
     * The idempotency property that matters here, and it is not "no second
     * shop". Sign-in and the getSession repair path both call provisionAccount
     * with no name; if either overwrote the row, signing in would erase the
     * name signed up with and the greeting would silently revert.
     */
    const store = memoryStore()
    await provisionAccount(store, { ...ACCOUNT, name: 'Farhan Jamal' })
    await provisionAccount(store, ACCOUNT) // as sign-in does
    await provisionAccount(store, { ...ACCOUNT, name: 'Someone Else' })

    expect(store.users[0]!.name).toBe('Farhan Jamal')
    expect(store.users[0]!.displayName).toBe('Farhan')
  })

  it('handles a one-word name without losing it', async () => {
    const store = memoryStore()
    await provisionAccount(store, { ...ACCOUNT, name: 'Prince' })
    expect(store.users[0]!.name).toBe('Prince')
    expect(store.users[0]!.displayName).toBe('Prince')
  })
})

describe('provisioning is idempotent', () => {
  it('a retried sign-up does not create a second shop', async () => {
    const store = memoryStore()
    const first = await provisionAccount(store, ACCOUNT)
    const again = await provisionAccount(store, ACCOUNT)

    expect(again.created).toBe(false)
    expect(again.shopId).toBe(first.shopId)
    expect(store.shops).toHaveLength(1)
    expect(store.users).toHaveLength(1)
    expect(store.memberships).toHaveLength(1)
  })

  it('survives being called many times', async () => {
    const store = memoryStore()
    for (let i = 0; i < 5; i++) await provisionAccount(store, ACCOUNT)
    expect(store.shops).toHaveLength(1)
    expect(store.memberships).toHaveLength(1)
  })

  it('repairs a half-finished attempt that left a user with no shop', async () => {
    /*
     * The exact state a failed provision leaves behind, and the one the
     * setup_failed copy promises signing in will fix. Keying idempotency off
     * "does the user exist" instead of "does the shop exist" would skip the
     * shop forever and strand this account.
     */
    const store = memoryStore()
    await store.createUser({ id: ACCOUNT.userId, email: ACCOUNT.email })
    expect(store.shops).toHaveLength(0)

    const result = await provisionAccount(store, ACCOUNT)
    expect(result.created).toBe(true)
    expect(store.shops).toHaveLength(1)
  })

  it('restores a membership lost between the shop insert and the join', async () => {
    const store = memoryStore()
    const first = await provisionAccount(store, ACCOUNT)
    store.memberships.length = 0 // as if that insert had failed

    await provisionAccount(store, ACCOUNT)
    expect(store.memberships).toEqual([
      { userId: ACCOUNT.userId, shopId: first.shopId, role: 'OWNER' },
    ])
    expect(store.shops).toHaveLength(1)
  })
})

/*
 * The property the mock's removed guard was credited with.
 *
 * lib/etsy/mock.ts used to refuse any shopId that was not one hardcoded
 * constant, under the comment "a user must never be able to operate on another
 * shop's data". Per-user demo shops made that check refuse every request, so it
 * is gone — and these assert that what actually enforced the property is still
 * enforcing it. Deleting a guard is only safe if you can show the real one
 * holds.
 */
describe('cross-shop isolation survives the mock change', () => {
  const session = {
    userId: 'u1',
    email: 'a@example.com',
    name: 'A',
    shopId: 'shop_mine',
    isDemo: false,
  }

  it('refuses a shop the session does not own', () => {
    expect(() => shopContext(session, 'shop_someone_else')).toThrow(AppError)
    try {
      shopContext(session, 'shop_someone_else')
    } catch (error) {
      expect((error as AppError).kind).toBe('AUTHORIZATION')
    }
  })

  it('allows the shop the session does own', () => {
    expect(shopContext(session, 'shop_mine')).toEqual({
      shopId: 'shop_mine',
      actorId: 'u1',
      readOnly: false,
    })
  })

  it('refuses even when the requested shop is the old demo constant', () => {
    // The previous guard would have WAVED THIS THROUGH — it only asked whether
    // the id equalled DEMO_SHOP_ID, never whose shop it was.
    expect(() => shopContext(session, 'demo-willow-fern')).toThrow(AppError)
  })
})

describe('the mock serves any shop id, but only in mock mode', () => {
  const previous = process.env.ETSY_MODE
  beforeEach(() => {
    if (previous === undefined) delete process.env.ETSY_MODE
    else process.env.ETSY_MODE = previous
  })

  it('serves the demo catalogue to a per-user shop id', async () => {
    delete process.env.ETSY_MODE
    const shop = await new MockEtsyService().getShop('shop_a1b2c3')
    expect(shop.name).toBe('Willow & Fern Studio')
  })

  it('refuses to answer at all when the product believes it is live', async () => {
    /*
     * What replaced the shop-identity check. Fictional listings presented as a
     * real shop's is a worse failure than anything the old guard prevented.
     */
    process.env.ETSY_MODE = 'live'
    await expect(new MockEtsyService().getShop('shop_a1b2c3')).rejects.toThrow(AppError)
  })
})
