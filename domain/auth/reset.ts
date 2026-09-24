/*
 * Password reset by emailed code — the parts that are decisions rather than
 * plumbing.
 *
 * Pure: no Supabase, no cookies, no React. The actions read the policy from
 * here and the unit tests read it without a server.
 */

import type { Tone } from './two-factor'

/**
 * WHAT EVERY SUBMISSION OF THE FORGOT-PASSWORD FORM SAYS. ALL OF THEM.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   A RESET FORM THAT BEHAVES DIFFERENTLY FOR A REGISTERED ADDRESS IS AN
 *   ORACLE FOR TESTING WHICH SELLERS ARE ON THE PLATFORM.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Someone with a list of Etsy shop owners' email addresses can submit them one
 * at a time and keep the ones that come back different. "We've sent you a
 * code" against "no account found" is the obvious version of that mistake;
 * "Sent!" against a form that just sits there is the same mistake with less
 * text. So there is ONE string, it is conditional in its own wording — "if
 * that email is registered" — and it is returned whatever happened.
 *
 * The wording has to carry the conditional, because a flat "we've sent a code"
 * to someone with no account is a lie that sends them to check an inbox
 * nothing is coming to.
 */
export const RESET_SENT_TITLE = 'If that email is registered, we’ve sent a code'
export const RESET_SENT_DETAIL =
  'Check your inbox for a six-digit code. It expires shortly, so use it soon. Nothing here tells you whether an account exists — that is deliberate.'

/**
 * The floor on how long a forgot-password submission takes, in milliseconds.
 *
 * SAME WORDS IS ONLY HALF OF IT. Supabase does real work for a registered
 * address — generating a token and handing it to a mailer — and returns
 * quickly for one it does not recognise. Identical copy delivered in 40ms
 * versus 600ms is the same oracle, read off a stopwatch instead of the screen.
 *
 * So every submission is padded out to at least this long. It is not a
 * constant-time algorithm and does not claim to be: it removes the difference
 * that is trivially observable from a browser's network tab, which is the
 * difference that matters here. Anything above the floor is left alone rather
 * than truncated, because cutting a slow response short would leak in the
 * other direction.
 *
 * 900ms is comfortably above the variation measured between the two paths and
 * low enough that the form does not feel broken.
 */
export const RESET_TIMING_FLOOR_MS = 900

/**
 * How long the flow holds on to the address between the two forms.
 *
 * THIS IS AN EMAIL ADDRESS, NOT A CODE, and the distinction is the whole
 * reason the cookie is acceptable. The person typed it into the previous
 * screen one moment ago; it is carried so the second screen does not have to
 * ask for it again, and so it does not have to travel in a query string that
 * lands in an access log.
 *
 * NOTHING ABOUT THE CODE IS STORED ANYWHERE BY THIS PRODUCT. Supabase holds
 * it, with its own expiry and its own single-use handling, and
 * `verifyOtp({ type: 'recovery' })` is the only thing that ever checks one. A
 * table of ours would be a second copy of a password-reset token for every
 * account in it, and a readable one — row-level security on this project was
 * disabled and exploitable within the last week — is a password reset for
 * everybody at once.
 */
export const RESET_EMAIL_COOKIE = 'ep-reset-email'
export const RESET_EMAIL_TTL_SECONDS = 15 * 60

export interface ResetOutcome {
  tone: Tone
  title: string
  detail: string
}

/*
 * The closed map both reset screens render from. Same rule as every other
 * outcome map in this codebase: a Supabase error string never becomes our
 * copy, and an outcome with no copy does not compile.
 */
export const RESET_OUTCOMES = {
  sent: {
    tone: 'info',
    title: RESET_SENT_TITLE,
    detail: RESET_SENT_DETAIL,
  },
  wrong_code: {
    tone: 'danger',
    /*
     * The exact sentence the brief asked for. It is also the honest one: this
     * screen cannot tell a mistyped code from an expired one from a code for
     * an address that has no account, and inventing a distinction it does not
     * have would either be wrong or would restore the oracle.
     */
    title: 'That code is not correct',
    detail:
      'Check the six digits and try again. Codes expire, so if this one has been sitting in your inbox for a while, ask for a new one.',
  },
  missing_email: {
    tone: 'warn',
    title: 'Start again from the beginning',
    detail: 'We no longer have the address this code belongs to. Nothing was changed.',
  },
  mismatch: {
    tone: 'warn',
    title: 'Those two passwords do not match',
    detail: 'Type the new password twice, identically. Nothing was changed.',
  },
  weak_password: {
    tone: 'warn',
    title: 'That password is too short',
    detail:
      'Use at least eight characters. Length is what makes a password hard to guess, so a long ordinary phrase beats a short complicated one.',
  },
  needs_second_factor: {
    tone: 'warn',
    /*
     * The one rule that makes this whole flow safe to have. Without it,
     * control of an inbox is control of the operator console and Part 1
     * achieves nothing — an attacker who can read email resets the password,
     * signs in, and the authenticator is never consulted.
     */
    title: 'Your authenticator is still needed',
    detail:
      'Resetting a password does not skip two-factor authentication. Enter a code from your app, then set the new password.',
  },
  rate_limited: {
    tone: 'warn',
    title: 'Too many attempts',
    detail: 'Wait a minute and try again. Nothing is locked and your account is unaffected.',
  },
  not_configured: {
    tone: 'danger',
    title: 'Authentication is not configured',
    detail: 'This deployment has no Supabase project set. Nothing was changed.',
  },
  unavailable: {
    tone: 'danger',
    title: 'We could not reach the authentication service',
    detail: 'Nothing was changed. Try again in a moment.',
  },
  done: {
    tone: 'info',
    title: 'Your password has been changed',
    detail:
      'Every other session for this account has been signed out. If someone else had your old password, they no longer have a way in.',
  },
} as const

export type ResetOutcomeKey = keyof typeof RESET_OUTCOMES

export function resetOutcome(key: string | undefined): ResetOutcome | null {
  if (!key) return null
  const found = (RESET_OUTCOMES as Record<string, ResetOutcome>)[key]
  return found ?? null
}

/** The same minimum the sign-up form enforces, read from one place. */
export const MIN_PASSWORD_LENGTH = 8

export type NewPasswordProblem = 'mismatch' | 'weak_password' | null

/**
 * Check a new password pair.
 *
 * Order matters: a mismatch is reported before a length failure, because when
 * both are true the person almost certainly mistyped the confirmation and
 * telling them the password is short sends them to fix the wrong field.
 */
export function checkNewPassword(password: string, confirm: string): NewPasswordProblem {
  if (password !== confirm) return 'mismatch'
  if (password.length < MIN_PASSWORD_LENGTH) return 'weak_password'
  return null
}
