import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

/*
 * `cookies()` throws outside a request scope, and the test runner is not one.
 *
 * Mocked to an empty jar, which is the honest stand-in for "a visitor with no
 * session cookie": the demo branch never looks at it, and the live branch is
 * asserted on its source rather than by pretending to hold a real token.
 */
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], get: () => undefined, set: () => {} }),
}))

const { getSession } = await import('@/lib/auth')
const { DEMO_ACTOR_ID, DEMO_SHOP_ID } = await import('@/lib/etsy/demo-dataset')

/*
 * getSession() now reads a real Supabase session. These cover the two things
 * that would be worst to get wrong, neither of which needs a Supabase project
 * or a database to check.
 *
 *   1. The demo path still works when AUTH_MODE is unset. The whole suite and
 *      every browser check depend on it, and the flag has to be reversible.
 *   2. The live path uses getUser(), takes isDemo from the shop, and never
 *      reaches for the service-role key.
 */

const ORIGINAL = process.env.AUTH_MODE

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AUTH_MODE
  else process.env.AUTH_MODE = ORIGINAL
})

describe('the demo session survives the flag', () => {
  it('returns the fixed demo session when AUTH_MODE is unset', async () => {
    delete process.env.AUTH_MODE
    const session = await getSession()
    expect(session).toEqual({
      userId: DEMO_ACTOR_ID,
      email: 'salman@willowandfern.com',
      name: 'Salman R.',
      shopId: DEMO_SHOP_ID,
      isDemo: true,
    })
  })

  it('returns it for "mock" and for any value that is not exactly "live"', async () => {
    // Fails toward demo. A typo must not half-enable real authentication.
    for (const value of ['mock', 'LIVE', 'Live', 'true', '']) {
      process.env.AUTH_MODE = value
      expect((await getSession())?.shopId, value).toBe(DEMO_SHOP_ID)
    }
  })

  it('refuses rather than falling back when live is half-configured', async () => {
    /*
     * AUTH_MODE=live with no Supabase project and no database. Returning the
     * demo session here would be the worst outcome available: someone who
     * asked for real accounts would silently get a fabricated one, and every
     * seller would share it.
     */
    process.env.AUTH_MODE = 'live'
    expect(await getSession()).toBeNull()
  })
})

/*
 * Source-level checks, because the alternative is a live Supabase project in CI.
 * Comments are stripped first (D59c): this module DISCUSSES getSession vs
 * getUser at length, and a promise never to call X contains X.
 */
describe('the live path is wired the way it has to be', () => {
  const source = readFileSync('lib/auth/index.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('revalidates the token instead of trusting the cookie', () => {
    /*
     * getUser() asks Supabase whether the token is still good. getSession()
     * decodes whatever the browser sent and believes it. One word apart, and
     * the difference is the entire security property.
     */
    expect(source).toContain('supabase.auth.getUser()')
    expect(source).not.toContain('supabase.auth.getSession()')
  })

  it('never reads the service-role key', () => {
    // It bypasses row-level security. A session read runs as the signed-in
    // user or it is not a session read.
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('takes isDemo from the shop row, never from the auth mode', () => {
    /*
     * isDemo drives the demo banner, the D11 provenance override and readOnly
     * in shopContext — all statements about the SHOP. Deriving it from how
     * someone signed in would make a connected shop read as demo the moment
     * auth changed.
     */
    expect(source).toMatch(/isDemo:\s*shop\.isDemo/)
    expect(source).not.toMatch(/isDemo:\s*!?isDemoAuth\(\)/)
  })

  it('repairs a shopless account rather than returning null first', () => {
    // /login would render, but /onboarding is not an escape — it calls
    // getShop(session.shopId), the row that is missing.
    expect(source).toContain('provisionAccount')
  })
})

describe('the sign-out route stays a POST', () => {
  const route = readFileSync('app/api/auth/signout/route.ts', 'utf8')

  it('exports POST and not GET', () => {
    // A GET sign-out fires on a link prefetch, a preview unfurl or an <img>
    // on a hostile page. Each would silently end the session.
    expect(route).toMatch(/export async function POST/)
    expect(route).not.toMatch(/export async function GET/)
  })

  it('is what the account menu posts to', () => {
    const menu = readFileSync('components/layout/user-menu.tsx', 'utf8')
    expect(menu).toContain('action="/api/auth/signout" method="post"')
    // Not a link. A link would be a GET.
    expect(menu).not.toMatch(/href=["']\/api\/auth\/signout/)
  })

  it('is reachable without JavaScript', () => {
    // <details>/<summary> opens, closes and takes focus with no hydration, and
    // the sign-out itself is a plain form POST. This is the only way out of
    // the app, so it must work in the least capable case.
    const menu = readFileSync('components/layout/user-menu.tsx', 'utf8')
    expect(menu).toContain('<details')
    expect(menu).toContain('<summary')
    expect(menu).not.toContain("'use client'")
    expect(menu).not.toContain('onClick')
  })
})
