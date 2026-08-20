import { Search } from 'lucide-react'
import { ShopContext } from './shop-context'
import { ThemeToggle } from './theme-toggle'

/* Top bar: 64px, per Foundations 06. */
export function TopBar({
  shopName,
  lastSyncedAt,
  isDemo,
  userInitials,
}: {
  shopName: string
  lastSyncedAt: string | null
  isDemo: boolean
  userInitials: string
}) {
  return (
    <header className="flex h-topbar shrink-0 items-center gap-3.5 border-b border-line bg-surface px-4 md:px-[26px]">
      <ShopContext shopName={shopName} lastSyncedAt={lastSyncedAt} isDemo={isDemo} />

      {/* Command palette entry point. Wired in Phase 2 with the action model. */}
      <button
        type="button"
        className="ml-auto hidden items-center gap-2 rounded-control border border-line px-3 py-2 text-[12px] text-muted-1 hover:bg-canvas-soft md:flex"
      >
        <Search size={14} aria-hidden />
        Search or jump to…
        <kbd className="ml-2 rounded border border-line px-1 text-[10px]">⌘K</kbd>
      </button>

      <div className="ml-auto hidden sm:block md:ml-0">
        <ThemeToggle />
      </div>

      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-[11px] font-semibold text-white"
        style={{ background: 'var(--ink-2)' }}
        aria-hidden
      >
        {userInitials}
      </span>
    </header>
  )
}
