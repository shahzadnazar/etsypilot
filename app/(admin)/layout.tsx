import type { ReactNode } from 'react'
import { OperatorShell } from '@/components/admin/operator-shell'
import { getAdminAccess } from '@/domain/admin/access'
import { visibleOperatorNav } from '@/domain/admin/navigation'
import { initialsFor } from '@/lib/utils/name'

/*
 * The operator shell.
 *
 * Its own route group, NOT nested inside (dashboard). That layout carries the
 * seller navigation, the shop chip and the demo banner — every one of which
 * would be a lie here. There is no "your shop" on an operator screen.
 *
 * THE AUTHORITATIVE GATE. Middleware 404s anonymous visitors, but it runs on
 * the Edge runtime and cannot read the platform_role column, so it cannot tell
 * a MANAGER from any other signed-in seller. This check can, and it is also the
 * one that still holds when a route is reached some way middleware does not
 * cover. notFound(), never a 403: a 403 confirms /admin exists.
 *
 * VISUALLY DISTINCT ON PURPOSE. An explicit banner above everything, so it is
 * never ambiguous which application you are looking at — an operator who thinks
 * they are in their own account is an operator about to be surprised by what
 * they are seeing. Every colour is a D1 token or the same literal dark pair the
 * demo banner uses (D1/D10: a token background with a literal foreground breaks
 * on theme flip).
 *
 * THE CHROME LIVES IN components/admin, not here. This file's job is the gate
 * and nothing else; when the navigation and the shell were inline it was four
 * hundred lines in which the one security-relevant branch was easy to lose.
 * OperatorShell takes navigation that is ALREADY FILTERED — computed here,
 * server-side, from the same `can` the pages gate on — so the browser bundle
 * never learns which items this viewer was refused.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const access = await getAdminAccess()

  /*
   * REFUSED: render nothing of our own and let the page decide the response.
   *
   * Calling notFound() HERE was the obvious thing and it was measurably worse.
   * A notFound() thrown from a LAYOUT has no boundary above it, so Next falls
   * back to its bare `<html id="__next_error__">` document — 7,383 bytes with
   * no styling, against 9,507 for the ordinary 404 page. Same status, visibly
   * different response, so a signed-in seller could still tell /admin apart
   * from a URL nobody ever wrote. That is the disclosure the whole
   * 404-instead-of-403 rule exists to stop.
   *
   * Passing `children` straight through means the PAGE's own requireAdmin()
   * throws instead, from a page, where app/(admin)/not-found.tsx catches it and
   * renders the ordinary 404 copy. Next still wraps a request-time notFound()
   * in its error document shell rather than the root layout, so the response is
   * not byte-identical to a missing URL — the residual difference, and what it
   * does and does not disclose, is written down in domain/admin/access.ts.
   *
   * THIS SHIFTS THE GATE ONTO THE PAGES, so it is no longer enough that a page
   * SHOULD check. Every page under app/(admin) must call requireAdmin(), and a
   * sweep in tests/unit/admin-roles.test.ts fails if one does not — the same
   * shape of guard as the cross-shop import check, for the same reason: a rule
   * nothing enforces is a rule until the day someone forgets.
   *
   * Note what still holds: no operator chrome renders for a refused request.
   * The banner, the email, the role and the navigation are all inside the
   * branch below, which only a real operator reaches.
   */
  if (!access) return <>{children}</>

  return (
    <OperatorShell
      groups={visibleOperatorNav(access)}
      email={access.email}
      role={access.role}
      /*
       * Initials from the EMAIL, with no name to derive them from, and that is
       * a fact about the operator identity rather than an omission here.
       * getOperatorIdentity() returns a user id and an address and nothing
       * else — it deliberately reads no `users` row, because resolving one is
       * what dragged provisioning into the operator closure and made D94 false
       * by import. The address is also the honest label: it is the thing that
       * distinguishes two operator logins on one machine.
       */
      userInitials={initialsFor('', access.email)}
      userName={access.email}
    >
      {children}
    </OperatorShell>
  )
}
