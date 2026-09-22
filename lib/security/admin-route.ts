/*
 * The Edge half of the admin gate.
 *
 * Pure, and in its own module for the same reason checkCsrf() and cspFor() are:
 * a decision that lives inside middleware.ts cannot be tested without starting
 * a server, so it stops being tested. NO `server-only` MARKER — middleware is
 * a separate Edge bundle that does not set the `react-server` export condition,
 * so that import would throw at module load on every single request (D59b).
 *
 * THIS IS THE WEAKER OF THE TWO CHECKS, on purpose. The Edge runtime cannot
 * reach Postgres — postgres-js is a TCP driver — so this cannot resolve
 * MANAGER, which lives in a column. What it CAN decide without a database:
 *
 *   - demo mode has no platform administrators at all, because getSession()
 *     there returns one fixed session shared by everyone who can reach the
 *     deployment;
 *   - nobody is signed in, if no Supabase cookie was sent.
 *
 * That covers every anonymous probe and the whole of demo mode. `reachable:
 * true` means "carry on to the real check", NEVER "allowed": the cookie is not
 * validated here. Anyone can forge a cookie NAME. What they cannot forge is
 * getUser() agreeing with it, and that happens in domain/admin/access.ts, which
 * is authoritative and runs regardless of what this returned.
 */

export interface AdminRouteInput {
  pathname: string
  /** AUTH_MODE=live. Read by the caller so this stays a pure function. */
  liveAuth: boolean
  cookieNames: readonly string[]
}

export interface AdminRouteVerdict {
  /** Is this an /admin URL at all? */
  matched: boolean
  /** May it proceed to the authoritative check? False means 404, not 403. */
  reachable: boolean
}

/**
 * Does this path belong to the operator panel?
 *
 * The exact match and the trailing slash are both needed, and the trailing
 * slash is what keeps `/administrators` or `/admin-tools` — routes nobody has
 * written yet — from being swallowed by a prefix test.
 */
function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

export function checkAdminRoute(input: AdminRouteInput): AdminRouteVerdict {
  if (!isAdminPath(input.pathname)) return { matched: false, reachable: true }
  if (!input.liveAuth) return { matched: true, reachable: false }
  return {
    matched: true,
    reachable: input.cookieNames.some((name) => name.startsWith('sb-')),
  }
}
