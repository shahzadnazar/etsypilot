/*
 * Rendering an estimate.
 *
 * An estimate is always a range (Methodology 93). This component takes
 * Provenanced<EstimatedRange> and has no prop for a midpoint, so the falsely
 * precise single figure — the thing every keyword tool on the market prints —
 * cannot be produced from it.
 *
 * A null value renders "Not enough data" with the reason, in the same way Money
 * renders the em dash. Same principle: absence is a state, not a small number.
 */

import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Numeric } from '@/components/ui/numeric'
import type { EstimatedRange } from '@/lib/signals/interface'
import type { Provenanced } from '@/lib/provenance/types'
import { cn } from '@/lib/utils/cn'

function compact(n: number): string {
  if (n >= 1000) {
    const k = n / 1000
    return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}K`
  }
  return n.toLocaleString('en-US')
}

export function RangeValue({
  data,
  suffix,
  className,
  prefix = '',
}: {
  data: Provenanced<EstimatedRange>
  suffix?: string
  prefix?: string
  className?: string
}) {
  if (data.value === null) {
    return (
      <span className={cn('text-muted-1', className)}>
        Not enough data
        <span className="sr-only"> — {data.provenance.methodology}</span>
      </span>
    )
  }
  return (
    <Numeric className={className}>
      {prefix}
      {compact(data.value.min)}–{prefix}
      {compact(data.value.max)}
      {suffix ? <span className="text-muted-1"> {suffix}</span> : null}
    </Numeric>
  )
}

/**
 * A metric tile for the research screens.
 *
 * The badge and the confidence sit above the figure rather than below it,
 * because a reader who has already read the number has already believed it.
 */
export function EstimateTile({
  label,
  data,
  children,
  note,
  demo,
  onExplain,
}: {
  label: string
  data: Provenanced<unknown>
  children: React.ReactNode
  note?: string
  demo: boolean
  onExplain?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-[14px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        <ProvenanceBadge
          type={data.provenance.type}
          demo={demo}
          srDetail={data.provenance.methodology}
        />
      </div>
      <span className="text-[22px] font-semibold leading-none text-ink-1">{children}</span>
      {data.provenance.confidence ? (
        <span className="text-caption text-muted-1">
          Confidence {data.provenance.confidence.toLowerCase()}
        </span>
      ) : null}
      {note ? <span className="text-caption leading-snug text-muted-1">{note}</span> : null}
      {onExplain}
    </div>
  )
}
