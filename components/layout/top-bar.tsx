import Link from 'next/link'
import { Puzzle, Search } from 'lucide-react'
import { ShopContext } from './shop-context'
import { ThemeToggle } from './theme-toggle'

/* Top bar: 64px, per Foundations 06. */
export function TopBar({
  shopName,
  lastSyncedAt,
  isDemo,
  userInitials,
  userName,
}: {
  shopName: string
  lastSyncedAt: string | null
  isDemo: boolean
  userInitials: string
  /** For the accessible name. Initials alone are not one. */
  userName: string
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

      <div className="ml-auto hidden sm:block md:ml-0">
        <ThemeToggle />
      </div>

      {/*
        A link, not a decorative span.
        
        It was `aria-hidden` on a <span> — so it was the one thing in the top bar
        that looked like a control and was not, invisible to a screen reader and
        inert to a click. An avatar in that corner is where every application
        puts the account, and a seller who clicks it and gets nothing learns the
        chrome is a picture of an app.
        
        Colours are literal, not tokenised: pairing a token background with a
        literal foreground breaks on theme flip — --ink-2 inverts to #CBD5E1 in
        dark, which put white text on light grey. Same convention as the demo
        banner (D1/D10).
        
        Hover is a ring, not opacity. Dimming an element dims the text inside
        it, which is why the sweep refuses a hover style that lowers opacity —
        and it caught this one the first time it ran.
      */}
      <Link
        href="/settings/profile"
        title={`${userName} — your profile`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-[11px] font-semibold transition-shadow hover:shadow-[0_0_0_2px_var(--brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        style={{ background: '#241B12', color: '#F7F3ED' }}
      >
        <span aria-hidden>{userInitials}</span>
        <span className="sr-only">{userName} — open your profile</span>
      </Link>
    </header>
  )
}
