'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PUBLIC NAVIGATION, AND THE DROPDOWNS THAT USED TO BE HOVER-ONLY.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The approved design's menus were `group-hover:visible` with a hardcoded
 * `aria-expanded="false"` that nothing ever changed. Three separate failures
 * in one pattern, and they are worth naming because each has a different
 * victim:
 *
 *   NO POINTER, NO MENU      A keyboard user could focus the button and press
 *                            Enter and Return and Space, and nothing opened.
 *                            `group-focus-within` opened it when focus reached
 *                            a link INSIDE the panel — which is unreachable
 *                            until the panel is open. A touch device has no
 *                            hover at all, so the mobile sheet was the only
 *                            way in and the desktop menus were simply dead.
 *   A LIE TO A SCREEN READER `aria-expanded="false"` on a menu that is open
 *                            and painted is worse than no attribute: it is a
 *                            statement, and it is false.
 *   NO WAY OUT               No Escape, no outside click. A menu that opens on
 *                            hover and closes on un-hover needs neither; one
 *                            that can be opened deliberately needs both.
 *
 * ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────
 *
 * One real button per menu, owning one piece of state, with `aria-expanded`
 * rendered FROM that state so the two cannot disagree. Hover still opens it on
 * a device that has a pointer — the design's feel is kept — but hover is now a
 * second way in rather than the only one, and it is applied with pointer
 * events rather than CSS so the same state drives both.
 *
 * `aria-haspopup` is deliberately absent. It announces a menu widget, and a
 * menu widget owes the reader arrow-key roving, type-ahead and a `menuitem`
 * role on every child. This is a disclosure holding a list of links: Tab moves
 * through them, which is what a reader of links expects, and claiming
 * otherwise would promise an interaction model that is not implemented.
 */

export interface NavLink {
  label: string
  href: string
  description?: string
}

/*
 * Every destination on this page resolves to something that exists — a route,
 * or a section on this page. `tests/unit/links.test.ts` checks the first kind
 * against the filesystem and `tests/unit/landing-page.test.ts` checks the
 * second against the rendered sections, which is what stopped the previous
 * export's `href="#signup"` (no such element) and its three bare `href="#"`.
 */
const FEATURES: NavLink[] = [
  {
    label: 'Keyword research',
    href: '/#discover',
    description: 'Demand bands, competition and seasonality, from modelled sample data.',
  },
  {
    label: 'Profit intelligence',
    href: '/#profit',
    description: 'Every fee and every cost, subtracted from what the buyer actually paid.',
  },
  {
    label: 'Listing checks',
    href: '/#listings',
    description: 'Mechanical rules against your own fields, each with its evidence.',
  },
  {
    label: 'Shop performance',
    href: '/#performance',
    description: 'What changed this period, and what the product can and cannot explain.',
  },
  {
    label: 'Safer bulk updates',
    href: '/#bulk',
    description: 'Select, see the diff, then apply. Nothing reaches Etsy unconfirmed.',
  },
]

const RESOURCES: NavLink[] = [
  /*
   * `/#provenance` was this, and the provenance section came off the
   * homepage. The methodology page in the product is where that answer
   * actually lives, at greater length — so the link follows the content
   * rather than pointing at an anchor nothing answers to. A plain href,
   * because the demo door is a route handler whose 303 the client router
   * cannot apply.
   */
  { label: 'How the figures are made', href: '/api/demo/enter?to=/data/methodology', description: 'How each figure is produced, and what is withheld.' },
  { label: 'Common questions', href: '/#faq', description: 'What this is, what it is not, and what it costs.' },
  { label: 'Data sources', href: '/api/demo/enter?to=/data/sources', description: 'The catalogue of what this product reads from.' },
  { label: 'Pricing comparison', href: '/pricing/compare', description: 'Every limit on Free, Basic and Pro, side by side.' },
]

