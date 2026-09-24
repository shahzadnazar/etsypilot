import type { ReactNode } from 'react'
import { requireOperatorRoute } from '@/domain/admin/access'

/*
 * The gate for /admin/audit, applied ABOVE this segment's Suspense boundary.
 *
 * audit.view is super-admin-only and non-delegatable, so it is checked as a
 * capability rather than a permission — requireAdmin cannot take it, by design.
 *
 * See requireOperatorRoute in domain/admin/access.ts: a page's own notFound()
 * cannot set a status that a loading.tsx has already caused to be sent. The
 * page still gates itself — this is the half that decides before the flush,
 * not a replacement for the half that decides what renders.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireOperatorRoute({ permission: 'users.view', superAdminOnly: 'audit.view' })
  return <>{children}</>
}
