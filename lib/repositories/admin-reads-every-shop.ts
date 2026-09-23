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
 *     4. NO ORDER ROWS, NO LISTING DATA. Orders may be SUMMED and COUNTED;
 *        not one order row may be selected, and no buyer-identifying column
 *        may be named at all. A1 forbade the orders table outright, on the
 *        grounds that an operator LISTING accounts has no business reading a
 *        seller's revenue — and said such a read would need its own reviewed
 *        addition with its own justification. This is that addition. The
 *        justification is `financials.view`: "my profit looks wrong" is the
 *        support case this product most has to be able to answer, and it
 *        cannot be answered by someone who cannot see the figures. What the
 *        rule keeps is the part that was actually protecting anyone — the
 *        aggregate crosses the boundary, the purchases do not. The test in
 *        tests/unit/admin-roles.test.ts enforces it by reading the SELECT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 */

import { and, asc, count, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { getDb, schema } from '@/lib/db'
import { resolvePlatformRole, type PlatformRole } from '@/domain/admin/roles'
import type { AccountDetailReads, Read } from '@/domain/admin/account-detail'

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
 * One account, for the role editor.
 *
 * Read fresh at submit time rather than trusted from the form. The list the
 * operator is looking at was rendered at some earlier moment, and the two facts
 * that decide whether a change is legitimate — does this account still exist,
 * and what role does it hold now — are exactly the two that can have moved
 * since. Taking `before` from a hidden form field would let a stale page write
 * a false "from" value into the audit log.
 */
export async function adminReadAccount(
  userId: string,
): Promise<{ id: string; email: string; storedRole: string; resolvedRole: PlatformRole } | null> {
  const [row] = await getDb()
    .select({
      id: schema.users.id,
      email: schema.users.email,
      platformRole: schema.users.platformRole,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    email: row.email,
    storedRole: row.platformRole,
    resolvedRole: resolvePlatformRole({ email: row.email, storedRole: row.platformRole }),
  }
}

/**
 * Everyone the COLUMN says is a manager, newest first.
 *
 * Reads the stored value, not the resolved one, and that is the right question
 * here: the Managers page lists the people this panel promoted, which is a fact
 * about the column. Someone who is SUPER_ADMIN through the environment is not a
 * manager and must not appear, even if their row happens to say MANAGER.
 */
export async function adminListManagers(): Promise<AdminUserRow[]> {
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
    .where(eq(schema.users.platformRole, 'MANAGER'))
    .orderBy(desc(schema.users.createdAt))

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    platformRole: resolvePlatformRole({ email: row.email, storedRole: row.storedRole }),
    shopId: row.shopId,
    shopName: row.shopName,
    shopIsDemo: row.shopIsDemo,
    signedUpAt: row.signedUpAt,
  }))
}

/* ------------------------------------------------ one account, in depth */

const NOT_READ = { read: false } as const

/**
 * Everything the account detail screen can show, in one read.
 *
 * ── WHAT IS DELIBERATELY NOT SELECTED ─────────────────────────────────────
 *
 * `etsy_connections.token_ref` — rule 3 of this file. A support screen has no
 * use for a credential, and selecting it would put one in a React payload.
 *
 * `orders.country_code` — and this is the one worth spelling out. It is the
 * closest thing to buyer-identifying data in the schema, and D77 exists
 * because a country with one order in it is a person. The seller's own
 * analytics folds countries under five orders together BEFORE the data leaves
 * the domain; rather than reimplement that folding for an operator screen,
 * this reads no country at all. An operator answering "my profit looks wrong"
 * does not need to know where the buyers were.
 *
 * Nothing here selects from `order_items` either: a line item is what somebody
 * bought. The financial figures are aggregates over `orders`, which is the
 * level the question is asked at.
 *
 * ── AGGREGATED IN SQL, NOT IN MEMORY ──────────────────────────────────────
 *
 * The order figures come back as sums and a count. That is not only faster —
 * it means no individual order row is ever loaded into the process, so there
 * is no array of purchases for a later change to start rendering.
 */
export interface AdminAccountDetail {
  id: string
  email: string
  name: string | null
  displayName: string | null
  storedRole: string
  resolvedRole: PlatformRole
  onboardingState: string
  signedUpAt: Date

