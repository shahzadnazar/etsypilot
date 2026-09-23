import 'server-only'

/*
 * The admin gate.
 *
 * One function decides whether someone may see /admin, and every admin surface
 * calls it. Not a boolean passed around — a page that receives `isAdmin` from
 * its caller is a page whose security depends on the caller remembering.
 *
 * TWO INDEPENDENT CHECKS guard /admin, and they are deliberately not the same
 * check twice:
 *
 *   middleware.ts   Edge, and therefore DB-free. It can tell a signed-out
 *                   visitor from a signed-in one and nothing more, so it 404s
 *                   everyone without a session and everyone in demo mode.
 *                   Coarse, cheap, and covers the common case.
 *
 *   this module     Node, authoritative. Resolves the real role, including
 *                   MANAGER, which lives in a column the Edge runtime cannot
 *                   reach — postgres-js is a TCP driver.
 *
 * Said plainly because the asymmetry matters: the middleware check is NOT
 * sufficient on its own and is not meant to be. Middleware is also not the
 * only way a route can be reached, which is the real argument for the second
 * check regardless of what the first one can see.
 *
 * 404, NEVER 403. A 403 confirms /admin exists and is worth attacking. Someone
 * without access gets the answer they would get for a URL nobody ever wrote —
 * which is the truthful answer, since for them it does not exist.
 *
 * ── How far that actually holds, measured against a running server ────────
 *
 * ANONYMOUS VISITORS AND DEMO MODE: byte-identical, verified. Middleware
 * rewrites the request to a path with no route, so what comes back is the same
 * response a never-written URL produces, down to the byte once the per-request
 * nonce and the echoed path are normalised. tests/browser/admin-hidden.py
 * asserts exactly that and fails if it stops being true.
 *
 * A SIGNED-IN SELLER WHO IS NOT AN OPERATOR: same 404 status, same rendered
 * page, NO operator content — no banner, no navigation, no email, no role, no
 * column name, nothing from the account list. But the refusal happens during
 * render, and Next wraps a request-time notFound() in its `__next_error__`
 * document shell rather than the root layout, so the response is 8,602 bytes
 * where a missing URL is 9,507. An authenticated seller who compares the two
 * can therefore tell that /admin is a URL this application treats specially.
 * They learn nothing else.
 *
 * NOT CLOSED, and deliberately so rather than by oversight. Closing it means
 * refusing in middleware, which is the only place that can rewrite — and
 * middleware runs on the Edge runtime, which cannot read platform_role, so it
 * cannot recognise a MANAGER. The options were to drop the MANAGER role or to
 * add an internal role-resolution endpoint that the Edge can call with the
 * session cookie. A new authenticated internal endpoint is real attack surface,
 * and it would be spent hiding a fact from people who are already signed in.
 * Written down here so it stays a decision rather than becoming a discovery.
 */

import { cache } from 'react'
import { notFound } from 'next/navigation'
import { getOperatorIdentity } from '@/lib/auth/operator-identity'
import { isLiveAuth } from '@/lib/auth/supabase-config'
import { isDatabaseConfigured } from '@/lib/db'
import { logFailure } from '@/lib/errors/api'
import { adminReadStoredPlatformRole } from '@/lib/repositories/admin-reads-every-shop'
import { readStoredPermissions } from '@/lib/repositories/admin-permissions'
import { resolvePermissions } from './permissions'
import {
  canSuperAdminOnly,
  resolvePlatformRole,
  type Permission,
  type PlatformRole,
  type SuperAdminOnlyCapability,
} from './roles'

export interface AdminAccess {
  userId: string
  email: string
  role: PlatformRole
  permissions: readonly Permission[]
  can(permission: Permission): boolean
  canSuperAdminOnly(capability: SuperAdminOnlyCapability): boolean
}

/**
 * Resolve the caller's platform access, or null when they have none.
 *
 * Returns null rather than throwing so a caller can decide what "none" means.
 * Every caller today turns it into a 404.
 *
 * WRAPPED IN cache() for the same reason getSession() is: it now makes a
 * database read, and within one request the layout, the page and — on a
 * submit — the domain action all ask. Three identical queries for one answer
 * is waste, and worse, three reads that could disagree if a write landed
 * between them. One request sees one answer.
 */
