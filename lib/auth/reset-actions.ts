'use server'

/*
 * Password reset by emailed six-digit code.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THERE IS NO TABLE OF RESET CODES, AND THERE IS NO NEED FOR ONE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The instinct is to generate a code, store it with an expiry, and compare on
 * the way back. Supabase already does all three. `resetPasswordForEmail()`
 * mints a recovery token and `verifyOtp({ type: 'recovery' })` checks it, with
 * the provider handling expiry and single use. The only thing that turns it
 * from a link into a code is the EMAIL TEMPLATE: a template containing
 * `{{ .Token }}` emits the six digits instead of `{{ .ConfirmationURL }}`.
 * That is a dashboard setting, not code — see docs/DATABASE-AND-AUTH-SETUP.md.
 *
 * So a table of ours would be a second copy of a live password-reset token for
 * every account in it. Row-level security on this project was disabled and
 * exploitable within the last week; a readable table of reset codes is a
 * password reset for everybody in it, at once. And a six-digit code is a
 * million possibilities — hashing it barely slows an offline guess, so the
 * protections that actually matter are expiry, an attempt cap and a rate
 * limit, all of which live at the provider and none of which would be improved
 * by keeping a copy here.
 *
 * ── THE TWO PROPERTIES THAT ARE EASY TO LOSE ─────────────────────────────
 *
 * ENUMERATION. Every submission of the first form answers the same way, in the
 * same words, after the same minimum time. See domain/auth/reset.ts.
 *
 * 2FA IS NOT BYPASSED. An account with a verified factor must clear it before
 * the new password takes effect. Without that, control of an inbox is control
 * of the operator console and the whole of Part 1 is decoration — an attacker
 * reading email would reset the password, sign in, and never meet the
 * authenticator. The check is in completeReset(), where the write happens, not
 * only on the page that draws the form.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from './supabase'
import { supabaseCredentials } from './supabase-config'
import { getMfaPosture } from './mfa'
import { logFailure } from '@/lib/errors/api'
import { TWO_FACTOR_VERIFY_PATH } from '@/domain/auth/two-factor'
import {
  RESET_EMAIL_COOKIE,
  RESET_EMAIL_TTL_SECONDS,
  RESET_TIMING_FLOOR_MS,
  checkNewPassword,
  type ResetOutcomeKey,
} from '@/domain/auth/reset'

const FORGOT_PATH = '/forgot-password'
const CODE_PATH = '/reset-password'
const NEW_PASSWORD_PATH = '/reset-password/new'

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

async function client() {
  return createSupabaseServerClient(await actionCookies())
}

function back(path: string, outcome: ResetOutcomeKey): never {
  redirect(`${path}?outcome=${outcome}`)
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

/** Pad a fast path out so it cannot be told from a slow one on a stopwatch. */
async function holdUntilFloor(startedAt: number): Promise<void> {
  const elapsed = Date.now() - startedAt
  if (elapsed >= RESET_TIMING_FLOOR_MS) return
  await new Promise((resolve) => setTimeout(resolve, RESET_TIMING_FLOOR_MS - elapsed))
}

/**
 * Step 1: ask for a code.
 *
 * NOTE WHAT IS NOT HERE: no branch on whether the account exists, because this
 * function never finds out. `resetPasswordForEmail` does not report it, and
 * nothing here goes looking — a `select … from users where email = …` before
 * the call would reintroduce the oracle this whole design is built around, and
 * it would do it in our own database rather than at the provider.
 *
 * NO `redirectTo`, AND THAT IS THE POINT ABOUT DOMAINS. The link-based flow
 * needs one, and a hard-coded host is exactly what the brief forbids. The code
 * flow needs none: the email carries `{{ .Token }}` and the person types it
 * here. So there is no site URL in this file, no environment variable to set
 * for it, and nothing to change when a domain arrives.
 */
export async function requestReset(form: FormData): Promise<void> {
  const startedAt = Date.now()
  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase()

  if (!supabaseCredentials()) {
    await holdUntilFloor(startedAt)
    back(FORGOT_PATH, 'not_configured')
  }

  /*
   * An empty or obviously malformed address gets the SAME answer as a valid
   * one, after the same delay. A "that is not an email address" branch here
   * would be harmless on its own, but it is the first of the special cases
   * that end with the form reporting which addresses are real.
   */
  if (email.includes('@')) {
    try {
      const supabase = await client()
      await supabase.auth.resetPasswordForEmail(email)
    } catch (error) {
      /*
       * SWALLOWED ON PURPOSE, and this is the uncomfortable one. Reporting a
       * provider failure here would mean the form sometimes answers
       * differently — and "sometimes" is all an enumeration attack needs. It
       * is logged with a reference, so an outage is visible to us and silent
       * to the form.
       */
      logFailure(error, { path: 'auth/reset/request' })
    }
  }

  /*
   * The address is carried forward so the next screen need not ask again.
   * Set for every submission, including addresses that have no account —
   * otherwise the presence of the cookie is itself the answer.
   */
  const jar = await cookies()
  jar.set(RESET_EMAIL_COOKIE, email, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: RESET_EMAIL_TTL_SECONDS,
  })

  await holdUntilFloor(startedAt)
  redirect(`${CODE_PATH}?outcome=sent`)
}

