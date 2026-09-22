'use server'

/*
 * Sign in, sign up, sign out.
 *
 * Server actions rather than route handlers, for one reason that decides it: a
 * Server Component cannot set a cookie, and a server action can. Authentication
 * IS the act of setting a cookie, so the one place in this codebase that must
 * write one is the one place that uses an action.
 *
 * WHAT THIS DOES AND DOES NOT DO. Signing up now creates a Supabase account AND
 * provisions our own rows: a `users` row, a demo `shops` row and the
 * `memberships` joining them. What it still does not do is connect any of that
 * to the request — getSession() is untouched and returns the demo session while
 * AUTH_MODE is unset. So a successful sign-in today sets a cookie that nothing
 * yet reads, against rows nothing yet queries. That is the intended half-built
 * state, not an oversight.
 *
 * (This comment used to say nothing here wrote a row, which stopped being true
 * the moment provisioning landed. A file that misdescribes itself is the same
 * defect as a figure that misdescribes its source.)
 *
 * Failures redirect back with an outcome KEY, never a message. The page renders
 * from the closed map in domain/auth/outcomes.ts, so a Supabase wording change
 * cannot become our copy and no provider detail reaches a signed-out page. Same
 * pattern as the OAuth outcomes on Shop connections.
 *
 * Redirecting rather than returning state also means these forms work with no
 * JavaScript. A sign-in screen that needs a hydrated bundle to report a wrong
 * password is a sign-in screen that fails closed on a slow connection.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from './supabase'
import { supabaseCredentials } from './supabase-config'
import { outcomeForAuthError, type AuthOutcomeKey } from '@/domain/auth/outcomes'
import { provisionAccount } from '@/domain/auth/provision'
import { isDatabaseConfigured } from '@/lib/db'
import { logFailure } from '@/lib/errors/api'
import { withAccountStore } from '@/lib/repositories/accounts'

/** Where a failed attempt lands: back on the form, with a reason. */
function back(path: '/login' | '/signup', outcome: AuthOutcomeKey): never {
  redirect(`${path}?outcome=${outcome}`)
}

/**
 * The cookie jar, adapted for @supabase/ssr.
 *
 * A server action CAN write cookies, so `setAll` is real here — unlike the
 * Server Component case, where it has to be a no-op and middleware does the
 * refresh instead.
 *
 * The options Supabase supplies are spread FIRST and ours second, so httpOnly,
 * sameSite and secure cannot be loosened by whatever the library passes.
 */
async function actionCookies() {
  const jar = await cookies()
  return {
    getAll: () => jar.getAll().map((c) => ({ name: c.name, value: c.value })),
    setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
      for (const cookie of list) {
        jar.set(cookie.name, cookie.value, {
          ...cookie.options,
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
        })
      }
    },
  }
}

/** Trim and sanity-check the form fields before any network call. */
function readCredentials(form: FormData): { email: string; password: string } | null {
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')
  if (!email || !password) return null
  return { email, password }
}

/** Longest name the users table and the profile screen both accept. */
const MAX_NAME = 80

/**
 * The name from the sign-up form, validated here and not only in the browser.
 *
 * `required` on the input is a convenience; a form can be posted without one.
 * Server-side is where a rule becomes a rule.
 *
 * REQUIRED, not optional, and the deciding argument is consistency with a rule
 * this product already enforces: saveProfile() REFUSES a blank name, because
 * the audit log must never answer "who did this?" with nothing. Accepting a
 * blank one at sign-up would mean every new account starts in exactly the state
 * the profile screen forbids — and the greeting falls back to the email's local
 * part, which is the defect this change exists to remove.
 */
function readName(form: FormData): string | null {
  const name = String(form.get('name') ?? '').trim()
  if (!name || name.length > MAX_NAME) return null
  return name
}

/**
 * Give this account its user row, demo shop and membership.
 *
 * Returns true when the account is ready. On failure it reports the problem
 * and returns false; the caller decides what the seller sees, because that
 * differs between signing up (half-success) and signing in (already had one).
 *
 * Idempotent all the way down, so calling it on EVERY sign-in is not waste —
 * it is what makes the setup_failed copy's "signing in will finish it" true
 * rather than a hopeful sentence.
 */
async function provisionSignedInAccount(
  supabaseUserId: string,
  email: string,
  path: '/login' | '/signup',
  /** Known at sign-up only. Sign-in must not pass one — see provisionAccount. */
  name?: string,
): Promise<boolean> {
  /*
   * No database means nothing can be provisioned. Reported rather than
   * skipped: an auth account with no shop is precisely the silent partial
   * success this path exists to avoid, and it would surface much later as a
   * redirect loop with nothing pointing back to here.
   */
  if (!isDatabaseConfigured()) {
    logFailure(
      new Error('AUTH provisioning ran with no DATABASE_URL configured'),
      { path },
    )
    return false
  }

  try {
    await withAccountStore((store) =>
      provisionAccount(store, { userId: supabaseUserId, email, ...(name ? { name } : {}) }),
    )
    return true
  } catch (error) {
    // Logged with a reference the seller can quote. The error itself never
    // reaches the page — same rule as every other failure on these screens.
    logFailure(error, { path })
    return false
  }
}

