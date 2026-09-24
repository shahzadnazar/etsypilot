'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { isCurrentNavItem, type OperatorNavGroup } from '@/domain/admin/navigation'

/*
 * The operator panel below `lg`: a 56px bar and a drawer.
 *
 * D61: the mobile shell is a different bar, not a smaller one. Same reasoning
 * as MobileTopBar in the seller app — the two hold different things in a
 * different order, and expressing that as a pile of hidden/lg:flex on shared
 * markup produces something nobody can read or change safely.
 *
 * ── NO BOTTOM TAB BAR ─────────────────────────────────────────────────────
 *
 * The seller app has five fixed tabs because every seller has the same five
 * destinations. An operator's are not fixed: a manager holding one permission
 * has one screen, a super admin has all of them.
 *
 * A permission-derived bar WAS built — four visible items plus a More that
 * opened this drawer, shrinking rather than padding for a viewer with fewer.
 * It worked as specified and the owner did not want it. Operator navigation
 * is this drawer and the desktop rail, for all three roles, which is what it
 * was before the bar and what it is again.
 *
 * The drawer carries everything with each item's blurb, and carries the same
 * set the rail does — which is the property that actually matters.
 *
 * Every control is 44×44 (D56/D61), which is the design's own figure and
 * comfortably past WCAG 2.2's 24×24. The negative margins are the design's
 * too: they let a 44px target sit flush to a 14px gutter without the icon
 * looking inset.
 */
export function OperatorMobileBar({ groups }: { groups: OperatorNavGroup[] }) {
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

  /*
   * The open item's label, so the bar says where you are.
   *
   * On a phone the drawer is shut almost all the time, which means the bar is
   * the only thing on screen that could answer "which operator screen is
   * this?" — the seller bar answers the equivalent question with the shop chip.
   */
  const current = groups
    .flatMap((group) => group.items)
    .find((item) => isCurrentNavItem(pathname, item.href))

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3.5 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="operator-nav"
          className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-2 hover:bg-canvas-soft"
        >
          <Menu size={20} aria-hidden />
          <span className="sr-only">Open operator navigation</span>
        </button>

        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[12px] font-semibold leading-none text-ink-1">
            {current?.label ?? 'Operations'}
          </span>
          <span className="truncate text-[10px] font-medium leading-none text-muted-1">
            Operator console · read-only
          </span>
        </span>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/*
            * The scrim is a button, not a div with onClick. Tapping outside to
            * close is an action, and an action only a pointer can reach is one
            * a keyboard user cannot undo.
            */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[rgba(36,27,18,0.45)]"
          >
            <span className="sr-only">Close navigation</span>
          </button>

          <nav
            id="operator-nav"
            /* Distinct from the bottom bar's "Primary": this one is all of
               them, with their blurbs, rather than the first four. */
            aria-label="All operator sections"
            className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-surface shadow-overlay"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
              <span
                className="flex h-[30px] w-[30px] items-center justify-center rounded-control text-[11px] font-bold"
                style={{ background: '#241B12', color: '#F7F3ED' }}
              >
                OPS
              </span>
              <span className="text-[15px] font-bold tracking-[-0.01em] text-ink-1">
                Operations
              </span>
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
              {groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-2">
                    {group.label}
                  </div>
                  <ul className="flex flex-col">
                    {group.items.map((item) => {
                      const active = isCurrentNavItem(pathname, item.href)
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex min-h-[44px] flex-col justify-center gap-0.5 rounded-control px-2.5 py-2 text-[13px]',
                              active
                                ? 'bg-brand-tint font-semibold text-brand-strong'
                                : 'font-medium text-ink-2',
                            )}
                          >
                            {item.label}
                            {/*
                              * The blurb is a title attribute on the desktop
                              * rail and real text here. A tooltip needs a
                              * pointer that hovers, which a phone has not got,
                              * so on the surface where hover does not exist the
                              * sentence is simply shown.
                              */}
                            <span className="text-[10.5px] font-normal leading-snug text-muted-1">
                              {item.blurb}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}

              <p className="mt-2 border-t border-line px-2.5 pt-3 text-[10.5px] leading-relaxed text-muted-1">
                Read-only console. Nothing here changes a seller&rsquo;s data or their Etsy shop.
              </p>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  )
}
