import Link from 'next/link'
import { EmptyState } from '@/components/ui/states'
import { OperatorTable } from '@/components/admin/operator-table'
import { PageHeader } from '@/components/layout/page-header'
import { requireAdmin } from '@/domain/admin/access'
import { adminListManagers } from '@/lib/repositories/admin-reads-every-shop'
import { adminReadPromotions } from '@/lib/repositories/admin-audit-log'
import { formatCalendarDate } from '@/lib/utils/format'

/*
 * Who currently holds MANAGER, and how they got it.
 *
 * "WHO PROMOTED THEM" IS READ FROM THE AUDIT LOG, not from a column beside
 * platform_role. That was the requirement and it is also the right shape: a
 * `promoted_by` column would be the same fact stored twice, and the copy
 * without the timestamp, without the actor's role at the time, and without the
 * demotion that came afterwards would be the one that quietly went stale. The
 * log already knows, and it is the record that cannot be edited.
 *
 * An account with no record shows "not recorded" rather than a guess. That
 * happens legitimately — a row set directly in the database, or a promotion
 * that predates this log — and saying so is the honest answer. Filling it in
 * with the oldest plausible operator would be worse than the gap, because the
 * gap is visible.
 */
export const dynamic = 'force-dynamic'

export default async function AdminManagersPage() {
  await requireAdmin('users.view')
  const managers = await adminListManagers()
  const promotions = await adminReadPromotions(managers.map((m) => m.id))

  return (
    <>
      <title>Managers · Operations · EtsyPilot</title>

      <PageHeader
        title="Managers"
        subtitle={
          <>
            {managers.length === 1 ? '1 account' : `${managers.length} accounts`} promoted to
            manager. A manager sees the account list and nothing else — no money, no seller data,
            no audit log. Super admins and admins are not listed here: their role comes from an
            environment variable, not from this column.
          </>
        }
      />

      {managers.length === 0 ? (
        <EmptyState
          title="Nobody has been promoted to manager"
          description="A manager is an ordinary account given the operator role. Promote one from the accounts list and they appear here, with who promoted them and when."
          action={
            <Link
              href="/admin/users"
              className="font-semibold text-brand underline underline-offset-2"
            >
              Go to Accounts
            </Link>
          }
        />
      ) : (
        <OperatorTable
          label="Managers"
          minWidth={720}
          caption="Every account holding the manager role, with who promoted them and when."
        >
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-4 py-2.5 font-semibold">Email</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Promoted by</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Promoted</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((manager) => {
                const promotion = promotions.get(manager.id)
                return (
                  <tr key={manager.id} className="border-t border-line align-top">
                    <td className="px-4 py-3 text-small text-ink-1">{manager.email}</td>
                    <td className="px-3 py-3 text-small text-ink-2">
                      {manager.name ?? (
                        <>
                          <span aria-hidden className="text-muted-2">—</span>
                          <span className="sr-only">No name set on this account</span>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 text-small text-ink-2">
                      {promotion ? (
                        promotion.actorEmail
                      ) : (
                        <span className="text-muted-1">Not recorded</span>
                      )}
                    </td>
                    <td className="tnum px-4 py-3 text-small text-ink-2">
                      {promotion ? (
                        formatCalendarDate(promotion.at.toISOString().slice(0, 10))
                      ) : (
                        <span className="text-muted-1">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
        </OperatorTable>
      )}

      <p className="mt-3 max-w-prose text-caption leading-relaxed text-muted-1">
        &ldquo;Promoted by&rdquo; comes from the audit log rather than from a second column, so it
        cannot drift out of step with what actually happened. &ldquo;Not recorded&rdquo; means
        exactly that — the row was set some other way — and is shown rather than guessed at.
      </p>
    </>
  )
}
