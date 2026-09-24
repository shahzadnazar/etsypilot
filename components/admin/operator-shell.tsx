import type { ReactNode } from 'react'
import { OperatorBanner } from './operator-banner'
import { OperatorDrawerProvider } from './operator-drawer'
import { OperatorMobileBar } from './operator-mobile-bar'
import { OperatorMobileTabs } from './operator-mobile-tabs'
import { OperatorSidebar } from './operator-sidebar'
import { OperatorTopBar } from './operator-top-bar'
import type { OperatorNavGroup } from '@/domain/admin/navigation'

/*
 * The operator application shell.
 *
 * Same geometry as the seller shell — 264px rail, 64px bar, content capped at
 * 1600px with 24px gutters (Foundations 06) — built from the same tokens and
 * the same two shared components (ThemeToggle, UserMenu).
 *
 * ── ITS OWN SHELL, NOT AppShell WITH THE AWKWARD PROPS MADE OPTIONAL ──────
 *
 * AppShell requires a shop name, a last-sync time, a plan, a usage meter and
 * an open-action count. None of the five exists on an operator screen, and
 * none of them could be invented honestly:
 *
 *   a shop         an operator is looking at everyone's. Showing their own
 *                  beside another seller's data is the confusion the banner
 *                  exists to prevent.
 *   a plan meter   it would be the OPERATOR's plan, rendered on a screen about
 *                  somebody else. A figure that is true about the wrong
 *                  subject is worse than no figure.
 *   action count   the Action Center is a seller surface. There is nothing for
 *                  an operator to have open.
 *
 * Making those props optional would push five `?? undefined` branches into the
 * component every seller sees on every screen, so that a different application
 * could borrow it. That degrades the seller side to save a file here, and the
 * two shells have genuinely different content — which is the same argument D61
 * makes for the mobile bar being a separate component rather than the desktop
 * one with classes on it.
 *
 * What IS shared is shared: the tokens, the geometry, the theme toggle and the
 * sign-out. A second sign-out would be a second thing to keep correct, and
 * sign-out is the control that must work with no JavaScript at all.
 *
 * ── THE NAVIGATION ARRIVES ALREADY FILTERED ───────────────────────────────
 *
 * `groups` is what THIS viewer may see, computed on the server by
 * visibleOperatorNav(access) from the same `can` the pages gate on. Nothing in
 * the browser bundle knows which items were removed, so nothing can render a
 * padlock: omitted, never locked.
 */
export function OperatorShell({
  children,
  groups,
  email,
  role,
  userInitials,
  userName,
}: {
  children: ReactNode
  groups: OperatorNavGroup[]
  email: string
  role: string
  userInitials: string
  userName: string | null
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/*
        * Its own landmark, as in the seller shell. The skip link sits above
        * every other landmark, so without one it belonged to none and a
        * screen-reader user navigating by landmark could not reach it.
        */}
      <nav aria-label="Skip links">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-body"
        >
          Skip to content
        </a>
      </nav>

      <OperatorBanner email={email} role={role} />

      {/*
        * The provider wraps both mobile controls and nothing else. `groups` is
        * still computed on the SERVER and handed down already filtered, so the
        * browser bundle never learns which items this viewer was refused —
        * putting the open/closed flag in a context is what keeps that true
        * while letting the bar's "More" open the drawer.
        */}
      <OperatorDrawerProvider>
        <div className="flex flex-1 overflow-hidden">
          <OperatorSidebar groups={groups} />

          <div className="flex min-w-0 flex-1 flex-col">
            <OperatorMobileBar groups={groups} />
            <OperatorTopBar userInitials={userInitials} userName={userName} userEmail={email} />
            {/*
              * pb-20 below lg, for the bar that is now underneath.
              *
              * FOUND BY AXE once it swept every screen: target-size failed on
              * /admin/usage, /admin/operations and /admin/permissions/MANAGER
              * at 390 — and the obscuring neighbour, when the failures were
              * traced rather than guessed at, was the new bottom tab bar in
              * every case. The last control on a scrolled page ended up flush
              * against it with no clear space, so a 24px target was a 12px
              * target to anyone with a thumb.
              *
              * Two wrong fixes were tried first: widening the permission rows
              * and padding the figure's badge. Both treated the symptom on one
              * screen; one of them made the measurement WORSE. The bar is the
              * cause, so the room belongs at the bottom of the scroller.
              */}
            <main id="main" className="flex-1 overflow-y-auto px-4 pb-20 pt-5 md:px-6 lg:pb-5">
              <div className="mx-auto w-full max-w-content">{children}</div>
            </main>
          </div>
        </div>

        <OperatorMobileTabs groups={groups} />
      </OperatorDrawerProvider>
    </div>
  )
}
