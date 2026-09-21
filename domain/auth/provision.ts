/*
 * What a new account gets.
 *
 * Decision on record: every account is given its own demo shop, so the whole
 * product is explorable before an Etsy connection exists. The Etsy key is not
 * available and will not be for some time, and a seller who signs up and lands
 * on twenty empty screens has no way to judge whether the thing works.
 *
 * Policy lives here rather than in the repository, and rows live in the
 * repository rather than here: architecture section 3 has domain services above
 * repositories, and "a new seller gets a demo shop called X in USD" is a
 * product decision that will change, while "insert a row" will not.
 *
 * ONLY users, shops AND memberships. Listings, orders and fees are served by
 * the Etsy adapter, not stored — seeding them would create a second source for
 * data the mock already owns, and the two would drift.
 */

import { randomUUID } from 'node:crypto'
import type { AccountStore } from '@/lib/repositories/accounts'

/** The starting shop. Named for the person, not for the fixture. */
export const DEMO_SHOP_NAME = 'My demo shop'
export const DEMO_SHOP_CURRENCY = 'USD'

export interface ProvisionedAccount {
  userId: string
  shopId: string
  /** False when this account already had everything. Lets callers log honestly. */
  created: boolean
}

/**
 * Make sure a signed-up account has a user row, a shop and a membership.
 *
 * IDEMPOTENT, and that is the whole contract. It is called from sign-up and
 * again from sign-in, it may be retried after a network failure, and it may run
 * twice concurrently if someone double-submits. None of those may produce a
 * second shop: two shops for one seller is a split identity that surfaces much
 * later, as data that appears to have vanished, and nothing in the product
 * would point at sign-up as the cause.
 *
 * So the shop is looked up BY OWNER before anything is created, and that read
 * is the idempotency key. Not "did we just create a user" — a half-finished
 * previous attempt could leave a user with no shop, and keying off the user
 * would then skip the shop forever.
 *
 * Takes a store rather than reaching for one, so the caller decides whether
 * this runs inside a transaction. It always should; the type does not enforce
 * that, and withAccountStore() is the only intended entry.
 */
export async function provisionAccount(
  store: AccountStore,
  account: { userId: string; email: string },
): Promise<ProvisionedAccount> {
  const user = await store.createUser({ id: account.userId, email: account.email })

  const existing = await store.findShopByOwnerId(user.id)
  if (existing) {
    /*
     * Already provisioned. The membership is re-asserted rather than assumed:
     * it is the one row that could be missing on its own if an older attempt
     * failed between the shop insert and the membership insert, and its absence
     * means a seller owns a shop they cannot open.
     */
    await store.createMembership({ userId: user.id, shopId: existing.id, role: 'OWNER' })
    return { userId: user.id, shopId: existing.id, created: false }
  }

  const shop = await store.createShop({
    // Random rather than derived from the user id: a shop id appears in URLs
    // and logs, and deriving it would make those a map back to the account.
    id: `shop_${randomUUID()}`,
    ownerId: user.id,
    name: DEMO_SHOP_NAME,
    currency: DEMO_SHOP_CURRENCY,
    isDemo: true,
    // Matches the schema default, written explicitly: this shop is a demo shop
    // because provisioning decided so, not because a column default happened
    // to agree.
    connectionStatus: 'DEMO',
  })

  await store.createMembership({ userId: user.id, shopId: shop.id, role: 'OWNER' })
  return { userId: user.id, shopId: shop.id, created: true }
}
