import Link from 'next/link'
import type { ReactNode } from 'react'

/*
 * Page header.
 *
 * The subtitle always states period, shop and currency where the page reports
 * figures - "all figures in USD" is not decoration, it is part of the claim.
 *
 * ── ONE HEADER, INCLUDING IN THE OPERATOR CONSOLE ─────────────────────────
 *
 * Seven operator pages used to hand-roll
 *
 *     <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] …">
 *
 * which had already drifted from the `text-page` token this file uses. Three
 * of them also invented their own back-link markup, each slightly different,
 * for the one reason this component did not cover: it had nowhere to put one.
 * It does now, so there is no longer a reason to write a heading by hand, and
 * a test under app/(admin) fails on a literal <h1.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string
  /**
   * ReactNode, not string.
   *
   * The operator subtitles carry a link or a conditional clause — "Open an
   * account to see one in depth" appears only for a viewer who may. Forcing
   * them to a string is what kept those pages off this component.
   */
  subtitle?: ReactNode
  actions?: ReactNode
  /**
   * One level up, on a detail screen.
   *
   * NOT a breadcrumb trail. The operator console is two levels deep, and a
   * trail over two levels is decoration that takes a line of vertical space on
   * a phone to tell someone what the single link already tells them.
   */
  back?: { href: string; label: string }
}) {
  return (
    <div className="pb-5">
      {back ? (
        <Link
          href={back.href}
          className="text-small text-muted-1 underline underline-offset-2 hover:text-ink-2"
        >
          ← {back.label}
        </Link>
      ) : null}
      <div
        className={`flex flex-wrap items-start justify-between gap-4${back ? ' mt-3' : ''}`}
      >
        <div className="flex flex-col gap-1.5">
          <h1 className="text-page tracking-[-0.015em] text-ink-1">{title}</h1>
          {subtitle ? <div className="text-small text-muted-1">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
