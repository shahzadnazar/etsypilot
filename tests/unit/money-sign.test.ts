/*
 * A negative figure must read as negative.
 *
 * This exists because it did not. Money rendered `formatCurrency(Math.abs(v))`
 * and added a minus only when the CALLER passed `negate`, so a genuinely
 * negative number displayed as a positive one — including net profit, the
 * number in this product that most needs to be right, and which goes negative
 * exactly when a seller most needs to know.
 *
 * It survived eleven phases because the demo shop is profitable. Nothing in the
 * type system, the unit tests or the browser checks could see it: the value was
 * correct all the way to the last line of the renderer. It took running the app
 * against a shop with no orders to make it visible.
 */

import { describe, expect, it } from 'vitest'
import { formatSignedCurrency } from '@/lib/utils/format'

const MINUS = '−'

describe('formatSignedCurrency', () => {
  it('shows a loss as a loss', () => {
    expect(formatSignedCurrency(-1322.05)).toBe(`${MINUS}$1,322.05`)
  })

  it('shows a profit without a sign', () => {
    expect(formatSignedCurrency(1322.05)).toBe('$1,322.05')
  })

  it('renders a deduction as negative when asked', () => {
    expect(formatSignedCurrency(14.2, 'USD', { negate: true })).toBe(`${MINUS}$14.20`)
  })

  it('renders a NEGATIVE deduction as a credit', () => {
    // A refund is a negative cost. Erasing the sign here would show a credit as
    // a charge — the same error in the opposite direction.
    expect(formatSignedCurrency(-5, 'USD', { negate: true })).toBe('$5.00')
  })

  it('uses the design minus, not a hyphen', () => {
    // Intl emits U+002D. The design, and every other negative in this product,
    // uses U+2212 — a mixture is visible in a column of figures.
    expect(formatSignedCurrency(-1)).not.toContain('-')
    expect(formatSignedCurrency(-1).startsWith(MINUS)).toBe(true)
  })

  it('keeps zero unsigned', () => {
    expect(formatSignedCurrency(0)).toBe('$0.00')
    expect(formatSignedCurrency(-0)).toBe('$0.00')
  })
})
