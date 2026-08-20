'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { MOBILE_TABS } from './navigation'

/*
 * Five-item bottom tab bar at <= 767px (artboard 90).
 *
 * Mobile is re-composed around actions and summaries, not a shrunken desktop
 * dashboard - so this is a different navigation, not the sidebar squeezed.
 * 44px minimum touch targets.
 */
export function MobileTabs() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 flex border-t border-line bg-surface lg:hidden"
    >
      {MOBILE_TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-[44px] flex-1 items-center justify-center px-2 py-2.5 text-[11px]',
              active ? 'font-semibold text-brand-strong' : 'font-medium text-muted-1',
            )}
            style={active ? { boxShadow: 'inset 0 2px 0 var(--brand)' } : undefined}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
