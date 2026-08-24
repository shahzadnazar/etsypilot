import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import type { ChangeHistoryView } from '@/domain/change-history/service'
import { outcomeLabel, isFailure, SOURCE_LABEL } from '@/domain/change-history/types'
import { formatDateTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { RollbackCell } from './rollback-cell'

/*
 * The change history table (artboard 44).
 *
 * The Status column is counted from the job's items, so a row cannot say
 * "Complete" over a job with a failure in it. The Rollback column is planned
 * against the live catalogue on every render — see RollbackCell.
 */
export function HistoryTable({ view }: { view: ChangeHistoryView }) {
  if (view.total === 0) {
    return (
      <EmptyState
        title="Nothing has been changed yet"
        description="Every listing EtsyPilot writes to appears here, with what it changed and a way to undo it. Bulk edits, scheduled jobs and accepted AI drafts all land in the same trail."
        action={
          <Link
            href="/listings/bulk-editor"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Open the bulk editor
          </Link>
        }
      />
    )
  }

  if (view.rows.length === 0) {
    return (
      <EmptyState
        title="No change matches this filter"
        description={`All ${view.total} jobs are still in the trail — this view is hiding them. The history is append-only and nothing is ever removed from it.`}
        action={
          <Link
            href="/listings/change-history"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Clear filter
          </Link>
        }
      />
    )
  }

  return (
    <Card
      tabIndex={0}
      role="region"
      aria-label="Change history, scrolls horizontally"
      className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <table className="w-full min-w-[880px] border-collapse text-body">
        <caption className="sr-only">
          Every job EtsyPilot applied to this shop, newest first, in UTC. Status is counted from
          the job&rsquo;s own results; rollback availability is re-checked against your live
          listings.
        </caption>
        <thead>
          <tr className="bg-canvas-soft text-left text-label text-muted-1">
            <th scope="col" className="px-4 py-2.5 font-semibold">When</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">User</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Listings</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Change</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Source</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Rollback</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => {
            const open = view.selected?.row.job.id === row.job.id
            const failed = isFailure(row.job)
            return (
              <tr
                key={row.job.id}
                className={cn('border-t border-line align-top', open && 'bg-brand-tint')}
              >
                <td className="tnum px-4 py-3 text-[11.5px] text-ink-2">
                  {formatDateTime(row.job.at)}
                </td>
                <td className="px-3 py-3 text-small text-ink-2">{row.job.actor}</td>
                <td className="tnum px-3 py-3 text-right text-small text-ink-2">
                  {row.listingCount.toLocaleString('en-US')}
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/listings/change-history?job=${row.job.id}${view.source !== 'ALL' ? `&source=${view.source}` : ''}`}
                    aria-current={open ? 'true' : undefined}
                    className="text-small font-medium text-ink-1 underline-offset-2 hover:underline"
                  >
                    {row.job.summary}
                  </Link>
                  <span className="tnum mt-0.5 block text-caption text-muted-1">
                    Job #{row.job.id}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {row.job.source === 'AI_ASSISTED' ? (
                    <span
                      className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold"
                      style={{ background: '#F5F3FF', borderColor: '#DDD6FE', color: '#6D28D9' }}
                    >
                      {SOURCE_LABEL[row.job.source]}
                    </span>
                  ) : (
                    <span className="text-[11.5px] font-medium text-muted-1">
                      {SOURCE_LABEL[row.job.source]}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span
                    className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
                    style={
                      failed
                        ? {
                            background: 'var(--warning-surface)',
                            borderColor: 'var(--warning-border)',
                            color: 'var(--warning-ink)',
                          }
                        : {
                            background: 'var(--success-surface)',
                            borderColor: 'var(--success-border)',
                            color: 'var(--success-ink)',
                          }
                    }
                  >
                    {outcomeLabel(row.job)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RollbackCell state={row.rollback} jobId={row.job.id} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
