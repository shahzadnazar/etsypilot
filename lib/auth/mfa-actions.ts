'use server'

/*
 * Enrolling, verifying and removing a second factor.
 *
 * ── NO SECRET OF OURS, ANYWHERE ───────────────────────────────────────────
 *
 * There is no TOTP secret in this codebase, no recovery-code table, and no
 * column anywhere that says whether an account has 2FA. Every one of those
 * lives in Supabase's own tables and is reached through `supabase.auth.mfa`.
 *
 * That is not merely convenient. A TOTP secret is a password equivalent: it
 * generates every future code. A table of them is a single row away from
 * turning "the attacker has the database" into "the attacker has everybody's
 * second factor", and a second copy of something Supabase already holds is a
 * second thing that can leak, drift or be backed up somewhere nobody is
 * watching. The same argument retires the recovery-code table: auth-js
 * exposes `mfa.recoveryCodes`, so the codes are generated, hashed, counted and
 * consumed at the provider.
 *
 * It also keeps a rule true that a table would have broken. The operator area
 * may write exactly four things (domain/admin/operator-writes.ts), and an
 * operator enrolling their own authenticator writes none of them — the write
 * goes to Supabase, over HTTP, from a route that is not under app/(admin) at
 * all.
 *
 * ── THESE ACTIONS RUN AS THE CALLER, AND ONLY EVER ON THEMSELVES ──────────
 *
 * Every function here uses the request's own cookie jar, so Supabase applies
 * the change to whoever is signed in. There is no `userId` parameter on any of
 * them and no way to pass one. That is the structural half of "nobody can
 * reset somebody else's second factor": the argument through which one
 * operator would name another simply does not exist.
 *
 * ── WHY THE COOKIE JAR IS THE REAL ONE HERE, UNLIKE step-up.ts ────────────
 *
 * lib/auth/step-up.ts goes to great lengths to use an ISOLATED client with no
 * cookie access, because a password check that mints a session would replace
 * the caller's. The opposite is true here and the difference is worth stating
 * so the two files do not look inconsistent: verifying a TOTP code is SUPPOSED
 * to change the session. It is what turns aal1 into aal2, and the new token
 * has to reach the browser or the step-up achieved nothing.
 */

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from './supabase'
import { supabaseCredentials } from './supabase-config'
import { logFailure } from '@/lib/errors/api'
import {
  RECOVERY_CODE_COUNT,
  TWO_FACTOR_SETUP_PATH,
  TWO_FACTOR_VERIFY_PATH,
  type TwoFactorOutcomeKey,
} from '@/domain/auth/two-factor'

/** The factor's label at the provider. One per account, by design. */
const FRIENDLY_NAME = 'Authenticator app'

/**
 * The cookie jar, adapted for @supabase/ssr.
 *
 * A server action can write cookies, so `setAll` is real — and it has to be:
 * a successful `mfa.verify()` returns an aal2 session, and a session that is
 * never written back is a step-up the next request knows nothing about.
 *
 * Supabase's options are spread first and ours second, so httpOnly, sameSite
 * and secure cannot be loosened by whatever the library passes. Same shape as
 * lib/auth/actions.ts, deliberately.
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

async function client() {
  return createSupabaseServerClient(await actionCookies())
}

/** Back to a two-factor screen with an outcome KEY, never a provider message. */
function back(path: string, outcome: TwoFactorOutcomeKey): never {
  redirect(`${path}?outcome=${outcome}`)
}

/** The six digits, with the spaces authenticator apps display. */
function readCode(form: FormData, field = 'code'): string {
  return String(form.get(field) ?? '').replace(/\s+/g, '')
}

export interface EnrollmentOffer {
  factorId: string
  /** An SVG data URI from Supabase. No QR library ships in this app. */
  qrCode: string
  /** The same secret in text, for anyone who cannot scan. */
  secret: string
  uri: string
}

