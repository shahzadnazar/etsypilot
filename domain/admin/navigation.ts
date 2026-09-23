/*
 * The operator panel's navigation model.
 *
 * Pure: no database, no `server-only`, no React. It has to be importable from
 * a CLIENT component — the sidebar reads the pathname to mark the active item —
 * and a module that pulls `server-only` into a client bundle fails the build
 * (D50a). Nothing here reaches anything; it is a list of labels and hrefs and
 * the gate that stands in front of each.
 *
 * ── A NAV ENTRY THAT 404s IS THE DEFECT, NOT THE FEATURE ──────────────────
 *
 * D54a: the seller sidebar once advertised 38 surfaces when 17 existed, and
 * the fix was to check the claim against the filesystem in BOTH directions.
 * The operator panel has the same failure mode twice over, because an item can
 * be wrong in two different ways:
 *
 *   NO PAGE           the href resolves to nothing. Ordinary D54a.
 *   NO PERMISSION     the page exists and this viewer would be refused. The
 *                     gate below is what prevents it, and it is the SAME key
 *                     the page passes to requireAdmin() — not a second
 *                     opinion about who may see what.
 *
 * There is no `unbuilt` flag here and there must not be one. In the seller app
 * a listed-but-unbuilt item keeps the roadmap honest; in an operator panel it
 * would advertise a capability over other people's data that does not exist,
 * which is a different and worse claim. An operator surface appears in this
 * file in the same commit that builds it.
 *
 * ── OMITTED, NEVER LOCKED ─────────────────────────────────────────────────
 *
 * An item the viewer's permissions do not cover is not rendered at all — no
 * greyed row, no padlock. A padlock tells someone what exists and that they
 * cannot have it, which is the reconnaissance the 404-instead-of-403 rule
 * exists to deny (D91). The group header disappears with its last visible
 * item, so an empty heading cannot leak the shape of what is missing either.
 */

import type { Permission, SuperAdminOnlyCapability } from './roles'

/**
 * What stands in front of one item.
 *
 * A discriminated union rather than a single string, because the two are
 * checked by DIFFERENT functions taking DIFFERENT types — `can(Permission)`
 * and `canSuperAdminOnly(SuperAdminOnlyCapability)`. Flattening them to one
 * field would let `audit.view` be typed as a Permission somewhere, and the
 * whole point of SUPER_ADMIN_ONLY is that it cannot be.
 */
export type NavGate =
  | { kind: 'permission'; key: Permission }
  | { kind: 'superAdminOnly'; key: SuperAdminOnlyCapability }

export interface OperatorNavItem {
  label: string
  href: string
  gate: NavGate
  /** One line in the drawer and the sidebar tooltip. What this screen answers. */
  blurb: string
}

export interface OperatorNavGroup {
  label: string
  items: readonly OperatorNavItem[]
}

const permission = (key: Permission): NavGate => ({ kind: 'permission', key })
const superAdminOnly = (key: SuperAdminOnlyCapability): NavGate => ({
  kind: 'superAdminOnly',
  key,
})

export const OPERATOR_NAV: readonly OperatorNavGroup[] = [
  {
    label: 'People',
    items: [
      {
        label: 'Accounts',
        href: '/admin/users',
        gate: permission('users.view'),
        blurb: 'Every account on the platform, newest first.',
      },
      {
        label: 'Managers',
        href: '/admin/managers',
        gate: permission('users.view'),
        blurb: 'Everyone this panel has promoted.',
      },
    ],
  },
  {
    label: 'Platform',
    items: [
      {
        label: 'Etsy connections',
        href: '/admin/etsy',
        gate: permission('etsy.view'),
        blurb: 'Which shops are authorised, which have lapsed, and what last synced.',
      },
      {
        label: 'Subscriptions',
        href: '/admin/subscriptions',
        gate: permission('subscriptions.view'),
        blurb: 'Who is on what plan, what is past due, and which trials end this week.',
      },
      {
        label: 'Usage & quota',
        href: '/admin/usage',
        gate: permission('usage.view'),
        blurb: 'Listings and AI generations against each plan’s limits. Who is near a cap.',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        /*
         * Gated on roles.write, not on a permission, and that is deliberate
         * rather than incidental. The matrix is where permissions are granted,
         * so whoever can open it can grant themselves the rest — which is the
         * definition of a capability that cannot be delegated.
         */
        label: 'Permissions',
        href: '/admin/permissions',
        gate: superAdminOnly('roles.write'),
        blurb: 'What each role may do. Editable, and every change is recorded.',
      },
      {
        label: 'Audit log',
        href: '/admin/audit',
        gate: superAdminOnly('audit.view'),
        blurb: 'Every role and permission change, including the refusals.',
      },
    ],
  },
] as const

/**
 * The viewer's own navigation.
 *
 * Takes the two predicates rather than an AdminAccess, so this module depends
 * on nothing and can be exercised without one. Passing the real `access.can`
 * and `access.canSuperAdminOnly` is what makes the nav and the pages agree:
 * there is no second copy of the viewer's permissions to fall out of step.
 *
 * A group whose every item is gated away disappears entirely, heading and all.
 */
export function visibleOperatorNav(access: {
  can(permission: Permission): boolean
  canSuperAdminOnly(capability: SuperAdminOnlyCapability): boolean
}): OperatorNavGroup[] {
  return OPERATOR_NAV.map((group) => ({
    label: group.label,
    items: group.items.filter((item) =>
      item.gate.kind === 'permission'
        ? access.can(item.gate.key)
        : access.canSuperAdminOnly(item.gate.key),
    ),
  })).filter((group) => group.items.length > 0)
}

/** Every href the nav can offer, for the guard that checks them against disk. */
export function allOperatorHrefs(): string[] {
  return OPERATOR_NAV.flatMap((group) => group.items.map((item) => item.href))
}

/**
 * Whether an item is the one currently open.
 *
 * Prefix matching, so `/admin/users/abc123` keeps Accounts marked — an
 * operator two clicks into a detail screen should still be able to see where
 * they are. `/admin/users/abc/role` is under the same item for the same
 * reason. Exported rather than inlined in the sidebar so the drawer and the
 * rail cannot disagree about which one is lit.
 */
export function isCurrentNavItem(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
