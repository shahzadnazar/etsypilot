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
import { formatSignedCurrency } from '@/lib/utils/format'

export function Numeric({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  /**
   * A tone colour, and only that.
   *
   * Several operator figures carry `--danger-ink` or `--warning-ink` as an
   * inline value rather than a class, which is this codebase's convention for
   * tones (D1/D10: a token background with a literal foreground breaks on
   * theme flip). Without this prop those figures had to stay hand-written
   * spans, which is exactly how the two rules above get forgotten one cell at
   * a time.
   */
  style?: React.CSSProperties
}) {
  return (
    <span className={cn('tnum whitespace-nowrap', className)} style={style}>
      {children}
    </span>
  )
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

  /*
   * The sign is the VALUE's, not the caller's.
   *
   * This used to render `formatCurrency(Math.abs(value))` and prefix a minus
   * only when `negate` was passed. So a negative number displayed as a positive
   * one — and the number that matters most in this product is net profit, which
   * goes negative exactly when a seller most needs to know.
   *
   * Found by rendering the app against a shop with no orders: fixed labour and
   * other costs still apply, so net profit was −$1,322.05 and the screen said
   * "Net profit $1,322.05". A loss shown as a profit. Invisible for eleven
   * phases because the demo shop is profitable and nothing else was ever tried.
   *
   * `negate` keeps its meaning — "this value is a deduction, show it as one" —
   * but it now flips the sign rather than erasing it, so a negative cost (a
   * refund, a credit) correctly reads as a positive line instead of being
   * silently turned into another deduction.
   */
  return (
    <Numeric className={className}>{formatSignedCurrency(value, currency, { negate })}</Numeric>
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
