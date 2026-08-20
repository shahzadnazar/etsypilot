'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { ReconciliationStatus, ReconciliationSummary } from '@/domain/profit/types'
import { STATUS_LABEL } from '@/domain/profit/types'
import { Money, NumericCell } from '@/components/ui/numeric'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

/*
 * Transactions and reconciliation.
 *
 * Cost and profit render as an em dash where the value is null, never as 0.00 -
 * a zero in a money column is a claim, and "we do not know" is not zero.
 *
 * Exception rows expand to their resolutions. A status the seller cannot act on
 * is where they stop trusting the total above it.
 */

const STATUS_FILL: Record<ReconciliationStatus, { bg: string; border: string; fg: string }> = {
  MATCHED: { bg: '#F0FDF4', border: '#BBF7D0', fg: '#166534' },
  PARTIAL: { bg: '#FFFBEB', border: '#FDE68A', fg: '#B45309' },
  UNMATCHED: { bg: '#FEF2F2', border: '#FECACA', fg: 'var(--danger)' },
}

export function TransactionsTable({
  reconciliation,
  currency,
}: {
  reconciliation: ReconciliationSummary
  currency: string
}) {
  const [filter, setFilter] = useState<ReconciliationStatus | 'ALL'>('ALL')
  const rows = reconciliation.rows
    .filter((r) => filter === 'ALL' || r.status === filter)
    .slice(0, 12)

  const filters: (ReconciliationStatus | 'ALL')[] = ['ALL', 'MATCHED', 'PARTIAL', 'UNMATCHED']
  const countFor = (f: ReconciliationStatus | 'ALL') =>
    f === 'ALL'
      ? reconciliation.rows.length
      : f === 'MATCHED'
        ? reconciliation.matched
        : f === 'PARTIAL'
          ? reconciliation.partial
          : reconciliation.unmatched

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={cn(
              'rounded-control px-3 py-1.5 text-[11.5px] font-semibold',
              filter === f
                ? 'bg-brand-tint text-brand-strong'
                : 'border border-line text-ink-2 hover:bg-canvas-soft',
            )}
          >
            {f === 'ALL' ? 'All' : STATUS_LABEL[f]} · <span className="tnum">{countFor(f)}</span>
          </button>
        ))}

        {reconciliation.excludedValue > 0 ? (
          <span className="tnum ml-auto text-caption text-muted-1">
            {formatCurrency(reconciliation.excludedValue, currency)} excluded from profit until
            resolved
          </span>
        ) : null}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-body">
          <caption className="sr-only">
            Transactions for the period, with reconciliation status and how to resolve exceptions.
          </caption>
          <thead>
            <tr className="bg-canvas-soft text-left text-label text-muted-1">
              <th scope="col" className="px-4 py-2.5 font-semibold">Order</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Listing</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Gross</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Fees</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Cost</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Profit</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const fill = STATUS_FILL[row.status]
              return (
                <tr key={row.orderId} className="border-t border-line align-top">
                  <td className="tnum px-4 py-3 text-small text-ink-2">
                    {row.orderId}
                    <span className="mt-0.5 block text-caption text-muted-1">
                      {formatDate(row.placedAt)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-small text-ink-1">
                    {row.listingTitle}
                    {row.reason ? (
                      <span className="mt-1 block text-caption text-muted-1">{row.reason}</span>
                    ) : null}
                    {row.resolutions.length > 0 ? (
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {row.resolutions.map((r) => (
                          <Link
                            key={r.href}
                            href={r.href}
                            className={cn(
                              'rounded-control px-2 py-1 text-[11px] font-semibold',
                              r.kind === 'PRIMARY'
                                ? 'bg-brand text-white hover:bg-brand-strong'
                                : 'border border-line text-ink-2 hover:bg-canvas-soft',
                            )}
                          >
                            {r.label}
                          </Link>
                        ))}
                      </span>
                    ) : null}
                  </td>
                  <NumericCell className="text-ink-2">
                    <Money value={row.gross} currency={currency} />
                  </NumericCell>
                  <NumericCell className="text-ink-2">
                    <Money value={row.fees} currency={currency} negate />
                  </NumericCell>
                  <NumericCell className="text-ink-2">
                    <Money value={row.cost} currency={currency} negate unknownLabel="No confirmed cost" />
                  </NumericCell>
                  <NumericCell className="font-semibold text-ink-1">
                    <Money
                      value={row.profit}
                      currency={currency}
                      unknownLabel="Not computed — this order has no confirmed cost"
                    />
                  </NumericCell>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: fill.bg, borderColor: fill.border, color: fill.fg }}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <p className="text-caption leading-relaxed text-muted-1">
        Unmatched and partial transactions are excluded from profit until resolved, rather than
        given an assumed cost.
      </p>
    </div>
  )
}
