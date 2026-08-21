'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronDown, Menu, X } from 'lucide-react'
import { NAV_FOOTER, NAV_GROUPS } from './navigation'
import { cn } from '@/lib/utils/cn'
import { formatRelative } from '@/lib/utils/format'

/*
 * The mobile top bar (Foundations, "Mobile shell · 390 × 844").
 *
 * 56px, not the desktop 64: hamburger, shop chip, notifications. It replaces
 * the desktop bar below `lg`, where the sidebar is hidden and the bottom tab
 * bar carries five destinations — the drawer here is how the other twenty are
 * reached at all.
 *
 * "Mobile is re-composed around actions and summaries, not a shrunken
 * desktop", from the same design file, is why this is a separate component
 * rather than responsive classes on TopBar: the two bars contain different
 * things in a different order, and expressing that as a pile of
 * hidden/lg:flex on one element produces markup nobody can read.
 *
 * Every control here is 44×44, which is the design's own figure and also
 * comfortably past WCAG 2.2's 24×24 (D56a). The negative margins are the
 * design's too: they let a 44px touch target sit flush to a 14px gutter
 * without the icon looking inset.
 */
export function MobileTopBar({
  shopName,
  lastSyncedAt,
  isDemo,
  unreadCount,
  counts,
}: {
  shopName: string
  lastSyncedAt: string | null
  isDemo: boolean
  /** Drives the dot on the bell. Zero means no dot, never a "0" badge. */
  unreadCount: number
  /** Measured counts by href, for the drawer's chips. */
  counts: Record<string, number>
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Any navigation closes it. Without this the drawer stays open over the page
  // it just navigated to, which reads as the tap having failed.
  useEffect(() => setOpen(false), [pathname])

  // Escape closes it, and the page behind must not scroll while it is open.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open])

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-canvas-soft"
        >
          <Menu size={20} aria-hidden />
          <span className="sr-only">Open navigation</span>
        </button>

        {/*
          * The shop chip. Dashed in demo mode and the sync line goes muted, for
          * the same reason the desktop chip does: a green "synced" line beside
          * a shop that is not connected implies a live Etsy link (artboard
          * 103b).
          */}
        <Link
          href="/settings/shops"
          className={cn(
            'flex min-w-0 flex-1 items-center gap-2 rounded-[9px] border px-2.5 py-1.5',
            isDemo ? 'border-dashed border-muted-2' : 'border-line',
          )}
        >
          <span
            aria-hidden
            className="h-[22px] w-[22px] shrink-0 rounded-[6px]"
            style={{
              background:
                'repeating-linear-gradient(135deg, var(--canvas-soft) 0 5px, var(--surface) 5px 10px)',
              border: '1px solid var(--border)',
            }}
          />
          <span className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-[12px] font-semibold leading-none text-ink-1">
              {shopName}
            </span>
            <span
              className="truncate text-[10px] font-medium leading-none"
              style={{ color: isDemo ? 'var(--muted-1)' : 'var(--success)' }}
            >
              {isDemo
                ? 'Demo shop · not connected'
                : lastSyncedAt
                  ? `Synced ${formatRelative(lastSyncedAt)}`
                  : 'Never synced'}
            </span>
          </span>
          <ChevronDown size={13} aria-hidden className="ml-auto shrink-0 text-muted-2" />
        </Link>

        <Link
          href="/action-center"
          className="-mr-2.5 relative flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-canvas-soft"
        >
          <Bell size={20} aria-hidden />
          {unreadCount > 0 ? (
            <span
              aria-hidden
              className="absolute right-2.5 top-2.5 h-[7px] w-[7px] rounded-full border-[1.5px] border-surface"
              style={{ background: 'var(--danger)' }}
            />
          ) : null}
          {/*
            * The count is announced, not drawn. A 7px dot says "something is
            * waiting" to a sighted user and nothing at all otherwise, so the
            * number lives here where a screen reader will read it.
            */}
          <span className="sr-only">
            {unreadCount > 0
              ? `Action Center, ${unreadCount} open ${unreadCount === 1 ? 'action' : 'actions'}`
              : 'Action Center'}
          </span>
        </Link>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/*
            * The scrim is a button, not a div with onClick. Tapping outside to
            * close is an action, and an action that only a pointer can reach is
            * one a keyboard user cannot undo.
            */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[rgba(36,27,18,0.45)]"
          >
            <span className="sr-only">Close navigation</span>
          </button>

          <nav
            id="mobile-nav"
            aria-label="All sections"
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface shadow-xl"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-control bg-brand text-[12px] font-bold text-brand-on">
                EP
              </span>
              <span className="text-[15px] font-bold tracking-[-0.01em] text-ink-1">EtsyPilot</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center rounded-control text-ink-2 hover:bg-canvas-soft"
              >
                <X size={18} aria-hidden />
                <span className="sr-only">Close navigation</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-2">
                    {group.label}
                  </div>
                  <ul className="flex flex-col">
                    {group.items.map((item) =>
                      /*
                       * Unbuilt items are listed and not linked, exactly as in
                       * the sidebar (D54). The drawer is the only way to reach
                       * most of the product on a phone, so a "Soon" row that
                       * 404s would be worse here than anywhere.
                       */
                      item.unbuilt ? (
                        <li key={item.href}>
                          <span className="flex min-h-[44px] items-center justify-between rounded-control px-2.5 text-[13px] font-medium text-muted-1">
                            {item.label}
                            <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                              Soon
                            </span>
                          </span>
                        </li>
                      ) : (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={pathname === item.href ? 'page' : undefined}
                            className={cn(
                              'flex min-h-[44px] items-center justify-between rounded-control px-2.5 text-[13px]',
                              pathname === item.href
                                ? 'bg-brand-tint font-semibold text-brand-strong'
                                : 'font-medium text-ink-2',
                            )}
                          >
                            {item.label}
                            {counts[item.href] ? (
                              <span className="tnum text-[10.5px] font-semibold text-muted-1">
                                {counts[item.href]}
                              </span>
                            ) : null}
                          </Link>
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              ))}

              <ul className="flex flex-col border-t border-line pt-2">
                {NAV_FOOTER.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex min-h-[44px] items-center rounded-control px-2.5 text-[13px] font-medium text-ink-2"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  )
}
