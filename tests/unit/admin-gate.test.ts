import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkAdminRoute } from '@/lib/security/admin-route'

/*
 * THE GATE, as opposed to the role model.
 *
 * admin-roles.test.ts asks "what role is this person?". This file asks the
 * question that actually decides whether anything is exposed: "does /admin
 * exist for this request?". Two independent answers have to agree that it does
 * not, and they are tested separately because they fail separately — the Edge
 * check cannot see MANAGER, and the Node check does not run on a request the
 * Edge check already refused.
 */

/* ───────────────────────────── the Edge half ───────────────────────────── */

const SB = ['sb-access-token', 'sb-refresh-token']

describe('the Edge check: what middleware can decide without a database', () => {
  it('404s every /admin path when AUTH_MODE is not live', () => {
    /*
     * The single most important line in this file. With AUTH_MODE unset,
     * getSession() returns one FIXED demo session shared by everyone who can
     * reach the deployment. If /admin were reachable there, the operator panel
     * would be open to the entire internet.
     */
    for (const pathname of ['/admin', '/admin/users', '/admin/users/deep/path']) {
      const verdict = checkAdminRoute({ pathname, liveAuth: false, cookieNames: SB })
      expect(verdict.matched, pathname).toBe(true)
      expect(verdict.reachable, pathname).toBe(false)
    }
  })

  it('404s a signed-out visitor even when auth is live', () => {
    expect(checkAdminRoute({ pathname: '/admin', liveAuth: true, cookieNames: [] }).reachable).toBe(
      false,
    )
    expect(
      checkAdminRoute({
        pathname: '/admin/users',
        liveAuth: true,
        cookieNames: ['theme', 'NEXT_LOCALE'],
      }).reachable,
    ).toBe(false)
  })

  it('lets a signed-in request through to the real check, which is not the same as allowing it', () => {
    const verdict = checkAdminRoute({ pathname: '/admin/users', liveAuth: true, cookieNames: SB })
    expect(verdict).toEqual({ matched: true, reachable: true })
  })

  it('does not claim a cookie name proves anything', () => {
    /*
     * Anyone can set a cookie called sb-anything. This check is deliberately
     * satisfied by that, and it is why it is not the only check: the cookie is
     * never validated here, only counted.
     */
    expect(
      checkAdminRoute({ pathname: '/admin', liveAuth: true, cookieNames: ['sb-'] }).reachable,
    ).toBe(true)
  })

  it('leaves every non-admin path completely alone', () => {
    for (const pathname of ['/', '/dashboard', '/settings', '/api/export', '/login']) {
      expect(checkAdminRoute({ pathname, liveAuth: false, cookieNames: [] }), pathname).toEqual({
        matched: false,
        reachable: true,
      })
    }
  })

  it('matches on a path segment, not a prefix', () => {
    /*
     * `startsWith('/admin')` alone would swallow /administrators — a route
     * nobody has written, but the next person to write one would find it 404ing
     * with no clue why.
     */
    for (const pathname of ['/administrators', '/admin-tools', '/adminx']) {
      expect(
        checkAdminRoute({ pathname, liveAuth: false, cookieNames: [] }).matched,
        pathname,
      ).toBe(false)
    }
  })
})

/* ───────────────────────────── the Node half ───────────────────────────── */

/*
 * getSession() and the database are both mocked, because what is being tested
 * is the DECISION, not Supabase and not Postgres. The mock returns whatever the
 * test sets, which is the only way to ask "what happens for a signed-in seller
 * who is not an administrator?" without creating one.
 */
const session = vi.hoisted(() => ({
  current: null as null | { userId: string; email: string; isDemo: boolean },
}))
const db = vi.hoisted(() => ({ configured: false, storedRole: null as string | null }))
const auth = vi.hoisted(() => ({ live: true }))
const notFoundCalls = vi.hoisted(() => ({ count: 0 }))

vi.mock('@/lib/auth', () => ({ getSession: async () => session.current }))
vi.mock('@/lib/db', () => ({ isDatabaseConfigured: () => db.configured }))
vi.mock('@/lib/auth/supabase-config', () => ({ isLiveAuth: () => auth.live }))
vi.mock('@/lib/repositories/admin-reads-every-shop', () => ({
  adminReadStoredPlatformRole: async () => db.storedRole,
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    notFoundCalls.count += 1
    // The real notFound() throws, and requireAdmin() depends on that: it is
    // what makes "forgot to check the return value" impossible.
    throw new Error('NEXT_NOT_FOUND')
  },
}))

const { getAdminAccess, requireAdmin } = await import('@/domain/admin/access')

const ENV = { superAdmin: process.env.SUPER_ADMIN_EMAILS, admin: process.env.ADMIN_EMAILS }

beforeEach(() => {
  session.current = null
  db.configured = false
  db.storedRole = null
  auth.live = true
  notFoundCalls.count = 0
  delete process.env.SUPER_ADMIN_EMAILS
  delete process.env.ADMIN_EMAILS
})

afterEach(() => {
  if (ENV.superAdmin === undefined) delete process.env.SUPER_ADMIN_EMAILS
  else process.env.SUPER_ADMIN_EMAILS = ENV.superAdmin
  if (ENV.admin === undefined) delete process.env.ADMIN_EMAILS
  else process.env.ADMIN_EMAILS = ENV.admin
})

