import { Lock } from 'lucide-react'
import { Card } from '@/components/ui/card'
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
export function InputsPanel({ rows }: { rows: InputRow[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-[18px]">
        <h3 className="text-section text-ink-1">Inputs</h3>
        <p className="mt-1 text-caption leading-relaxed text-muted-1">
          Verified lines are read from your receipts and cannot be edited here. Seller inputs drive
          the scenarios.
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
              <span className="flex items-center gap-1.5 text-small font-semibold text-ink-1">
                {row.locked ? (
                  <Lock size={12} strokeWidth={2.4} className="text-muted-1" aria-hidden />
                ) : null}
                {row.label}
              </span>
              {row.note ? (
                <span className="text-caption text-muted-1">{row.note}</span>
              ) : null}
            </dt>

            <dd className="shrink-0">
              {row.locked ? (
                <>
                  <span className="tnum text-small font-semibold text-ink-2">{row.value}</span>
                  <span className="sr-only"> — locked, cannot be edited</span>
                </>
              ) : (
                <input
                  defaultValue={row.value}
                  aria-label={row.label}
                  className="tnum h-9 w-32 rounded-control border border-line bg-surface px-2.5 text-right text-small text-ink-1"
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
