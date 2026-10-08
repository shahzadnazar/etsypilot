/*
 * Authentication abstraction.
 *
 * Supabase Auth is the chosen provider (architecture.md section 2) but nothing
 * above this module knows that. In demo mode a fixed session is returned so the
 * whole product is reachable with no credentials configured.
 *
 * Authorization is NOT delegated to the provider - see lib/permissions.
 */

import { cache } from 'react'
import { cookies } from 'next/headers'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import { provisionAccount } from '@/domain/auth/provision'
import { isDatabaseConfigured } from '@/lib/db'
import { logFailure } from '@/lib/errors/api'
import { readOnlyAccountStore, withAccountStore, type ShopRow } from '@/lib/repositories/accounts'
import { markPublicDemoRequest } from '@/lib/demo-request'
import { PUBLIC_DEMO_ACTOR_ID, PUBLIC_DEMO_COOKIE } from './public-demo-actor'
import { createSupabaseServerClient } from './supabase'
import { supabaseCredentials } from './supabase-config'

/**
 * Is authentication still the fixed demo session?
 *
 * AUTH_MODE, not ETSY_MODE. These answer different questions — "is a real
 * person signed in" and "where does Etsy data come from" — and one flag cannot
 * express the state we are actually in: real sellers signing in while the shop
 * data stays the demo catalogue, because the Etsy key has not arrived. Under
 * one flag, turning auth on would have silently switched the Etsy adapter to
 * live and broken every screen.
 *
 * Read from the environment rather than by importing isDemoMode from
 * '@/lib/etsy'. That import looks tidier and is the exact mistake D59b records:
 * it drags LiveEtsyService, and with it node:crypto, into any bundle that
 * touches auth — which the Edge runtime cannot load. Auth has no reason to know
 * an Etsy adapter exists.
 *
 * Not exported. Nothing outside this module should branch on how auth is
 * configured; callers branch on whether getSession() returned a session.
 */
function isDemoAuth(): boolean {
  return process.env.AUTH_MODE !== 'live'
}

/**
 * Who is asking.
 *
 * ── TWO KINDS, AND THE DIFFERENCE IS NOT COSMETIC ─────────────────────────
 *
 *   SELLER       somebody with an account. Either a real signed-in user, or —
 *                on a deployment with AUTH_MODE unset — the fixed demo seller
 *                this product has always returned.
 *   PUBLIC_DEMO  nobody. A visitor who clicked "See the live demo" on the
 *                landing page: no account, no email, no password, and no row
 *                anywhere in the database.
 *
 * The kind is on the session rather than inferred, because every inference
 * available is wrong somewhere. `isDemo` is `shops.is_demo` and is true for a
 * real seller who has not connected Etsy yet. An empty `userId` would be a
 * sentinel nobody checks. A missing cookie cannot be asked about downstream.
 */
export type SessionKind = 'SELLER' | 'PUBLIC_DEMO'

export interface Session {
  userId: string
  email: string
  /** The name this account told us, or null when it has not told us one. */
  name: string | null
  /** The shop this request operates on. Single-shop in MVP (D20). */
  shopId: string
  isDemo: boolean
  kind: SessionKind
}

const DEMO_SESSION: Session = {
  userId: DEMO_ACTOR_ID,
  email: 'salman@willowandfern.com',
  name: 'Salman R.',
  shopId: DEMO_SHOP_ID,
  isDemo: true,
  kind: 'SELLER',
}

/**
 * The cookie that says "this browser clicked into the public demo".
 *
 * It carries no identity and grants no authority. Everything it unlocks is
 * decided here, from constants in this file: a fixed shop id that belongs to a
 * fixture, a read-only flag, and an actor id that is not a user.
 *
 * `httpOnly` so page JavaScript cannot read or set it, `sameSite: 'lax'` so it
 * is not sent on cross-site POSTs, and no `secure` in development only.
 */
export { PUBLIC_DEMO_COOKIE, PUBLIC_DEMO_ACTOR_ID } from './public-demo-actor'

