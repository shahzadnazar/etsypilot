import type { ReactNode } from 'react'
import { requireOperatorRoute } from '@/domain/admin/access'

/*
 * The gate for /admin/subscriptions, applied ABOVE this segment's Suspense boundary.
 *
 * Wraps this segment only.
 *
 * See requireOperatorRoute in domain/admin/access.ts: a page's own notFound()
 * cannot set a status that a loading.tsx has already caused to be sent. The
 * page still gates itself — this is the half that decides before the flush,
 * not a replacement for the half that decides what renders.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireOperatorRoute({ permission: 'subscriptions.view' })
  return <>{children}</>
}
