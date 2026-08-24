'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { SETTINGS_NAV } from './navigation'

/*
 * The settings rail (artboards 72, 109, 110, 111).
 *
 * SETTINGS_NAV existed for eleven phases and nothing rendered it. Every
 * settings page was reachable only from the sidebar's single "Settings" entry,
 * so a seller who landed on Shop connections had no way to see that Costs &
 * fees or the Audit log existed at all. The table was right; there was just no
 * surface for it.
 *
 * Same unbuilt treatment as the main sidebar: listed, not linked, so the rail
 * never offers a destination Next will answer with a 404.
 */
export function SettingsNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Settings"
      className="shrink-0 border-line lg:w-[212px] lg:border-r lg:pr-3"
    >
      <div className="px-2.5 pb-1 text-[13px] font-bold text-ink-1 lg:pt-1">Settings</div>
      {SETTINGS_NAV.map((group) => (
        <div key={group.label} className="mb-3">
          <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-2">
            {group.label}
          </div>
          <ul className="flex flex-wrap gap-px lg:flex-col lg:flex-nowrap">
            {group.items.map((item) => {
              if (item.unbuilt) {
                return (
                  <li key={item.href}>
                    <span
                      className="flex items-center gap-2 rounded-control px-2.5 py-2 text-[13px] font-medium text-muted-1"
                      title="Not built yet"
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-2">
                        Soon
                      </span>
                    </span>
                  </li>
                )
              }
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-control px-2.5 py-2 text-[13px]',
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
      ))}
    </nav>
  )
}
