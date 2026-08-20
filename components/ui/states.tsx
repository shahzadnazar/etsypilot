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
}: {
  title: string
  description: string
  action?: ReactNode
}) {
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
}: {
  label: string
  reason: string
  remedy?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-[18px]">
      <span className="text-label text-muted-1">{label}</span>
      <p className="text-small text-ink-2">{reason}</p>
      {remedy ? <p className="text-caption text-muted-1">{remedy}</p> : null}
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
