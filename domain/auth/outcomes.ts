/*
 * What the sign-in and sign-up screens are allowed to say.
 *
 * Same shape and same reasoning as CONNECT_OUTCOMES in domain/connect/types.ts:
 * the page renders from a closed map, and the action redirects with a KEY of
 * that map. An outcome with no copy does not compile, and a message with no
 * outcome has nowhere to be shown.
 *
 * The reason it matters more here than there: the raw text comes from Supabase.
 * Echoing a provider's error string onto a signed-out page means an upstream
 * wording change silently becomes our user-facing copy, and it means whatever
 * detail that string happens to carry is published. Neither is something to
 * decide by accident.
 *
 * TWO OF THESE ARE DELIBERATELY VAGUE, and that is a security property rather
 * than sloppy writing — see `invalid` and `signup_conflict` below.
 */

export type Tone = 'info' | 'warn' | 'danger'

export interface AuthOutcome {
  tone: Tone
  title: string
  detail: string
}

export const AUTH_OUTCOMES = {
  invalid: {
    tone: 'danger',
    /*
     * Says "email or password", never which. Naming the wrong one turns this
     * form into an account-existence oracle: an attacker submits an address
     * with a junk password and learns from the wording whether that person has
     * an EtsyPilot account. Supabase returns one error for both cases, and this
     * copy preserves that rather than undoing it.
     */
    title: 'That email and password do not match',
    detail:
      'Check both and try again. If you have forgotten your password, sign up is not the way back in — contact us and we will reset it.',
  },
  unconfirmed: {
    tone: 'warn',
    title: 'Confirm your email first',
    detail:
      'We sent a confirmation link when you signed up. Open it, then sign in here. Nothing is wrong with your account.',
  },
  rate_limited: {
    tone: 'warn',
    title: 'Too many attempts',
    detail:
      'Sign-in is rate limited to slow down guessing. Wait a minute and try again — nothing is locked and your account is unaffected.',
  },
  weak_password: {
    tone: 'warn',
    title: 'That password is too short',
    detail:
      'Use at least eight characters. Length is what makes a password hard to guess, so a long ordinary phrase beats a short complicated one.',
  },
  invalid_email: {
    tone: 'warn',
    title: 'That does not look like an email address',
    detail: 'Check for a typo and try again. Nothing was sent and no account was created.',
  },
  missing_fields: {
    tone: 'warn',
    title: 'Both fields are needed',
    detail: 'Enter an email address and a password. Nothing was submitted.',
  },
  check_email: {
    tone: 'info',
    /*
     * Shown for a successful sign-up AND for an address that is already
     * registered. Supabase distinguishes them; this screen must not, for the
     * same enumeration reason as `invalid`. A real new seller gets a real
     * email; someone probing for accounts learns nothing either way.
     */
    title: 'Check your email',
    detail:
      'If that address can be registered, a confirmation link is on its way. Open it to finish setting up, then sign in.',
  },
  setup_failed: {
    tone: 'danger',
    /*
     * The honest half-success. The Supabase account EXISTS; its shop does not.
     * Saying "sign-up failed" would be a lie that sends people round in circles
     * re-registering an address that is already taken, and saying nothing would
     * leave them to discover it as a redirect loop later.
     *
     * "Sign in to finish" is a promise, so provisioning also runs on sign-in
     * and is idempotent. A recovery instruction that does not actually recover
     * is worse than admitting there is none.
     */
    title: 'Your account was created, but its shop was not',
    detail:
      'The account exists — do not sign up again with that address. Signing in will finish setting it up. If it keeps failing, send us the reference from this page.',
  },
  not_configured: {
    tone: 'danger',
    title: 'Sign-in is not switched on yet',
    detail:
      'This deployment has no authentication provider configured, so no account can be created or signed in to. Nothing was submitted. The demo shop is unaffected.',
  },
  unavailable: {
    tone: 'danger',
    title: 'We could not reach the sign-in service',
    detail:
      'Nothing was submitted and no account was changed. This is on our side, not yours — try again in a moment.',
  },
} as const

export type AuthOutcomeKey = keyof typeof AUTH_OUTCOMES

/** Narrow a query-string value to a key, or null. Never echoes the input. */
export function authOutcome(raw: string | undefined): AuthOutcomeKey | null {
  return raw && raw in AUTH_OUTCOMES ? (raw as AuthOutcomeKey) : null
}

/**
 * Map a Supabase failure onto one of our outcomes.
 *
 * Takes the pieces rather than the error object so this is a pure function that
 * can be tested without constructing a provider error — and so nothing in this
 * module can accidentally hold, log or return the original.
 *
 * Reads `code` first: Supabase's stable machine-readable field. Falls back to
 * the HTTP status, and only then to a lowercased message substring, which is
 * the fragile route and is why every branch below ends at a named outcome
 * instead of passing text through. An unrecognised failure becomes
 * `unavailable` — honest about being our problem, and carrying no detail we
 * did not write.
 */
export function outcomeForAuthError(error: {
  code?: string
  status?: number
  message?: string
}): AuthOutcomeKey {
  const code = error.code ?? ''
  const message = (error.message ?? '').toLowerCase()

  if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
    return 'invalid'
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return 'unconfirmed'
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'rate_limited'
  }
  if (code === 'weak_password' || message.includes('password should be at least')) {
    return 'weak_password'
  }
  if (code === 'validation_failed' || message.includes('unable to validate email')) {
    return 'invalid_email'
  }
  /*
   * An address that already exists. Mapped to the same neutral copy as a
   * successful sign-up rather than to a "that account exists" message, which
   * would be the enumeration leak this file exists to avoid.
   */
  if (code === 'user_already_exists' || message.includes('already registered')) {
    return 'check_email'
  }
  return 'unavailable'
}
