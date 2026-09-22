import { redirect } from 'next/navigation'
import { requireAdmin } from '@/domain/admin/access'

/*
 * /admin has no landing screen of its own yet. Accounts is the only surface.
 *
 * The gate comes BEFORE the redirect, and that ordering is the whole point of
 * this file. A redirect issued first would answer a non-operator with a 307 to
 * /admin/users — telling them both that /admin exists and where it goes, which
 * is exactly what the 404 is for. Refusing first means they get the same
 * nothing they would get for any URL that was never written.
 */
export default async function AdminIndex() {
  await requireAdmin('users.view')
  redirect('/admin/users')
}
