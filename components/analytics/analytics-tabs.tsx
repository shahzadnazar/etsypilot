import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { NAV_GROUPS } from '@/components/layout/navigation'

/*
 * The Analytics tab row (artboard 51).
 *
 * The artboard draws Performance / Listings / Customers / Traffic imports /
 * Experiments as tabs on one screen. Two of them — Sales map and Experiments —
 * have their own artboards and their own nav entries, so they are routes here
 * and the row links across rather than duplicating them.
 *
 * The list is read from NAV_GROUPS, so a tab cannot advertise a surface the
 * sidebar calls Soon: links.test.ts already asserts that flag against the
 * filesystem in both directions, and this inherits it.
 */
export function AnalyticsTabs({ current }: { current: string }) {
  const items = NAV_GROUPS.find((g) => g.label === 'Analytics')?.items ?? []

  return (
    <nav aria-label="Analytics views" className="mb-4 flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.href === current
        if (item.unbuilt) {
          return (
            <span
              key={item.href}
              title="Not built yet"
              className="inline-flex h-11 items-center gap-2 rounded-control px-3 text-[12px] font-medium text-muted-1 md:h-[38px]"
            >
              {item.label}
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                Soon
              </span>
            </span>
          )
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-11 items-center rounded-control px-3 text-[12px] font-semibold md:h-[38px]',
              active
                ? 'bg-brand-tint text-brand-strong'
                : 'border border-line text-ink-2 hover:bg-canvas-soft',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
