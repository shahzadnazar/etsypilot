import type { ReactNode } from 'react'
import { requireOperatorRoute } from '@/domain/admin/access'

/*
 * The gate for /admin/users/<id>/role, applied above any boundary below it.
 *
 * roles.write is super-admin-only and non-delegatable, so it is checked as a
 * capability rather than a permission — requireAdmin cannot take it, by
 * design, and that is what keeps it out of the delegatable set.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireOperatorRoute({ permission: 'users.view', superAdminOnly: 'roles.write' })
  return <>{children}</>
}
