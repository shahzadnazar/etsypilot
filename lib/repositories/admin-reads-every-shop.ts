import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THIS FILE DELIBERATELY CROSSES THE SHOP ISOLATION BOUNDARY.
 *
 *   Every other repository in this codebase is scoped to one shop through
 *   ShopContext, and shopContext() in lib/permissions THROWS when the session
 *   does not own the shop being asked for. That is the isolation boundary, it
 *   is untouched, and nothing here weakens it.
 *
 *   These queries have no shop scope at all. They read across every seller in
 *   the system. That is what an operator's account list IS — you cannot list
 *   the accounts by asking one account about itself.
 *
 *   THE FILENAME IS THE GUARD. `admin-reads-every-shop` cannot appear in an
 *   import line by accident, and a reviewer seeing it in a seller-facing file
 *   knows immediately that something is wrong. A test asserts that only
 *   app/(admin) and domain/admin import it, and fails if anything else does.
 *
 *   RULES FOR THIS FILE, all four load-bearing:
 *
 *     1. READ ONLY. No insert, no update, no delete, ever. Not in this step
 *        and not by extension later — a write path here would be a write with
 *        no shop scope and no seller's consent. It gets its own file when it
 *        exists, with its own audit trail.
 *     2. CALLERS MUST HAVE CHECKED FIRST. Nothing here authorises anything.
 *        requireAdmin() in domain/admin/access.ts is the gate; these functions
 *        assume it already ran and do not re-derive permission, because a
 *        function that checks its own caller's rights is a function people
 *        stop checking before.
 *     3. NO SECRETS. Never select etsy_connections.token_ref, never a
 *        password, never anything from SUPABASE_SERVICE_ROLE_KEY. The column
 *        lists below are explicit for that reason — `select *` would quietly
 *        start returning whatever a future migration adds.
 *     4. NO ORDER DATA, NO LISTING DATA. An operator listing accounts has no
 *        business reading a seller's revenue. Those get their own reviewed
 *        additions with their own justification, or they do not exist.
 *
 * ██████████████████████████████████████████████████████████████████████████
 */

import { desc, eq } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { resolvePlatformRole, type PlatformRole } from '@/domain/admin/roles'

/** One row of the operator's account list. Nothing here is money or content. */
export interface AdminUserRow {
  id: string
  email: string
  name: string | null
  /** Resolved, not raw: the env allow-lists outrank whatever the column says. */
  platformRole: PlatformRole
  /** Their own shop. Null for an account whose provisioning never finished. */
  shopId: string | null
  shopName: string | null
  shopIsDemo: boolean | null
  signedUpAt: Date
}

/**
 * The platform role stored against one account.
 *
 * Its own function, and deliberately narrow: the gate needs one column for one
 * id, and handing it the whole user row would invite reading more.
 */
export async function adminReadStoredPlatformRole(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ platformRole: schema.users.platformRole })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  return row?.platformRole ?? null
}

/**
 * Every account, newest first.
 *
 * LEFT JOIN on shops, not INNER: an account whose provisioning failed has no
 * shop, and those are exactly the accounts an operator most needs to see.
 * An inner join would hide the broken ones, which is the wrong way round.
 *
 * `limit` is capped rather than trusted, so a caller cannot ask for the whole
 * table by accident. Paging arrives when the list is long enough to need it.
 */
export async function adminListUsers(options: { limit?: number } = {}): Promise<AdminUserRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500)

  const rows = await getDb()
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      storedRole: schema.users.platformRole,
      signedUpAt: schema.users.createdAt,
      shopId: schema.shops.id,
      shopName: schema.shops.name,
      shopIsDemo: schema.shops.isDemo,
    })
    .from(schema.users)
    .leftJoin(schema.shops, eq(schema.shops.ownerId, schema.users.id))
    .orderBy(desc(schema.users.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    /*
     * Resolved per row, so the list shows the role that is actually in force.
     * Printing the raw column would show USER beside an account that is
     * SUPER_ADMIN through the environment — a list that disagrees with the
     * system it describes.
     */
    platformRole: resolvePlatformRole({ email: row.email, storedRole: row.storedRole }),
    shopId: row.shopId,
    shopName: row.shopName,
    shopIsDemo: row.shopIsDemo,
    signedUpAt: row.signedUpAt,
  }))
}
