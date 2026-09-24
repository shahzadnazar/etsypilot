'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { isCurrentNavItem, type OperatorNavGroup } from '@/domain/admin/navigation'
import { useOperatorDrawer } from './operator-drawer'

/*
 * The operator bottom tab bar on a phone.
 *
 * ── WHY THERE WAS NONE, AND WHY THAT REASONING SURVIVES ───────────────────
 *
 * operator-mobile-bar.tsx argued against one, and it was right about the
 * thing it was arguing against: the seller app has FIVE FIXED tabs because
 * every seller has the same five destinations, and an operator's are not
 * fixed — a manager holding one permission has one screen, a super admin has
 * all of them. A hard-coded five-tab bar would show a manager four tabs that
 * 404 them, which is the exact failure D54a exists to prevent and worse here,
 * because a padlocked operator screen is reconnaissance (D91).
 *
 * The fix is not to hard-code five. It is to build the bar from
 * visibleOperatorNav(access) — the SAME filtered list the rail and the drawer
 * render, computed on the server from the same `can` the pages gate on. There
 * is no second opinion about what this viewer may reach, so nothing in this
 * bar can be a link their permissions would refuse.
 *
 * ── IT SHRINKS, IT DOES NOT PAD ───────────────────────────────────────────
 *
 * A viewer with two visible items gets two tabs. Not two tabs and three
 * greyed-out ones, and not two tabs stretched to fill five slots' worth of
 * chrome: omitted, never locked, which is the rule the sidebar already
 * follows.
 *
 * ── "MORE" APPEARS ONLY WHEN THERE IS MORE ────────────────────────────────
 *
 * A fifth slot opens the drawer, and it is rendered only when the bar is
 * actually hiding something. With four or fewer visible items the bar already
 * holds all of them, and a More that reveals nothing new is D70's control
 * that appears to do something and does not. The hamburger in the top bar
 * still opens the same drawer either way, so nothing becomes unreachable —
 * the drawer also carries each item's blurb, which the bar has no room for.
 *
 * Every target is 44px tall (D56/D61).
 */
export function OperatorMobileTabs({ groups }: { groups: OperatorNavGroup[] }) {
  const pathname = usePathname()
  const { open, setOpen } = useOperatorDrawer()

  const items = groups.flatMap((group) => group.items)
  if (items.length === 0) return null

  /*
   * Four, then More. The order is OPERATOR_NAV's own, so the bar and the rail
   * agree about which screens come first — a bar that ranked items some other
   * way would put a different "first" screen on a phone than on a desktop.
   */
  const shown = items.slice(0, 4)
  const hidden = items.length - shown.length

  return (
    <nav
      /*
       * "Primary", matching the seller app's MobileTabs, and NOT "Operator
       * sections" — which the rail and the drawer already carry. Landmark
       * labels are how a screen-reader user picks between navigations, and at
       * 390px this bar and the drawer can both be in the document at once.
       * Three landmarks with one name is a list of three identical choices.
       */
      aria-label="Primary"
      className="sticky bottom-0 z-10 flex border-t border-line bg-surface lg:hidden"
    >
      {shown.map((item) => {
        const active = isCurrentNavItem(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-[44px] flex-1 items-center justify-center px-2 py-2.5 text-center text-[11px] leading-tight',
              active ? 'font-semibold text-brand-strong' : 'font-medium text-muted-1',
            )}
            style={active ? { boxShadow: 'inset 0 2px 0 var(--brand)' } : undefined}
          >
            {item.label}
          </Link>
        )
      })}

      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          /*
           * aria-expanded is not decoration here, it is what makes
           * aria-controls valid.
           *
           * FOUND BY AXE, once it started running on every screen instead of
           * on /admin/users alone: aria-valid-attr-value failed on this
           * button at every width, on every screen. The drawer is unmounted
           * while closed, so `operator-nav` refers to nothing — which ARIA
           * permits only for a control that declares itself collapsed. The
           * hamburger already did; this one did not, so it was pointing at an
           * element that did not exist and saying nothing about why.
           */
          aria-expanded={open}
          aria-controls="operator-nav"
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1 px-2 py-2.5 text-[11px] font-medium leading-tight text-muted-1"
        >
          <Menu size={14} aria-hidden />
          More
          {/* The count, so "More" is not a guess about how much more. */}
          <span className="sr-only">
            : {hidden} more operator {hidden === 1 ? 'section' : 'sections'}
          </span>
        </button>
      ) : null}
    </nav>
  )
}
