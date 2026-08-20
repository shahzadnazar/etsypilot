import { Lock } from 'lucide-react'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import type { InputRow } from '@/domain/profit/scenarios'
import { cn } from '@/lib/utils/cn'

/*
 * The inputs panel.
 *
 * Locked rows render as text with a lock icon; only unlocked rows render an
 * input. That is a presentation of a guarantee made upstream, not the guarantee
 * itself — `computeScenario` has no parameter through which a verified figure
 * could be varied, so even a UI bug here could not adjust an Etsy fee.
 */
export function InputsPanel({ rows, demo = false }: { rows: InputRow[]; demo?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-[18px]">
        <h3 className="text-section text-ink-1">Inputs</h3>
        <p className="mt-1 text-caption leading-relaxed text-muted-1">
          Locked rows cannot be edited here — the badge on each says whether it came from
          Etsy or was derived. Seller inputs drive the scenarios, and scenarios change the
          waterfall only: the transactions ledger always shows real receipts.
        </p>
      </div>

      <dl className="flex flex-col divide-y divide-line">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              'flex items-center justify-between gap-4 px-[18px] py-3',
              row.locked && 'bg-canvas-soft',
            )}
          >
            <dt className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-1.5 text-small font-semibold text-ink-1">
                {row.locked ? (
                  <>
                    <Lock size={12} strokeWidth={2.4} className="text-muted-1" aria-hidden />
                    <span className="sr-only">Locked:</span>
                  </>
                ) : null}
                {row.label}
              </span>
              {/*
                Locked is not the same as verified (D33). Read-only styling and
                provenance are orthogonal: a greyed field reads as authoritative,
                so the badge is what says where the number came from — never the
                lock icon, and never the fact that it cannot be edited.
              */}
              <span className="flex flex-wrap items-center gap-1.5 text-caption text-muted-1">
                <ProvenanceBadge type={row.provenance} demo={demo} />
                {row.note ? <span>· {row.note}</span> : null}
              </span>
            </dt>

            <dd className="shrink-0">
              {row.locked ? (
                <>
                  <Numeric className="text-small font-semibold text-ink-2">{row.value}</Numeric>
                  <span className="sr-only"> — locked, cannot be edited</span>
                </>
              ) : (
                <input
                  defaultValue={row.value}
                  aria-label={row.label}
                  className="tnum h-9 w-32 whitespace-nowrap rounded-control border border-line bg-surface px-2.5 text-right text-small text-ink-1"
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