/**
 * The actor id a public visitor acts as. DELIBERATELY NOT DEMO_ACTOR_ID.
 *
 * Salman R. is a person in the fixture — the demo shop's owner, the name on
 * its audit records. A public visitor is not him and must not be recorded as
 * him: if an anonymous visitor's refused write ever reaches a log, the log has
 * to say an anonymous visitor did it. Separate ids make that true by
 * construction rather than by anybody remembering.
 *
 * It is also not a `users` row. Nothing provisions it and nothing may: every
 * foreign key to `users` would reject it, which is one more wall between a
 * visitor and a write.
 */


/**
 * A visitor with no account, pinned to the fixture and read-only.
 *
 * `shopId` is the fixture's id and `shopContext()` throws crossShop for any
 * other, so a public session cannot produce a context for a real shop even if
 * a URL asked it to. `isDemo: true` is what makes `assertCanWrite()` refuse —
 * the same gate the demo seller has always had, reached by the same path.
 */
const PUBLIC_DEMO_SESSION: Session = {
  userId: PUBLIC_DEMO_ACTOR_ID,
  email: '',
  name: null,
  shopId: DEMO_SHOP_ID,
  isDemo: true,
  kind: 'PUBLIC_DEMO',
}

/** True for a session that belongs to nobody. Read by the chrome and the gates. */
export function isPublicDemo(session: Session | null): boolean {
  return session?.kind === 'PUBLIC_DEMO'
}

/**
 * The stored name, or null. NEVER ANYTHING DERIVED FROM THE ADDRESS.
 *
 * This used to return the local part of the email when `users.name` was null,
 * and the argument for it was that the value is the seller's own text rather
 * than something invented. What that missed is how it reads. An account with
 * no name saw:
 *
 *     Good morning, malikfarhanjamal7229
 *
 * which is not a name, is not what that person is called, and for a great many
 * addresses is a string nobody would want greeting them on their own screen —
 * a childhood nickname, a birth year, a former surname, a number. The product
 * had not been told a name; the honest thing is to act like it.
 *
 * So the type is `string | null` now, and null travels all the way to the
 * screens. Each one says what it means by it: the greeting drops the comma and
 * the name, the account menu shows the address it was already showing, and the
 * profile form offers an empty field to fill rather than a pre-filled guess it
 * would have saved on the next submit.
 *
 * The AVATAR is a separate question and still falls back to the address, which
 * is not a contradiction: two letters in a circle is a swatch, not a claim
 * about what someone is called, and the alternative is a blank circle.
 */
function storedName(user: { name: string | null; email: string }): string | null {
  return user.name?.trim() || null
}

/**
 * Find this account's shop, provisioning one if it somehow has none.
 *
 * A signed-in user with no shop is the one state that cannot be allowed to
 * reach the layout. Returning null for it would redirect to /login while the
 * cookie is still valid, and /onboarding is not an escape either — it calls
 * getShop(session.shopId), so it needs the very row that is missing.
 *
 * So it is REPAIRED rather than reported. Provisioning is idempotent and
 * already runs on sign-up and sign-in, which makes this the third caller of one
 * function rather than a new path with its own rules. It costs one extra write
 * attempt exactly once, for an account that should never have existed in this
 * state.
 */
async function resolveShop(userId: string, email: string): Promise<ShopRow | null> {
  const store = readOnlyAccountStore()
  const existing = await store.findShopByOwnerId(userId)
  if (existing) return existing

  try {
    await withAccountStore((tx) => provisionAccount(tx, { userId, email }))
  } catch (error) {
    // Logged, never surfaced. The caller decides what a shopless session means.
    logFailure(error, { path: 'getSession/provision' })
    return null
  }
  return store.findShopByOwnerId(userId)
}

