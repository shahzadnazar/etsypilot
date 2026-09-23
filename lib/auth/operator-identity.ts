import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHO IS SIGNED IN — AND NOTHING ELSE.
 *
 *   This exists so the operator area can answer "who is asking" without
 *   reaching a module that can WRITE. It is the narrow half of getSession():
 *   the Supabase identity check, with no shop resolution and no repair.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── WHY IT IS A SEPARATE MODULE ───────────────────────────────────────────
 *
 * getSession() resolves the caller's SHOP, and when that shop is missing it
 * REPAIRS it by calling provisionAccount() — which writes `users`, `shops` and
 * `memberships`. That is right for the seller app: a seller with no shop
 * cannot use /dashboard, and /onboarding needs the very row that is absent.
 *
 * But it made `lib/repositories/accounts.ts` reachable from every operator
 * page by import, and with it three seller tables. The rule in D94 — the
 * operator area may write exactly three things — was therefore FALSE at the
 * import level the day it was written, and the guard that enforces it failed
 * on the existing code rather than on a hypothetical future mistake.
 *
 * The fix is not an exemption. The operator gate never needed a shop: no
 * screen under /admin reads the operator's own shop, because an operator is
 * not acting as a seller. It needed `userId` and `email`, which is what this
 * returns. Nothing here imports getDb, accounts.ts, or anything that can
 * write, and the guard checks that by walking the import graph.
 *
 * ── WHAT IT FIXES BY ACCIDENT, WHICH IS WORTH KNOWING ─────────────────────
 *
 * getSession() returns null when the shop cannot be resolved. So a SUPER_ADMIN
 * whose own provisioning had failed was locked OUT of /admin — the one screen
 * that could repair anything — by a missing row in a table the operator panel
 * never reads. The break-glass route is supposed to survive a broken database;
 * it did not survive a missing shop. It does now.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It does not replace getSession(). The seller app still uses that, repair and
 * all. This is not a second way to be signed in: it runs the same
 * getUser() check against the same provider and trusts nothing the browser
 * supplied. What it lacks is the ability to change anything.
 */

import { cookies } from 'next/headers'
import { createSupabaseServerClient } from './supabase'
import { isLiveAuth, supabaseCredentials } from './supabase-config'

export interface OperatorIdentity {
  userId: string
  /** From the PROVIDER, not from a row. See below. */
  email: string
}

/**
 * The verified identity behind this request, or null.
 *
 * Null for: demo mode, a missing Supabase configuration, no cookie, an expired
 * or forged token. Every one of those is "nobody", and the operator gate turns
 * all of them into the same 404.
 */
export async function getOperatorIdentity(): Promise<OperatorIdentity | null> {
  /*
   * Demo mode has no operators, checked here as well as in the gate.
   *
   * With AUTH_MODE unset the seller app runs on one FIXED session shared by
   * everyone who can reach the deployment. This module refuses to produce an
   * identity at all in that mode, so there is nothing for the gate to resolve
   * even if its own check were removed.
   */
  if (!isLiveAuth()) return null
  if (!supabaseCredentials()) return null

  const jar = await cookies()
  const supabase = createSupabaseServerClient({
    getAll: () => jar.getAll().map((c) => ({ name: c.name, value: c.value })),
    // A no-op: a Server Component cannot set a cookie. Middleware does the
    // refresh, on a response that can carry one.
    setAll: () => {},
  })

  /*
   * getUser(), never getSession().
   *
   * getUser revalidates the token with Supabase. getSession decodes whatever
   * cookie the browser supplied and believes it — which is precisely the thing
   * a session check exists to defend against. The names are one word apart and
   * the difference is the whole security property.
   */
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null

  /*
   * THE EMAIL COMES FROM THE PROVIDER, not from the `users` row.
   *
   * It decides the platform role, because SUPER_ADMIN_EMAILS and ADMIN_EMAILS
   * are matched against it. Reading it from a row would mean anything able to
   * write that row could mint an administrator — the exact property the env
   * allow-lists exist to prevent (D91). Supabase's copy is the one tied to the
   * credential that was just verified.
   */
  const email = data.user.email ?? ''
  if (!email) return null

  return { userId: data.user.id, email }
}
