import Link from 'next/link'
import type { ReactNode } from 'react'

/*
 * The one 404 layout, worded by whoever renders it.
 *
 * ── WHY THIS EXISTS RATHER THAN A SECOND 404 PAGE ─────────────────────────
 *
 * app/(admin)/not-found.tsx used to be a one-line re-export of the seller's
 * 404, and the stated reason — one page, so the two cannot drift into two
 * different-looking 404s — was sound. The result was not. An operator who
 * typed a URL they could not reach was told:
 *
 *   "The link may be outdated, or the listing was deleted on Etsy. Nothing is
 *    broken with your account."       [Back to overview]  [Listing audit]
 *
 * There are no listings in the operator console, nothing was deleted on Etsy,
 * and both buttons threw the operator out into the seller app. Every word of
 * it was false on every operator route.
 *
 * So the LAYOUT is shared and the WORDS are not. The two 404s stay visually
 * identical because they are the same component; they stop saying the same
 * thing because saying the same thing was the defect.
 */

export interface NotFoundLink {
  href: string
  label: string
}

export function NotFoundFrame({
  body,
  links,
}: {
  /** The sentence under the heading. Whatever is true where this rendered. */
  body: ReactNode
  /**
   * Where to go instead, first one emphasised.
   *
   * May be empty, and renders nothing when it is. A viewer with nowhere to be
   * sent gets no buttons rather than a button to somewhere they would be
   * refused — the same rule the operator navigation follows: omitted, never
   * offered and then denied.
   */
  links: readonly NotFoundLink[]
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <p className="tnum text-metric text-muted-2">404</p>
      <h1 className="text-page text-ink-1">That page doesn&rsquo;t exist</h1>
      <p className="text-body text-ink-2">{body}</p>
      {links.length > 0 ? (
        <div className="flex gap-2">
          {links.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                index === 0
                  ? 'rounded-control bg-brand px-3.5 py-2.5 text-[12.5px] font-semibold text-brand-on'
                  : 'rounded-control border border-line px-3.5 py-2.5 text-[12.5px] font-semibold text-ink-2'
              }
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </main>
  )
}