  shop: {
    id: string
    name: string
    isDemo: boolean
    connectionStatus: string
    lastSyncedAt: Date | null
    createdAt: Date
    membershipRole: string | null
    membershipSince: Date | null
  } | null

  /** Null when the shop has never been connected to Etsy. */
  connection: Read<{
    scopes: string[]
    expiresAt: Date | null
    revokedAt: Date | null
  } | null>

  /** Null when no subscription row exists — different from a free plan. */
  subscription: Read<{
    plan: string
    status: string
    renewsAt: Date | null
    trialEndsAt: Date | null
    cancelledAt: Date | null
  } | null>

  /** Empty when no usage record exists for the current period. */
  usage: Read<{ metric: string; used: number; limit: number; periodStart: Date; periodEnd: Date }[]>

  /**
   * The most recent computed profit record, or null when none has been
   * computed. Carries its own coverage percentage, which is what stops the
   * screen from rendering a profit that silently excludes unconfirmed costs.
   */
  profit: Read<{
    periodStart: Date
    periodEnd: Date
    grossRevenue: string
    etsyFees: string
    paymentProcessing: string
    offsiteAds: string
    shipping: string
    cogs: string
    labour: string
    otherCosts: string
    netProfit: string
    coveragePercent: number
    computedAt: Date
  } | null>

  /**
   * Order aggregates over the profit record's period, or null when there is no
   * period to aggregate over. Never individual orders.
   */
  orders: Read<{
    count: number
    gross: string
    refunds: string
    etsyFees: string
    paymentProcessing: string
    offsiteAds: string
  } | null>
}