/**
 * Step 2: check the code.
 *
 * On success Supabase returns a session, which actionCookies() writes back.
 * That session is how step 3 knows who is setting a password — there is no
 * token of ours passed between the screens, and nothing to forge.
 */
export async function verifyResetCode(form: FormData): Promise<void> {
  if (!supabaseCredentials()) back(CODE_PATH, 'not_configured')

  const token = String(form.get('code') ?? '').replace(/\s+/g, '')
  const jar = await cookies()
  const email = jar.get(RESET_EMAIL_COOKIE)?.value ?? ''
  if (!email) back(FORGOT_PATH, 'missing_email')
  if (!token) back(CODE_PATH, 'wrong_code')

  try {
    const supabase = await client()
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' })
    if (error) {
      const status = error.status ?? 0
      if (status === 429) back(CODE_PATH, 'rate_limited')
      /*
       * Every other credential failure is one message. A wrong code, an
       * expired code and a code for an address with no account are
       * indistinguishable here — deliberately, because distinguishing them is
       * the oracle again, arriving one screen later than the obvious place.
       */
      if (status >= 400 && status < 500) back(CODE_PATH, 'wrong_code')
      logFailure(error, { path: 'auth/reset/verify' })
      back(CODE_PATH, 'unavailable')
    }
  } catch (error) {
    if (isRedirect(error)) throw error
    logFailure(error, { path: 'auth/reset/verify' })
    back(CODE_PATH, 'unavailable')
  }

  redirect(NEW_PASSWORD_PATH)
}

/**
 * Step 3: set the new password.
 *
 * ── THE 2FA CHECK IS HERE, WHERE THE WRITE IS ────────────────────────────
 *
 * Not on the page that renders the form. A server action is a public endpoint
 * with a generated id; whatever the page chose to draw, this can be posted to
 * directly. So the rule "a reset does not bypass two-factor authentication"
 * has to be enforced at the only place that changes the password.
 *
 * It sends the caller to the ordinary code screen with `next` pointing back
 * here, so an operator resetting a password meets exactly the same
 * authenticator prompt they meet everywhere else — one implementation, not a
 * second one written for this flow.
 */
export async function completeReset(form: FormData): Promise<void> {
  if (!supabaseCredentials()) back(NEW_PASSWORD_PATH, 'not_configured')

  const password = String(form.get('password') ?? '')
  const confirm = String(form.get('confirm') ?? '')
  const problem = checkNewPassword(password, confirm)
  if (problem) back(NEW_PASSWORD_PATH, problem)

  /*
   * Read BEFORE the write, and fail closed. `enrolled && !satisfied` is an
   * account that has a second factor on a session that has not used it — the
   * exact state an inbox-only attacker would be in.
   */
  const posture = await getMfaPosture()
  if (posture.enrolled && !posture.satisfied) {
    redirect(`${TWO_FACTOR_VERIFY_PATH}?next=${encodeURIComponent(NEW_PASSWORD_PATH)}&outcome=step_up`)
  }

  try {
    const supabase = await client()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      const status = error.status ?? 0
      if (status === 422 || status === 400) back(NEW_PASSWORD_PATH, 'weak_password')
      if (status === 401 || status === 403) back(CODE_PATH, 'wrong_code')
      logFailure(error, { path: 'auth/reset/complete' })
      back(NEW_PASSWORD_PATH, 'unavailable')
    }

    /*
     * ── END EVERY OTHER SESSION ─────────────────────────────────────────
     *
     * `scope: 'others'`, and each of the three scopes is wrong in its own way
     * here, so the choice is spelled out rather than left to the default:
     *
     *   'global'  revokes THIS session too, so the person who just proved
     *             who they are is thrown back to the sign-in form holding a
     *             password they have not used yet.
     *   'local'   revokes only this one — the opposite of what is wanted, and
     *             the default in some call shapes.
     *   'others'  every session except this one. A reset usually means the old
     *             password is compromised; whoever had it is signed in
     *             somewhere, and leaving them there makes the reset cosmetic.
     */
    await supabase.auth.signOut({ scope: 'others' })
  } catch (error) {
    if (isRedirect(error)) throw error
    logFailure(error, { path: 'auth/reset/complete' })
    back(NEW_PASSWORD_PATH, 'unavailable')
  }

  // The address is no longer needed; leaving it would mean a stale reset
  // cookie outliving the reset it belonged to.
  const jar = await cookies()
  jar.delete(RESET_EMAIL_COOKIE)

  redirect('/dashboard?outcome=password_changed')
}
