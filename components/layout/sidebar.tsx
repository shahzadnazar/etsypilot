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

/*
 * The plan meter.
 *
 * Over the limit it says what ACTUALLY happens, which plans.ts has stated all
 * along: new bulk jobs pause, nothing is deleted, and the seller chooses what
 * to remove. A red number with no sentence beside it invites the fear the
 * product spends its effort not creating — that data is about to disappear.
 *
 * A limit of 0 means "not offered on this plan" rather than "none allowed", so
 * it renders as a count with no denominator instead of a division by zero.
 */
export function PlanUsage({ usage }: { usage: { used: number; limit: number } }) {
  const over = usage.limit > 0 && usage.used > usage.limit
  return (
    <>
      <div className={cn('tnum text-caption', over ? 'font-semibold text-danger' : 'text-muted-1')}>
        {usage.limit > 0
          ? `${usage.used.toLocaleString('en-US')} / ${usage.limit.toLocaleString('en-US')} listings`
          : `${usage.used.toLocaleString('en-US')} listings`}
      </div>
      {over ? (
        <p className="mt-1 text-[10.5px] leading-relaxed text-muted-1">
          Over your plan limit. New bulk jobs pause — nothing is deleted, and you choose what to
          remove.{' '}
          <Link href="/billing" className="font-semibold text-brand-strong underline underline-offset-2">
            Change plan
          </Link>
        </p>
      ) : null}
    </>
  )
}

export function Sidebar({
  plan,
  usage,
  counts,
}: {
  plan: string
  /*
   * Structured, not a pre-formatted string.
   *
   * It used to arrive as "412 / 200 listings" and render as grey text, so a
   * shop 212 listings OVER its plan looked identical to one comfortably under
   * it. The billing page had an at-limit state all along; the shell — the thing
   * on every screen — did not, so the one number a seller sees constantly was
   * the one that could not tell them anything was wrong.
   */
  usage: { used: number; limit: number }
  /*
   * Measured counts, keyed by href. Empty is a valid state and renders no
   * chip — the alternative was the literal badges this replaces, which said
   * Action Center "2" while the bell said 5.
   */
  counts: Record<string, number>
}) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Main"
      className="hidden w-shell shrink-0 flex-col border-r border-line bg-surface lg:flex"
    >
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-control bg-brand text-[12px] font-bold text-brand-on">
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
                if (item.unbuilt) {
                  /*
                   * Listed, not linked. Every one of these used to be a <Link>
                   * to a 404 — the sidebar advertised 38 surfaces when 17
                   * existed. Showing the item keeps the roadmap honest; making
                   * it a destination was the dishonest half.
                   */
                  return (
                    <li key={item.href}>
                      <span
                        className="flex items-center justify-between rounded-control py-2 pl-2.5 pr-2 text-[12.5px] font-medium text-muted-1"
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
                      {counts[item.href] ? (
                        <span className="tnum text-[10.5px] font-semibold text-muted-1">
                          {counts[item.href]}
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
        <PlanUsage usage={usage} />
      </div>
    </nav>
  )
}
