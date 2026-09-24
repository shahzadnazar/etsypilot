import { notFound } from 'next/navigation'
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
   * REFUSED: notFound() HERE, before anything of this response is written.
   *
   * ── THIS LINE USED TO PASS `children` THROUGH, AND THE REASON EXPIRED ──
   *
   * It used to return <>{children}</> and let the PAGE's own requireAdmin()
   * throw, because a notFound() from a layout was measured as falling back to
   * Next's bare `<html id="__next_error__">` document — 7,383 unstyled bytes
   * against 9,507 for the ordinary 404 page. Visibly different, so a seller
   * could tell /admin from a URL nobody wrote.
   *
   * RE-MEASURED ON NEXT 16.3.6 AND IT IS NO LONGER TRUE. A notFound() thrown
   * here is caught by app/not-found.tsx in the parent segment and renders the
   * ordinary 404 page: 8,798 bytes against 8,964 for a genuinely missing URL,
   * the same visible text, and — the part that matters — the same 404 STATUS.
   *
   * ── AND LEAVING IT WAS COSTING THE STATUS CODE ────────────────────────
   *
   * Adding a loading.tsx to the operator routes put each page inside a
   * Suspense boundary, so Next STREAMS the response: the shell is flushed
   * with 200 before the page's gate runs, and a notFound() after that cannot
   * change a status that has already been sent. Measured: every operator
   * route with a skeleton answered 200 with 404 copy, and /admin/permissions
   * — the one without a skeleton — answered 404. A 200 that says "not found"
   * is exactly as good a confirmation to a script as a 403 is.
   *
   * Deciding HERE decides before the first byte, so the skeletons cost
   * nothing. THE PAGES STILL GATE THEMSELVES: this answers "is this an
   * operator at all", each page answers "may this operator see THIS", and a
   * sweep in tests/unit/admin-roles.test.ts fails if one forgets — the same
   * shape of guard as the cross-shop import check, for the same reason.
   *
   * An operator who holds console access and lacks one permission is refused
   * by their page instead, which streams and therefore answers 200 with the
   * in-console 404. That is not a disclosure: they are already inside the
   * console and the rail is drawn around them. The disclosure this rule
   * exists to stop is a SELLER learning that /admin is there, and that
   * request never reaches a page.
   *
   * Note what still holds, stated for BOTH people who reach a 404 here,
   * because an earlier version of this note described only one of them and was
   * therefore false about the case that actually happens.
   *
   *   A REFUSED REQUEST gets no operator chrome at all, and now no operator
   *   RESPONSE either: it never reaches a page, and app/not-found.tsx renders
   *   the same 404, at the same status, that any other missing URL gives.
   *
   *   AN OPERATOR WHO LACKS ONE PERMISSION keeps the full chrome around the
   *   404, and that is correct rather than a leak. They have already been
   *   admitted to the console by this layout; hiding the rail from them would
   *   tell them nothing they do not know and would lose them the way back.
   */
  if (!access) notFound()

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
      /*
       * Null, not the address. The menu shows the address on its own line
       * already; passing it as the NAME too printed it twice, once in the
       * shape of a name it is not.
       */
      userName={null}
    >
      {children}
    </OperatorShell>
  )
}
