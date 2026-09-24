import type { ReactNode } from 'react'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { ProvenanceButton } from '@/components/provenance/provenance-button'
import { UnavailableCard } from '@/components/ui/states'
import { Numeric } from '@/components/ui/numeric'
import { formatNumber } from '@/lib/utils/format'
import type { Provenanced } from '@/lib/provenance/types'

/*
 * One operator figure, with the provenance that produced it.
 *
 * ── IT WAS COPY-PASTED THREE TIMES ────────────────────────────────────────
 *
 * A local `Figure()` existed verbatim in admin/ai and admin/users/[userId],
 * and admin/metrics had the same markup inlined a third time. Each rendered an
 * unavailable figure as an em dash plus a paragraph, which is the shape
 * components/ui/states.tsx already has a component for.
 *
 * ── A NULL VALUE CANNOT RENDER AS A NUMBER ────────────────────────────────
 *
 * The branch below is the point of the component rather than a detail of it.
 * `Provenanced<T>.value` is nullable, and an UNAVAILABLE figure renders its
 * REASON where the numeral would be — through UnavailableCard, so it looks
 * like every other unavailable surface in the product. There is no path that
 * shows a blank where a number is expected and lets the reader fill it in,
 * and no path that renders 0 for "we do not know".
 *
 * ── THE BADGE IS NOT OPTIONAL ─────────────────────────────────────────────
 *
 * Both branches carry one, including the unavailable branch, because
 * "unavailable" is itself a provenance class and a figure that does not say
 * where it came from is the thing the seller app is built to never do. The
 * screen used to be able to omit it by forgetting; now the only way to render
 * a figure is through a component that always draws it.
 */
export function OperatorFigure({
  label,
  figure,
  suffix,
  footnote,
  valueClassName,
  frame = 'card',
  metricKey,
}: {
  label: string
  figure: Provenanced<string | number>
  /** '%' and the like. Never a currency — money goes through Money. */
  suffix?: string
  /** The denominator, the coverage, whatever makes the number readable. */
  footnote?: ReactNode
  /** The tone the count is rendered in, where the screen has one. */
  valueClassName?: string
  /**
   * 'bare' for a tile already inside a Card grid.
   *
   * The count grids on usage, subscriptions, operations and etsy are five to
   * seven tiles wide and already sit inside a bordered panel. Drawing another
   * border around each one would be a card in a card five times across.
   */
  frame?: 'card' | 'bare'
  /**
   * A key in lib/provenance/methodology.ts, where the metric has a full
   * explanation.
   *
   * With one, the badge becomes a button that opens the methodology drawer —
   * the seller app's "see how this is calculated", which no operator screen
   * had. Without one it stays a static badge: ProvenanceButton falls back to
   * exactly that rather than rendering a control that does nothing.
   */
  metricKey?: string
}) {
  const badge = metricKey ? (
    <ProvenanceButton metricKey={metricKey} type={figure.provenance.type} />
  ) : (
    <ProvenanceBadge
      type={figure.provenance.type}
      srDetail={`${label}: ${figure.provenance.methodology}`}
    />
  )

  const limitations = figure.provenance.limitations?.map((limitation) => (
    <p key={limitation} className="text-caption leading-relaxed text-muted-1">
      {limitation}
    </p>
  ))

  if (figure.value === null) {
    return (
      <UnavailableCard
        tight
        label={label}
        badge={badge}
        reason={figure.provenance.methodology}
        remedy={limitations ? <>{limitations}</> : undefined}
      />
    )
  }

  return (
    <div
      className={
        frame === 'bare'
          ? 'flex flex-col gap-1'
          : 'flex flex-col gap-1 rounded-card border border-line bg-canvas-soft p-3'
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="text-label leading-snug text-muted-1">{label}</span>
        {badge}
      </div>
      <Numeric className={valueClassName ?? 'text-[18px] font-semibold text-ink-1'}>
        {typeof figure.value === 'number' ? formatNumber(figure.value) : figure.value}
        {suffix}
      </Numeric>
      {footnote ? <p className="text-caption leading-relaxed text-muted-1">{footnote}</p> : null}
      {limitations}
    </div>
  )
}
