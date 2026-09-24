import type { ReactNode } from 'react'
import { requireOperatorRoute } from '@/domain/admin/access'

/*
 * The gate for /admin/permissions and /admin/permissions/<role>, applied ABOVE this segment's Suspense boundary.
 *
 * One layout covers the matrix AND the per-role editor, because they require
 * exactly the same thing. Where a parent's requirements differ from a child's
 * — /admin/users — a route group is used instead so the gate wraps one page.
 *
 * See requireOperatorRoute in domain/admin/access.ts: a page's own notFound()
 * cannot set a status that a loading.tsx has already caused to be sent. The
 * page still gates itself — this is the half that decides before the flush,
 * not a replacement for the half that decides what renders.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireOperatorRoute({ permission: 'users.view', superAdminOnly: 'roles.write' })
  return <>{children}</>
}
