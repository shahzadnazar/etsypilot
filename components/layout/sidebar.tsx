'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { NAV_FOOTER, NAV_GROUPS } from './navigation'

/*
 * Sidebar: 264px expanded, 72px collapsed (Foundations 06/07).
 *
 * Active state is a left rail PLUS a tint PLUS label weight - never colour
 * alone (artboard 89).
 */

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function Sidebar({ plan, listingUsage }: { plan: string; listingUsage: string }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      className="hidden w-shell shrink-0 flex-col border-r border-line bg-surface lg:flex"
    >
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-control bg-brand text-[12px] font-bold text-white">
          EP
        </span>
        <span className="text-[15px] font-bold tracking-[-0.01em] text-ink-1">EtsyPilot</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-2.5 pb-1.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-2">
              {group.label}
            </div>
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between rounded-control py-2 pl-2.5 pr-2 text-[12.5px] transition-colors duration-150',
                        active
                          ? 'bg-brand-tint font-semibold text-brand-strong'
                          : 'font-medium text-ink-2 hover:bg-canvas-soft',
                      )}
                      style={
                        active ? { boxShadow: 'inset 2px 0 0 var(--brand)' } : undefined
                      }
                    >
                      <span>{item.label}</span>
                      {item.badge ? (
                        <span className="tnum text-[10.5px] font-semibold text-muted-1">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        <ul className="flex flex-col gap-px border-t border-line pt-3">
          {NAV_FOOTER.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex rounded-control py-2 pl-2.5 pr-2 text-[12.5px] transition-colors duration-150',
                    active
                      ? 'bg-brand-tint font-semibold text-brand-strong'
                      : 'font-medium text-ink-2 hover:bg-canvas-soft',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Plan usage footer. D22: listings and AI generations only - no shop or
          seat meters, since neither exists in MVP. */}
      <div className="border-t border-line px-4 py-3">
        <div className="text-[11px] font-semibold text-ink-2">{plan} plan</div>
        <div className="tnum text-caption text-muted-1">{listingUsage}</div>
      </div>
    </nav>
  )
}