export async function adminReadAccountDetail(
  userId: string,
  reads: AccountDetailReads,
): Promise<AdminAccountDetail | null> {
  const db = getDb()

  const [account] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      displayName: schema.users.displayName,
      storedRole: schema.users.platformRole,
      onboardingState: schema.users.onboardingState,
      signedUpAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)
  if (!account) return null

  const [shopRow] = await db
    .select({
      id: schema.shops.id,
      name: schema.shops.name,
      isDemo: schema.shops.isDemo,
      connectionStatus: schema.shops.connectionStatus,
      lastSyncedAt: schema.shops.lastSyncedAt,
      createdAt: schema.shops.createdAt,
    })
    .from(schema.shops)
    .where(eq(schema.shops.ownerId, userId))
    .limit(1)

  const base = {
    id: account.id,
    email: account.email,
    name: account.name,
    displayName: account.displayName,
    storedRole: account.storedRole,
    resolvedRole: resolvePlatformRole({ email: account.email, storedRole: account.storedRole }),
    onboardingState: account.onboardingState,
    signedUpAt: account.signedUpAt,
  }

  /*
   * An account with no shop stops here. What the caller asked to read still
   * decides the shape of the answer: a section that was not requested reports
   * `read: false` rather than an empty one, whether or not there was anything
   * to find.
   */
  const notFoundFor = <T>(want: boolean, value: T): Read<T> =>
    want ? { read: true, value } : NOT_READ

  if (!shopRow) {
    return {
      ...base,
      shop: null,
      connection: notFoundFor(reads.connection, null),
      subscription: notFoundFor(reads.plan, null),
      usage: notFoundFor(reads.usage, []),
      profit: notFoundFor(reads.financials, null),
      orders: notFoundFor(reads.financials, null),
    }
  }

  const [membership] = await db
    .select({ role: schema.memberships.role, createdAt: schema.memberships.createdAt })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.shopId, shopRow.id)))
    .limit(1)

  // scopes, expiry and revocation. NEVER token_ref.
  const [connection] = reads.connection
    ? await db
        .select({
          scopes: schema.etsyConnections.scopes,
          expiresAt: schema.etsyConnections.expiresAt,
          revokedAt: schema.etsyConnections.revokedAt,
        })
        .from(schema.etsyConnections)
        .where(eq(schema.etsyConnections.shopId, shopRow.id))
        .limit(1)
    : [null]

  /*
   * Read when EITHER the plan or the usage section is visible, because usage
   * records hang off the subscription id. Only exposed when the plan section
   * is, so a viewer holding usage.view alone still learns nothing about what
   * the seller pays.
   */
  const [subscription] = reads.plan || reads.usage
    ? await db
        .select({
          id: schema.subscriptions.id,
          plan: schema.subscriptions.plan,
          status: schema.subscriptions.status,
          renewsAt: schema.subscriptions.renewsAt,
          trialEndsAt: schema.subscriptions.trialEndsAt,
          cancelledAt: schema.subscriptions.cancelledAt,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId))
        /*
         * A live subscription beats a cancelled one. `subscriptions` has no
         * createdAt, and picking an arbitrary row would make the Plan section
         * report "cancelled" for an account that has since resubscribed —
         * a figure that is wrong in the direction that alarms.
         */
        .orderBy(sql`${schema.subscriptions.cancelledAt} nulls first`)
        .limit(1)
    : [null]

  const usage =
    reads.usage && subscription
      ? await db
          .select({
            metric: schema.usageRecords.metric,
            used: schema.usageRecords.used,
            limit: schema.usageRecords.limit,
            periodStart: schema.usageRecords.periodStart,
            periodEnd: schema.usageRecords.periodEnd,
          })
          .from(schema.usageRecords)
          .where(eq(schema.usageRecords.subscriptionId, subscription.id))
          .orderBy(desc(schema.usageRecords.periodEnd), asc(schema.usageRecords.metric))
          .limit(10)
      : []

  const [profit] = reads.financials
    ? await db
        .select({
          periodStart: schema.profitRecords.periodStart,
          periodEnd: schema.profitRecords.periodEnd,
          grossRevenue: schema.profitRecords.grossRevenue,
          etsyFees: schema.profitRecords.etsyFees,
          paymentProcessing: schema.profitRecords.paymentProcessing,
          offsiteAds: schema.profitRecords.offsiteAds,
          shipping: schema.profitRecords.shipping,
          cogs: schema.profitRecords.cogs,
          labour: schema.profitRecords.labour,
          otherCosts: schema.profitRecords.otherCosts,
          netProfit: schema.profitRecords.netProfit,
          coveragePercent: schema.profitRecords.coveragePercent,
          computedAt: schema.profitRecords.computedAt,
        })
        .from(schema.profitRecords)
        .where(eq(schema.profitRecords.shopId, shopRow.id))
        .orderBy(desc(schema.profitRecords.periodEnd))
        .limit(1)
    : [null]

  /*
   * Aggregates only. No order row reaches this process, so there is no list of
   * purchases for a later change to start rendering, and no country code to
   * re-identify a buyer from.
   */
  const [orderTotals] = profit
    ? await db
        .select({
          count: count(),
          gross: sql<string>`coalesce(sum(${schema.orders.gross}), 0)::text`,
          refunds: sql<string>`coalesce(sum(${schema.orders.refunds}), 0)::text`,
          etsyFees: sql<string>`coalesce(sum(${schema.orders.etsyFees}), 0)::text`,
          paymentProcessing: sql<string>`coalesce(sum(${schema.orders.paymentProcessing}), 0)::text`,
          offsiteAds: sql<string>`coalesce(sum(${schema.orders.offsiteAds}), 0)::text`,
        })
        .from(schema.orders)
        .where(
          and(
            eq(schema.orders.shopId, shopRow.id),
            gte(schema.orders.placedAt, profit.periodStart),
            lte(schema.orders.placedAt, profit.periodEnd),
          ),
        )
    : [null]

  return {
    ...base,
    shop: {
      ...shopRow,
      membershipRole: membership?.role ?? null,
      membershipSince: membership?.createdAt ?? null,
    },
    connection: notFoundFor(reads.connection, connection ?? null),
    subscription: notFoundFor(
      reads.plan,
      subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            renewsAt: subscription.renewsAt,
            trialEndsAt: subscription.trialEndsAt,
            cancelledAt: subscription.cancelledAt,
          }
        : null,
    ),
    usage: notFoundFor(reads.usage, usage),
    profit: notFoundFor(reads.financials, profit ?? null),
    orders: notFoundFor(reads.financials, orderTotals ?? null),
  }
}

