import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import type { ProvenanceType } from '@/lib/provenance/types'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE HERO. A PROFIT STATEMENT WITH HOLES IN IT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Every competitor's hero shows confident numbers. This one shows a real
 * waterfall that stops: the three fee lines read "Not known", and net profit
 * never arrives.
 *
 * It is live HTML, not a screenshot — so it costs no assets, it is readable by
 * a screen reader, it reflows at phone width, and the provenance badges are
 * the same component the dashboard renders. The argument, the product demo and
 * the hero image are one object.
 *
 * ── THE FIGURES ARE THE DEMO SHOP'S, AND THEY SAY SO ──────────────────────
 *
 * Willow & Fern's period, which is what a visitor sees one click later in the
 * live demo. They are written here rather than computed because this is a
 * public page with no session and no shop — calling the profit domain would
 * mean inventing a context for a visitor who has none. The caption under the
 * table names the shop, so nothing here is presented as a real seller's.
 *
 * ── RED IS LEDGER RED ─────────────────────────────────────────────────────
 *
 * --danger is already #B91C1C in this palette and it is used here for exactly
 * what red ink means on a paper ledger: the debits, and the lines that cannot
 * be filled. It is not decoration and there is no second accent on this page.
 */

interface Row {
  label: string
  /** Null where the figure is not known. Never 0 standing in for unknown. */
  amount: number | null
  provenance: ProvenanceType
  /** Shown in place of a figure. The reason, not an em dash. */
  absent?: string
  kind: 'revenue' | 'debit' | 'total'
  /** True for the three lines that stall. Drives the pause in the stagger. */
  gap?: boolean
}

const CURRENCY = 'USD'

/**
 * The period the demo shop reports, line for line.
 *
 * Gross, discounts and refunds are receipt facts. The three fee lines are the
 * whole point: Etsy reports fees through the payment-account ledger, which is
 * a separate read from the order receipts, so a shop that has synced its
 * orders and not that ledger genuinely does not know them — and a net profit
 * computed without them reads HIGHER than the truth.
 */
const ROWS: Row[] = [
  { label: 'Gross revenue', amount: 18420.65, provenance: 'VERIFIED', kind: 'revenue' },
  { label: 'Discounts', amount: -412.0, provenance: 'VERIFIED', kind: 'debit' },
  { label: 'Refunds', amount: -238.5, provenance: 'VERIFIED', kind: 'debit' },
  {
    label: 'Etsy fees',
    amount: null,
    provenance: 'UNAVAILABLE',
    absent: 'Not known',
    kind: 'debit',
    gap: true,
  },
  {
    label: 'Payment processing',
    amount: null,
    provenance: 'UNAVAILABLE',
    absent: 'Not known',
    kind: 'debit',
    gap: true,
  },
  {
    label: 'Offsite Ads',
    amount: null,
    provenance: 'UNAVAILABLE',
    absent: 'Not known',
    kind: 'debit',
    gap: true,
  },
  { label: 'Shipping', amount: -1148.2, provenance: 'SELLER_INPUT', kind: 'debit' },
  { label: 'COGS', amount: -6999.85, provenance: 'SELLER_INPUT', kind: 'debit' },
  { label: 'Labour', amount: -980.0, provenance: 'SELLER_INPUT', kind: 'debit' },
  {
    label: 'Net profit',
    amount: null,
    provenance: 'UNAVAILABLE',
    absent: 'Unavailable',
    kind: 'total',
    gap: true,
  },
]

function money(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: CURRENCY,
    signDisplay: 'never',
  }).format(amount)
}

export function HeroLedger() {
  return (
    <figure
      className="m-0 overflow-hidden border"
      style={{
        borderColor: 'var(--border)',
        borderRadius: 'var(--paper-radius)',
        background: 'var(--surface)',
      }}
    >
      <figcaption
        className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 md:px-5"
        style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
      >
        <span className="display text-[17px] md:text-[19px]" style={{ color: 'var(--ink-1)' }}>
          Profit, July 14 – August 12
        </span>
        <span className="mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--muted-1)' }}>
          Willow &amp; Fern · demo shop · USD
        </span>
      </figcaption>

      <table className="w-full border-collapse">
        <caption className="sr-only">
          A profit waterfall for the demo shop. Etsy fees, payment processing and Offsite Ads are
          not known, because Etsy reports them through the payment-account ledger rather than on
          the order receipt — so net profit is withheld rather than calculated without them.
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Where the figure came from</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, index) => (
            <tr
              key={row.label}
              className="ledger-row border-t"
              data-gap={row.gap ? 'true' : 'false'}
              style={
                {
                  borderColor: 'var(--border)',
                  '--row': index,
                  ...(row.kind === 'total' ? { background: 'var(--canvas-soft)' } : {}),
                } as React.CSSProperties
              }
            >
              <th
                scope="row"
                className={`px-4 py-2.5 text-left align-middle md:px-5 ${
                  row.kind === 'total' ? 'display text-[15px]' : 'text-[13px] font-medium'
                }`}
                style={{ color: row.kind === 'total' ? 'var(--ink-1)' : 'var(--ink-2)' }}
              >
                {row.label}
              </th>
              <td className="hidden px-2 py-2.5 align-middle sm:table-cell">
                {/*
                  * The real badge component, not a copy. If the dashboard's
                  * provenance vocabulary changes, this page changes with it —
                  * a marketing page that explains a system it has reimplemented
                  * is a page that will eventually describe something else.
                  */}
                <ProvenanceBadge type={row.provenance} demo={false} />
              </td>
              <td
                className={`figure px-4 py-2.5 text-right align-middle md:px-5 ${
                  row.kind === 'total' ? 'text-[16px] font-semibold' : 'text-[13.5px]'
                }`}
                style={{
                  color:
                    row.amount === null
                      ? 'var(--danger)'
                      : row.kind === 'debit'
                        ? 'var(--danger)'
                        : 'var(--ink-1)',
                }}
              >
                {row.amount === null ? (
                  <span className="text-[12px]">{row.absent}</span>
                ) : row.kind === 'debit' ? (
                  /*
                   * Parentheses, which is how a ledger writes a debit, with the
                   * sign read out for anyone not looking at the parentheses.
                   */
                  <>
                    <span aria-hidden>({money(row.amount)})</span>
                    <span className="sr-only">minus {money(row.amount)}</span>
                  </>
                ) : (
                  money(row.amount)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        className="border-t px-4 py-3 text-[12px] leading-relaxed md:px-5"
        style={{ borderColor: 'var(--border)', color: 'var(--muted-1)' }}
      >
        <span style={{ color: 'var(--danger)' }}>Etsy fees, payment processing and Offsite Ads</span>{' '}
        arrive in Etsy&rsquo;s payment-account ledger, not on the order receipt. Until that ledger
        has been read they are unknown — so net profit is withheld rather than calculated without
        them, because a net profit missing its fees reads higher than the truth.
      </div>
    </figure>
  )
}
