'use server'

/*
 * The one action in the operator panel that changes anything.
 *
 * A server action rather than a route handler for the same reason the auth
 * forms are: it posts from a plain <form>, so the role editor works with no
 * JavaScript. A privileged control that needs a hydrated bundle to function is
 * a privileged control that fails open-ended on a slow connection — and this
 * one asks for a password, which is the last field that should depend on a
 * chunk having loaded.
 *
 * THIS FILE DECIDES NOTHING. Every check lives in changePlatformRole()
 * (domain/admin/role-change.ts), including the requireAdmin() call. What
 * happens here is form parsing and navigation, which is all a boundary should
 * do — a gate split between the action and the domain is a gate with two
 * places to forget.
 *
 * Failures come back as an outcome KEY, never a message, matching
 * lib/auth/actions.ts. The page renders from the closed REFUSAL_COPY map, so
 * no provider wording and no target's details can reach the screen through an
 * error string.
 */

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { changePlatformRole } from '@/domain/admin/role-change'

export async function changeRole(form: FormData): Promise<void> {
  const targetUserId = String(form.get('targetUserId') ?? '')
  const role = form.get('role')
  const password = String(form.get('password') ?? '')

  const result = await changePlatformRole({ targetUserId, role, password })

  if (!result.ok) {
    /*
     * Back to the same confirmation screen with the reason. Deliberately NOT
     * back to the list: a refusal that bounces the operator to a page showing
     * the unchanged row reads as "nothing happened", and they retry without
     * ever seeing why it was refused.
     */
    redirect(`/admin/users/${encodeURIComponent(targetUserId)}/role?outcome=${result.reason}`)
  }

  /*
   * The list and the managers page both render from the column this just
   * changed, and both are force-dynamic — but revalidatePath is what makes the
   * client-side router drop its cached RSC payload for them. Without it a
   * back-navigation shows the old role, which is the "control that appears to
   * work and does not" failure with a delay on it.
   */
  revalidatePath('/admin/users')
  revalidatePath('/admin/managers')
  revalidatePath('/admin/audit')
  redirect(`/admin/users?changed=${encodeURIComponent(result.targetEmail)}`)
}
