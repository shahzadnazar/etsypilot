import Link from 'next/link'
import { Card } from '@/components/ui/card'
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

      <div className="flex flex-col gap-1 pb-4">
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
          Managers
        </h1>
        <p className="max-w-prose text-small leading-relaxed text-muted-1">
          {managers.length === 1 ? '1 account' : `${managers.length} accounts`} promoted to manager.
          A manager sees the account list and nothing else — no money, no seller data, no audit
          log. Super admins and admins are not listed here: their role comes from an environment
          variable, not from this column.
        </p>
      </div>

      {managers.length === 0 ? (
        <Card className="p-[18px] text-small leading-relaxed text-ink-2">
          Nobody has been promoted to manager. Promote someone from{' '}
          <Link href="/admin/users" className="font-semibold text-brand underline underline-offset-2">
            Accounts
          </Link>
          .
        </Card>
      ) : (
        <Card
          tabIndex={0}
          role="region"
          aria-label="Managers, scrolls horizontally"
          className="w-full max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <table className="w-full min-w-[720px] border-collapse text-body">
            <caption className="sr-only">
              Every account holding the manager role, with who promoted them and when.
            </caption>
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
          </table>
        </Card>
      )}

      <p className="mt-3 max-w-prose text-caption leading-relaxed text-muted-1">
        &ldquo;Promoted by&rdquo; comes from the audit log rather than from a second column, so it
        cannot drift out of step with what actually happened. &ldquo;Not recorded&rdquo; means
        exactly that — the row was set some other way — and is shown rather than guessed at.
      </p>
    </>
  )
}
