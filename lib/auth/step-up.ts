import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   PASSWORD RE-CONFIRMATION THAT DOES NOT TOUCH THE CALLER'S SESSION.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * WHAT THIS DEFENDS AGAINST, and it is exactly one thing: an unlocked laptop.
 * A session cookie proves someone signed in at some point on this device. It
 * cannot prove the person at the keyboard right now is the same person. For
 * reading the account list that distinction is not worth a password prompt;
 * for granting platform privileges it is, which is why GitHub asks again
 * before a permission change. It defends against nothing else — not a stolen
 * password, not a compromised server, not a malicious operator.
 *
 * ── THE TRAP ──────────────────────────────────────────────────────────────
 *
 * The obvious implementation is the wrong one:
 *
 *     const supabase = createSupabaseServerClient(await actionCookies())
 *     await supabase.auth.signInWithPassword({ email, password })   // ← NO
 *
 * That client is wired to the REQUEST'S COOKIE JAR. A successful
 * signInWithPassword mints a NEW session and the adapter writes it straight
 * back over the operator's cookies. The visible effect is mild — they stay
 * signed in, on a rotated token — but the real one is not: their previous
 * session is replaced as a side effect of being asked to confirm, every other
 * tab is now on a stale token, and a "verify who you are" step has silently
 * become a "sign in again" step. A re-authentication that re-authenticates is
 * not a check; it is a state change wearing a check's clothes.
 *
 * ── WHAT THIS DOES INSTEAD ────────────────────────────────────────────────
 *
 * An ISOLATED client from @supabase/supabase-js — deliberately NOT the
 * @supabase/ssr helper — configured so it has nowhere to persist anything:
 *
 *     persistSession: false      no storage adapter, so nothing is written
 *     autoRefreshToken: false    no background timer outliving the request
 *     detectSessionInUrl: false  server-side; there is no URL fragment
 *
 * It is given NO cookie adapter and this module imports NOTHING that could
 * supply one. The minted session exists as a value in memory for the length of
 * one function call and is then revoked.
 *
 * STRUCTURAL, NOT CAREFUL. This file must never import `next/headers`,
 * `./supabase` or `@supabase/ssr`, and verifyPassword() takes no cookie
 * parameter — there is no argument through which a jar could be threaded in.
 * A sweep in tests/unit/admin-role-change.test.ts fails if any of those
 * imports appears. The rule is enforced by the file's shape rather than by
 * whoever edits it next remembering why.
 *
 * ── REVOKING THE THROWAWAY SESSION ────────────────────────────────────────
 *
 * GoTrue has no "check this password" endpoint; the only way to verify one is
 * to exchange it for tokens. So a real refresh token IS minted, and leaving it
 * valid would mean every password confirmation quietly accumulated a usable
 * credential at the provider.
 *
 * `signOut({ scope: 'local' })` on the isolated client revokes THAT session and
 * only that session, because the client's current access token is the one it
 * just minted. `scope: 'global'` would be a serious bug: it revokes every
 * session the user has, so confirming a password would sign the operator out
 * of their own browser — and out of every other device they use. The scope is
 * the whole point of the line and is why it is spelled out rather than left to
 * the default.
 *
 * Failure to revoke is swallowed. The verification already succeeded or failed
 * on its own terms, and an unused token that expires on schedule is not worth
 * turning a completed check into an error.
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseCredentials } from './supabase-config'
import { logFailure } from '@/lib/errors/api'

/**
 * Why a verification did not succeed.
 *
 * Three outcomes, not two, because "we could not ask" and "the password was
 * wrong" must never be collapsed. A misconfigured deployment that reported
 * every attempt as a wrong password would fill the audit log with a brute-force
 * signature that nobody was producing.
 */
export type StepUpResult =
  | { ok: true }
  | { ok: false; reason: 'WRONG_PASSWORD' }
  | { ok: false; reason: 'UNAVAILABLE' }

/**
 * Does this password belong to this account, right now?
 *
 * `email` comes from the SERVER'S view of the session — never from the form.
 * Taking it from the request would turn a re-confirmation into an oracle for
 * checking credentials against any address someone cares to type.
 *
 * There is no cookie parameter. See the banner: that is the guarantee.
 */
export async function verifyPassword(email: string, password: string): Promise<StepUpResult> {
  const credentials = supabaseCredentials()
  if (!credentials) return { ok: false, reason: 'UNAVAILABLE' }
  // An empty password is refused here rather than sent. Some providers treat a
  // blank credential generously; none of them should get the chance.
  if (!email || !password) return { ok: false, reason: 'WRONG_PASSWORD' }

  const isolated = createClient(credentials.url, credentials.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  let verified = false
  try {
    const { data, error } = await isolated.auth.signInWithPassword({ email, password })
    if (error) {
      /*
       * Distinguishing "wrong password" from "Supabase is down" without
       * parsing a provider message: a failure that produced no session and
       * carried an auth status is a credential failure. Anything else — a
       * network error, a 500, a rate limit at the provider — is reported as
       * unavailable, so an outage never reads as an attack in the log.
       */
      const status = error.status ?? 0
      if (status === 400 || status === 401) return { ok: false, reason: 'WRONG_PASSWORD' }
      logFailure(error, { path: 'admin/step-up' })
      return { ok: false, reason: 'UNAVAILABLE' }
    }
    verified = Boolean(data.session)
    if (!verified) return { ok: false, reason: 'WRONG_PASSWORD' }
    return { ok: true }
  } catch (error) {
    logFailure(error, { path: 'admin/step-up' })
    return { ok: false, reason: 'UNAVAILABLE' }
  } finally {
    /*
     * Revoke the throwaway session, and ONLY it. `scope: 'local'` is
     * load-bearing — see the banner. In `finally` so a thrown error upstream
     * cannot leave the token alive.
     */
    if (verified) {
      try {
        await isolated.auth.signOut({ scope: 'local' })
      } catch {
        // Best effort, deliberately. The token expires on its own schedule.
      }
    }
  }
}