/**
 * Begin enrollment: ask Supabase for a secret and a QR code.
 *
 * NOT AN ACTION THE FORM POSTS TO — the setup page calls it while rendering,
 * because the QR code has to be on the screen before there is anything to
 * submit. It creates an UNVERIFIED factor, which counts for nothing until
 * verifyEnrollment() promotes it.
 *
 * Any factor left unverified by an abandoned attempt is cleared first.
 * Supabase refuses a second enroll() under the same friendly name, so without
 * this the second visit to the setup screen would fail with a duplicate-name
 * error and the person would have no way forward from a screen whose whole
 * job is to move them forward.
 */
export async function beginEnrollment(): Promise<EnrollmentOffer | null> {
  if (!supabaseCredentials()) return null
  const supabase = await client()

  try {
    const { data: userData } = await supabase.auth.getUser()
    for (const factor of userData.user?.factors ?? []) {
      if (factor.factor_type === 'totp' && factor.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: FRIENDLY_NAME,
    })
    if (error || !data) {
      logFailure(error ?? new Error('mfa.enroll returned no data'), { path: 'auth/mfa/enroll' })
      return null
    }
    const totp = (data as { id: string; totp?: { qr_code?: string; secret?: string; uri?: string } })
    if (!totp.totp?.secret) {
      logFailure(new Error('mfa.enroll returned no TOTP secret'), { path: 'auth/mfa/enroll' })
      return null
    }
    return {
      factorId: totp.id,
      qrCode: totp.totp.qr_code ?? '',
      secret: totp.totp.secret,
      uri: totp.totp.uri ?? '',
    }
  } catch (error) {
    logFailure(error, { path: 'auth/mfa/enroll' })
    return null
  }
}

/**
 * Finish enrollment: prove the app is producing codes this server accepts.
 *
 * THE TYPED CODE IS THE POINT OF THIS STEP. Enrolling without it would let
 * someone complete setup having scanned nothing, or having scanned it into an
 * app on a phone whose clock is wrong — and they would find out at the moment
 * they were locked out rather than at the moment they could still fix it.
 *
 * On success Supabase returns an aal2 session, which actionCookies() writes
 * back. So enrolling also satisfies the gate, and the operator who was
 * redirected here lands on the console rather than on another code prompt.
 */
export async function verifyEnrollment(form: FormData): Promise<void> {
  if (!supabaseCredentials()) back(TWO_FACTOR_SETUP_PATH, 'not_configured')
  const factorId = String(form.get('factorId') ?? '')
  const code = readCode(form)
  if (!factorId || !code) back(TWO_FACTOR_SETUP_PATH, 'wrong_code')

  const supabase = await client()
  let generated: string[] | null = null
  let recoveryUnsupported = false

  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) {
      /*
       * A wrong code and an unreachable provider are not the same event and
       * must not read the same. Same rule as step-up.ts: an outage that
       * reported itself as a wrong code would send someone to check their
       * phone's clock over and over while nothing was wrong with it.
       */
      const status = error.status ?? 0
      if (status === 400 || status === 401 || status === 422) {
        back(TWO_FACTOR_SETUP_PATH, 'wrong_code')
      }
      logFailure(error, { path: 'auth/mfa/verify' })
      back(TWO_FACTOR_SETUP_PATH, 'unavailable')
    }

    /*
     * RECOVERY CODES ARE ISSUED HERE, once, immediately after the factor is
     * verified — not on the way in, and not on request later.
     *
     * Not before: codes handed out beside a factor that then failed to verify
     * are codes for a second factor that does not exist. Not later: a person
     * who has just enrolled is the one person guaranteed to be sitting in
     * front of the screen, and "you can generate these any time" is how
     * accounts end up with a second factor and no way past it.
     */
    generated = await issueRecoveryCodes(supabase)
    if (generated === null) recoveryUnsupported = true
  } catch (error) {
    // redirect() throws; rethrow so the navigation is not swallowed as a
    // failure. Next's own docs call this out and it is an easy bug to write.
    if (isRedirect(error)) throw error
    logFailure(error, { path: 'auth/mfa/verify' })
    back(TWO_FACTOR_SETUP_PATH, 'unavailable')
  }

  if (recoveryUnsupported) back(TWO_FACTOR_SETUP_PATH, 'recovery_unsupported')
  /*
   * The codes travel in the redirect's query string, which is the one place
   * they can go without a table of ours. They are shown exactly once by
   * design, so there is nothing to look them up from later.
   *
   * THE COST, STATED: a query string reaches the server's access log and the
   * browser's history. It is bounded — the codes are single-use, ten of them,
   * for one account, and the alternative is storing them somewhere to survive
   * one redirect, which is the table this whole file exists to avoid. The
   * screen tells the person to save them and move on.
   */
  const packed = encodeURIComponent(generated!.join(' '))
  redirect(`${TWO_FACTOR_SETUP_PATH}?outcome=enrolled&codes=${packed}`)
}

