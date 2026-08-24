/*
 * Billing history.
 *
 * Failures stay in the list. A declined charge is the thing a seller most needs
 * to see, and a history that shows only successes is how they find out about a
 * lapsed card from a paused job instead of from this page.
 *
 * Every row is money taken. There is no refund row and no credit row, because
 * subscription charges are not refunded — so this table has no negative amount
 * to render and no direction to disambiguate.
 *
 * A row with no receipt says so rather than rendering a dead link.
 */

import { Card } from '@/components/ui/card'
import { Money, Numeric } from '@/components/ui/numeric'
import type { Invoice, InvoiceStatus } from '@/lib/billing/interface'
import { formatCalendarDate } from '@/lib/utils/format'

const STATUS_FILL: Record<InvoiceStatus, { bg: string; border: string; fg: string; label: string }> = {
  PAID: { bg: 'var(--success-surface)', border: 'var(--success-border)', fg: 'var(--success-ink)', label: 'Paid' },
  DECLINED: { bg: 'var(--danger-surface)', border: 'var(--danger-border)', fg: 'var(--danger-ink)', label: 'Card declined' },
  OPEN: { bg: 'var(--warning-surface)', border: 'var(--warning-border)', fg: 'var(--warning-ink)', label: 'Open' },
}

export function BillingHistory({ invoices }: { invoices: Invoice[] }) {
  return (
    <Card
      tabIndex={0}
      role="region"
      aria-label="Billing history, scrolls horizontally"
      className="w-full max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <table className="w-full min-w-[600px] border-collapse text-body">
        <caption className="sr-only">
          Every charge on this account, newest first. Declined charges are included.
        </caption>
        <thead>
          <tr className="bg-canvas-soft text-left text-label text-muted-1">
            <th scope="col" className="px-4 py-2.5 font-semibold">Date</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Description</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Receipt</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const fill = STATUS_FILL[inv.status]
            return (
              <tr key={inv.id} className="border-t border-line">
                <td className="px-4 py-3 text-small text-ink-2">
                  <Numeric>{formatCalendarDate(inv.date)}</Numeric>
                </td>
                <td className="px-3 py-3 text-small text-ink-1">{inv.description}</td>
                <td className="px-3 py-3 text-right">
                  <Money value={inv.amount} currency={inv.currency} className="text-small text-ink-2" />
                </td>
                <td className="px-3 py-3">
                  <span
                    className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: fill.bg, borderColor: fill.border, color: fill.fg }}
                  >
                    {fill.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-small">
                  {inv.receiptUrl ? (
                    <a
                      href={inv.receiptUrl}
                      className="font-semibold text-brand-strong underline underline-offset-2"
                    >
                      PDF
                    </a>
                  ) : (
                    /* No money moved, so there is no receipt. Said, not linked. */
                    <span className="text-muted-1" title="No money was taken, so there is no receipt">
                      —
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
