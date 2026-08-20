/*
 * CSV export.
 *
 * A CSV outlives the screen it came from. Once a figure is in a spreadsheet,
 * every badge, drawer and caption this product spent five phases building is
 * gone — so the provenance has to travel in the file itself.
 *
 * Three rules, all enforced here rather than left to the caller:
 *
 *   1. Every value column is followed by its own provenance column. Not one
 *      column for the sheet, not a footer note: the classification belongs to
 *      the number, and a reader sorting by revenue must not be able to separate
 *      them (D32).
 *
 *   2. An unknown value exports as an empty cell, never 0. A spreadsheet will
 *      happily sum a column of zeros and give an answer that looks right
 *      (D34a).
 *
 *   3. A header block states what the export excludes, in the file, above the
 *      table. The seller who opens this in six months has no other way to know.
 */

import type { ProvenanceType } from '@/lib/provenance/types'

export interface ExportColumn<T> {
  header: string
  /** Null renders as an empty cell. There is no fallback parameter. */
  value: (row: T) => string | number | null
  /** Omitted only for identifiers and labels, which classify nothing. */
  provenance?: (row: T) => ProvenanceType
}

export interface ExportSpec<T> {
  filename: string
  title: string
  /** Period, currency, coverage — whatever qualifies every row. */
  context: string[]
  /** What the file does not contain. Never empty in practice. */
  excludes: string[]
  columns: ExportColumn<T>[]
}

/** Escapes per RFC 4180, and neutralises spreadsheet formula injection. */
export function csvCell(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  // A cell starting with =, +, - or @ is executed by Excel and Sheets on open.
  // Prefixing with a quote keeps the text readable and inert.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv<T>(spec: ExportSpec<T>, rows: T[]): string {
  const lines: string[] = []

  lines.push(csvCell(spec.title))
  for (const line of spec.context) lines.push(csvCell(line))
  lines.push('')
  lines.push(csvCell('Not included in this file:'))
  for (const line of spec.excludes) lines.push(csvCell(`- ${line}`))
  lines.push('')

  const header: string[] = []
  for (const column of spec.columns) {
    header.push(csvCell(column.header))
    if (column.provenance) header.push(csvCell(`${column.header} — source`))
  }
  lines.push(header.join(','))

  for (const row of rows) {
    const cells: string[] = []
    for (const column of spec.columns) {
      const value = column.value(row)
      cells.push(csvCell(value))
      if (column.provenance) {
        // An empty value has no provenance to report; "Unavailable" would claim
        // we classified something we never had.
        cells.push(csvCell(value === null ? 'Unavailable' : column.provenance(row)))
      }
    }
    lines.push(cells.join(','))
  }

  return lines.join('\r\n')
}

/* --------------------------------------------------------------- specs */

import type { TransactionRow } from '@/domain/profit/types'

export function transactionsExport(args: {
  periodStart: string
  periodEnd: string
  currency: string
  coveragePercent: number
}): ExportSpec<TransactionRow> {
  return {
    filename: `etsypilot-transactions-${args.periodStart.slice(0, 10)}.csv`,
    title: 'EtsyPilot — transactions',
    context: [
      `Period ${args.periodStart.slice(0, 10)} to ${args.periodEnd.slice(0, 10)} (UTC)`,
      `Currency ${args.currency}`,
      `Confirmed cost coverage ${args.coveragePercent}% of order value`,
    ],
    excludes: [
      'Orders with no confirmed cost have an empty Cost and Profit cell. They are not zero.',
      'Offsite Ads are verified at shop level only — Etsy does not expose ad spend per listing.',
      'Etsy does not provide listing views or buyer search terms through the public API.',
    ],
    columns: [
      { header: 'Order', value: (r) => r.orderId },
      { header: 'Placed at (UTC)', value: (r) => r.placedAt },
      { header: 'Listing', value: (r) => r.listingTitle },
      { header: 'Gross', value: (r) => r.gross, provenance: () => 'VERIFIED' },
      { header: 'Fees', value: (r) => r.fees, provenance: () => 'VERIFIED' },
      { header: 'Cost', value: (r) => r.cost, provenance: () => 'SELLER_INPUT' },
      { header: 'Profit', value: (r) => r.profit, provenance: () => 'CALCULATED' },
      { header: 'Reconciliation', value: (r) => r.status },
      { header: 'Why', value: (r) => r.reason ?? null },
    ],
  }
}

import type { AuditFinding } from '@/domain/audit/service'

export function auditExport(args: { healthScore: number; coveragePercent: number }): ExportSpec<
  AuditFinding & { ruleLabel: string; severity: string }
> {
  return {
    filename: 'etsypilot-listing-audit.csv',
    title: 'EtsyPilot — listing audit',
    context: [
      `Health score ${args.healthScore} of 100, calculated from rule severity weighted by each listing's share of verified revenue`,
      `Revenue coverage ${args.coveragePercent}% of listings had orders in the period`,
    ],
    excludes: [
      'Revenue earned in period is what these listings took, not an estimate of what an issue costs. Nothing here says money is at risk.',
      'Listings with no orders in the period carry no weight in the health score.',
      'Severity weights are EtsyPilot thresholds, not Etsy requirements, except where the rule says it blocks publishing.',
      'Nothing here predicts ranking. Etsy does not publish its ranking algorithm.',
    ],
    columns: [
      { header: 'Listing', value: (r) => r.listingId },
      { header: 'Title', value: (r) => r.title },
      { header: 'SKU', value: (r) => r.sku },
      { header: 'Rule', value: (r) => r.ruleLabel },
      { header: 'Severity', value: (r) => r.severity },
      {
        header: 'Revenue earned in period',
        value: (r) => r.revenueOnListing.value,
        provenance: () => 'VERIFIED',
      },
      { header: 'Suggested value', value: (r) => r.suggestedValue ?? null, provenance: () => 'CALCULATED' },
    ],
  }
}
