import { Card } from '@/components/ui/card'
import type { ApplyProgress, OperationItem, OperationState } from '@/domain/bulk-editor/types'
import { STATE_LABEL } from '@/domain/bulk-editor/types'

/*
 * Live operation state (artboard 43).
 *
 * Four counts, always all four, even at zero — a run that shows only successes
 * reads as clean when it may simply not have reached the failures yet.
 *
 * A failure names the listing and the reason. "We could not update 1 listing"
 * with no further detail is the kind of message that makes a seller distrust
 * every future run.
 */
export function OperationProgressPanel({
  state,
  progress,
  items,
}: {
  state: OperationState
  progress: ApplyProgress
  items: OperationItem[]
}) {
  const done = progress.succeeded + progress.failed + progress.skipped
  const percent = progress.total === 0 ? 0 : Math.round((done / progress.total) * 100)
  const failures = items.filter((i) => i.status === 'FAILED')

  return (
    <Card className="flex flex-col gap-4 p-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-section text-ink-1">{STATE_LABEL[state]}</h3>
        <span className="tnum text-caption text-muted-1">
          {done} of {progress.total}
        </span>
      </div>

      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--canvas-soft)' }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Bulk operation progress"
      >
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${percent}%`, background: 'var(--brand)' }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Count label="Succeeded" value={progress.succeeded} colour="var(--success)" />
        <Count label="Running" value={progress.running} colour="var(--muted-1)" />
        <Count label="Warnings" value={progress.warnings} colour="var(--warning-strong)" />
        <Count label="Failed" value={progress.failed} colour="var(--danger)" />
      </div>

      {failures.length > 0 ? (
        <div
          className="rounded-control border p-3 text-small leading-relaxed"
          style={{ background: '#FEF2F2', borderColor: '#FECACA', color: 'var(--danger)' }}
          role="alert"
        >
          <span className="font-semibold">
            We could not update {failures.length} listing{failures.length === 1 ? '' : 's'}.
          </span>
          <ul className="mt-1.5 flex flex-col gap-1">
            {failures.slice(0, 3).map((f) => (
              <li key={f.listingId} style={{ color: 'var(--ink-2)' }}>
                “{f.title}” — {f.error ?? 'No reason was returned.'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}

function Count({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <div className="rounded-control border border-line p-2.5">
      <span className="block text-label text-muted-1">{label}</span>
      <span className="tnum mt-0.5 block text-[19px] font-semibold" style={{ color: colour }}>
        {value}
      </span>
    </div>
  )
}
