import 'server-only'

/*
 * The Supabase server client.
 *
 * Plumbing only. Nothing calls this yet — getSession() still returns the demo
 * session — and it is committed ahead of the wiring so that the dependency, the
 * cookie contract and the server-only boundary can be reviewed on their own,
 * rather than inside the change that switches authentication on.
 *
 * `server-only` is the load-bearing line. It makes importing this module from a
 * client component a BUILD error rather than a code-review question, which is
 * the same guarantee lib/ai/claude.ts and lib/billing/stripe.ts carry. The anon
 * key is public by design and safe in a browser bundle, but the client built
 * here reads the request's cookies — and a cookie-reading client has no
 * business in code that ships to a browser.
 *
 * @supabase/ssr, not @supabase/auth-helpers-nextjs: the latter is deprecated
 * and predates the App Router's cookie model.
 */

import { createServerClient } from '@supabase/ssr'
import { supabaseCredentials } from './supabase-config'

/**
 * Both key formats this project may be issued.
 *
 * Supabase now issues `sb_publishable_…` / `sb_secret_…` keys instead of the
 * older JWT anon keys. Both work unchanged with @supabase/ssr, because the key
 * is a bearer credential the client forwards — nothing here needs to look
 * inside it.
 *
 * So there is deliberately NO code that decodes it. Reading a `.` -separated
 * payload to pull out an expiry or a role would work today on a JWT key and
 * throw on the newer format, and it would be parsing a credential to learn
 * something the server already knows.
 */
function credentials(): { url: string; key: string } {
  /*
   * Read through supabase-config so middleware and this module cannot disagree
   * about which project they are talking to. That module carries no
   * `server-only` marker precisely so the Edge runtime can reach it.
   */
  const found = supabaseCredentials()

  /*
   * Fail here, named, rather than letting the SDK throw something generic on
   * the first request. This runs only when auth is live: with AUTH_MODE unset,
   * getSession() returns the demo session and never reaches this module.
   *
   * SUPABASE_SERVICE_ROLE_KEY is NOT read here, and must not be. It bypasses
   * row-level security, so the one place it could ever belong is a deliberate
   * server-side admin path — of which this product has none (there is no admin
   * surface at all). A session read runs as the signed-in user or it is not a
   * session read.
   */
  if (!found) {
    throw new Error(
      'AUTH_MODE=live requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Set both in .env.local, or leave AUTH_MODE unset to keep the demo session.',
    )
  }
  return found
}

/** What this module needs from the request's cookie jar. */
export interface CookieAccess {
  getAll(): { name: string; value: string }[]
  /**
   * Persist refreshed auth cookies.
   *
   * A Server Component cannot set cookies, so its caller passes a no-op and
   * lets middleware do the refresh. That is correct rather than lazy: the
   * refreshed token still applies to the current request, it just is not
   * written back from a context the framework forbids writing from.
   */
  setAll(cookies: { name: string; value: string; options?: Record<string, unknown> }[]): void
}

/**
 * Build a request-scoped Supabase client.
 *
 * Request-scoped on purpose — never a module-level singleton. The client closes
 * over one request's cookies, so a shared instance would serve one seller's
 * session to the next, which is the cross-account leak this product's whole
 * permission model exists to prevent.
 *
 * Callers must use `supabase.auth.getUser()`, never `getSession()`: getUser
 * revalidates the token with Supabase, while getSession trusts a cookie the
 * browser handed over — which is the thing being defended against.
 */
export function createSupabaseServerClient(cookies: CookieAccess) {
  const { url, key } = credentials()
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (list) => cookies.setAll(list),
    },
  })
}
