import type { ReactNode } from 'react'
import { requireOperatorRoute } from '@/domain/admin/access'

/*
 * The gate for /admin/users/<id>, in a route group for the same reason
 * /admin/users is.
 *
 * The sibling route /admin/users/<id>/role requires users.view and roles.write
 * and does NOT require users.detail. A gate placed directly on [userId] would
 * have wrapped the role editor too and added a requirement it does not have.
 *
 * In practice roles.write is super-admin-only and a super admin holds every
 * permission, so nobody would have been refused today — which is exactly the
 * kind of reasoning that stops being true after one edit to the role model.
 * The group costs a directory and needs no reasoning at all.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireOperatorRoute({ permission: 'users.detail' })
  return <>{children}</>
}
