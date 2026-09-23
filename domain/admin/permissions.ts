/*
 * The editable permission matrix.
 *
 * Pure: types and total functions, no database and no `server-only`, so every
 * rule below is testable without Postgres and the matrix screen can import it.
 *
 * ── WHAT IS EDITABLE, AND WHAT IS NOT ─────────────────────────────────────
 *
 *   SUPER_ADMIN   never. Always every permission, never read from the store.
 *   ADMIN         editable.
 *   MANAGER       editable.
 *   USER          not in the matrix at all; it is the absence of a role.
 *
 * SUPER_ADMIN is excluded for one reason that is not about tidiness: a super
 * admin who can remove their own capabilities can lock themselves out of the
 * only screen that could restore them. There is no second super admin to fix
 * it and no in-app route back — the way back would be editing
 * SUPER_ADMIN_EMAILS and restarting, which is a deployment operation, not an
 * afternoon. The matrix simply does not offer the row.
 *
 * That exclusion is a TYPE, like the assignable roles in ./roles: every
 * function on the permission write path takes `EditableRole`, so
 *
 *     setRolePermissions('SUPER_ADMIN', [])   // ← does not compile
 *
 * is wrong at the keyboard rather than caught by an `if` someone could delete.
 */

import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  SUPER_ADMIN_ONLY,
  type Permission,
  type PlatformRole,
} from './roles'

/* -------------------------------------------------------- editable roles */

export const EDITABLE_ROLES = ['ADMIN', 'MANAGER'] as const satisfies readonly PlatformRole[]
export type EditableRole = (typeof EDITABLE_ROLES)[number]

export function isEditableRole(value: unknown): value is EditableRole {
  return typeof value === 'string' && (EDITABLE_ROLES as readonly string[]).includes(value)
}

/* ------------------------------------------------------- parsing the form */

/**
 * Turn whatever a request carried into a set of real permissions.
 *
 * THE ONLY DOOR from `string[]` to `Permission[]`, which is what makes the
 * type guarantee downstream mean anything.
 *
 * It REFUSES on an unrecognised key rather than dropping it, and that choice
 * is load-bearing. Silently dropping `roles.write` would answer a tampered
 * request with a cheerful success and an audit record that did not mention
 * the attempt — the request would look, in the log, exactly like an ordinary
 * save. Refusing puts the attempt in the log as a refusal, which is the whole
 * argument for recording refusals at all (D66).
 *
 * A legitimate form can never trip it: the checkboxes are rendered from
 * PERMISSIONS and a browser submits only the ones it was given.
 *
 * Duplicates are collapsed. An empty list is VALID — "this role may do
 * nothing" is a real thing to say, and it is different from "nobody has
 * configured this role", which is the absence of a row.
 */
export function parsePermissionKeys(values: readonly unknown[]): readonly Permission[] | null {
  const known = new Set<string>(PERMISSIONS)
  const out: Permission[] = []
  for (const value of values) {
    if (typeof value !== 'string') return null
    if (!known.has(value)) return null
    if (!out.includes(value as Permission)) out.push(value as Permission)
  }
  // Canonical order, so a stored set and an audit record never differ merely
  // by the order the browser happened to submit the boxes in.
  return sortPermissions(out)
}

/** PERMISSIONS order, not alphabetical. The screen reads in this order too. */
export function sortPermissions(values: readonly Permission[]): readonly Permission[] {
  return PERMISSIONS.filter((permission) => values.includes(permission))
}

/* ----------------------------------------------------------- resolution */

/**
 * What a role may actually do, given what the store holds for it.
 *
 * `stored` is null when there is NO ROW, which is not the same as a row
 * holding an empty list:
 *
 *   null   nobody has ever configured this role → the defaults apply. This is
 *          what keeps first deploy behaving exactly as it did, even if the
 *          seed in migration 0005 never ran.
 *   []     somebody configured it to nothing → nothing. A deliberate empty
 *          set must not be helpfully refilled from the defaults; that would
 *          make the matrix a screen that changes nothing, which is worse than
 *          no matrix at all.
 *
 * Anyone able to DELETE the row could therefore restore the defaults — but
 * anyone able to delete it can also UPDATE it to whatever they like, so this
 * is not a capability the distinction hands out.
 *
 * ── THE FILTER IS A SECURITY BOUNDARY, NOT TIDYING ────────────────────────
 *
 * The stored value is filtered through PERMISSIONS on the way out. A row that
 * somehow contains 'roles.write' or 'audit.view' — a bad migration, a direct
 * UPDATE, a future bug — grants neither, because neither is in PERMISSIONS and
 * neither is a Permission. It is the last of three independent barriers: the
 * matrix cannot render them, parsePermissionKeys cannot accept them, and this
 * cannot return them.
 */
export function resolvePermissions(
  role: PlatformRole,
  stored: readonly string[] | null,
): readonly Permission[] {
  // SUPER_ADMIN never consults the store. See the banner.
  if (role === 'SUPER_ADMIN') return PERMISSIONS
  if (role === 'USER') return []
  if (stored === null) return DEFAULT_ROLE_PERMISSIONS[role]
  return PERMISSIONS.filter((permission) => stored.includes(permission))
}

/* --------------------------------------------------------------- display */

/** What each key means, in the operator's words. Rendered on the matrix. */
export const PERMISSION_LABELS: Record<Permission, { title: string; detail: string }> = {
  'users.view': {
    title: 'Accounts',
    detail: 'See every account, its platform role and its shop. No money, no seller data.',
  },
  'users.detail': {
    title: 'Account detail',
    detail: 'Open one account and see more about it than the list shows.',
  },
  'subscriptions.view': {
    title: 'Subscriptions',
    detail: 'See who is on which plan and what they are billed.',
  },
  'usage.view': { title: 'Usage', detail: 'See how much of their plan each account is using.' },
  'ai.view': { title: 'AI', detail: 'See AI drafting activity and its costs.' },
  'etsy.view': { title: 'Etsy', detail: 'See Etsy connection health and sync state.' },
  'operations.view': {
    title: 'Operations',
    detail: 'See queues, jobs and the platform’s own health.',
  },
  'financials.view': {
    title: 'Financials',
    detail:
      'See a seller’s revenue, profit, order count and fees. The most sensitive figures in the product — and read-only, like everything else here.',
  },
}

/**
 * The two that are NOT here, restated where the matrix can see them.
 *
 * `SUPER_ADMIN_ONLY` is a separate type that `can()` cannot accept, so neither
 * can be granted. This export exists so the screen can SAY so — a matrix that
 * silently omits two capabilities looks like a matrix with a gap in it.
 */
export const NON_DELEGATABLE = SUPER_ADMIN_ONLY

export const NON_DELEGATABLE_LABELS: Record<(typeof SUPER_ADMIN_ONLY)[number], string> = {
  'audit.view': 'Read the operator audit log',
  'roles.write': 'Change platform roles and these permissions',
}
