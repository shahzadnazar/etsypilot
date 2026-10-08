import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { PUBLIC_DEMO_ACTOR_ID, PUBLIC_DEMO_COOKIE } from '@/lib/auth/public-demo-actor'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import { isPublicVisitor } from '@/domain/public-demo'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   A VISITOR WITH NO ACCOUNT. WHAT THEY MAY SEE, AND WHAT THEY MAY NOT DO.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The landing page invites anybody to click into Willow & Fern with no
 * account, no email and no signup. That is the most persuasive thing this
 * project owns and it is also the only door in the product that opens for
 * someone who has not identified themselves, so it gets the strictest guard.
 *
 * Two properties, and they are not the same property:
 *
 *   A public visitor can never NAME a real shop. Their session's shopId is a
 *   fixture constant, and shopContext() throws crossShop for anything else —
 *   so there is no URL, parameter or cookie that produces a context for
 *   somebody's real catalogue.
 *
 *   A public visitor can never WRITE. Two gates, because one does not cover
 *   it: assertCanWrite refuses a read-only shop, and assertNotPublicVisitor
 *   refuses an anonymous actor on the three paths that are deliberately open
 *   to a read-only demo SELLER.
 *
 * tests/integration/public-demo.int.ts asserts the database half against a
 * real Postgres: no row of a real shop is read, and no row is written.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('the two identities cannot be confused', () => {
  it('gives a visitor an actor id that is not the demo seller', () => {
    /*
     * Salman R. is a person in the fixture: the demo shop's owner and the name
     * on its audit records. If a visitor acted as him, a refused write in the
     * log would name a person who was not there.
     */
    expect(PUBLIC_DEMO_ACTOR_ID).not.toBe(DEMO_ACTOR_ID)
    expect(isPublicVisitor({ shopId: DEMO_SHOP_ID, actorId: PUBLIC_DEMO_ACTOR_ID, readOnly: true })).toBe(true)
    expect(isPublicVisitor({ shopId: DEMO_SHOP_ID, actorId: DEMO_ACTOR_ID, readOnly: true })).toBe(false)
  })

  it('and the visitor is never provisioned a user row', () => {
    /*
     * Nothing may create `public-demo-visitor` in `users`. Every foreign key
     * to that table then rejects it, which is a wall a code change cannot
     * accidentally remove.
     */
    const provisioning = code('domain/auth/provision.ts')
    expect(provisioning).not.toContain(PUBLIC_DEMO_ACTOR_ID)
    const everywhere = [...walk('domain'), ...walk('lib'), ...walk('app')]
      .filter((f) => /insert\s*\(\s*schema\.users/.test(code(f)))
      .filter((f) => code(f).includes(PUBLIC_DEMO_ACTOR_ID))
    expect(everywhere, 'something writes a users row for the public visitor').toEqual([])
  })

  it('resolves a real signed-in user before it ever looks at the cookie', () => {
    /*
     * ORDER IS THE WHOLE PROPERTY. If the cookie were consulted first, anybody
     * could demote a signed-in seller to a demo visitor — or, read the other
     * way, a stale cookie would silently change what a seller is shown.
     *
     * Asserted on the source because the alternative is booting Supabase. The
     * cookie read must appear AFTER the getUser() failure branch opens.
     */
    const auth = code('lib/auth/index.ts')
    const getUser = auth.indexOf('supabase.auth.getUser()')
    const cookieRead = auth.indexOf(`jar.get(${'PUBLIC_DEMO_COOKIE'})`)
    expect(getUser, 'getUser is not called').toBeGreaterThan(-1)
    expect(cookieRead, 'the demo cookie is never read').toBeGreaterThan(-1)
    expect(cookieRead, 'the demo cookie is read before the real user').toBeGreaterThan(getUser)
  })

  it('and the cookie carries nothing that could be forged into authority', () => {
    /*
     * The flag is checked for presence and its value is never read, so there
     * is no payload to tamper with. Everything the session grants is a
     * constant in lib/auth/index.ts.
     */
    const auth = code('lib/auth/index.ts')
    expect(auth).toMatch(/jar\.get\(PUBLIC_DEMO_COOKIE\)/)
    expect(auth, 'the cookie value is parsed, so it carries authority').not.toMatch(
      /jar\.get\(PUBLIC_DEMO_COOKIE\)[?!]?\.value/,
    )
    expect(PUBLIC_DEMO_COOKIE).toBe('ep_public_demo')
  })
})

describe('every mutation reaches a write gate', () => {
  /**
   * Routes that mutate and are deliberately not shop writes.
   *
   * Each is here with a reason, not for convenience — an allowlist whose
   * entries are unexplained is a list that grows.
   */
  const NOT_SHOP_WRITES: Record<string, string> = {
    'app/api/auth/signout/route.ts':
      'Ends a session. A public visitor has none to end, and the worst case is ' +
      'that they are sent to /login.',
    'app/api/billing/webhook/route.ts':
      'Called by the payment provider, not by a browser. It has no session and ' +
      'no ShopContext, and is authenticated by signature.',
    'app/api/waitlist/route.ts':
      'Pre-account data: a waitlist row has no shop and no user, so there is no ' +
      'ShopContext to gate and shop scoping is unavailable by construction. What ' +
      'protects it instead is that the table has no read path at all — see ' +
      'lib/repositories/waitlist.ts — so the form cannot be used to ask whether ' +
      'an address is on the list, and RLS is on it (migration 0014).',
  }

  const GATES = ['assertCanWrite', 'assertNotPublicVisitor', 'assertBillingWritable']

  const mutating = walk('app/api').filter((file) =>
    /export async function (POST|PUT|PATCH|DELETE)/.test(readFileSync(file, 'utf8')),
  )

  it('has mutating routes for the sweep to check', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(mutating.length).toBeGreaterThan(5)
  })

  it('so a form a visitor can submit cannot reach a write unguarded', () => {
    /*
     * The gate may be in the route or in the domain function it calls — the
     * domain is the better place and most of these use it — so the sweep
     * follows one hop into `domain/`. What it refuses to accept is a mutation
     * with no gate anywhere on the path.
     */
    const domainSource = walk('domain').map((f) => ({ file: f, text: code(f) }))

    const offenders: string[] = []
    for (const route of mutating) {
      if (route in NOT_SHOP_WRITES) continue
      const text = code(route)
      if (GATES.some((gate) => text.includes(gate))) continue

      // Does something it calls from domain/ hold a gate?
      const callsGuarded = domainSource.some(
        ({ file, text: domainText }) =>
          GATES.some((gate) => domainText.includes(gate)) &&
          [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@\/domain\/([^']+)'/g)].some(
            ([, , mod]) => file.startsWith(`domain/${mod}`),
          ),
      )
      if (!callsGuarded) offenders.push(route)
    }

    expect(offenders, 'a mutating route reaches no write gate').toEqual([])
  })

  it('and the demo door itself grants nothing', () => {
    /*
     * Not in the allowlist above because it is a GET and the sweep only sees
     * mutating methods — which is exactly why it needs its own assertion. The
     * route sets one flag cookie and nothing else; if it ever started writing
     * a row, choosing a shop id or reading a parameter, that is the moment an
     * anonymous visitor acquires state.
     */
    const enter = code('app/api/demo/enter/route.ts')
    expect(enter).toMatch(/jar\.set\(PUBLIC_DEMO_COOKIE/)
    expect(enter, 'the demo door writes to the database').not.toMatch(/getDb|schema\./)
    expect(enter, 'the demo door reads a form body').not.toMatch(/formData/)
    /*
     * It DOES read one parameter — `?to=`, so "Open in the demo →" beside Shop
     * Pulse lands on Shop Pulse. That is a destination, not authority, and it
     * is laundered: only the path survives, it is resolved against this
     * request's own origin, and /api and /admin are refused. The guard checks
     * the laundering rather than banning the parameter, because banning it
     * would have been satisfied by a link that simply went somewhere useless.
     */
    expect(enter).toMatch(/safeDestination/)
    expect(enter, 'a destination is used without being checked').not.toMatch(
      /redirect\(new URL\(requested/,
    )
    expect(code('app/api/demo/exit/route.ts'), 'the exit does more than delete a cookie').not.toMatch(
      /getDb|schema\./,
    )
  })

  it('and every allowlisted route says why it is exempt', () => {
    for (const [route, why] of Object.entries(NOT_SHOP_WRITES)) {
      expect(mutating, `${route} is allowlisted but is not a mutating route`).toContain(route)
      expect(why.length, `${route} has no reason recorded`).toBeGreaterThan(60)
    }
  })
})

describe('the operator console is unreachable without an account', () => {
  it('404s anyone with no Supabase cookie, before any page renders', async () => {
    const { checkAdminRoute } = await import('@/lib/security/admin-route')

    /*
     * A public visitor carries `ep_public_demo` and nothing else. The Edge
     * gate admits only a request with an `sb-` cookie, and admitting means
     * "proceed to the authoritative check" rather than "allowed".
     */
    const visitor = checkAdminRoute({
      pathname: '/admin',
      liveAuth: true,
      cookieNames: [PUBLIC_DEMO_COOKIE],
    })
    expect(visitor).toEqual({ matched: true, reachable: false })

    // Every /admin path, not just the root.
    for (const path of ['/admin', '/admin/accounts', '/admin/etsy-health']) {
      expect(
        checkAdminRoute({ pathname: path, liveAuth: true, cookieNames: [PUBLIC_DEMO_COOKIE] })
          .reachable,
        `${path} was reachable`,
      ).toBe(false)
    }

    // The positive control: a signed-in cookie gets as far as the real check.
    expect(
      checkAdminRoute({ pathname: '/admin', liveAuth: true, cookieNames: ['sb-access-token'] })
        .reachable,
    ).toBe(true)
  })
})
