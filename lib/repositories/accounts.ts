/*
 * The account store: users, shops and the membership joining them.
 *
 * Architecture section 3 puts repositories below domain services and above
 * Postgres, and this codebase keeps infrastructure in lib/ (lib/db, lib/etsy,
 * lib/billing) with business logic in domain/. So a repository belongs here,
 * and the provisioning POLICY — what a new account gets — belongs in
 * domain/auth, which calls this.
 *
 * Every function takes the ids it operates on. None reads an ambient session,
 * for the reason lib/permissions/index.ts gives: "forgot to scope this query"
 * should be a missing-argument compile error rather than a security incident.
 *
 * THE STORE IS AN INTERFACE, and that is not ceremony. The idempotency rules
 * below are the part that must not be wrong — a second shop for one seller is a
 * split identity that only shows up later, as data appearing to vanish. Behind
 * a concrete Drizzle call those rules could only be tested against a live
 * Postgres, which this project deliberately does not require to run its suite.
 * With a seam, the rules are exercised in-memory and the SQL is the thin part.
 */

import { eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'

export interface UserRow {
  id: string
  email: string
  /**
   * Null for every provisioned account today.
   *
   * The column exists and nothing populates it — sign-up collects an email and
   * a password, and there is no screen that sets a display name. Read anyway,
   * with the caller falling back, so the day something does populate it the
   * shell starts using it without another change here.
   */
  name: string | null
}

export interface ShopRow {
  id: string
  ownerId: string | null
  name: string
  isDemo: boolean
}

/**
 * The five operations provisioning needs, and no more.
 *
 * Kept deliberately narrow. A repository that exposes everything the schema can
 * express is a repository nobody can reason about; this one grows when a caller
 * needs it to.
 */
export interface AccountStore {
  findUserById(id: string): Promise<UserRow | null>
  createUser(user: { id: string; email: string }): Promise<UserRow>
  findShopByOwnerId(ownerId: string): Promise<ShopRow | null>
  createShop(shop: {
    id: string
    ownerId: string
    name: string
    currency: string
    isDemo: boolean
    connectionStatus: string
  }): Promise<ShopRow>
  createMembership(membership: { userId: string; shopId: string; role: string }): Promise<void>
}

/** Anything with the query methods we use — the db handle or a transaction. */
type Queryable = Pick<ReturnType<typeof getDb>, 'select' | 'insert'>

/**
 * The Postgres implementation.
 *
 * Takes a Queryable rather than calling getDb() itself, so the same code runs
 * inside a transaction and outside one. That is what lets provisioning be
 * atomic without the repository knowing anything about transactions.
 */
export function postgresAccountStore(db: Queryable): AccountStore {
  return {
    async findUserById(id) {
      const [row] = await db
        .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, id))
        .limit(1)
      return row ?? null
    },

    async createUser(user) {
      const [row] = await db
        .insert(schema.users)
        .values({ id: user.id, email: user.email })
        /*
         * A retried sign-up must not fail on a row that is already correct.
         * The id is the Supabase user id and is the primary key, so a conflict
         * means "this exact account is already here" — the desired end state,
         * not an error.
         */
        .onConflictDoNothing({ target: schema.users.id })
        .returning({ id: schema.users.id, email: schema.users.email, name: schema.users.name })

      // onConflictDoNothing returns nothing when it skipped, so read back.
      if (row) return row
      const existing = await this.findUserById(user.id)
      if (!existing) throw new Error(`user ${user.id} could not be created or read back`)
      return existing
    },

    async findShopByOwnerId(ownerId) {
      const [row] = await db
        .select({
          id: schema.shops.id,
          ownerId: schema.shops.ownerId,
          name: schema.shops.name,
          isDemo: schema.shops.isDemo,
        })
        .from(schema.shops)
        .where(eq(schema.shops.ownerId, ownerId))
        .limit(1)
      return row ?? null
    },

    async createShop(shop) {
      const [row] = await db
        .insert(schema.shops)
        .values({
          id: shop.id,
          ownerId: shop.ownerId,
          name: shop.name,
          currency: shop.currency,
          isDemo: shop.isDemo,
          connectionStatus: shop.connectionStatus,
        })
        .returning({
          id: schema.shops.id,
          ownerId: schema.shops.ownerId,
          name: schema.shops.name,
          isDemo: schema.shops.isDemo,
        })
      if (!row) throw new Error(`shop ${shop.id} could not be created`)
      return row
    },

    async createMembership(membership) {
      await db
        .insert(schema.memberships)
        .values(membership)
        // (userId, shopId) is the primary key, so a repeat is already true.
        .onConflictDoNothing()
    },
  }
}

/**
 * Run `work` against a transactional store.
 *
 * All three rows land together or none does. A user with no shop is the state
 * that produces a redirect loop the moment auth goes live, and a shop with no
 * membership is a shop its owner cannot reach — both are worse than a failed
 * sign-up the seller can simply retry.
 */
export async function withAccountStore<T>(work: (store: AccountStore) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => work(postgresAccountStore(tx)))
}

/**
 * A store for reads, outside any transaction.
 *
 * getSession() runs on every request and only ever reads — wrapping that in a
 * transaction would open and close one per page view for two indexed selects.
 * Writes still go through withAccountStore().
 */
export function readOnlyAccountStore(): AccountStore {
  return postgresAccountStore(getDb())
}
