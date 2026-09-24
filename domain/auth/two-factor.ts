/*
 * Who must have a second factor, and what each screen is allowed to say.
 *
 * Pure: no database, no `server-only`, no React, no Supabase. The gate, the
 * enrollment screen, the seller's settings page and the unit tests all read
 * the rule from here, so "operators must" is one sentence in one place rather
 * than an `if` repeated in four.
 */

import type { PlatformRole } from '@/domain/admin/roles'

/**
 * Is a second factor REQUIRED for this platform role?
 *
 * ── THE TABLE ─────────────────────────────────────────────────────────────
 *
 *   SUPER_ADMIN  required
 *   ADMIN        required
 *   MANAGER      required
 *   USER         optional, from their own settings
 *
 * MANAGER IS IN THE REQUIRED LIST DELIBERATELY. It is the weakest operator
 * role and the easiest to obtain — a promoted seller, granted in-app by a
 * super admin — which makes it the obvious account to go after. A rule that
 * required 2FA of the two roles that live in environment variables and not of
 * the one that is handed out through a web form would protect the accounts
 * that were already hardest to reach.
 *
 * NO GRACE PERIOD. There is no "required after N days" branch, because the
 * only thing a grace period changes is which day the requirement can be
 * ignored on. An operator without a second factor is stopped now, and the
 * enrollment screen is one redirect away.
 */
export function requiresTwoFactor(role: PlatformRole): boolean {
  return role !== 'USER'
}

/**
 * Where an operator is sent when the requirement is not met.
 *
 * TWO DESTINATIONS, NOT ONE, because the two questions in lib/auth/mfa.ts have
 * two different remedies. Someone who has never enrolled needs the setup
 * screen; someone enrolled on an aal1 session needs to type a code. Sending
 * both to the same place would show a QR code to a person who already has one
 * scanned, and the natural reading of that screen — "set up two-factor
 * authentication" — would invite them to enroll a second time.
 */
export const TWO_FACTOR_SETUP_PATH = '/two-factor'
export const TWO_FACTOR_VERIFY_PATH = '/two-factor/verify'

/**
 * The remedy for a posture, or null when there is nothing to fix.
 *
 * Takes the two booleans rather than the whole posture so it stays callable
 * from a unit test with no Supabase anywhere near it.
 */
export function twoFactorRemedy(posture: {
  enrolled: boolean
  satisfied: boolean
}): string | null {
  if (posture.satisfied) return null
  return posture.enrolled ? TWO_FACTOR_VERIFY_PATH : TWO_FACTOR_SETUP_PATH
}

export type Tone = 'info' | 'warn' | 'danger'

export interface TwoFactorOutcome {
  tone: Tone
  title: string
  detail: string
}

/*
 * The closed map every two-factor screen renders from.
 *
 * Same rule as domain/auth/outcomes.ts and for the same reason: the raw text
 * comes from Supabase, and echoing a provider string onto one of these screens
 * would make an upstream wording change into our copy. An outcome with no copy
 * does not compile; a provider message has nowhere to be shown.
 */
export const TWO_FACTOR_OUTCOMES = {
  wrong_code: {
    tone: 'danger',
    title: 'That code is not correct',
    /*
     * Names the clock, because a wrong code is far more often a phone whose
     * time has drifted than a typo, and "check the six digits again" sends
     * someone into a loop that cannot end.
     */
    detail:
      'Codes change every 30 seconds — make sure you are reading the current one. If it keeps failing, check that your phone’s clock is set automatically; a drifting clock produces codes this server will never accept.',
  },
  wrong_recovery_code: {
    tone: 'danger',
    title: 'That recovery code is not correct',
    detail:
      'Each code works once. If you have already used this one it will not work again — try the next unused code from your list.',
  },
  enrolled: {
    tone: 'info',
    title: 'Two-factor authentication is on',
    detail: 'Your authenticator app is now required whenever you sign in.',
  },
  disabled: {
    tone: 'info',
    title: 'Two-factor authentication is off',
    detail:
      'Your password is now the only thing protecting this account. You can turn it back on at any time.',
  },
  codes_regenerated: {
    tone: 'info',
    title: 'New recovery codes issued',
    detail: 'Your previous codes stopped working the moment these were created.',
  },
  required: {
    tone: 'warn',
    title: 'Operator accounts need two-factor authentication',
    detail:
      'This is not optional and there is no grace period. Set it up here and the operator console opens straight away.',
  },
  step_up: {
    tone: 'warn',
    title: 'Enter your authenticator code',
    detail:
      'You are signed in, but this session has not used your second factor yet. The operator console needs it.',
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
  recovery_unsupported: {
    tone: 'warn',
    title: 'Recovery codes are not available on this project',
    /*
     * Honest rather than silent. Recovery codes are a newer GoTrue feature and
     * a project on an older version answers 404 to the endpoint. Enrollment
     * still completes — the authenticator works — and this says plainly what
     * the account does not have, because an operator who believes they hold
     * ten codes they were never shown is worse off than one who knows.
     */
    detail:
      'Your authenticator is enrolled and working. This Supabase project does not offer recovery codes yet, so a lost phone means a manual intervention in the Supabase dashboard. Nothing else is affected.',
  },
  session_expired: {
    tone: 'warn',
    title: 'That took too long',
    detail: 'Start again from the beginning. Nothing was changed.',
  },
} as const

export type TwoFactorOutcomeKey = keyof typeof TWO_FACTOR_OUTCOMES

/** Narrow an arbitrary query value against the closed map. */
export function twoFactorOutcome(key: string | undefined): TwoFactorOutcome | null {
  if (!key) return null
  const found = (TWO_FACTOR_OUTCOMES as Record<string, TwoFactorOutcome>)[key]
  return found ?? null
}

/**
 * The number of recovery codes to ask Supabase for.
 *
 * Ten is the figure every comparable product settles on, and the reason is
 * arithmetic rather than fashion: it has to be enough to survive a lost phone
 * plus the handful of codes people burn testing that they work, and small
 * enough to be written on one piece of paper.
 */
export const RECOVERY_CODE_COUNT = 10

/**
 * NOBODY CAN RESET SOMEBODY ELSE'S SECOND FACTOR, and this string says so on
 * the screen.
 *
 * Deliberately absent: an operator tool that clears another operator's factor.
 * An ADMIN who could do that could enroll their own phone against a MANAGER's
 * account and then sign in as them — which returns the product to "a stolen
 * password is enough" while displaying a 2FA badge. The role that would need
 * such a tool is the same role the tool would be used against.
 *
 * So the recovery path is a recovery code, or someone with Supabase dashboard
 * access removing the factor by hand. Written on the screen because a person
 * locked out will otherwise wait for a button that is never coming, and will
 * ask an admin who will go looking for one.
 */
export const NO_OPERATOR_RESET_NOTICE =
  'No one at EtsyPilot can reset this for you — not an admin, not support. That is deliberate: anyone who could reset your second factor could sign in as you. If you lose your phone, use a recovery code. If you have lost those too, recovery needs someone with Supabase dashboard access to remove the factor by hand.'
