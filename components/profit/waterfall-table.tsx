import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import type { ProfitResult } from '@/domain/profit/types'
import { formatCurrency } from '@/lib/utils/format'

/* The eight-cost line, with each line's provenance beside it. */
export function WaterfallTable({
  result,
  currency,
  demo,
}: {
  result: ProfitResult
  currency: string
  demo: boolean
}) {
  const max = Math.max(...result.lines.map((l) => Math.abs(l.amount))) || 1

  return (
    <Card className="p-[18px]">
      <h2 className="text-section text-ink-1">Gross revenue to net profit</h2>
      <p className="mt-1 text-caption text-muted-1">
        Waterfall · {currency} · {result.scenario.toLowerCase()} scenario
      </p>

      <table className="mt-4 w-full border-collapse text-body">
        <caption className="sr-only">
          Profit waterfall in {currency} for the {result.scenario.toLowerCase()} scenario.
        </caption>
        <thead>
          <tr className="text-left text-label text-muted-1">
            <th scope="col" className="pb-2 font-semibold">Line</th>
            <th scope="col" className="pb-2 text-right font-semibold">Amount</th>
            <th scope="col" className="pb-2 pl-4 font-semibold">Source</th>
          </tr>
        </thead>
        <tbody>
          {result.lines.map((line) => {
            const isNet = line.key === 'net'
            return (
              <tr key={line.key} className="border-t border-line">
                <td className={`py-2.5 ${isNet ? 'font-semibold text-ink-1' : 'text-ink-2'}`}>
                  {line.label}
                  <span
                    aria-hidden
                    className="mt-1.5 block h-1 rounded-full"
                    style={{
                      width: `${Math.max(2, (Math.abs(line.amount) / max) * 100)}%`,
                      background:
                        line.amount < 0 ? 'var(--muted-2)' : isNet ? 'var(--success)' : 'var(--brand)',
                      opacity: line.amount < 0 ? 0.45 : 1,
                    }}
                  />
                </td>
                <td
                  className={`tnum whitespace-nowrap py-2.5 text-right ${
                    isNet ? 'font-semibold text-ink-1' : 'text-ink-2'
                  }`}
                >
                  {line.amount < 0 ? '−' : ''}
                  {formatCurrency(Math.abs(line.amount), currency)}
                </td>
                <td className="py-2.5 pl-4">
                  <ProvenanceBadge
                    type={line.provenance.type}
                    demo={demo}
                    srDetail={line.provenance.methodology}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
