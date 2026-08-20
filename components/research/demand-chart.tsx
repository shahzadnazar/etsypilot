/*
 * Twelve-month modelled demand.
 *
 * Sparse months break the line rather than being bridged. An interpolated line
 * over a month with no observation is the chart equivalent of filling a null
 * with a zero: it looks like data and it is a drawing.
 *
 * Months are plotted from their YYYY-MM key and never passed through a zoned
 * formatter (D24).
 */

const MONTH_LABEL: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr', '05': 'May', '06': 'Jun',
  '07': 'Jul', '08': 'Aug', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

function monthLabel(key: string): string {
  return MONTH_LABEL[key.slice(5, 7)] ?? key
}

export function DemandChart({
  history,
  term,
}: {
  history: { month: string; index: number | null }[]
  term: string
}) {
  const width = 720
  const height = 150
  const padding = 8
  const max = Math.max(...history.map((p) => p.index ?? 0), 10)
  const step = history.length > 1 ? (width - padding * 2) / (history.length - 1) : 0

  const x = (i: number) => padding + i * step
  const y = (v: number) => height - padding - (v / max) * (height - padding * 2)

  // Contiguous runs of observed months. Gaps stay gaps.
  const runs: { i: number; index: number }[][] = []
  let run: { i: number; index: number }[] = []
  history.forEach((p, i) => {
    if (p.index === null) {
      if (run.length > 0) runs.push(run)
      run = []
    } else {
      run.push({ i, index: p.index })
    }
  })
  if (run.length > 0) runs.push(run)

  const sparse = history.filter((p) => p.index === null).length

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[150px] w-full"
        role="img"
        aria-label={`Twelve months of modelled demand for ${term}. ${sparse} month${sparse === 1 ? '' : 's'} had too little observation to model and are left blank.`}
      >
        {runs.map((r, ri) => (
          <polyline
            key={ri}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={2}
            strokeLinecap="round"
            points={r.map((p) => `${x(p.i)},${y(p.index)}`).join(' ')}
          />
        ))}
        {history.map((p, i) =>
          p.index === null ? (
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
        {history.map((p, i) =>
          i % 2 === 0 ? <span key={p.month}>{monthLabel(p.month)}</span> : null,
        )}
      </div>

      <figcaption className="text-caption leading-relaxed text-muted-1">
        Indexed, modelled monthly.{' '}
        {sparse > 0
          ? `${sparse} month${sparse === 1 ? '' : 's'} had too little observation to model — the line breaks rather than guessing across the gap.`
          : 'Every month in this window had enough observation to model.'}
      </figcaption>
    </figure>
  )
}
