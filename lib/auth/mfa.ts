import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   TWO QUESTIONS, ASKED SEPARATELY, BECAUSE THEY HAVE DIFFERENT ANSWERS.
 *
 *     1. Has this account enrolled a second factor at all?
 *     2. Did THIS SESSION actually use it?
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Collapsing them is the standard way this feature ends up as decoration. An
 * implementation that only asks (1) ships an enrollment screen and a gate that
 * still opens for a password-only session: every operator dutifully scans a QR
 * code, and a stolen password is still enough. Supabase names the distinction
 * — aal1 is password-only, aal2 is password plus a code — and the gate in
 * domain/admin/access.ts requires aal2, not enrollment.
 *
 * ── WHERE THE ANSWER COMES FROM, AND WHY IT CAN BE BELIEVED ───────────────
 *
 * `aal` is a claim inside the access token, which arrives in a cookie. A
 * cookie is a thing the caller supplies, so reading a privilege level straight
 * out of one would be the same defect as trusting `getSession()` — which this
 * codebase already refuses to do, for this reason, in getOperatorIdentity().
 *
 * So the order here is load-bearing and is not an implementation detail:
 *
 *   1. getUser()  asks Supabase to validate the token. It checks the
 *                 signature and the expiry SERVER-SIDE. A token with a
 *                 hand-edited `aal` claim fails this step, because editing any
 *                 claim breaks the signature.
 *   2. only then  decode that same token and read `aal`.
 *
 * Step 2 alone would be forgeable. Step 1 alone cannot answer the question —
 * getUser() returns the user and says nothing about how they authenticated.
 * Together they are a server-verified assurance level, and the `sub` check
 * below fails closed if the two ever disagree about whose token this is.
 *
 * WHY NOT mfa.getAuthenticatorAssuranceLevel(). Its public signature takes no
 * argument, and in that form it reads the session out of storage and decodes
 * it WITHOUT the getUser() round trip — precisely step 2 without step 1. It is
 * the right call in a browser, where the session was obtained by this client
 * moments ago. It is the wrong call at a server-side gate, where the session is
 * whatever the request carried.
 *
 * ── AND NOTHING HERE CAN WRITE ────────────────────────────────────────────
 *
 * domain/admin/access.ts imports this, so it is inside the operator closure
 * that tests/unit/operator-write-boundary.test.ts walks. It imports the same
 * three modules getOperatorIdentity() does and nothing else: no getDb, no
 * accounts.ts, no repository. The enrollment WRITES live in mfa-actions.ts,
 * which no operator page imports — and which writes to Supabase rather than to
 * any table of ours, so the four things the operator area may write are still
 * four.
 */

import { cookies } from 'next/headers'
import { createSupabaseServerClient } from './supabase'
import { isLiveAuth, supabaseCredentials } from './supabase-config'

/**
 * Supabase's name for how hard this session was to obtain.
 *
 * `aal1` password only. `aal2` password plus a second factor. `null` when the
 * token carries no claim at all, which is what an old token issued before MFA
 * existed looks like — treated as aal1 below, never as satisfied.
 */
export type AssuranceLevel = 'aal1' | 'aal2'

export interface MfaPosture {
  /** A factor this account has finished setting up. Question (1). */
  enrolled: boolean
  /** How this session authenticated. Question (2). */
  level: AssuranceLevel
  /**
   * Both questions answered yes.
   *
   * A single boolean for callers that only need the verdict — but derived
   * here, from both fields, so no caller can accidentally gate on enrollment
   * alone.
   */
  satisfied: boolean
  /**
   * A factor that was started and never verified.
   *
   * Enrollment is two steps at Supabase: `enroll()` creates an UNVERIFIED
   * factor, `verify()` promotes it. Abandoning the screen between them leaves
   * a stub that counts for nothing and blocks a second enroll() with a
   * duplicate friendly name, so the setup screen clears it and starts again.
   */
  unverifiedFactorIds: readonly string[]
  /** The verified factor to challenge, when there is one. */
  verifiedFactorId: string | null
  /** Recovery codes exist for this account. Never the codes themselves. */
  hasRecoveryCodes: boolean
  /**
   * Did we actually get an answer?
   *
   * ── "NOBODY" AND "WE COULD NOT ASK" ARE THE SAME CLOSED POSTURE, AND
   *    THAT IS ONLY SAFE IF CALLERS CAN TELL THEM APART ───────────────────
   *
   * Every failure below returns NO_POSTURE: demo mode, no configuration, no
   * cookie, a rejected token, AND a Supabase that did not answer. For a gate
   * that asks "is this session satisfied?" the collapse is correct and fails
   * closed — none of those is a session that used a second factor.
   *
   * It is NOT correct for a gate that asks "does this account have a factor to
   * honour?", because `enrolled: false` on a provider timeout reads as "no
   * factor, carry on" — an enrolled account waved past the code screen by an
   * outage. That is a fail-OPEN answer wearing a closed answer's clothes, and
   * it was found by a test double that could not serve concurrent requests
   * producing exactly that symptom intermittently.
   *
   * So the flag says which it was, and the two gates spend it differently:
   *
   *   app/(admin)/layout.tsx   unresolved is refused. The console is the
   *                            privileged surface; an operator seeing the code
   *                            screen during an outage loses a minute.
   *
   *   app/(dashboard)/layout   unresolved is allowed through, deliberately.
   *                            The seller's own app is not privileged, the
   *                            session check above it already failed closed if
   *                            Supabase is unreachable, and bouncing every
   *                            seller — including the ones with no factor at
   *                            all — to an enrollment screen during a provider
   *                            blip is a worse outcome than the narrow window
   *                            it closes.
   *
   * Written down rather than left implicit, because a boolean that is false
   * for two different reasons is exactly the shape of a defect nobody sees.
   */
  resolved: boolean
}

