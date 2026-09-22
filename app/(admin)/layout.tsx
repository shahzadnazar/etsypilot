import type { ReactNode } from 'react'
import Link from 'next/link'
import { getAdminAccess } from '@/domain/admin/access'

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
 * VISUALLY DISTINCT ON PURPOSE. A dark chrome and an explicit banner, so it is
 * never ambiguous which application you are looking at — an operator who thinks
 * they are in their own account is an operator about to be surprised by what
 * they are seeing. Every colour is a D1 token or the same literal dark pair the
 * demo banner uses (D1/D10: a token background with a literal foreground breaks
 * on theme flip).
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
    <div className="flex min-h-screen flex-col bg-canvas">
      <div
        role="status"
        aria-label="Operator console"
        className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 md:px-[18px]"
        style={{ background: '#241B12' }}
      >
        <span
          className="rounded-[5px] px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.07em] text-white"
          style={{ background: 'rgba(255,255,255,.14)' }}
        >
          Operator
        </span>
        <span className="flex-1 text-[12px] leading-snug" style={{ color: '#F7F3ED' }}>
          EtsyPilot operations — not a seller account. You are looking at every shop on the
          platform, read-only.
        </span>
        <span className="tnum text-[11px]" style={{ color: '#C9BCA9' }}>
          {access.email} · {access.role.replace('_', ' ').toLowerCase()}
        </span>
        {/*
          * The way back to the seller app. An operator console with no exit is
          * a console people leave by editing the URL.
          */}
        <Link
          href="/dashboard"
          className="shrink-0 rounded-[7px] bg-white px-2.5 py-1.5 text-[11px] font-semibold"
          style={{ color: '#241B12' }}
        >
          My shop
        </Link>
      </div>

      <header className="flex h-topbar shrink-0 items-center gap-3.5 border-b border-line bg-surface px-4 md:px-[26px]">
        <span className="text-[15px] font-bold tracking-[-0.01em] text-ink-1">Operations</span>
        <nav aria-label="Operator" className="flex items-center gap-1">
          {access.can('users.view') ? (
            <Link
              href="/admin/users"
              className="rounded-control px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:bg-canvas-soft"
            >
              Accounts
            </Link>
          ) : null}
        </nav>
      </header>

      <main id="main" className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto w-full max-w-content">{children}</div>
      </main>
    </div>
  )
}
