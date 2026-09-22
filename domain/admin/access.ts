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

import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { isLiveAuth } from '@/lib/auth/supabase-config'
import { isDatabaseConfigured } from '@/lib/db'
import { logFailure } from '@/lib/errors/api'
import { adminReadStoredPlatformRole } from '@/lib/repositories/admin-reads-every-shop'
import {
  can,
  canSuperAdminOnly,
  hasAnyAdminAccess,
  resolvePlatformRole,
  ROLE_PERMISSIONS,
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
 * The only two callers today both turn it into a 404.
 */
export async function getAdminAccess(): Promise<AdminAccess | null> {
  const session = await getSession()
  if (!session) return null

  /*
   * Demo mode has no platform administrators, by construction.
   *
   * With AUTH_MODE unset, getSession() returns a FIXED session shared by
   * everyone who can reach the deployment. If that session could resolve to an
   * administrator, the operator panel would be open to anybody who could load
   * the site. Refused here outright, before any email is compared.
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
   * the session's provenance. What matters is whether getSession() returned
   * the fixed session, and it returns that exactly when AUTH_MODE is not live.
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
  if (!hasAnyAdminAccess(role)) return null

  return {
    userId: session.userId,
    email: session.email,
    role,
    permissions: ROLE_PERMISSIONS[role],
    can: (permission) => can(role, permission),
    canSuperAdminOnly: (capability) => canSuperAdminOnly(role, capability),
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
