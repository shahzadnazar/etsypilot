/*
 * Supabase configuration, readable from every runtime.
 *
 * Deliberately separate from lib/auth/supabase.ts, and deliberately NOT marked
 * `server-only`.
 *
 * `server-only` resolves to a module that throws unless the `react-server`
 * export condition is set. Server Components and server actions set it;
 * MIDDLEWARE DOES NOT — it is a separate Edge bundle. So a middleware that
 * imported the server-only factory would throw at import time, on every
 * request, for every route. Same shape as D59b: a module reached from the wrong
 * runtime, which nothing catches until the build or the first request.
 *
 * What lives here is configuration — two env reads and a flag. What lives in
 * the server-only module is the client factory that closes over a cookie jar.
 * Both sides read their credentials from here, so there is one answer to "is
 * auth live and what are its keys", not two that can drift.
 */

/**
 * Is real authentication switched on?
 *
 * AUTH_MODE, never ETSY_MODE (D86). Anything other than 'live' is demo, so an
 * unset or misspelled value fails toward the demo session rather than toward a
 * half-configured live one.
 */
export function isLiveAuth(): boolean {
  return process.env.AUTH_MODE === 'live'
}

export interface SupabaseCredentials {
  url: string
  key: string
}

/**
 * The project URL and anon key, or null when either is missing.
 *
 * Null rather than a throw, because middleware runs on every request and must
 * degrade to "no refresh" rather than taking the whole app down over a missing
 * env var. Callers that genuinely cannot proceed raise their own error with
 * their own wording.
 *
 * SUPABASE_SERVICE_ROLE_KEY is not read here and is not read anywhere.
 *
 * THAT STAYS TRUE NOW THAT THERE IS AN ADMIN SURFACE, which is the version of
 * this note worth keeping. The old wording said the key could only belong on a
 * "deliberate admin path" and that no such path existed — and then one was
 * built, including a write. The operator panel reads across every shop and
 * changes users.platform_role, and it does all of it through the ordinary
 * pooled Postgres connection as the signed-in operator. It has never needed a
 * credential that bypasses row-level security, and the step-up password check
 * uses the ANON key like every other auth call.
 */
export function supabaseCredentials(): SupabaseCredentials | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return { url, key }
}

/**
 * Cookie options for anything this product sets.
 *
 *   httpOnly  script must never read the session cookie
 *   sameSite  'lax', NOT 'strict' — strict drops the cookie on the return leg
 *             of a cross-site redirect, which is exactly how Etsy's OAuth
 *             callback arrives. A session that evaporates on the way back from
 *             Etsy would look like a random sign-out.
 *   secure    in production only, so http://localhost still works
 */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const
