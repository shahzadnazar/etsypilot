'use server'

/*
 * Sign in, sign up, sign out.
 *
 * Server actions rather than route handlers, for one reason that decides it: a
 * Server Component cannot set a cookie, and a server action can. Authentication
 * IS the act of setting a cookie, so the one place in this codebase that must
 * write one is the one place that uses an action.
 *
 * THIS STEP CREATES SUPABASE ACCOUNTS ONLY. getSession() still returns the demo
 * session while AUTH_MODE is unset, and nothing here writes a row to `users` or
 * `shops` — joining a Supabase account to an EtsyPilot shop is the next step.
 * So a successful sign-in today sets a cookie that nothing yet reads. That is
 * the intended half-built state, not an oversight.
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

export async function signIn(form: FormData): Promise<void> {
  const path = '/login' as const
  if (!supabaseCredentials()) back(path, 'not_configured')

  const fields = readCredentials(form)
  if (!fields) back(path, 'missing_fields')

  const supabase = createSupabaseServerClient(await actionCookies())
  const { error } = await supabase.auth.signInWithPassword(fields)
  if (error) back(path, outcomeForAuthError(error))

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
  // Checked before the round trip so the weak-password copy is ours, not a
  // provider string that changes when a project's policy changes.
  if (fields.password.length < 8) back(path, 'weak_password')

  const supabase = createSupabaseServerClient(await actionCookies())
  const { error } = await supabase.auth.signUp(fields)
  if (error) back(path, outcomeForAuthError(error))

  /*
   * Always "check your email", never "account created" — and never a redirect
   * to /dashboard. With email confirmation on, sign-up does NOT produce a
   * session, so sending them to the dashboard would bounce them straight back
   * and look broken. It is also the same copy an already-registered address
   * gets, which is what keeps this form from answering "does this person have
   * an account".
   */
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
