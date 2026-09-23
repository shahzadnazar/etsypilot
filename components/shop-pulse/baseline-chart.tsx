import type { Baseline } from '@/domain/shop-pulse/types'
import type { DomainEvent } from '@/lib/events/types'
import { formatCalendarDate } from '@/lib/utils/format'

/*
 * Baseline vs actual (artboard 91).
 *
 * Conventions carried from Foundations 05:
 *   solid line   = verified from receipts
 *   shaded band  = the expected range from this shop's own 90-day history
 *   markers      = recorded events, on the axis
 *
 * The band is the point of the chart. A bare trend line invites the seller to
 * eyeball whether a dip matters; the band answers it.
 */
export function BaselineChart({
  baseline,
  events,
  periodStart,
}: {
  baseline: Baseline
  events: DomainEvent[]
  periodStart: string
}) {
  const W = 900
  const H = 220
  const PAD = { top: 12, right: 8, bottom: 26, left: 30 }
  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom }

  const max = Math.max(...baseline.series.map((p) => Math.max(p.upper, p.actual))) * 1.1 || 1
  const n = baseline.series.length
  const x = (i: number) => PAD.left + (i / Math.max(1, n - 1)) * inner.w
  const y = (v: number) => PAD.top + inner.h - (v / max) * inner.h

  const bandPath = [
    ...baseline.series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.upper)}`),
    ...[...baseline.series].reverse().map((p, i) => `L ${x(n - 1 - i)} ${y(p.lower)}`),
    'Z',
  ].join(' ')

  const actualPath = baseline.series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.actual)}`)
    .join(' ')

  const expectedPath = baseline.series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.expected)}`)
    .join(' ')

  const startMs = new Date(periodStart).getTime()
  const markers = events
    .map((e) => {
      const idx = Math.round((new Date(e.timestamp).getTime() - startMs) / 86_400_000)
      return idx >= 0 && idx < n ? { idx, event: e } : null
    })
    .filter((m): m is { idx: number; event: DomainEvent } => m !== null)

  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-muted-1">
        <span>
          Daily orders · UTC · solid line verified from your receipts · band is the expected range
          from your own {baseline.windowDays}-day history
        </span>
      </figcaption>

      <div
        /*
         * Focusable, on purpose. A container that scrolls horizontally is
         * operable with a mouse or a finger and completely unreachable from a
         * keyboard unless it can take focus — axe calls it
         * scrollable-region-focusable, and it only appears at a viewport narrow
         * enough for the chart to overflow. The desktop-only sweep never saw it.
         */
        tabIndex={0}
        role="region"
        aria-label="Baseline chart, scrolls horizontally"
        className="relative overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[220px] w-full min-w-[560px]"
          role="img"
          aria-label={`Daily orders against this shop's own baseline. Actual ${baseline.actualTotal}, expected ${baseline.expectedTotal}, ${baseline.deviationPercent}% below the baseline.`}
        >
          <line
            x1={PAD.left}
            y1={PAD.top + inner.h}
            x2={W - PAD.right}
            y2={PAD.top + inner.h}
            stroke="var(--border)"
          />

          {/* Expected range */}
          <path d={bandPath} fill="var(--brand)" opacity="0.1" />
          <path
            d={expectedPath}
            fill="none"
            stroke="var(--muted-2)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {/* Verified actual */}
          <path
            d={actualPath}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Days outside the band get a dot as well as position, so the
              deviation is not carried by line shape alone. */}
          {baseline.series.map((p, i) =>
            p.outside ? (
              <circle key={p.date} cx={x(i)} cy={y(p.actual)} r="3" fill="var(--danger)" />
            ) : null,
          )}

          {/* Event markers on the axis */}
          {markers.map(({ idx, event }) => (
            <g key={event.eventId}>
              <line
                x1={x(idx)}
                y1={PAD.top}
                x2={x(idx)}
                y2={PAD.top + inner.h}
                stroke="var(--muted-2)"
                strokeWidth="1"
                strokeDasharray="2 3"
              />
              <rect
                x={x(idx) - 3}
                y={PAD.top + inner.h - 3}
                width="6"
                height="6"
                transform={`rotate(45 ${x(idx)} ${PAD.top + inner.h})`}
                fill="var(--ink-2)"
              />
            </g>
          ))}

          <text x={PAD.left} y={H - 6} className="fill-[var(--muted-2)] text-[10px]">
            {formatCalendarDate(baseline.series[0]?.date ?? periodStart.slice(0, 10))}
          </text>
          <text
            x={W - PAD.right}
            y={H - 6}
            textAnchor="end"
            className="fill-[var(--muted-2)] text-[10px]"
          >
            {formatCalendarDate(baseline.series[n - 1]?.date ?? periodStart.slice(0, 10))}
          </text>
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-caption text-muted-1">
        <Legend swatch={<span className="h-0.5 w-4" style={{ background: 'var(--brand)' }} />}>
          Actual
        </Legend>
        <Legend
          swatch={
            <span
              className="h-0.5 w-4"
              style={{
                background:
                  'repeating-linear-gradient(90deg,var(--muted-2) 0 4px,transparent 4px 8px)',
              }}
            />
          }
        >
          Expected
        </Legend>
        <Legend
          swatch={
            <span
              className="h-2.5 w-4 rounded-sm"
              style={{ background: 'var(--brand)', opacity: 0.15 }}
            />
          }
        >
          Baseline range
        </Legend>
        <Legend swatch={<span className="h-2 w-2 rotate-45" style={{ background: 'var(--ink-2)' }} />}>
          Recorded change
        </Legend>
      </div>

      {/* The claim this chart is allowed to make, and the one it is not. */}
      <p className="mt-3 text-caption leading-relaxed text-muted-1">
        The baseline is built only from this shop&rsquo;s own order history. EtsyPilot has no
        access to Etsy&rsquo;s ranking algorithm and does not model it — markers show what changed
        and when, not why Etsy ranked anything.
      </p>
    </figure>
  )
}

function Legend({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  )
}
