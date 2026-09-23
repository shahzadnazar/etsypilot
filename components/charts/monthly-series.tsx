/*
 * A twelve-month series where gaps stay gaps.
 *
 * Extracted from DemandChart, which kept every line of its own copy and now
 * renders this. The MECHANISM was always generic — plot a monthly series,
 * break the line at months with no observation, dash a marker where the gap is
 * — and only the words around it were about demand.
 *
 * ── WHY THE EXTRACTION RATHER THAN REUSING DemandChart ────────────────────
 *
 * Its caption says "Indexed, modelled monthly" and its accessible name says
 * "modelled demand". Both are true of demand and both would be FALSE of a
 * count of signups, which is counted rather than modelled and is not indexed
 * at all. Reusing the component would have put "modelled" on a figure that was
 * counted — the provenance failure this codebase exists to avoid, arriving
 * through a shared component rather than through a shared number.
 *
 * So the drawing is shared and the CLAIM is not. Every caller supplies its own
 * caption and its own accessible description, because only the caller knows
 * what its figures are.
 *
 * ── A BREAK IS NOT A ZERO ─────────────────────────────────────────────────
 *
 * A month with no observation is `null`, and the line breaks across it. An
 * interpolated line over a month with nothing in it is the chart equivalent of
 * filling a null with a zero: it looks like data and it is a drawing. A month
 * that genuinely measured nought is `0` and is plotted on the axis, which is a
 * different mark and a different fact (D34).
 */

const MONTH_LABEL: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

/** Months are plotted from their YYYY-MM key, never through a zoned formatter (D24). */
function monthLabel(key: string): string {
  return MONTH_LABEL[key.slice(5, 7)] ?? key
}

export interface MonthlyPoint {
  /** YYYY-MM. */
  month: string
  /** Null means "not observed". Zero means "observed, and it was nought". */
  value: number | null
}

export function MonthlySeriesChart({
  points,
  description,
  caption,
  stroke = 'var(--brand)',
  minimumMax = 10,
}: {
  points: MonthlyPoint[]
  /** The accessible name. The caller owns the claim, not this component. */
  description: string
  caption: React.ReactNode
  stroke?: string
  /** Keeps a series of small numbers off the ceiling. */
  minimumMax?: number
}) {
  const width = 720
  const height = 150
  const padding = 8
  const max = Math.max(...points.map((p) => p.value ?? 0), minimumMax)
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0

  const x = (i: number) => padding + i * step
  const y = (v: number) => height - padding - (v / max) * (height - padding * 2)

  // Contiguous runs of observed months. Gaps stay gaps.
  const runs: { i: number; value: number }[][] = []
  let run: { i: number; value: number }[] = []
  points.forEach((p, i) => {
    if (p.value === null) {
      if (run.length > 0) runs.push(run)
      run = []
    } else {
      run.push({ i, value: p.value })
    }
  })
  if (run.length > 0) runs.push(run)

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[150px] w-full"
        role="img"
        aria-label={description}
      >
        {runs.map((r, ri) => (
          <polyline
            key={ri}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinecap="round"
            points={r.map((p) => `${x(p.i)},${y(p.value)}`).join(' ')}
          />
        ))}
        {points.map((p, i) =>
          p.value === null ? (
            <line
              key={p.month}
              x1={x(i)}
              x2={x(i)}
              y1={padding}
              y2={height - padding}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null,
        )}
      </svg>

      <div className="flex justify-between text-caption text-muted-1">
        {points.map((p, i) => (i % 2 === 0 ? <span key={p.month}>{monthLabel(p.month)}</span> : null))}
      </div>

      <figcaption className="text-caption leading-relaxed text-muted-1">{caption}</figcaption>
    </figure>
  )
}
