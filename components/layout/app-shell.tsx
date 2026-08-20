import type { ReactNode } from 'react'
import { DemoBanner } from './demo-banner'
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
  plan,
  listingUsage,
}: {
  children: ReactNode
  shopName: string
  lastSyncedAt: string | null
  isDemo: boolean
  userInitials: string
  plan: string
  listingUsage: string
}) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {isDemo ? <DemoBanner /> : null}

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-body"
      >
        Skip to content
      </a>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar plan={plan} listingUsage={listingUsage} />

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            shopName={shopName}
            lastSyncedAt={lastSyncedAt}
            isDemo={isDemo}
            userInitials={userInitials}
          />
          <main id="main" className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="mx-auto w-full max-w-content">{children}</div>
          </main>
        </div>
      </div>

      <MobileTabs />
    </div>
  )
}
