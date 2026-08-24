import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { AuditTable } from '@/components/audit-log/audit-table'
import { RecordDrawer } from '@/components/audit-log/record-drawer'
import { Card } from '@/components/ui/card'
import { getAuditLogView } from '@/domain/audit-log/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Audit log' }

/*
 * Audit log (artboard 109).
 *
 * Built around refusals. The question a dispute asks is "did EtsyPilot change
 * my listing?", and the answer is usually no — which a log of successes cannot
 * give, because an absent record proves nothing. So every action is recorded
 * with what it did or did not reach, and "Refused only" is pinned in the filter
 * row rather than hidden in a dropdown.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; source?: string; q?: string; record?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const query = await searchParams
  const ctx = shopContext(session, session.shopId)
  const view = await getAuditLogView(ctx, query)

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Every action taken on this shop through EtsyPilot, including the ones that were refused. Records are immutable and cannot be edited or deleted from this page."
        actions={
          <>
            <Link
              href="/api/export/audit-log"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Export CSV
            </Link>
            <Link
              href="/api/export/audit-log?format=json"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Export JSON
            </Link>
          </>
        }
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1">
          <AuditTable view={view} />
        </div>
        {view.selected ? <RecordDrawer record={view.selected} /> : null}
      </div>

      <Card className="mt-5 flex flex-col gap-2 p-[18px]">
        <h2 className="text-label text-muted-1">Retention</h2>
        <p className="max-w-prose text-small leading-relaxed text-ink-2">
          Records are append-only and{' '}
          {view.retentionDays === null ? (
            <>
              the {view.plan.name} plan connects no shop, so there are no shop records to keep
            </>
          ) : (
            <>
              kept for <span className="tnum font-semibold">{view.retentionDays}</span> days on{' '}
              {view.plan.name}
            </>
          )}
          {'. '}
          {/*
            * Only the OTHER plans. Naming the seller's own retention twice —
            * "90 days on Solo (90 days on Solo, 365 days on Growth)" — read
            * like a system printing a variable it had already printed.
            */}
          {view.retentionByPlan
            .filter((r) => r.plan !== view.plan.name)
            .map((r) => (
              <span key={r.plan}>
                On {r.plan} they are kept for <span className="tnum">{r.days}</span> days.{' '}
              </span>
            ))}
          Deleting your shop data removes the shop&rsquo;s records; the account-level log of who
          requested it is kept as long as the account exists. Changes made directly on Etsy are not
          recorded here — they appear as differences at the next sync.
        </p>
        <p className="text-caption text-muted-1">
          <Link
            href="/settings/export"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Data export &amp; deletion
          </Link>{' '}
          explains what deletion removes and what it keeps.
        </p>
      </Card>
    </>
  )
}