/** Drop a session we are not going to honour, ignoring any failure doing so. */
async function discardSession(): Promise<void> {
  try {
    const supabase = createSupabaseServerClient(await actionCookies())
    await supabase.auth.signOut()
  } catch {
    // Best effort. The seller is being sent back to a form either way.
  }
}

export async function signIn(form: FormData): Promise<void> {
  const path = '/login' as const
  if (!supabaseCredentials()) back(path, 'not_configured')

  const fields = readCredentials(form)
  if (!fields) back(path, 'missing_fields')

  const supabase = createSupabaseServerClient(await actionCookies())
  const { data, error } = await supabase.auth.signInWithPassword(fields)
  if (error) back(path, outcomeForAuthError(error))

  /*
   * Provision on sign-in too, not only sign-up.
   *
   * This is the repair path. A sign-up whose provisioning failed leaves an auth
   * account with no shop, and the setup_failed copy tells that seller to sign
   * in to finish. Because provisioning is idempotent, the ordinary case costs
   * one indexed read by owner and changes nothing.
   */
  if (data.user) {
    const ready = await provisionSignedInAccount(data.user.id, data.user.email ?? fields.email, path)
    if (!ready) {
      await discardSession()
      back(path, 'setup_failed')
    }
  }

  /*
   * Outside the try/catch shape on purpose: redirect() works by throwing, so
   * wrapping these calls in a try would swallow the navigation and report it as
   * an auth failure. Next's own docs call this out; it is an easy bug to write
   * and a confusing one to read back.
   */
  redirect('/dashboard')
}

export async function signUp(form: FormData): Promise<void> {
  const path = '/signup' as const
  if (!supabaseCredentials()) back(path, 'not_configured')

  const fields = readCredentials(form)
  if (!fields) back(path, 'missing_fields')
  const name = readName(form)
  if (!name) back(path, 'missing_name')
  // Checked before the round trip so the weak-password copy is ours, not a
  // provider string that changes when a project's policy changes.
  if (fields.password.length < 8) back(path, 'weak_password')

  const supabase = createSupabaseServerClient(await actionCookies())
  const { data, error } = await supabase.auth.signUp(fields)
  if (error) back(path, outcomeForAuthError(error))

  /*
   * BOTH Supabase configurations have to work, because this project has "Confirm
   * email" off today and will turn it back on before launch.
   *
   *   confirmation OFF  signUp returns a session — the person is signed in this
   *                     instant. Telling them to check their email and leaving
   *                     them on the form reads as a failure, which is what was
   *                     observed.
   *   confirmation ON   signUp returns a user and NO session. Redirecting to
   *                     the dashboard would bounce straight back out.
   *
   * So the response decides, rather than an assumption about the setting.
   *
   * ON THE ENUMERATION PROPERTY, precisely. With confirmation ON it holds: a new
   * address and a registered one both end at check_email, indistinguishable.
   * With confirmation OFF it CANNOT hold, and no code here can restore it — a
   * new address is signed in and lands on the dashboard, a registered one comes
   * back to the form. Signing the new seller in IS the observable difference.
   * That is a consequence of the Supabase setting, not of this branch, and
   * turning confirmation back on restores the property. Said plainly here
   * because a comment claiming a guarantee the code does not provide is worse
   * than no comment.
   */
  if (data.session && data.user) {
    const ready = await provisionSignedInAccount(
      data.user.id,
      data.user.email ?? fields.email,
      path,
      name,
    )
    if (!ready) {
      /*
       * The half-success, handled rather than hidden. Supabase holds an
       * account; we hold no shop for it. The session is discarded so nobody is
       * left half-signed-in in a state the next step would loop on, and the
       * seller is told the account exists and that signing in finishes it —
       * which provisionSignedInAccount() on the sign-in path makes true.
       */
      await discardSession()
      back(path, 'setup_failed')
    }
    redirect('/dashboard')
  }

  // No session: confirmation is on, or the address was already registered.
  // Same copy either way.
  back(path, 'check_email')
}

export async function signOut(): Promise<void> {
  if (supabaseCredentials()) {
    const supabase = createSupabaseServerClient(await actionCookies())
    // Errors are ignored deliberately: the seller asked to be signed out, and
    // failing to reach Supabase must not leave them staring at a form that
    // refuses to let go. The cookies are cleared either way.
    await supabase.auth.signOut()
  }
  redirect('/login')
}