describe('the Node check: a non-admin gets 404 from /admin', () => {
  it('refuses a signed-out visitor', async () => {
    session.current = null
    expect(await getAdminAccess()).toBeNull()
  })

  it('refuses a signed-in seller who is not on any list', async () => {
    session.current = { userId: 'u1', email: 'seller@x.com', isDemo: false }
    process.env.SUPER_ADMIN_EMAILS = 'boss@etsypilot.app'
    expect(await getAdminAccess()).toBeNull()
  })

  it('refuses the demo session even when a DATABASE_URL is present', async () => {
    /*
     * The hole this replaced. The refusal used to read
     *
     *     session.isDemo && !isDatabaseConfigured()
     *
     * so setting DATABASE_URL while AUTH_MODE stayed unset let the FIXED demo
     * session — the one shared by everyone who can reach the deployment —
     * through to role resolution. Only middleware stood in the way, and the
     * whole argument for a second check is that middleware is not the only way
     * a route is reached.
     *
     * The condition that is actually meant is "is this the fixed demo
     * session", which is AUTH_MODE, not a connection string.
     */
    auth.live = false
    db.configured = true
    process.env.SUPER_ADMIN_EMAILS = 'salman@willowandfern.com'
    session.current = { userId: 'demo', email: 'salman@willowandfern.com', isDemo: true }
    expect(await getAdminAccess()).toBeNull()
  })

  it('does NOT lock out a real operator whose shop is flagged demo', async () => {
    /*
     * The other direction, and the reason the old condition was not simply
     * tightened to `session.isDemo`. Live auth on the demo catalogue is the
     * state .env.example describes as the one the product is actually in:
     * real people signing in while shop data is still Willow & Fern. Their
     * SHOP being a demo shop says nothing about their PLATFORM role.
     */
    auth.live = true
    db.configured = true
    process.env.SUPER_ADMIN_EMAILS = 'boss@etsypilot.app'
    session.current = { userId: 'u9', email: 'boss@etsypilot.app', isDemo: true }
    expect((await getAdminAccess())?.role).toBe('SUPER_ADMIN')
  })

  it('refuses the DEMO session outright, whatever the email says', async () => {
    auth.live = false
    /*
     * Belt and braces with the Edge check, and not redundant: middleware is not
     * the only way a route can be reached. If someone set SUPER_ADMIN_EMAILS to
     * the demo address, the fixed shared session would otherwise resolve to an
     * administrator.
     */
    process.env.SUPER_ADMIN_EMAILS = 'salman@willowandfern.com'
    session.current = { userId: 'demo', email: 'salman@willowandfern.com', isDemo: true }
    expect(await getAdminAccess()).toBeNull()
  })

  it('throws notFound() rather than returning, so a caller cannot ignore it', async () => {
    session.current = { userId: 'u1', email: 'seller@x.com', isDemo: false }
    await expect(requireAdmin('users.view')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundCalls.count).toBe(1)
  })

  it('404s a real administrator who lacks the specific permission', async () => {
    // MANAGER holds users.view and nothing else. Being an operator is not the
    // same as being allowed on every operator screen.
    db.configured = true
    db.storedRole = 'MANAGER'
    session.current = { userId: 'u2', email: 'manager@x.com', isDemo: false }

    const access = await getAdminAccess()
    expect(access?.role).toBe('MANAGER')
    await expect(requireAdmin('subscriptions.view')).rejects.toThrow('NEXT_NOT_FOUND')
    await expect(requireAdmin('users.view')).resolves.toMatchObject({ role: 'MANAGER' })
  })

  it('admits an administrator named in the environment', async () => {
    process.env.ADMIN_EMAILS = 'ops@etsypilot.app'
    session.current = { userId: 'u3', email: 'ops@etsypilot.app', isDemo: false }

    const access = await getAdminAccess()
    expect(access?.role).toBe('ADMIN')
    expect(access?.can('users.view')).toBe(true)
    // ADMIN is an administrator and still cannot touch the two that matter.
    expect(access?.canSuperAdminOnly('roles.write')).toBe(false)
    expect(access?.canSuperAdminOnly('audit.view')).toBe(false)
  })

  it('gives roles.write and audit.view to SUPER_ADMIN alone', async () => {
    process.env.SUPER_ADMIN_EMAILS = 'boss@etsypilot.app'
    session.current = { userId: 'u4', email: 'boss@etsypilot.app', isDemo: false }
    const access = await getAdminAccess()
    expect(access?.canSuperAdminOnly('roles.write')).toBe(true)
    expect(access?.canSuperAdminOnly('audit.view')).toBe(true)
  })

  it('does not consult the database when none is configured', async () => {
    /*
     * The break-glass path: env alone must still get someone in, so a database
     * that is down or absent cannot lock out every administrator.
     */
    db.configured = false
    db.storedRole = 'MANAGER' // would grant, if it were read
    process.env.SUPER_ADMIN_EMAILS = 'boss@etsypilot.app'

    session.current = { userId: 'u5', email: 'manager@x.com', isDemo: false }
    expect(await getAdminAccess()).toBeNull() // the column was never read

    session.current = { userId: 'u6', email: 'boss@etsypilot.app', isDemo: false }
    expect((await getAdminAccess())?.role).toBe('SUPER_ADMIN')
  })
})
