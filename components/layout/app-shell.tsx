import type { ReactNode } from 'react'
import { DemoBanner } from './demo-banner'
import { MobileTopBar } from './mobile-top-bar'
import { MobileTabs } from './mobile-tabs'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

/*
 * The application shell.
 *
 * Sidebar 264px, top bar 64px, content capped at 1600px with 24px gutters
 * (Foundations 06). The demo banner sits above everything while demo mode is on.
 */
export function AppShell({
  children,
  shopName,
  lastSyncedAt,
  isDemo,
  userInitials,
  userName,
  userEmail,
  plan,
  usage,
  openActionCount,
  counts,
}: {
  children: ReactNode
  shopName: string
  lastSyncedAt: string | null
  isDemo: boolean
  userInitials: string
  userName: string
  userEmail: string
  plan: string
  usage: { used: number; limit: number }
  /** Drives the bell's dot on mobile. */
  openActionCount: number
  /** Measured nav counts by href. Never authored — see navigation.ts. */
  counts: Record<string, number>
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/*
        * Both of these sit above the sidebar and the top bar, so they belonged
        * to no landmark at all — and a screen-reader user navigating by
        * landmark could reach neither. Not a technicality: the demo banner is
        * the notice saying nothing on screen can be published to Etsy.
        *
        * They get one landmark EACH rather than a shared one, because they are
        * different things. A shared role="banner" would also have been a second
        * banner on the page — TopBar's <header> is already the first — and
        * "two banners" is its own violation. The fix for a missing landmark
        * must not be another landmark in the wrong place.
        */}
      <nav aria-label="Skip links">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-body"
        >
          Skip to content
        </a>
      </nav>

      {isDemo ? <DemoBanner /> : null}

      <div className="flex flex-1 overflow-hidden">
        <Sidebar plan={plan} usage={usage} counts={counts} />

        <div className="flex min-w-0 flex-1 flex-col">
          {/*
            * Two bars, one per breakpoint, rather than one bar with responsive
            * classes. "Mobile is re-composed around actions and summaries, not
            * a shrunken desktop" — they hold different things in a different
            * order, and expressing that as hidden/lg:flex on shared markup
            * produces something nobody can read or change safely.
            */}
          <MobileTopBar
            shopName={shopName}
            lastSyncedAt={lastSyncedAt}
            isDemo={isDemo}
            unreadCount={openActionCount}
            counts={counts}
          />
          <div className="hidden lg:contents">
            <TopBar
              shopName={shopName}
              lastSyncedAt={lastSyncedAt}
              isDemo={isDemo}
              userInitials={userInitials}
              userName={userName}
              userEmail={userEmail}
            />
          </div>
          <main id="main" className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="mx-auto w-full max-w-content">{children}</div>
          </main>
        </div>
      </div>

      <MobileTabs />
    </div>
  )
}
