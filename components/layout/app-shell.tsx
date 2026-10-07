import type { ReactNode } from 'react'
import { ShopStateBanner } from './demo-banner'
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
  demoData,
  connected,
  userInitials,
  userName,
  userEmail,
  isOperator,
  plan,
  usage,
  openActionCount,
  counts,
}: {
  children: ReactNode
  shopName: string
  lastSyncedAt: string | null
  /**
   * The fictional catalogue is being served. This is `ETSY_MODE`, not the shop
   * row — it decides the banner's wording and the "· demo" chip suffix.
   */
  demoData: boolean
  /**
   * This shop has an Etsy connection. This is `!shops.is_demo`, not the mode —
   * it decides the green dot, the solid border and the sync line.
   *
   * Two booleans rather than one because the chrome asks two questions, and
   * answering both with `session.isDemo` put a sentence about a fictional
   * catalogue on screens that were serving none. components/layout/
   * demo-banner.tsx has the full argument.
   */
  connected: boolean
  userInitials: string
  userName: string | null
  userEmail: string
  /** Server-computed. See TopBar. */
  isOperator?: boolean
  plan: string
  usage: { used: number | null; limit: number }
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

      {/*
        * The banner states what is true of the data, so it is keyed on the
        * mode. In live mode with no connection it says so instead of claiming
        * a fictional shop; connected and live, there is nothing to say.
        */}
      {demoData ? (
        <ShopStateBanner kind="DEMO_DATA" shopName={shopName} />
      ) : !connected ? (
        <ShopStateBanner kind="NOT_CONNECTED" shopName={shopName} />
      ) : null}

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
            demoData={demoData}
            connected={connected}
            unreadCount={openActionCount}
            counts={counts}
          />
          <div className="hidden lg:contents">
            <TopBar
            isOperator={isOperator}
              shopName={shopName}
              lastSyncedAt={lastSyncedAt}
              demoData={demoData}
              connected={connected}
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
