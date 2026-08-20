import { Card } from '@/components/ui/card'
import type { OperationItem } from '@/domain/bulk-editor/types'

/*
 * The exact before/after (artboard 42).
 *
 * Removed and added lines are marked with −/+ and a word, not colour alone.
 * The sample is explicitly labelled as a sample, with the full count beside it -
 * a seller who thinks they reviewed everything when they saw three of 122 is
 * worse off than one who knows they sampled.
 */
export function DiffViewer({
  items,
  sampleSize = 3,
  onInspectAll,
}: {
  items: OperationItem[]
  sampleSize?: number
  onInspectAll?: () => void
}) {
  const sample = items.slice(0, sampleSize)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-[18px]">
        <h3 className="text-section text-ink-1">Review diff</h3>
        <span className="flex items-center gap-3 text-caption text-muted-1">
          <span className="tnum">
            Sample {sample.length} of {items.length}
          </span>
          {onInspectAll ? (
            <button
              onClick={onInspectAll}
              className="font-semibold text-brand-strong underline underline-offset-2"
            >
              Inspect all
            </button>
          ) : null}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-line">
        {sample.map((item) => (
          <div key={item.listingId} className="flex flex-col gap-2 p-[18px]">
            <span className="text-small font-semibold text-ink-1">
              {item.title}
              {item.sku ? <span className="font-normal text-muted-1"> · {item.sku}</span> : null}
            </span>

            <dl className="flex flex-col gap-1">
              {item.diffs.map((d) => (
                <div key={d.field} className="flex flex-col gap-0.5">
                  <div className="tnum flex gap-2 text-caption">
                    <span className="font-semibold text-muted-1" aria-hidden>−</span>
                    <span className="sr-only">Removed:</span>
                    <span className="text-muted-1 line-through">
                      {d.field}: {d.before}
                    </span>
                  </div>
                  <div className="tnum flex gap-2 text-caption">
                    <span className="font-semibold" style={{ color: 'var(--success)' }} aria-hidden>
                      +
                    </span>
                    <span className="sr-only">Added:</span>
                    <span className="font-semibold text-ink-1">
                      {d.field}: {d.after}
                    </span>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Card>
  )
}
