import type { ReactNode } from 'react'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'

/*
 * A titled panel in the operator console.
 *
 * ── SIX IDENTICAL COPIES ──────────────────────────────────────────────────
 *
 * `function Section({ title, blurb, children })` existed verbatim in admin/ai,
 * admin/usage, admin/operations, admin/etsy and admin/subscriptions, and a
 * sixth time in admin/metrics differing only by a missing `mb-3`. Every one of
 * them hand-rolled the same thing:
 *
 *     <Card className="mb-3 p-[18px]">
 *       <h2 className="text-small font-semibold text-ink-1">{title}</h2>
 *       <p className="mt-0.5 max-w-prose text-caption …">{blurb}</p>
 *       <div className="mt-3">{children}</div>
 *
 * That is the third time this console has been found keeping a helper in six
 * places — after the local `Nothing()` empty state and the table wrapper.
 *
 * ── THE PADDING COMES FROM THE PRIMITIVES NOW ─────────────────────────────
 *
 * CardHeader and CardBody own `p-[18px]`, so it is stated once for the whole
 * product rather than written out at every panel. WORTH RECORDING: the seller
 * app does not use CardHeader, CardTitle or CardBody either — they were dead
 * code, exported and imported by nobody. So this does not bring the operator
 * console into line with the seller side; it is the first thing in the
 * product to use them, and the seller pages are now the ones hand-rolling.
 *
 * The heading stays an h2 at 13px. `as` keeps the level right under the page's
 * single h1, and `text-small` keeps the size it has today — adopting a shared
 * component should not silently restyle six screens.
 */
export function OperatorSection({
  title,
  blurb,
  /** `false` on a panel that is the last in a grid cell and needs no gap. */
  spaced = true,
  children,
}: {
  title: string
  blurb: string
  spaced?: boolean
  children: ReactNode
}) {
  return (
    <Card className={spaced ? 'mb-3' : undefined}>
      <CardHeader className="flex-col items-start gap-0.5">
        <CardTitle as="h2" className="text-small">
          {title}
        </CardTitle>
        <p className="max-w-prose text-caption leading-relaxed text-muted-1">{blurb}</p>
      </CardHeader>
      <CardBody className="pt-3">{children}</CardBody>
    </Card>
  )
}