/**
 * Read the signed-in session, or null when signed out.
 *
 * `cache()` wraps this because the body now makes NETWORK CALLS: one to
 * Supabase to revalidate the token and one or two to Postgres. The dashboard
 * layout calls getSession(), and so does nearly every page inside it, so an
 * uncached read would repeat that work several times per page view. React's
 * cache is per-request, so this dedupes within one render and never across
 * users — the distinction that matters, since the thing being cached is who is
 * asking.
 */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  /*
   * The `cookies()` read is not decoration and it is not a trick. A session is
   * per-request by definition, so a page whose content depends on WHO is asking
   * cannot be prerendered — and touching the request's cookies is how Next is
   * told that. Without it, demo mode returned a constant session, every
   * dashboard page was prerendered at build time, and the shell went on showing
   * the plan it had been built with after the seller changed it: /billing said
   * "412 / 2,000" while /dashboard said "412 / 200".
   *
   * Doing it here rather than sprinkling `export const dynamic` across the
   * pages means the property holds for every page that exists today AND every
   * page added later, without anyone remembering (D47).
   */
  const jar = await cookies()
  if (isDemoAuth()) return DEMO_SESSION

  /*
   * Live auth with nothing configured is a misconfiguration, not a signed-out
   * visitor. Returning null would send every seller to a sign-in form that
   * cannot work; saying so in the log and refusing is more useful than a
   * silent redirect nobody can diagnose.
   */
  if (!supabaseCredentials() || !isDatabaseConfigured()) {
    logFailure(
      new Error('AUTH_MODE=live needs both Supabase credentials and DATABASE_URL'),
      { path: 'getSession' },
    )
    return null
  }

  const supabase = createSupabaseServerClient({
    getAll: () => jar.getAll().map((c) => ({ name: c.name, value: c.value })),
    /*
     * A no-op, and correct rather than lazy: a Server Component cannot set a
     * cookie. Rotated tokens are written by the middleware refresh, which runs
     * on every request and CAN write to the response.
     */
    setAll: () => {},
  })

  /*
   * getUser(), never getSession().
   *
   * getUser revalidates the token with Supabase. getSession decodes whatever
   * cookie the browser supplied and believes it — which is precisely the thing
   * a session check exists to defend against. The names are one word apart and
   * the difference is the whole security property.
   */
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   NOBODY IS SIGNED IN. THE ONLY OTHER THING THIS REQUEST MAY BE IS A
     *   PUBLIC DEMO VISITOR.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Order matters and this is the only place it is decided: a real Supabase
     * user is resolved FIRST and returns above. The demo cookie is consulted
     * only once that has failed, so a signed-in seller who happens to carry
     * the cookie — they clicked the demo before signing up — is a seller, and
     * the cookie is inert for them. There is no combination of cookies that
     * turns a seller into a demo visitor or the reverse.
     *
     * Everything the returned session grants comes from constants in this
     * file. The cookie's VALUE is never read: it is a flag, so there is
     * nothing in it to forge.
     */
    if (jar.get(PUBLIC_DEMO_COOKIE)) {
      /*
       * Tell the rest of the request that the fixture is what it serves. This
       * is the single call site; see lib/demo-request.ts for why it is a
       * request-scoped flag and how it fails closed if it is ever missed.
       */
      markPublicDemoRequest()
      return PUBLIC_DEMO_SESSION
    }
    return null
  }

  const email = data.user.email ?? ''
  const shop = await resolveShop(data.user.id, email)
  if (!shop) {
    /*
     * Signed in, and we could not give them a shop. Null sends them to /login,
     * which renders (it is public, so there is no loop) and whose sign-in
     * attempt runs provisioning again and ends at the `setup_failed` message.
     * A terminating path with an explanation, rather than a silent bounce.
     */
    return null
  }

  const stored = await readOnlyAccountStore().findUserById(data.user.id)
  const user = stored ?? { id: data.user.id, email, name: null }

  return {
    userId: user.id,
    email: user.email || email,
    name: storedName(user),
    shopId: shop.id,
    /*
     * FROM THE SHOP, not from the auth mode.
     *
     * isDemo drives the demo banner, the D11 provenance override and readOnly
     * in shopContext — every one of which is a statement about the SHOP: is
     * this data real, may it be written to Etsy. Deriving it from how someone
     * signed in would make a real connected shop read as demo the moment auth
     * changed, and a demo shop read as real the moment it did not.
     *
     * Every account has a demo shop today, so every live session is still a
     * demo session. That is correct, and stays true until an Etsy connection
     * exists to flip the column.
     */
    isDemo: shop.isDemo,
    kind: 'SELLER',
  }
})

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) {
    const { Errors } = await import('@/lib/errors/types')
    throw Errors.notAuthenticated()
  }
  return session
}