/**
 * Ask Supabase for a set of recovery codes.
 *
 * Returns null — NOT an empty array — when the project's GoTrue does not offer
 * the endpoint, so the caller can say that plainly instead of showing an empty
 * list that reads as "you have no codes" when it means "we could not ask".
 * Recovery codes are a newer feature and an older project answers 404.
 */
async function issueRecoveryCodes(
  supabase: Awaited<ReturnType<typeof client>>,
): Promise<string[] | null> {
  const api = (
    supabase.auth.mfa as unknown as {
      recoveryCodes?: {
        generate: (params?: { friendlyName?: string }) => Promise<{
          data: { codes?: string[] } | null
          error: { status?: number } | null
        }>
      }
    }
  ).recoveryCodes
  if (!api) return null

  try {
    const { data, error } = await api.generate({})
    if (error || !data?.codes?.length) {
      if (error) logFailure(error, { path: 'auth/mfa/recovery-codes' })
      return null
    }
    // Trimmed to the documented count rather than trusted blindly; the server
    // decides how many it issues and this screen promises "around ten".
    return data.codes.slice(0, Math.max(RECOVERY_CODE_COUNT, data.codes.length))
  } catch (error) {
    logFailure(error, { path: 'auth/mfa/recovery-codes' })
    return null
  }
}

/**
 * Step up an existing enrollment from aal1 to aal2.
 *
 * The other half of the gate. This is what an operator who is already enrolled
 * does at the start of a session, and it changes nothing about the account —
 * it only proves the person at the keyboard holds the phone.
 */
export async function verifyStepUp(form: FormData): Promise<void> {
  if (!supabaseCredentials()) back(TWO_FACTOR_VERIFY_PATH, 'not_configured')
  const code = readCode(form)
  const next = safeNext(String(form.get('next') ?? ''))
  if (!code) back(TWO_FACTOR_VERIFY_PATH, 'wrong_code')

  const supabase = await client()
  try {
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    if (listError) {
      logFailure(listError, { path: 'auth/mfa/step-up' })
      back(TWO_FACTOR_VERIFY_PATH, 'unavailable')
    }
    const factorId = factors?.totp?.[0]?.id
    // Enrolled is the precondition for being sent here at all; if the factor
    // has gone in the meantime, the setup screen is the honest destination.
    if (!factorId) redirect(TWO_FACTOR_SETUP_PATH)

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) {
      const status = error.status ?? 0
      if (status === 400 || status === 401 || status === 422) {
        back(TWO_FACTOR_VERIFY_PATH, 'wrong_code')
      }
      logFailure(error, { path: 'auth/mfa/step-up' })
      back(TWO_FACTOR_VERIFY_PATH, 'unavailable')
    }
  } catch (error) {
    if (isRedirect(error)) throw error
    logFailure(error, { path: 'auth/mfa/step-up' })
    back(TWO_FACTOR_VERIFY_PATH, 'unavailable')
  }

  redirect(next)
}

/**
 * Spend a recovery code instead of a TOTP code.
 *
 * Single use is enforced at Supabase, not here, which is the point of using
 * the provider's primitive: there is no counter of ours to get wrong and no
 * window in which two requests could both spend the same code.
 */