/* ------------------------------------------------ every shop's connection */

/**
 * Every shop's Etsy connection, for the connection-health screen.
 *
 * ── WHAT IS DELIBERATELY NOT SELECTED ─────────────────────────────────────
 *
 * `etsy_connections.token_ref` — rule 3. A support screen has no use for a
 * credential, and selecting it would put one in a React payload. This is the
 * screen where it would have been most tempting: the whole subject is the
 * token, and the one column that must never leave the server is the token's.
 *
 * From `events`, only the TYPE, the TIME and the REASON. Never `listing_id`,
 * never `before_value`, never `after_value` — those three are listing content,
 * which is a seller's own product copy and has nothing to do with whether
 * their sync ran. The row filter is narrowed to the two sync event types for
 * the same reason: a query that read every event of every kind would be one
 * `select` away from a change history nobody asked for.
 *
 * ── AGGREGATED IN SQL ─────────────────────────────────────────────────────
 *
 * The two sync facts come back as one row per shop via DISTINCT ON, so no
 * event history is loaded into the process — there is no array of a seller's
 * changes for a later edit to start rendering.
 */
export interface AdminConnectionRow {
  shopId: string
  shopName: string
  isDemo: boolean
  ownerEmail: string | null
  connectionStatus: string
  lastSyncedAt: Date | null
  scopes: string[] | null
  expiresAt: Date | null
  revokedAt: Date | null
  lastSyncFailure: { at: Date; reason: string | null } | null
  lastSyncSuccess: Date | null
}

export async function adminListEtsyConnections(): Promise<AdminConnectionRow[]> {
  const db = getDb()

  const shops = await db
    .select({
      shopId: schema.shops.id,
      shopName: schema.shops.name,
      isDemo: schema.shops.isDemo,
      connectionStatus: schema.shops.connectionStatus,
      lastSyncedAt: schema.shops.lastSyncedAt,
      ownerEmail: schema.users.email,
      scopes: schema.etsyConnections.scopes,
      expiresAt: schema.etsyConnections.expiresAt,
      revokedAt: schema.etsyConnections.revokedAt,
    })
    .from(schema.shops)
    .leftJoin(schema.users, eq(schema.users.id, schema.shops.ownerId))
    .leftJoin(schema.etsyConnections, eq(schema.etsyConnections.shopId, schema.shops.id))
    .orderBy(asc(schema.shops.name))
    .limit(500)

  /*
   * The latest sync event of each kind, per shop, in one query.
   *
   * DISTINCT ON rather than a fetch-and-reduce: the events table is the
   * largest in the schema and holds every listing change ever made, so a read
   * that pulled rows into the process to pick two would be pulling a seller's
   * whole change history to answer "did the last sync work".
   */
  const syncEvents = await db
    .selectDistinctOn([schema.events.shopId, schema.events.type], {
      shopId: schema.events.shopId,
      type: schema.events.type,
      at: schema.events.timestamp,
      reason: schema.events.reason,
    })
    .from(schema.events)
    .where(inArray(schema.events.type, ['SYNC_FAILED', 'SYNC_COMPLETED']))
    .orderBy(asc(schema.events.shopId), asc(schema.events.type), desc(schema.events.timestamp))

  const failures = new Map<string, { at: Date; reason: string | null }>()
  const successes = new Map<string, Date>()
  for (const event of syncEvents) {
    if (event.type === 'SYNC_FAILED') failures.set(event.shopId, { at: event.at, reason: event.reason })
    else successes.set(event.shopId, event.at)
  }

  return shops.map((shop) => ({
    shopId: shop.shopId,
    shopName: shop.shopName,
    isDemo: shop.isDemo,
    ownerEmail: shop.ownerEmail,
    connectionStatus: shop.connectionStatus,
    lastSyncedAt: shop.lastSyncedAt,
    scopes: shop.scopes,
    expiresAt: shop.expiresAt,
    revokedAt: shop.revokedAt,
    lastSyncFailure: failures.get(shop.shopId) ?? null,
    lastSyncSuccess: successes.get(shop.shopId) ?? null,
  }))
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
