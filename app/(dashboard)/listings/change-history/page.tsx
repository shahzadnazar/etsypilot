import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { HistoryTable } from '@/components/change-history/history-table'
import { RollbackPanel } from '@/components/change-history/rollback-panel'
import { getChangeHistory } from '@/domain/change-history/service'
import { refusalFromQuery, REFUSAL_COPY } from '@/domain/change-history/rollback'
import { SOURCE_LABEL } from '@/domain/change-history/types'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Change history' }

/*
 * Change history and rollback (artboards 44–45).
 *
 * Distinct from the Audit log, which records every action including refusals.
 * This lists only jobs that WROTE something, because a rollback needs a
 * before-value to restore and a refusal has none. They do not merge (D22).
 */
export default async function ChangeHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; job?: string; refused?: string; rolledBack?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const query = await searchParams
  const ctx = shopContext(session, session.shopId)
  const view = await getChangeHistory(ctx, query)
  const refused = refusalFromQuery(query.refused)

  return (
    <>
      <PageHeader
        title="Change history"
        subtitle={
          view.retentionDays === null
            ? 'Immutable audit trail · times in UTC'
            : `Immutable audit trail · ${view.retentionDays} days retained on ${view.plan.name} · times in UTC`
        }
        actions={
          <Link
            href="/api/export/audit-log"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Export CSV
          </Link>
        }
      />

      {refused ? (
        <div
          role="alert"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--danger-surface)',
            borderColor: 'var(--danger-border)',
            color: 'var(--danger-ink)',
          }}
        >
          <strong className="font-semibold">{REFUSAL_COPY[refused].title}</strong>{' '}
          {REFUSAL_COPY[refused].detail}
        </div>
      ) : query.rolledBack ? (
        <div
          role="status"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--success-surface)',
            borderColor: 'var(--success-border)',
            color: 'var(--success-ink)',
          }}
        >
          <strong className="font-semibold">Job #{query.rolledBack} rolled back.</strong> The
          rollback is itself a job, at the top of this trail. Nothing was deleted.
        </div>
      ) : null}

      {view.total > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SourceLink view={view} to="ALL" label="All" />
          {view.sources.map((source) => (
            <SourceLink key={source} view={view} to={source} label={SOURCE_LABEL[source]} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1">
          <HistoryTable view={view} />
        </div>
        <RollbackPanel view={view} />
      </div>

      {view.total > 0 ? (
        <p className="mt-4 max-w-prose text-caption leading-relaxed text-muted-1">
          Rollback availability is re-checked against your live listings every time this page
          loads — never read from something recorded when the job ran. A listing edited on Etsy
          since is skipped rather than overwritten, and a rollback appends a new job rather than
          deleting the one it reverses.{' '}
          <Link
            href="/settings/audit-log"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            The audit log
          </Link>{' '}
          records the attempts that never reached Etsy, which this trail does not.
        </p>
      ) : null}
    </>
  )
}

function SourceLink({
  view,
  to,
  label,
}: {
  view: Awaited<ReturnType<typeof getChangeHistory>>
  to: string
  label: string
}) {
  const active = view.source === to
  const href = to === 'ALL' ? '/listings/change-history' : `/listings/change-history?source=${to}`
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex h-11 items-center rounded-control px-3 text-[11.5px] font-semibold md:h-[38px]',
        active
          ? 'bg-brand-tint text-brand-strong'
          : 'border border-line text-ink-2 hover:bg-canvas-soft',
      )}
    >
      {label}
    </Link>
  )
}
