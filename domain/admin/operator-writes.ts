/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT THE OPERATOR AREA MAY WRITE. AN ALLOWLIST, NOT A DENYLIST.
 *
 *   SUPER_ADMIN, ADMIN and MANAGER may READ every seller's data — that is
 *   what an operator panel is for — and may write NONE of it. Two halves of
 *   one rule:
 *
 *     OUR DATABASE   the four entries below are the complete list of what
 *                    /admin can change. Everything else in db/schema is
 *                    seller data and is read-only from this side.
 *
 *     THE SELLER'S ETSY SHOP   nothing at all. Not one listing, not one
 *                    field. The allowlist for this half is EMPTY, and that
 *                    is written down rather than left implied.
 *
 *   The second half is the sharper risk and the reason it is here. A bad
 *   database write corrupts our records and we can repair them from the audit
 *   trail. A bad Etsy write changes a real seller's live listings on
 *   etsy.com, under their name, in front of their buyers — and there is no
 *   transaction to roll back, no version to restore, and nothing we can tell
 *   a buyer who already saw it.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── WHY AN ALLOWLIST ──────────────────────────────────────────────────────
 *
 * A denylist ("the operator area must not write listings, orders, costs…")
 * is correct on the day it is written and silently wrong the day a table is
 * added. The new table is not on the list, so the check passes, and nobody
 * learns anything. An allowlist fails the other way: a write to a table nobody
 * named is refused, and the refusal names the table. The failure mode of
 * getting this wrong should be a red test, not a quiet permission.
 *
 * ── WHAT ENFORCES IT ──────────────────────────────────────────────────────
 *
 * tests/unit/operator-write-boundary.test.ts, which reads the code rather than
 * this comment. It walks every file under app/(admin), domain/admin and
 * lib/repositories/admin-*, follows their imports transitively, and fails if
 * any module in that closure can reach a write outside this list — whether it
 * writes directly or merely imports something that does.
 *
 * ── THE CHOKEPOINT ────────────────────────────────────────────────────────
 *
 * You cannot write to Postgres without `getDb()`. So the guard also pins down
 * WHICH modules in the operator closure may import it: the four repositories
 * below and nothing else. A new operator page that wants to write has to
 * either route through one of those files or add itself here, and both are
 * visible in review.
 *
 * ── WHAT THIS FORECLOSES ──────────────────────────────────────────────────
 *
 * Deliberately, and the trade is worth seeing rather than discovering. None of
 * these can be built without amending this file, the guard, and the decision
 * record together:
 *
 *   Resetting a seller's plan quota          usage_records / subscriptions
 *   Cancelling or refunding a subscription   subscriptions
 *   Fixing a broken cost rule for a seller   cost_rules
 *   Correcting a listing or an order         listings / orders / order_items
 *   Retrying or clearing a stuck bulk job    bulk_operations
 *   Re-linking or revoking an Etsy connection etsy_connections
 *   Deleting an account on request           users / shops / memberships
 *   Re-running a failed sync                 the seller's Etsy shop
 *   Repairing a listing on their behalf      the seller's Etsy shop
 *   Any operator-triggered publish           the seller's Etsy shop
 *   FULL IMPERSONATION — acting as a seller  everything
 *
 * Every one of those is a plausible support request, and support is where
 * "just one small write" enters a codebase. The answer is not that they are
 * bad features; it is that each needs its own decision, its own audit trail
 * and its own consent story, and none of them should arrive as a side effect
 * of an operator screen that already had a database handle in scope.
 *
 * The seller keeps writing their own data through the ordinary app, scoped by
 * shopContext(). Nothing here changes that, and lib/permissions is untouched.
 */

/** One thing the operator area may change, and why it is allowed to. */
export interface OperatorWritable {
  /** The drizzle export in db/schema, e.g. `adminAuditEvents`. */
  schemaKey: string
  /** The SQL table, as the guard and the migrations name it. */
  table: string
  /**
   * The only column that may be written, when the table is otherwise seller
   * data. `null` means the whole table is the operator's to write, which is
   * only true of tables that exist solely for the operator area.
   */
  column: string | null
  /** Shown on the permissions screen, so the panel states its own limits. */
  label: string
  why: string
}

export const OPERATOR_WRITABLE: readonly OperatorWritable[] = [
  {
    schemaKey: 'users',
    table: 'users',
    /*
     * ONE COLUMN of an otherwise seller-owned table, which is why `column` is
     * on this type at all. The row belongs to the seller — their email, their
     * name, their onboarding answers — and none of that is the operator's to
     * change. `platform_role` is the exception because it is not about their
     * shop at all: it is EtsyPilot's own record of who may operate EtsyPilot.
     */
    column: 'platform_role',
    label: 'A person’s platform role',
    why: 'Promotion and demotion between manager and user. Nothing else on the row.',
  },
  {
    schemaKey: 'adminAuditEvents',
    table: 'admin_audit_events',
    column: null,
    label: 'The role-change audit log',
    why: 'Append-only, and written in the same transaction as the change it records.',
  },
  {
    schemaKey: 'adminRolePermissions',
    table: 'admin_role_permissions',
    column: null,
    label: 'The permission matrix',
    why: 'What admins and managers may each do. Not a seller-visible setting.',
  },
  {
    schemaKey: 'adminPermissionAuditEvents',
    table: 'admin_permission_audit_events',
    column: null,
    label: 'The permission-change audit log',
    why: 'Append-only, and written in the same transaction as the change it records.',
  },
] as const