export async function verifyRecoveryCode(form: FormData): Promise<void> {
  if (!supabaseCredentials()) back(TWO_FACTOR_VERIFY_PATH, 'not_configured')
  const code = String(form.get('recoveryCode') ?? '').trim()
  const next = safeNext(String(form.get('next') ?? ''))
  if (!code) back(TWO_FACTOR_VERIFY_PATH, 'wrong_recovery_code')

  const supabase = await client()
  const api = (
    supabase.auth.mfa as unknown as {
      recoveryCodes?: {
        verify: (params: { code: string }) => Promise<{ error: { status?: number } | null }>
      }
    }
  ).recoveryCodes
  if (!api) back(TWO_FACTOR_VERIFY_PATH, 'recovery_unsupported')

  try {
    const { error } = await api.verify({ code })
    if (error) {
      const status = error.status ?? 0
      if (status === 400 || status === 401 || status === 403 || status === 422) {
        back(TWO_FACTOR_VERIFY_PATH, 'wrong_recovery_code')
      }
      logFailure(error, { path: 'auth/mfa/recovery-verify' })
      back(TWO_FACTOR_VERIFY_PATH, 'unavailable')
    }
  } catch (error) {
    if (isRedirect(error)) throw error
    logFailure(error, { path: 'auth/mfa/recovery-verify' })
    back(TWO_FACTOR_VERIFY_PATH, 'unavailable')
  }

  redirect(next)
}

/**
 * Turn a second factor off. SELLERS ONLY — the caller enforces that.
 *
 * There is no role check in this file on purpose. It is a server action, and a
 * server action reachable from a client is reachable by anyone who can name
 * it, so a check here would be one of two checks and the weaker one. The
 * decision lives in domain/auth/two-factor.ts and is applied by
 * disableTwoFactor()'s caller AND re-applied below, because a server action is
 * a public endpoint whatever the page around it renders.
 */
export async function disableTwoFactor(): Promise<void> {
  if (!supabaseCredentials()) back(TWO_FACTOR_SETUP_PATH, 'not_configured')

  /*
   * THE ROLE CHECK IS HERE, not only on the page that draws the button.
   *
   * An operator can POST to this action directly — it is an HTTP endpoint with
   * a generated id, not a private function — so "the button is not rendered
   * for operators" is a statement about the markup, not about who can call it.
   * This import is the reason the file reaches domain/admin: the rule that
   * operators may not disable 2FA has to be enforced where the change happens.
   */
  const { getAdminAccess } = await import('@/domain/admin/access')
  const access = await getAdminAccess()
  if (access) {
    const { requiresTwoFactor } = await import('@/domain/auth/two-factor')
    if (requiresTwoFactor(access.role)) redirect(`${TWO_FACTOR_SETUP_PATH}?outcome=required`)
  }

  const supabase = await client()
  try {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    for (const factor of factors?.totp ?? []) {
      await supabase.auth.mfa.unenroll({ factorId: factor.id })
    }
    const api = (
      supabase.auth.mfa as unknown as {
        recoveryCodes?: { unenroll: () => Promise<{ error: unknown }> }
      }
    ).recoveryCodes
    // Codes for a factor that no longer exists are codes to nothing. Best
    // effort: a project without the endpoint has none to remove.
    if (api) await api.unenroll().catch(() => undefined)
  } catch (error) {
    if (isRedirect(error)) throw error
    logFailure(error, { path: 'auth/mfa/disable' })
    redirect('/settings/security?outcome=unavailable')
  }

  redirect('/settings/security?outcome=disabled')
}

/**
 * A redirect target that cannot be pointed off this site.
 *
 * `next` arrives from a query string, so it is caller-supplied. Anything but a
 * single-slash-prefixed path becomes the console's front door — `//evil.test`
 * is rejected too, because a protocol-relative URL is an absolute one wearing
 * a relative one's clothes and is the form this check is usually written
 * without.
 */
function safeNext(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return '/admin'
  return value
}

/** Next signals navigation by throwing; this tells that apart from a failure. */
function isRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}
