import type { ReactNode } from 'react'
import { requireOperatorRoute } from '@/domain/admin/access'

/*
 * The gate for /admin/users, applied ABOVE this segment's Suspense boundary.
 *
 * ── WHY THIS IS IN A ROUTE GROUP AND NOT AT admin/users ───────────────────
 *
 * A layout wraps everything below it, and /admin/users/<id> does NOT require
 * users.view — it requires users.detail, and a viewer holding only
 * users.detail is a supported case that the account-detail tests exercise
 * directly. A gate at admin/users would have quietly added users.view to the
 * detail screen's requirements.
 *
 * `(list)` is not part of the URL, so this still serves /admin/users. It is a
 * place to hang a gate that wraps exactly one page.
 *
 * See requireOperatorRoute in domain/admin/access.ts for why the gate has to
 * be above the boundary at all: the loading.tsx beside this file is what makes
 * the response start streaming before the page's own notFound() can set a
 * status.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  await requireOperatorRoute({ permission: 'users.view' })
  return <>{children}</>
}