/** Nobody: demo mode, no configuration, no cookie, a token Supabase rejects. */
export const NO_POSTURE: MfaPosture = {
  enrolled: false,
  level: 'aal1',
  satisfied: false,
  unverifiedFactorIds: [],
  verifiedFactorId: null,
  hasRecoveryCodes: false,
  resolved: false,
}

/**
 * The payload of a JWT, or null if it does not look like one.
 *
 * DELIBERATELY NOT A VERIFIER, and the name says so. It does no signature
 * check and must never be used as though it did — the validation is getUser(),
 * upstream of every call to this. It is here rather than imported from the
 * SDK's internals because a decoder used for a security decision should be
 * three readable lines in this repository, not a private export that can
 * change shape in a patch release.
 *
 * Note this decodes an ACCESS TOKEN, not the anon key. lib/auth/supabase.ts
 * records that nothing in this codebase decodes the KEY, and that still holds:
 * the key is a bearer credential that is forwarded, and the newer
 * `sb_publishable_…` format is not a JWT at all. An access token always is one,
 * and its claims are the only place `aal` is published.
 */
function claimsOf(token: string): { sub?: string; aal?: string } | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const payload = parts[1]
  if (!payload) return null
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(padded, 'base64').toString('utf8')
    const parsed: unknown = JSON.parse(json)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as { sub?: string; aal?: string }
  } catch {
    return null
  }
}

/**
 * What this request's session can prove about a second factor.
 *
 * Returns NO_POSTURE for anyone who is not signed in, which makes every caller
 * fail closed: "not signed in" and "signed in without a second factor" produce
 * the same unsatisfied verdict, and the caller decides which refusal that is.
 */
export async function getMfaPosture(): Promise<MfaPosture> {
  if (!isLiveAuth()) return NO_POSTURE
  if (!supabaseCredentials()) return NO_POSTURE

  const jar = await cookies()
  const supabase = createSupabaseServerClient({
    getAll: () => jar.getAll().map((c) => ({ name: c.name, value: c.value })),
    // A Server Component cannot set a cookie; middleware does the refresh.
    setAll: () => {},
  })

  /*
   * getSession() is used HERE and only here, purely to get hold of the string
   * the browser sent. Nothing is believed on its say-so: the very next call
   * hands that string to Supabase for validation, and a failure there returns
   * the closed posture.
   */
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return NO_POSTURE

  const { data: userData, error } = await supabase.auth.getUser()
  if (error || !userData.user) return NO_POSTURE

  const claims = claimsOf(token)
  /*
   * The token getUser() validated must be the token being decoded. They come
   * from the same session object, so this can only fail if that assumption
   * stops holding in a future SDK — which is exactly when a silent wrong
   * answer would be most expensive.
   */
  if (!claims || claims.sub !== userData.user.id) return NO_POSTURE

  const level: AssuranceLevel = claims.aal === 'aal2' ? 'aal2' : 'aal1'

  /*
   * The factor list comes from the USER OBJECT that Supabase just returned,
   * not from the token. Tokens are long-lived enough that an enrollment
   * completed a minute ago would not be in one; the user object is current.
   */
  const factors = userData.user.factors ?? []
  const totp = factors.filter((factor) => factor.factor_type === 'totp')
  const verified = totp.find((factor) => factor.status === 'verified') ?? null
  const unverified = totp.filter((factor) => factor.status !== 'verified').map((factor) => factor.id)

  /*
   * Recovery codes are a factor of their own type in Supabase's model, so
   * their existence is readable from the same list — no second round trip, and
   * no code value anywhere near this process. `mfa.recoveryCodes.getStatus()`
   * would give a remaining count; the setup screen asks for that, a gate does
   * not.
   */
  const hasRecoveryCodes = factors.some(
    (factor) => (factor.factor_type as string) === 'recovery_code',
  )

  const enrolled = verified !== null
  return {
    enrolled,
    level,
    satisfied: enrolled && level === 'aal2',
    unverifiedFactorIds: unverified,
    verifiedFactorId: verified?.id ?? null,
    hasRecoveryCodes,
    resolved: true,
  }
}
