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
 * A SIGNED-IN SELLER WHO IS NOT AN OPERATOR: same 404 status, NO operator
 * content — no banner, no navigation, no email, no role, no column name,
 * nothing from the account list. The refusal happens during render, and Next
 * wraps a request-time notFound() in its `__next_error__` document shell
 * rather than the root layout. An authenticated seller who compares /admin
 * with a URL nobody wrote can therefore tell that /admin is treated specially.
 * They learn nothing else.
 *
 * ── THAT GAP IS WIDER THAN THIS COMMENT USED TO SAY. RE-MEASURED. ────────
 *
 * It described the difference as a byte count — 8,602 against 9,507, same
 * rendered page. "Same rendered page" is no longer true, and the number is not
 * the tell any more. On Next 16.3.6, `next start`:
 *
 *   signed-in seller, /admin        404    8,088 bytes, <body> EMPTY
 *   any missing URL                 404   10,292 bytes, the 404 page, rendered
 *
 * A request-time notFound() now returns a document with NO server-rendered
 * markup at all. The page travels as an RSC payload in inline scripts and is
 * drawn by the client after hydration. So the two responses are not "the same
 * page at a different size"; one is a page and the other is an empty shell,
 * which anyone can separate with a single curl and no JavaScript.
 *
 * It is also what a refused operator pays: blank for 0.3s on this machine,
 * 7s throttled to slow-3G, 15s on 2G, and blank forever with JavaScript off.
 *
 * ── AND THE REASON IT WAS LEFT OPEN HAS EXPIRED ──────────────────────────
 *
 * The paragraph here used to conclude: closing it means refusing in
 * middleware, middleware runs on the Edge runtime, the Edge cannot read
 * platform_role, therefore a MANAGER cannot be recognised before the response
 * starts — so the only alternatives were dropping the MANAGER role or adding
 * an internal role-resolution endpoint for the Edge to call.
 *
 * MEASURED, because the premise is a fact about Next and facts about Next in
 * this file have expired before. `middleware.ts` does still run on Edge:
 *
 *   middleware.ts   { runtime: "edge",   dbError: "The edge runtime does not
 *                     support Node.js 'net' module." }
 *
 * But `middleware.ts` is deprecated in Next 16 — the build prints the notice
 * on every run — and its replacement is not the same runtime. The same file,
 * renamed `proxy.ts` with its export renamed to `proxy`, and nothing else
 * changed:
 *
 *   proxy.ts        { runtime: "nodejs", node: "22.22.2",
 *                     dbRead: "MANAGER" }
 *
 * Postgres, read from the request path, before a byte of the response. The
 * third option the paragraph above could not see is therefore available: a
 * Node-runtime proxy can resolve platform_role and rewrite a refused /admin
 * request to a path with no route, exactly as it already does for anonymous
 * visitors — which is the ONE case measured as genuinely indistinguishable
 * from a missing URL, and the one case that is fully server-rendered.
 *
 * THAT IS NOT DONE HERE, and the reason is scope rather than doubt: it moves
 * a database read into the request path of every matched request in the
 * seller app, and it needs its own fail-closed argument. Recorded as the open
 * option it now is, so the next person weighing it starts from the measurement
 * rather than from the sentence that used to close the question.
 */

import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { getOperatorIdentity } from '@/lib/auth/operator-identity'
import { getMfaPosture } from '@/lib/auth/mfa'
import { isLiveAuth } from '@/lib/auth/supabase-config'
import { isDatabaseConfigured } from '@/lib/db'
import { logFailure } from '@/lib/errors/api'
import { adminReadStoredPlatformRole } from '@/lib/repositories/admin-reads-every-shop'
import { readStoredPermissions } from '@/lib/repositories/admin-permissions'
import { requiresTwoFactor, twoFactorRemedy } from '@/domain/auth/two-factor'
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
 * A SECOND FACTOR, AND A SESSION THAT ACTUALLY USED IT.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   THE GATE REQUIRES aal2. ENROLLMENT ALONE IS NOT A GATE — IT IS A BADGE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * lib/auth/mfa.ts explains why those are two questions. This is where the
 * second one is spent: an operator who enrolled six months ago and signed in
 * with a password five minutes ago holds an aal1 session, and aal1 does not
 * open the console. If this required `enrolled` instead of `satisfied`, every
 * operator would have set up an authenticator they were never asked for again,
 * and a stolen password would still be enough — which is the whole of what 2FA
 * is bought to prevent.
 *
 * ── IT REDIRECTS, WHERE EVERY OTHER REFUSAL HERE 404s ────────────────────
 *
 * Deliberate, and the ORDER is what makes it safe. requireAdmin() has already
 * established that this caller is an operator before anything below runs. So:
 *
 *   not an operator          404, unchanged, from the caller. Learns nothing.
 *   operator, no factor      redirect to the setup screen
 *   operator, aal1           redirect to the code screen
 *
 * A redirect tells the recipient that /admin exists. That is a disclosure to
 * an operator about a console they are already inside, which is no disclosure
 * at all — and the alternative, 404ing someone who is entitled to be here,
 * would hide the one screen that fixes their problem behind the screen they
 * cannot reach.
 *
 * ── THE ORDERING TRAP, HANDLED HERE RATHER THAN IN A DEPLOY NOTE ─────────
 *
 * Turning this on locks out every operator who has not yet enrolled, including
 * whoever turns it on. If the setup screen lived under /admin, that person
 * would need aal2 to reach the screen that grants them aal2, and the only way
 * out would be an intervention in the Supabase dashboard.
 *
 * So the setup screen is NOT under /admin. It is app/(account)/two-factor,
 * outside this gate entirely, reachable by any signed-in account — and a
 * super admin with no factor can walk to it, enroll, and come back. That is
 * a property of where the route lives, so it cannot be undone by editing this
 * function, and tests/browser/two-factor.py walks it as the first thing it
 * does.
 */
export async function requireOperatorTwoFactor(access: AdminAccess): Promise<void> {
  if (!requiresTwoFactor(access.role)) return

  const posture = await getMfaPosture()
  /*
   * UNRESOLVED IS REFUSED HERE. If Supabase could not be asked, this request
   * cannot show that it used a second factor, and the console is the surface
   * where that has to mean no. twoFactorRemedy() already returns the setup
   * path for the closed posture, so this is a statement of intent rather than
   * a branch — but it is the statement that makes the collapse in
   * lib/auth/mfa.ts safe to have.
   */
  const remedy = twoFactorRemedy(posture)
  if (!remedy) return

  /*
   * The destination carries where they were going, so enrolling lands them on
   * the screen they asked for rather than on the console's front page.
   * mfa-actions.ts refuses anything that is not a single-slash path, because
   * this value reaches a redirect.
   */
  redirect(remedy)
}

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

/**
 * The gate a ROUTE SEGMENT applies, from its layout, above every Suspense
 * boundary below it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   A PAGE'S OWN notFound() CANNOT SET THE STATUS ONCE THE RESPONSE HAS
 *   STARTED STREAMING, AND A loading.tsx MAKES IT START.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `loading.tsx` wraps a segment's PAGE in a Suspense boundary. Next renders
 * everything above that boundary — the shell — and flushes it as soon as it
 * resolves, with the fallback in place. The 200 is on the wire before the page
 * body ever runs, so the page's requireAdmin() throws into a response whose
 * status line has already been sent.
 *
 * MEASURED, as a real MANAGER holding only users.view, against `next start`:
 *
 *   /admin/audit          200   ← has a loading.tsx
 *   /admin/etsy           200   ← has a loading.tsx
 *   /admin/permissions    404   ← has none
 *
 * Eight of nine gated routes answered 200 carrying the operator 404 page. The
 * body was right, which is what let it survive: the only wrong thing was the
 * status line, and nothing that reads a page notices. Everything that reads a
 * STATUS does — which is every scanner and every script, and is the whole
 * reason /admin answers 404 rather than 403.
 *
 * A LAYOUT is part of the shell, so it decides before the flush. This is what
 * each route's layout.tsx calls, and the layout chain is why the route groups
 * exist: `(list)` and `(detail)` are places to hang a gate that wraps ONE page
 * rather than a whole subtree, because /admin/users and /admin/users/<id> do
 * not require the same permission.
 *
 * ── WHAT THE 404 COSTS, AND WHAT IT IS NOT CAUSED BY ────────────────────
 *
 * A request-time notFound() returns `<html id="__next_error__">` with an EMPTY
 * body; the 404 page is delivered as an RSC payload and drawn by the client.
 * It is tempting to blame the layout for that, and a three-way probe on one
 * route, one viewer, one missing permission says otherwise:
 *
 *   page gate, no loading.tsx       404   empty __next_error__ shell
 *   page gate, with loading.tsx     200   fully server-rendered
 *   layout gate, with loading.tsx   404   empty __next_error__ shell
 *
 * The blank body tracks the STATUS, not the position of the gate. It is the
 * price of answering 404 at render time on this version of Next, and
 * /admin/permissions — the one route that was already answering 404 before
 * these layouts existed — was already paying it. Moving the gate up did not
 * introduce it; it extended a correct status, and the cost that came with it,
 * to the other twelve routes.
 *
 * The way out is not a different gate position. It is refusing BEFORE the
 * route renders at all — see the proxy measurement in the header.
 *
 * THE PAGES STILL GATE THEMSELVES. This is not a replacement for that, and a
 * sweep asserts every page keeps its own call: a layout can be deleted, and a
 * page that trusted it would then be open.
 */
export async function requireOperatorRoute(gate: {
  permission: Permission
  /** For the two capabilities that are not delegatable. */
  superAdminOnly?: SuperAdminOnlyCapability
}): Promise<AdminAccess> {
  const access = await requireAdmin(gate.permission)
  if (gate.superAdminOnly && !access.canSuperAdminOnly(gate.superAdminOnly)) notFound()
  return access
}