export const getAdminAccess = cache(async function getAdminAccess(): Promise<AdminAccess | null> {
  /*
   * getOperatorIdentity(), NOT getSession(), and the difference is the whole
   * of D94 at this one line.
   *
   * getSession() resolves the caller's shop and REPAIRS a missing one by
   * calling provisionAccount(), which writes `users`, `shops` and
   * `memberships`. Importing it put those three seller tables one import away
   * from every operator page — so "the operator area cannot write seller data"
   * was false by import, and the guard that enforces it failed on the code as
   * it stood rather than on some future mistake.
   *
   * This is not an exemption carved for the guard. No screen under /admin
   * reads the operator's own shop, because an operator is not acting as a
   * seller here; the gate needs an id and an email, which is exactly what
   * getOperatorIdentity returns and all it can obtain.
   */
  const session = await getOperatorIdentity()
  if (!session) return null

  /*
   * Demo mode has no platform administrators, by construction.
   *
   * With AUTH_MODE unset the seller app runs on a FIXED session shared by
   * everyone who can reach the deployment. If that could resolve to an
   * administrator, the operator panel would be open to anybody who could load
   * the site. Refused here outright, before any email is compared — and
   * refused a second time inside getOperatorIdentity(), which produces no
   * identity at all in demo mode.
   *
   * THE CONDITION IS THE AUTH MODE, and getting that wrong is easy enough that
   * it is worth recording what the first version said:
   *
   *     if (session.isDemo && !isDatabaseConfigured()) return null
   *
   * which was wrong in both directions at once. Setting DATABASE_URL while
   * AUTH_MODE stayed unset made `isDatabaseConfigured()` true and let the
   * shared demo session straight through — leaving middleware as the only
   * thing in the way, which is exactly the reliance the comment at the top of
   * this file argues against. And a genuine signed-in operator whose SHOP row
   * is flagged isDemo — live auth on the demo catalogue, the state
   * .env.example describes the product as actually being in — was refused
   * whenever the database went away.
   *
   * `session.isDemo` was never the right question: it describes the SHOP, not
   * the session's provenance. What matters is whether the fixed demo session
   * is in play, and it is exactly when AUTH_MODE is not live.
   */
  if (!isLiveAuth()) return null

  let storedRole: string | null = null
  if (isDatabaseConfigured()) {
    try {
      storedRole = await adminReadStoredPlatformRole(session.userId)
    } catch (error) {
      /*
       * Fail closed. A database that cannot be read must deny, never fall back
       * to the env lists alone — though in practice those still resolve below,
       * which is the break-glass route working as designed.
       */
      logFailure(error, { path: 'admin/access' })
      storedRole = null
    }
  }

  const role = resolvePlatformRole({ email: session.email, storedRole })

  /*
   * USER short-circuits here, before any permission read.
   *
   * Deliberately a check on the ROLE and not on the defaults. The previous
   * version asked `hasAnyAdminAccess(role)`, which reads
   * DEFAULT_ROLE_PERMISSIONS — a constant. That was fine while the sets were
   * constants and is exactly wrong now: it would answer yes for a MANAGER
   * whose every box has been unticked, and the whole point of the matrix is
   * that unticking the last box removes the panel.
   */
  if (role === 'USER') return null

  /*
   * ── ENFORCEMENT READS THE STORE, NOT THE DEFAULTS ──────────────────────
   *
   * This is the only place an AdminAccess is built, and every check in the
   * operator panel goes through the object it returns — requireAdmin() in each
   * page, access.can() in the layout's navigation, the roles.write check in
   * the role editor. So making THIS read the store makes all of them read it,
   * and there is no second path to keep in step.
   *
   * SUPER_ADMIN never reaches the store: resolvePermissions() returns all
   * every permission for it without a query. That is what makes the matrix safe to edit —
   * whatever an operator does to the ADMIN and MANAGER rows, the person who
   * can fix it still has the screen that fixes it.
   */
  const permissions = await permissionsFor(role)

  /*
   * No permissions means no panel, for the same reason as above: a role
   * configured to nothing must not still be able to load /admin and find an
   * empty shell. It has to 404 like any other URL they may not have.
   */
  if (permissions.length === 0) return null

  return {
    userId: session.userId,
    email: session.email,
    role,
    permissions,
    can: (permission) => permissions.includes(permission),
    canSuperAdminOnly: (capability) => canSuperAdminOnly(role, capability),
  }
})

/**
 * The set in force for a role.
 *
 * FAILS CLOSED, with one exception that is not an exception. A database that
 * cannot be read yields null-as-in-error, and an ADMIN or MANAGER is refused
 * rather than handed the defaults — falling back would silently re-grant a
 * permission an operator had deliberately revoked, which is the one outcome a
 * permission screen must never produce.
 *
 * SUPER_ADMIN is unaffected because it never gets here with a query, so the
 * break-glass route survives a broken database exactly as it survives a broken
 * promotion UI.
 *
 * A MISSING ROW is different from a failed read and is handled inside
 * resolvePermissions(): no row means nobody has configured the role, so the
 * defaults apply and first deploy behaves as it always did.
 */
async function permissionsFor(role: PlatformRole): Promise<readonly Permission[]> {
  if (role === 'SUPER_ADMIN') return resolvePermissions(role, null)
  if (!isDatabaseConfigured()) return resolvePermissions(role, null)

  try {
    return resolvePermissions(role, await readStoredPermissions(role))
  } catch (error) {
    logFailure(error, { path: 'admin/access' })
    return []
  }
}

/**
 * Require a permission, or make the route not exist.
 *
 * `notFound()` throws, so this returns AdminAccess on the only path that
 * continues — callers cannot forget to check the result.
 */
export async function requireAdmin(permission: Permission): Promise<AdminAccess> {
  const access = await getAdminAccess()
  if (!access || !access.can(permission)) notFound()
  return access
}
