'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils/cn'
import { isCurrentNavItem, type OperatorNavGroup } from '@/domain/admin/navigation'

/*
 * The operator sidebar: 264px, the same geometry as the seller rail
 * (Foundations 06/07), built from the same tokens.
 *
 * ── WHY IT TAKES GROUPS RATHER THAN AN ACCESS OBJECT ──────────────────────
 *
 * This is a client component, so everything it receives crosses into the
 * browser bundle. `AdminAccess` carries `can()` and `canSuperAdminOnly()` —
 * functions, which do not serialise — and the viewer's full permission list,
 * which has no business being in a payload just to decide what to draw.
 *
 * So the SERVER filters and this draws. The groups that arrive are the groups
 * this viewer may see; there is no list of what they may not, and no flag
 * saying a row was removed. Omitted, never locked: nothing here can render a
 * padlock because nothing here knows a padlock would be needed.
 *
 * Active state is a left rail PLUS a tint PLUS label weight — never colour
 * alone (artboard 89).
 */
export function OperatorSidebar({ groups }: { groups: OperatorNavGroup[] }) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Operator sections"
      className="hidden w-shell shrink-0 flex-col border-r border-line bg-surface lg:flex"
    >
      <div className="flex items-center gap-2.5 px-4 py-4">
        {/*
          * A DIFFERENT mark from the seller app's brand square, on purpose.
          * The sidebar is the thing in peripheral vision all day, so it carries
          * the same signal as the banner: an operator glancing at the corner
          * must not read "my shop". Fixed colours, as the banner's are, so the
          * mark is identical in both themes.
          */}
        <span
          className="flex h-[30px] w-[30px] items-center justify-center rounded-control text-[11px] font-bold"
          style={{ background: '#241B12', color: '#F7F3ED' }}
        >
          OPS
        </span>
        <span className="flex flex-col">
          <span className="text-[15px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
            Operations
          </span>
          <span className="text-[10px] font-medium leading-tight text-muted-1">EtsyPilot</span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-2.5 pb-1.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-muted-2">
              {group.label}
            </div>
            <ul className="flex flex-col gap-px">
              {group.items.map((item) => {
                const active = isCurrentNavItem(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={item.blurb}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center rounded-control py-2 pl-2.5 pr-2 text-[12.5px] transition-colors duration-150',
                        active
                          ? 'bg-brand-tint font-semibold text-brand-strong'
                          : 'font-medium text-ink-2 hover:bg-canvas-soft',
                      )}
                      style={active ? { boxShadow: 'inset 2px 0 0 var(--brand)' } : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {/*
        * Where the seller rail puts a plan meter, this puts the limit.
        *
        * Not decoration and not a disclaimer: the footer of the navigation is
        * where someone looks when they are casting about for the control that
        * does the thing. Saying it here, permanently, is cheaper than the
        * support conversation that starts "I couldn't find the button".
        */}
      <div className="border-t border-line px-4 py-3">
        <div className="text-[11px] font-semibold text-ink-2">Read-only console</div>
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-1">
          Nothing here changes a seller&rsquo;s data or their Etsy shop. Role and permission
          changes are the only writes, and both are recorded.
        </p>
      </div>
    </nav>
  )
}