export function MarketingNav() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileId = useId()

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        borderColor: 'var(--border)',
        /*
         * Opaque, not a translucent blur. A backdrop-filter over a scrolling
         * page repaints on every frame on the devices least able to afford it,
         * and the design reads the same without it.
         */
        background: 'var(--surface)',
      }}
    >
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-[1180px] items-center gap-2 px-4 py-3 md:px-6"
      >
        <Link
          href="/"
          className="mr-2 flex items-center gap-2"
          /* One logo. The export rendered the mark and the wordmark as two
           * separate links to the same place, which is two tab stops and two
           * announcements of the same destination. */
        >
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center text-[13px] font-bold"
            style={{
              background: 'var(--brand)',
              color: 'var(--on-brand)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            CR
          </span>
          <span className="display text-[17px]" style={{ color: 'var(--ink-1)' }}>
            CobaltRank
          </span>
        </Link>

        <div className="ml-2 hidden items-center gap-1 lg:flex">
          <NavMenu label="Features" items={FEATURES} />
          {/*
            * `/#calculator` until the homepage calculator section was
            * removed. This is the calculator that has a URL of its own — a
            * real public route in app/(public), no account needed — so the
            * nav item still leads somewhere that divides two numbers.
            */}
          <Link href="/tools/etsy-seller-calculator" className="nav-link inline-flex">
            Free tools
          </Link>
          <NavMenu label="Resources" items={RESOURCES} />
          <Link href="/pricing" className="nav-link inline-flex">
            Pricing
          </Link>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="nav-link hidden sm:inline-flex">
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-10 items-center px-3.5 text-[13.5px] font-semibold"
            style={{
              background: 'var(--brand)',
              color: 'var(--on-brand)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            Start for Free
          </Link>

          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls={mobileId}
            aria-label={mobileOpen ? 'Close the navigation menu' : 'Open the navigation menu'}
            onClick={() => setMobileOpen((open) => !open)}
            className="grid h-10 w-10 place-items-center border lg:hidden"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--ink-2)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            <span aria-hidden className="text-[17px] leading-none">
              {mobileOpen ? '✕' : '☰'}
            </span>
          </button>
        </div>
      </nav>

      {/*
        * The mobile sheet is rendered only when open rather than hidden with a
        * class. A `display:none` panel is out of the tab order anyway, but it
        * stays in the accessibility tree in some combinations and it keeps its
        * links in the DOM for a reader walking by element rather than by
        * focus. Unmounting answers both.
        */}
      {mobileOpen ? (
        <div
          id={mobileId}
          className="border-t px-4 py-3 lg:hidden"
          style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
        >
          <MobileGroup label="Features" items={FEATURES} onNavigate={() => setMobileOpen(false)} />
          <MobileGroup label="Resources" items={RESOURCES} onNavigate={() => setMobileOpen(false)} />
          <Link
            href="/tools/etsy-seller-calculator"
            className="mobile-link"
            onClick={() => setMobileOpen(false)}
          >
            Free tools
          </Link>
          <Link href="/pricing" className="mobile-link" onClick={() => setMobileOpen(false)}>
            Pricing
          </Link>
          <Link href="/login" className="mobile-link" onClick={() => setMobileOpen(false)}>
            Log in
          </Link>
        </div>
      ) : null}
    </header>
  )
}

/* ─────────────────────────────────────────────────────── one desktop menu */

function NavMenu({ label, items }: { label: string; items: NavLink[] }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  /*
   * Escape closes and returns focus to the trigger; a click anywhere outside
   * closes without moving focus. Both are registered only while the menu is
   * open, so a page with two menus on it has at most one pair of listeners
   * rather than four that have to decide whether they are the ones that care.
   */
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (wrapper.current?.contains(event.target as Node)) return
      setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div
      ref={wrapper}
      className="relative"
      /*
       * Hover, for a device that has a pointer. `onPointerEnter` fires for a
       * mouse and a pen and not for a touch tap, so a phone gets the click
       * behaviour and a desktop gets both — one state, two ways in.
       */
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') setOpen(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') setOpen(false)
      }}
      /*
       * And the whole group closes when focus leaves it, which is what makes
       * Tab out of the last link behave the way a sighted mouse user's
       * pointer-leave does.
       */
      onBlur={(event) => {
        if (!wrapper.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="nav-link inline-flex items-center gap-1"
      >
        {label}
        <span
          aria-hidden
          className="text-[10px] leading-none transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute left-0 top-full z-50 mt-1 w-[22rem] border p-1.5"
          style={{
            borderColor: 'var(--border-strong)',
            background: 'var(--surface)',
            borderRadius: 'var(--card-radius)',
            boxShadow:
              '0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
          }}
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="menu-row block px-3 py-2.5"
              style={{ borderRadius: 'var(--paper-radius)' }}
            >
              <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                {item.label}
              </span>
              {item.description ? (
                <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: 'var(--muted-1)' }}>
                  {item.description}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/* ──────────────────────────────────────────────────────── the mobile sheet */

function MobileGroup({
  label,
  items,
  onNavigate,
}: {
  label: string
  items: NavLink[]
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="border-b py-1" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="mobile-link flex w-full items-center justify-between"
      >
        {label}
        <span aria-hidden className="text-[11px]">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="pb-2 pl-3">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="mobile-link" onClick={onNavigate}>
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
