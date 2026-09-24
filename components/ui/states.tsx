import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { Button } from './button'

/*
 * The shared state surfaces.
 *
 * rules.md section 12: never fail silently. A user-facing error explains what
 * happened, what the user can do next, and whether retry is available - so
 * ErrorState takes all three rather than a single message string.
 */

export function EmptyState({
  title,
  description,
  action,
  quiet = false,
}: {
  title: string
  /**
   * ReactNode, not string.
   *
   * The operator empties carry a count that changes with the data and, on the
   * managers screen, a link. A string type is what kept nine of them written
   * out by hand as bare text in a Card.
   */
  description: ReactNode
  action?: ReactNode
  /**
   * Inside a section that already has its own heading and card.
   *
   * The operator screens have two kinds of nothing and they are not the same
   * shape. A PAGE with no rows gets the full card: it is the whole screen, and
   * a heading and a border are what stop it reading as a screen that failed to
   * load. A SECTION with no rows sits inside a card that already has a title
   * above it, so the full treatment would nest a card in a card and put a
   * second heading under the first.
   *
   * Quiet keeps what matters — a title that says what is empty, and a
   * description that says what would put something in it — and drops the
   * chrome the surroundings already provide. It is the same component either
   * way, which is the point: these were nine copies of a local `Nothing`
   * helper that had no title at all.
   */
  quiet?: boolean
}) {
  if (quiet) {
    return (
      <div className="flex flex-col items-start gap-1">
        <p className="text-small font-semibold text-ink-1">{title}</p>
        <p className="max-w-prose text-small leading-relaxed text-ink-2">{description}</p>
        {action}
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-6">
      <h3 className="text-section text-ink-1">{title}</h3>
      <p className="max-w-prose text-body text-ink-2">{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({
  title,
  recovery,
  reference,
  onRetry,
}: {
  title: string
  recovery: string
  reference?: string
  onRetry?: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-6"
      style={{ borderLeft: '3px solid var(--danger)' }}
    >
      <h3 className="text-section text-ink-1">{title}</h3>
      <p className="max-w-prose text-body text-ink-2">{recovery}</p>
      {reference ? (
        <p className="tnum text-caption text-muted-1">Reference {reference}</p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Unavailable is not an error and not an empty state. Etsy does not expose the
 * metric, so we explain why and offer the supported next action instead of a
 * number (Methodology 93).
 */
export function UnavailableCard({
  label,
  reason,
  remedy,
  action,
  badge,
  tight = false,
}: {
  label: string
  reason: ReactNode
  remedy?: ReactNode
  action?: ReactNode
  /**
   * The provenance badge, beside the label.
   *
   * Optional because the seller screens that use this component are already
   * inside a section whose provenance is stated once. The operator figures are
   * a grid of independent numbers, and an UNAVAILABLE one with no badge is the
   * only figure on the screen not saying where it came from — which is the
   * gap this whole pass exists to close.
   */
  badge?: ReactNode
  /** Inside a grid of figures rather than standing alone as a panel. */
  tight?: boolean
}) {
  return (
    <div
      className={
        tight
          ? 'flex flex-col gap-1 rounded-card border border-line bg-canvas-soft p-3'
          : 'flex flex-col gap-2 rounded-card border border-line bg-surface p-[18px]'
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        {badge}
      </div>
      <p className={tight ? 'text-caption leading-relaxed text-ink-2' : 'text-small text-ink-2'}>
        {reason}
      </p>
      {remedy ? <p className="text-caption leading-relaxed text-muted-1">{remedy}</p> : null}
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-control bg-canvas-soft', className)}
    />
  )
}
