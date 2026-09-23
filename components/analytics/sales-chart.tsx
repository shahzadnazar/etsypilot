import type { DailyPoint } from '@/domain/analytics/service'
import { formatCurrency } from '@/lib/utils/format'

/*
 * Sales and orders, daily (artboard 51).
 *
 * Solid = this period, verified from receipts. Dotted = the same day of the
 * previous window. The convention is Foundations 05's and the same one the Shop
 * Pulse baseline uses, so a reader who has learned it once has learned it.
 *
 * The comparison line is aligned by POSITION, not by calendar date — "day 1
 * against day 1" — which is what the domain returns and what makes a 30-day
 * window comparable to the 30 before it.
 */
export function SalesChart({
  daily,
  currency,
}: {
  daily: DailyPoint[]
  currency: string
}) {
  const W = 900
  const H = 220
  const PAD = { top: 12, right: 8, bottom: 26, left: 44 }
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom }

  const values = daily.flatMap((d) => [d.revenue, d.previousRevenue ?? 0])
  const max = Math.max(...values, 1) * 1.1
  const n = daily.length
  const x = (i: number) => PAD.left + (i / Math.max(1, n - 1)) * inner.w
  const y = (v: number) => PAD.top + inner.h - (v / max) * inner.h

  const path = (pick: (d: DailyPoint) => number | null) =>
    daily
      .map((d, i) => {
        const value = pick(d)
        return value === null ? null : `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(value)}`
      })
      .filter(Boolean)
      .join(' ')

  const total = daily.reduce((sum, d) => sum + d.revenue, 0)
  const hasComparison = daily.some((d) => d.previousRevenue !== null)

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-caption text-muted-1">
        Daily · {currency} · solid = verified from your receipts
        {hasComparison ? ' · dotted = the previous 30 days' : ' · no previous period to compare'}
      </figcaption>

      <div
        tabIndex={0}
        role="region"
        aria-label="Sales chart, scrolls horizontally"
        className="relative overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[220px] w-full min-w-[560px]"
          role="img"
          aria-label={`Daily sales over ${n} days, ${formatCurrency(total, currency)} in total.${hasComparison ? ' The dotted line is the previous 30 days.' : ''}`}
        >
          <line
            x1={PAD.left}
            y1={PAD.top + inner.h}
            x2={W - PAD.right}
            y2={PAD.top + inner.h}
            stroke="var(--border)"
          />

          {hasComparison ? (
            <path
              d={path((d) => d.previousRevenue)}
              fill="none"
              stroke="var(--muted-2)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          ) : null}

          <path
            d={path((d) => d.revenue)}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {daily.map((d, i) =>
            i === 0 || i === n - 1 || i % 7 === 0 ? (
              <text
                key={d.date}
                x={x(i)}
                y={H - 8}
                textAnchor="middle"
                className="fill-[color:var(--muted-1)] text-[10px]"
              >
                {d.date.slice(5)}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {/*
        * The numbers, for anyone the chart does not serve. A line is a summary
        * of a table, and the table is the thing that can be read aloud, copied
        * or searched.
        */}
      <details className="mt-2">
        {/*
          * min-h-24 is not decoration. A bare <summary> is a 15px line box, and
          * WCAG 2.2 SC 2.5.8 wants 24px — the desktop sweep never saw it because
          * the failure is geometric and only appears where the layout is narrow.
          */}
        <summary className="inline-flex min-h-[24px] cursor-pointer items-center py-1 text-caption font-semibold text-brand-strong">
          Show these figures as a table
        </summary>
        <div className="mt-2 max-h-[240px] overflow-y-auto">
          <table className="w-full border-collapse text-caption">
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-3 py-2 font-semibold">Day (UTC)</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Orders</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Revenue</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Previous</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date} className="border-t border-line">
                  <td className="px-3 py-1.5 text-ink-2">{d.date}</td>
                  <td className="tnum px-3 py-1.5 text-right text-ink-2">{d.orders}</td>
                  <td className="tnum px-3 py-1.5 text-right text-ink-1">
                    {formatCurrency(d.revenue, currency)}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right text-muted-1">
                    {d.previousRevenue === null ? '—' : formatCurrency(d.previousRevenue, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
