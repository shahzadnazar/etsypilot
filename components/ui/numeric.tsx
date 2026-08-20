/*
 * Numeric and money cells.
 *
 * Shared so the two rules below cannot be forgotten one cell at a time:
 *
 *   1. Numerals are tabular and never wrap. A figure that breaks across two
 *      lines reads as a dash on one line and a number on the next, which is
 *      how "−$13.42" came to look like two separate values.
 *
 *   2. A null money value renders as an em dash, never 0.00. A zero in a money
 *      column is a claim; "we do not know" is not zero. Same reasoning as
 *      unavailable() returning value: null with no shape for a fallback.
 */

import { cn } from '@/lib/utils/cn'
import { formatCurrency } from '@/lib/utils/format'

export function Numeric({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <span className={cn('tnum whitespace-nowrap', className)}>{children}</span>
}

/**
 * `value: null` is the whole point of this component. There is no prop through
 * which a caller can substitute a fallback figure.
 */
export function Money({
  value,
  currency = 'USD',
  negate = false,
  unknownLabel = 'Not known',
  className,
}: {
  value: number | null
  currency?: string
  /** Render as a deduction, e.g. −$14.20. */
  negate?: boolean
  /** Tooltip and screen-reader text for the em dash. */
  unknownLabel?: string
  className?: string
}) {
  if (value === null) {
    return (
      <Numeric className={cn('text-muted-1', className)}>
        <span title={unknownLabel} aria-hidden>
          —
        </span>
        <span className="sr-only">{unknownLabel}</span>
      </Numeric>
    )
  }

  return (
    <Numeric className={className}>
      {negate ? '−' : ''}
      {formatCurrency(Math.abs(value), currency)}
    </Numeric>
  )
}

/** A right-aligned table cell that already carries both rules. */
export function NumericCell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <td className={cn('tnum whitespace-nowrap px-3 py-3 text-right text-small', className)}>
      {children}
    </td>
  )
}