/**
 * The only modules in the operator closure that may hold a database handle.
 *
 * Not a style rule: `getDb()` is the one way to reach Postgres, so this list
 * is what makes the allowlist above checkable at all. Three of these write;
 * the fourth reads across every shop and is listed because it holds the handle,
 * with a separate assertion that it contains no write.
 */
export const OPERATOR_DB_MODULES: readonly string[] = [
  'lib/repositories/admin-writes-platform-role.ts',
  'lib/repositories/admin-audit-log.ts',
  'lib/repositories/admin-permissions.ts',
  'lib/repositories/admin-reads-every-shop.ts',
]

/** Of those, the ones that may write. The reader must not. */
export const OPERATOR_READ_ONLY_MODULES: readonly string[] = [
  'lib/repositories/admin-reads-every-shop.ts',
]

/* ──────────────────────── the seller's Etsy shop ─────────────────────── */

/**
 * The ONE write method on EtsyService.
 *
 * Named as a constant so the guard and this file cannot drift: if the
 * interface ever grows a second writer, the sweep below still only knows about
 * this one and the mismatch is visible here rather than nowhere.
 *
 * D50 already records that nothing is auto-published and that this is
 * reachable only through the bulk editor's ConfirmedOperation gate — SELECT →
 * CONFIGURE → VALIDATE → DIFF → CONFIRM → APPLY → AUDIT → ROLLBACK. What is
 * added here is the other side of that statement: the operator area is outside
 * the gate by construction, so there is no /admin path that could reach the
 * gate's far end.
 */
export const ETSY_WRITE_METHOD = 'applyListingChanges'

/**
 * The chokepoint. You cannot call the method without a service to call it on.
 *
 * Exactly the same shape as `getDb` for the database half: rather than hunting
 * for method calls, the guard asks which operator modules can obtain the
 * handle at all.
 */
export const ETSY_SERVICE_FACTORY = 'getEtsyService'

/**
 * Operator modules permitted to hold an EtsyService. DELIBERATELY EMPTY.
 *
 * An empty allowlist is still an allowlist, and it is the honest expression of
 * the rule: the operator area may make zero Etsy calls, read or write. Reads
 * are excluded too because the handle is the same object — a screen that could
 * fetch a listing could also push one, and `etsy.view` (the permission that
 * exists for Etsy connection health) is served from OUR `etsy_connections`
 * table, not from the Etsy API.
 *
 * A future operator screen that genuinely needs to call Etsy adds itself here,
 * in a diff that says so.
 */
export const OPERATOR_ETSY_MODULES: readonly string[] = []

/**
 * Where the Etsy write legitimately lives, outside the operator area.
 *
 * Not an exemption list — nothing here is in the operator closure. It is the
 * guard's POSITIVE CONTROL: an "is it absent?" sweep passes perfectly when its
 * detector is broken, so the detector is first pointed at the places the write
 * really is, and has to find them.
 */
export const ETSY_WRITE_CALLERS: readonly string[] = ['domain/bulk-editor/service.ts']

/** The declaration and the two adapters. Neither is a caller. */
export const ETSY_WRITE_IMPLEMENTATIONS: readonly string[] = [
  'lib/etsy/interface.ts',
  'lib/etsy/live.ts',
  'lib/etsy/mock.ts',
]

/**
 * How many times the bulk editor calls it: the apply path and the rollback
 * path, and nothing else. D50's claim, pinned to a number.
 */
export const ETSY_WRITE_CALL_SITES = 2

/* ─────────────────────── the writable shop context ───────────────────── */

/**
 * The other handle an operator must never hold.
 *
 * `shopContext(session, shopId)` throws when the session does not own the
 * shop, so an operator inspecting someone else's shop cannot obtain a writable
 * context for it. That is enforced in lib/permissions, which this step does
 * not touch — but a rule nobody checks is a rule that erodes, and the read
 * paths future operator screens will need must not quietly acquire one on the
 * way to a number.
 *
 * Empty for the same reason as the Etsy list: the operator area holds none.
 */
export const SHOP_CONTEXT_FACTORY = 'shopContext'
export const OPERATOR_SHOP_CONTEXT_MODULES: readonly string[] = []

/**
 * The features this rule forecloses, in the panel's own words.
 *
 * Exported rather than left in the comment above so the screen can SAY what it
 * cannot do. A panel that silently lacks a capability looks like a panel that
 * has not got round to it; one that names the limit is making a claim a reader
 * can check.
 */
export const FORECLOSED_BY_DESIGN: readonly string[] = [
  'Resetting a plan quota',
  'Cancelling or refunding a subscription',
  'Editing a seller’s cost rules, listings or orders',
  'Clearing a stuck bulk job',
  'Revoking or re-linking an Etsy connection',
  'Deleting an account',
  'Re-running a failed sync',
  'Repairing a listing on a seller\u2019s behalf',
  'Any operator-triggered publish to Etsy',
  'Acting as a seller (impersonation)',
]
