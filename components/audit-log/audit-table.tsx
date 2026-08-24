import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { recordKey, type AuditLogView } from '@/domain/audit-log/service'
import { AUDIT_SOURCES, SOURCE_LABEL } from '@/domain/audit-log/types'
import { formatDateTime } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'
import { ReachedChip } from './reached-chip'

/*
 * The log itself.
 *
 * Filters and selection are in the URL, not in component state, and every
 * control is a link or a GET form. Three consequences worth having: it works
 * with no JavaScript, a filtered view can be sent to someone, and the record a
 * dispute is about has an address.
 */
export function AuditTable({ view }: { view: AuditLogView }) {
  const selectedKey = view.selected ? recordKey(view.selected) : null

  return (
    <div className="flex flex-col gap-3">
      <form method="get" action="/settings/audit-log" className="flex flex-wrap items-center gap-2">
        {/*
          * "Refused only" is a pinned filter rather than one value in a
          * dropdown. It is the question this log exists to answer, and burying
          * it three clicks deep would be a statement about how often we expect
          * it to be asked.
          */}
        <FilterLink view={view} to="ALL" label="All" count={view.total} />
        <FilterLink view={view} to="REFUSED" label="Refused only" count={view.refusedCount} />

        <label className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
          <span className="sr-only">Source</span>
          <select
            name="source"
            defaultValue={view.source}
            className="h-11 bg-transparent text-small text-ink-2 outline-none md:h-[38px]"
          >
            <option value="ALL">Any source</option>
            {AUDIT_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 focus-within:border-brand sm:max-w-[300px]">
          <span className="sr-only">Search listing, operation ID or actor</span>
          <input
            name="q"
            type="search"
            defaultValue={view.query}
            placeholder="Search listing, operation ID or actor"
            className="h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
          />
        </label>
        {/* Carried through the GET so searching does not drop the filter. */}
        {view.filter === 'REFUSED' ? <input type="hidden" name="filter" value="REFUSED" /> : null}
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
        >
          Search
        </button>
      </form>

      <p className="text-caption text-muted-1">
        <span className="tnum">{view.records.length.toLocaleString('en-US')}</span> of{' '}
        <span className="tnum">{view.total.toLocaleString('en-US')}</span> records · newest first ·
        times in UTC · select a row for the full record
      </p>

      {view.records.length === 0 ? (
        <EmptyState
          title={
            view.total === 0
              ? 'Nothing has happened on this shop yet'
              : 'No record matches these filters'
          }
          description={
            view.total === 0
              ? 'Every action taken through EtsyPilot appears here, including the ones that are refused. The log fills itself — there is nothing to switch on.'
              : 'Clear the filters to see the whole log. A record that does not match is still there; it is only hidden by this view.'
          }
          action={
            view.total === 0 ? undefined : (
              <Link
                href="/settings/audit-log"
                className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
              >
                Clear filters
              </Link>
            )
          }
        />
      ) : (
        <Card
          tabIndex={0}
          role="region"
          aria-label="Audit records, scrolls horizontally"
          className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <table className="w-full min-w-[860px] border-collapse text-body">
            <caption className="sr-only">
              Every action taken on this shop through EtsyPilot, including refusals. Showing{' '}
              {view.records.length} of {view.total} records, newest first, in UTC.
            </caption>
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-4 py-2.5 font-semibold">Timestamp</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Actor</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Action</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Target</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Source</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Reached Etsy</th>
              </tr>
            </thead>
            <tbody>
              {view.records.map((record) => {
                const key = recordKey(record)
                const open = key === selectedKey
                return (
                  <tr
                    key={key}
                    className={cn('border-t border-line align-top', open && 'bg-brand-tint')}
                  >
                    <td className="tnum px-4 py-3 text-[11.5px] text-ink-2">
                      {formatDateTime(record.at)}
                    </td>
                    <td className="px-3 py-3 text-small text-ink-2">{record.actor.name}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/settings/audit-log?${params(view, key)}`}
                        aria-current={open ? 'true' : undefined}
                        className="block text-[12.5px] font-semibold text-ink-1 underline-offset-2 hover:underline"
                      >
                        {record.action}
                      </Link>
                      <span className="tnum mt-0.5 block text-[11px] text-muted-1">
                        {record.detail}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-small text-ink-2">{record.target}</td>
                    <td className="px-3 py-3">
                      {record.source === 'AI_ASSISTED' ? (
                        <span
                          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
                          style={{ background: '#F5F3FF', borderColor: '#DDD6FE', color: '#6D28D9', borderWidth: 1 }}
                        >
                          {SOURCE_LABEL[record.source]}
                        </span>
                      ) : (
                        <span className="text-[11.5px] font-medium text-muted-1">
                          {SOURCE_LABEL[record.source]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ReachedChip reached={record.reached} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function FilterLink({
  view,
  to,
  label,
  count,
}: {
  view: AuditLogView
  to: 'ALL' | 'REFUSED'
  label: string
  count: number
}) {
  const active = view.filter === to
  const query = new URLSearchParams()
  if (to === 'REFUSED') query.set('filter', 'REFUSED')
  if (view.source !== 'ALL') query.set('source', view.source)
  if (view.query) query.set('q', view.query)
  const href = query.size > 0 ? `/settings/audit-log?${query}` : '/settings/audit-log'

  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex h-11 items-center rounded-control px-3 text-[11.5px] font-semibold md:h-[38px]',
        active ? 'bg-brand-tint text-brand-strong' : 'border border-line text-ink-2 hover:bg-canvas-soft',
      )}
    >
      {label} · <span className="tnum ml-1">{count}</span>
    </Link>
  )
}

/** Keep the current view when opening a record, so the drawer does not reset it. */
function params(view: AuditLogView, key: string): string {
  const query = new URLSearchParams()
  if (view.filter === 'REFUSED') query.set('filter', 'REFUSED')
  if (view.source !== 'ALL') query.set('source', view.source)
  if (view.query) query.set('q', view.query)
  query.set('record', key)
  return query.toString()
}
