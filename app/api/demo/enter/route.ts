import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { PUBLIC_DEMO_COOKIE } from '@/lib/auth'
import { AUTH_COOKIE_OPTIONS } from '@/lib/auth/supabase-config'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE DOOR INTO THE PUBLIC DEMO. NO ACCOUNT, NO EMAIL, NO PASSWORD.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Sets one flag cookie and redirects. The cookie's VALUE is never read — see
 * lib/auth/index.ts — so there is nothing in it to forge and nothing it can
 * say about who the visitor is. Everything the demo session grants is decided
 * from constants in that file: a fixture's shop id, an actor id that is not a
 * user, and `isDemo: true`, which is what makes assertCanWrite() refuse.
 *
 * ── GET, AND THAT IS DELIBERATE, UNLIKE SIGN-OUT ──────────────────────────
 *
 * app/api/auth/signout/route.ts is POST-only because a GET sign-out can be
 * triggered by a link prefetch or a hostile image tag, and each of those would
 * end a seller's session. The inverse is not true here: the worst a forged GET
 * to this route can do is show somebody a fictional shop. It grants nothing,
 * ends nothing and reveals nothing, so a plain link is the right affordance
 * for a "look around" button on a marketing page.
 *
 * It cannot affect a signed-in seller either. getSession() resolves a real
 * Supabase user first and only consults this cookie when there is none, so for
 * anyone with an account the cookie is inert.
 */
export async function GET(request: Request): Promise<Response> {
  const jar = await cookies()
  jar.set(PUBLIC_DEMO_COOKIE, '1', {
    ...AUTH_COOKIE_OPTIONS,
    /*
     * Four hours. Long enough to read all 36 screens, short enough that a
     * shared machine does not keep serving a demo to the next person — and
     * short enough that a visitor who later signs up is not carrying it
     * around. It is inert for a signed-in seller either way; this is tidiness,
     * not a control.
     */
    maxAge: 60 * 60 * 4,
  })
  /*
   * ── WHERE TO LAND, AND WHY IT IS NOT WHATEVER THE URL SAYS ─────────────
   *
   * The landing page links straight into a named screen ("Open in the demo →"
   * beside Shop Pulse), so the door takes a destination. It takes only the
   * PATH of it, resolved against this request's own origin, so an absolute or
   * cross-origin `?to=` cannot send anybody off-site — `new URL(x, base)`
   * keeps the origin of `base` and only `pathname` survives.
   *
   * And only a path inside the dashboard: a visitor has no account, so
   * /settings/billing or /onboarding would be a dead end, and an open redirect
   * into /api/... would let this route be used to reach something else.
   */
  const requested = new URL(request.url).searchParams.get('to') ?? '/dashboard'
  const path = safeDestination(requested)
  return NextResponse.redirect(new URL(path, request.url), 303)
}

/** A dashboard path, or the dashboard. Never an absolute URL, never /api. */
function safeDestination(requested: string): string {
  if (!requested.startsWith('/')) return '/dashboard'
  if (requested.startsWith('//')) return '/dashboard'
  const path = requested.split('?')[0]?.split('#')[0] ?? '/dashboard'
  if (path.startsWith('/api/') || path.startsWith('/admin')) return '/dashboard'
  return path
}
