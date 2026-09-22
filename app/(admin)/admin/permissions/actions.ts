'use server'

/*
 * The permission matrix's one action.
 *
 * Same shape as the role-change action and for the same reasons: a plain
 * <form>, so a privileged control never depends on a chunk having loaded; an
 * outcome KEY rather than a message, so no provider wording reaches the
 * screen; and no decisions here at all. Every check lives in
 * changeRolePermissions(), because a gate split between the action and the
 * domain is a gate with two places to forget.
 */

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { changeRolePermissions } from '@/domain/admin/permission-change'

export async function changePermissions(form: FormData): Promise<void> {
  const role = String(form.get('role') ?? '')
  /*
   * getAll: a checkbox group submits one entry per TICKED box and nothing at
   * all when every box is cleared. `getAll` returning [] is therefore the
   * honest representation of "revoke everything", where `get` would return
   * null and look like a malformed request.
   */
  const permissions = form.getAll('permissions')
  const password = String(form.get('password') ?? '')

  const result = await changeRolePermissions({ role, permissions, password })

  if (!result.ok) {
    // Back to the editor with the reason, not to the matrix: a refusal that
    // bounces to a screen showing the unchanged row reads as "nothing
    // happened", and they retry without ever seeing why.
    redirect(`/admin/permissions/${encodeURIComponent(role)}?outcome=${result.reason}`)
  }

  /*
   * Every operator screen renders from the set this just changed — including
   * the navigation, which is built from access.can(). Without this, a
   * back-navigation would show the old matrix, and that is the "control that
   * appears to work" failure with a delay on it.
   */
  revalidatePath('/admin', 'layout')
  redirect(`/admin/permissions?changed=${encodeURIComponent(result.role)}`)
}
