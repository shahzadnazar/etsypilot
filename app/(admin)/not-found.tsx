import SellerNotFound from '@/app/not-found'
import { NotFoundFrame, type NotFoundLink } from '@/components/layout/not-found-frame'
import { getAdminAccess } from '@/domain/admin/access'
import { visibleOperatorNav } from '@/domain/admin/navigation'

/*
 * The 404 boundary for the operator group.
 *
 * Without this file, requireAdmin()'s notFound() had no boundary in its own
 * hierarchy and a refused request rendered a bare error document with none of
 * the 404 copy in it.
 *
 * ── IT ANSWERS TWO DIFFERENT PEOPLE, AND THEY MUST NOT GET THE SAME PAGE ──
 *
 * It used to be a one-line re-export of the seller's 404, so both got the
 * seller's words: "the listing was deleted on Etsy", with buttons to the
 * dashboard and the listing audit. That was false on every operator route.
 * Both cases are now answered deliberately, and they are answered
 * DIFFERENTLY, which matters more than the copy does:
 *
 * A REFUSED VISITOR — a signed-in seller, or an operator-less account, who
 * typed /admin. getAdminAccess() is null, the layout above has already decided
 * to render no chrome, and this renders the SELLER 404 — literally that
 * component, so the response is the one any other missing URL produces.
 *
 *   THIS IS NOT COSMETIC. The whole reason /admin answers 404 rather than 403
 *   is that a 403 confirms /admin exists. Operator-flavoured copy here would
 *   confirm it just as loudly, in prose: "no such operator screen" tells a
 *   seller there ARE operator screens. The disclosure the status code avoids
 *   must not be reintroduced by the words on the page.
 *
 * AN OPERATOR WITHOUT ONE PERMISSION — a manager who typed /admin/audit. They
 * are inside the console, the layout has rendered the banner and their
 * navigation around this, and they already know the console exists. They get
 * copy that is true where they are standing and links back into it.
 *
 * THE LINKS ARE THIS VIEWER'S OWN. Built from visibleOperatorNav — the same
 * filtered list the rail renders — so the 404 cannot send a manager to a
 * screen that would 404 them again. A viewer with no visible items gets no
 * links at all: omitted, never offered and then denied.
 *
 * ── WHAT IT DOES NOT FIX, measured rather than assumed ────────────────────
 *
 * Next still wraps a request-time notFound() in its `<html id="__next_error__">`
 * shell instead of the root layout, so the response is 8,602 bytes against
 * 9,507 for a URL that genuinely has no route. Same status, same visible page,
 * different document shell — see the scope note in domain/admin/access.ts for
 * what that does and does not disclose.
 */
export default async function AdminNotFound() {
  const access = await getAdminAccess()

  /*
   * Not "the same copy as the seller 404" — the same COMPONENT. A copy of the
   * words here would be one edit away from diverging, and a divergence is
   * exactly the tell this branch exists to avoid.
   */
  if (!access) return <SellerNotFound />

  const links: NotFoundLink[] = visibleOperatorNav(access)
    .flatMap((group) => group.items)
    .slice(0, 2)
    .map((item) => ({ href: item.href, label: item.label }))

  return (
    <NotFoundFrame
      body="No operator screen answers to that address — or this account does not have the permission for it. Nothing is wrong with the console."
      links={links}
    />
  )
}
