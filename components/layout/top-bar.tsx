import Link from 'next/link'
import { Puzzle, Search, ShieldCheck } from 'lucide-react'
import { ShopContext } from './shop-context'
import { ThemeToggle } from './theme-toggle'
import { UserMenu } from './user-menu'

/* Top bar: 64px, per Foundations 06. */
export function TopBar({
  shopName,
  lastSyncedAt,
  isDemo,
  userInitials,
  userName,
  userEmail,
  isOperator = false,
}: {
  shopName: string
  lastSyncedAt: string | null
  isDemo: boolean
  userInitials: string
  /** For the accessible name. Initials alone are not one. */
  userName: string | null
  /** Shown in the menu. The one identifier that is never derived. */
  userEmail: string
  /**
   * Whether this viewer may open the operator console.
   *
   * A BOOLEAN COMPUTED ON THE SERVER, never an access object and never a
   * check made here. The seller layout resolves it with the same
   * getAdminAccess() the console itself gates on, so there is no second
   * opinion about who is an operator — and a seller's bundle is handed
   * `false`, not the means to work the answer out.
   */
  isOperator?: boolean
}) {
  return (
    <header className="flex h-topbar shrink-0 items-center gap-3.5 border-b border-line bg-surface px-4 md:px-[26px]">
      <ShopContext shopName={shopName} lastSyncedAt={lastSyncedAt} isDemo={isDemo} />

      {/*
        * The command palette, which is not built.
        *
        * This comment used to read "Wired in Phase 2 with the action model" —
        * it never was, and the control sat there for eleven phases looking like
        * the way to find things while swallowing every click. Disabled with the
        * reason on it until there is a palette behind it.
        */}
      <button
        type="button"
        disabled
        title="The command palette is not built yet. Use the sidebar to navigate."
        className="ml-auto hidden cursor-not-allowed items-center gap-2 rounded-control border border-line px-3 py-2 text-[12px] text-muted-2 opacity-70 md:flex"
      >
        <Search size={14} aria-hidden />
        Search or jump to…
        <kbd className="ml-2 rounded border border-line px-1 text-[10px]">⌘K</kbd>
      </button>

      {/*
        * Straight after the search, where it was asked for.
        *
        * The extension is something a seller reaches for while working, not
        * something they configure once — it was reachable only by opening
        * Settings and reading down a rail, which is where a feature goes to not
        * be found. Same destination as the settings entry; one page, two ways
        * in.
        */}
      <Link
        href="/settings/extension"
        className="hidden h-9 items-center gap-2 rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:inline-flex"
      >
        <Puzzle size={14} aria-hidden />
        Extension
      </Link>

      {/*
        * The way back to the console, and the only /admin href in the seller
        * app.
        *
        * The console has had a "My shop" button since it was built and nothing
        * came back, so an operator typed the URL every time.
        *
        * IT IS STILL TRUE THAT NO SELLER SEES A LINK TO /admin. This renders
        * for a viewer getAdminAccess() already returns an operator for; for
        * everyone else the element is not in the response at all — not hidden,
        * not disabled, absent. Same rule as the rail: omitted, never locked.
        *
        * prefetch={false} for the same reason the console's "My shop" carries
        * it, in the other direction: prefetching a route RENDERS it, and
        * hovering a link should not execute an operator screen.
        */}
      {isOperator ? (
        <Link
          href="/admin"
          prefetch={false}
          className="hidden h-9 items-center gap-2 rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:inline-flex"
        >
          <ShieldCheck size={14} aria-hidden />
          Operations
        </Link>
      ) : null}

      <div className="ml-auto hidden sm:block md:ml-0">
        <ThemeToggle />
      </div>

      {/*
        Was a link straight to Profile, which left the product with no sign-out
        at all: the session ended when the cookie expired, or never. An avatar
        in that corner is where every application puts the account, and the one
        thing an account menu must contain is the way out.
      */}
      <UserMenu userInitials={userInitials} userName={userName} userEmail={userEmail} />
    </header>
  )
}
