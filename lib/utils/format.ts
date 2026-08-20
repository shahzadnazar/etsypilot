/*
 * Formatting helpers.
 *
 * Every chart and metric states its period, unit, currency and time zone
 * (design brief section 11), so these all take an explicit currency or locale
 * rather than reading an ambient default.
 */

export function formatCurrency(
  amount: number,
  currency = 'USD',
  opts: { maximumFractionDigits?: number } = {},
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
  }).format(amount)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits)}%`
}

/**
 * Estimated values are always a range, never a falsely precise midpoint
 * (rules.md section 4, Methodology 93).
 */
export function formatRange(
  min: number,
  max: number,
  format: (n: number) => string = formatNumber,
): string {
  return `${format(min)}–${format(max)}`
}

/**
 * Deltas carry an arrow *and* a sign, so red/green is never the only cue
 * (artboard 89).
 */
export function formatDelta(value: number): { text: string; direction: 'up' | 'down' | 'flat' } {
  if (Math.abs(value) < 0.05) return { text: '▬ flat', direction: 'flat' }
  const direction = value > 0 ? 'up' : 'down'
  const arrow = value > 0 ? '▲' : '▼'
  return { text: `${arrow} ${Math.abs(value).toFixed(1)}%`, direction }
}

export function formatDate(iso: string, timeZone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  }).format(new Date(iso))
}

/**
 * Format a calendar date key ("2026-07-14") without shifting it.
 *
 * A date key has no time and no zone - it is the day the shop calls that day.
 * Running it through a zoned formatter parses it as UTC midnight and renders
 * the previous evening, which is how the axis came to start a day early.
 */
export function formatCalendarDate(dateKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T12:00:00.000Z`))
}

export function formatDateTime(iso: string, timeZone = 'America/New_York'): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(new Date(iso))
}

/** "Synced 6 minutes ago" - freshness is permanently visible in the top bar. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
