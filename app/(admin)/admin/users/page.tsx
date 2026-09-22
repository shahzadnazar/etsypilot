import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/domain/admin/access'
import { roleSource } from '@/domain/admin/roles'
import { adminListUsers } from '@/lib/repositories/admin-reads-every-shop'
import { formatCalendarDate } from '@/lib/utils/format'

/*
 * Every account on the platform.
 *
 * READ-ONLY, and not just by omission. D70: a control that appears to work and
 * does not is worse than no control — "Sign out everywhere else" that signs
 * nothing out is worse than no button, because whoever clicks it stops looking
 * for the real answer. On an operator screen that argument is stronger again,
 * so this page contains no button, no form, no link that implies an action, and
 * no disabled control hinting at one. Promotion is the next step; when it
 * exists it will arrive as a real control, not as a greyed-out promise.
 *
 * requireAdmin() rather than a boolean from the layout: a page that trusts its
 * parent to have checked is a page whose security depends on the parent still
 * being there.
 *
 * NO `export const metadata`, and that is a security decision rather than a
 * style one. Next resolves a route's static metadata independently of whether
 * the component renders, so it survives notFound() and lands in the flight
 * payload anyway. Measured against a real server: a signed-in NON-ADMIN asking
 * for this page got a 404 carrying
 *
 *     {"children":"Accounts · Operations · EtsyPilot"}
 *
 * which told them the operator panel exists and what the screen is called — the
 * exact disclosure the 404-instead-of-403 rule exists to prevent. A <title>
 * rendered inside the component cannot leak, because a refused request never
 * reaches it. React 19 hoists it into <head> from here.
 */
export const dynamic = 'force-dynamic'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>
}) {
  const access = await requireAdmin('users.view')
  const users = await adminListUsers()
  const { changed } = await searchParams

  /*
   * The control is rendered for SUPER_ADMIN only — not disabled for everyone
   * else, ABSENT. That was the requirement and it is the right one: a greyed
   * out "Change role" tells an ADMIN the capability exists and that they are
   * one promotion away from it. The confirmation page 404s them as well, which
   * is the half that holds when someone types the URL.
   */
  const mayChangeRoles = access.canSuperAdminOnly('roles.write')

  return (
    <>
      <title>Accounts · Operations · EtsyPilot</title>
      <div className="flex flex-col gap-1 pb-4">
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
          Accounts
        </h1>
        <p className="max-w-prose text-small leading-relaxed text-muted-1">
          {users.length === 1 ? '1 account' : `${users.length} accounts`} · newest first ·
          read-only. Nothing on this page changes anything, and no seller data — listings, orders
          or revenue — is read to build it.
        </p>
      </div>

      {changed ? (
        <Card
          role="status"
          className="mb-3 p-[14px] text-small leading-relaxed"
          style={{
            background: 'var(--success-surface)',
            borderColor: 'var(--success-border)',
            color: 'var(--success-ink)',
          }}
        >
          <strong className="font-semibold">Role changed</strong> for {changed}. The record is in
          the{' '}
          <Link href="/admin/audit" className="underline underline-offset-2">
            audit log
          </Link>
          .
        </Card>
      ) : null}

      {users.length === 0 ? (
        <Card className="p-[18px] text-small leading-relaxed text-ink-2">
          No accounts yet. Rows appear here as people sign up — this list is not seeded and shows
          nothing that is not really in the database.
        </Card>
      ) : (
        <Card
          tabIndex={0}
          role="region"
          aria-label="Accounts, scrolls horizontally"
          className="w-full max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <table className="w-full min-w-[820px] border-collapse text-body">
            <caption className="sr-only">
              Every EtsyPilot account with its platform role, its shop and when it was created.
            </caption>
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-4 py-2.5 font-semibold">Email</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Name</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Platform role</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Shop</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Signed up</th>
                {mayChangeRoles ? (
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-small text-ink-1">{user.email}</td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {user.name ?? (
                      <>
                        <span aria-hidden className="text-muted-2">—</span>
                        <span className="sr-only">No name set on this account</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <RoleChip role={user.platformRole} />
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {user.shopId ? (
                      <span className="flex flex-col gap-0.5">
                        <span>{user.shopName}</span>
                        {user.shopIsDemo ? (
                          <span className="text-caption text-muted-1">Demo shop</span>
                        ) : null}
                      </span>
                    ) : (
                      /*
                       * The state worth surfacing. An account with no shop is
                       * one whose provisioning failed, and it is exactly what
                       * an operator is here to notice — so it is named rather
                       * than left as an empty cell.
                       */
                      <span style={{ color: 'var(--warning-ink)' }}>No shop — setup unfinished</span>
                    )}
                  </td>
                  <td className="tnum px-4 py-3 text-small text-ink-2">
                    {formatCalendarDate(user.signedUpAt.toISOString().slice(0, 10))}
                  </td>
                  {mayChangeRoles ? (
                    <td className="px-4 py-3 text-small">
                      {roleSource(user.platformRole) === 'ENVIRONMENT' ? (
                        /*
                         * No link where the change would do nothing. Writing
                         * the column for an env-derived role succeeds and
                         * alters no access at all, so offering it would be
                         * D70's control that appears to work and does not.
                         * The reason is named rather than left as a blank.
                         */
                        <span className="text-caption text-muted-1">Set by environment</span>
                      ) : (
                        <Link
                          href={`/admin/users/${encodeURIComponent(user.id)}/role`}
                          className="font-semibold text-brand underline underline-offset-2"
                        >
                          Change role
                          <span className="sr-only"> for {user.email}</span>
                        </Link>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-3 max-w-prose text-caption leading-relaxed text-muted-1">
        Platform role is resolved, not stored: SUPER_ADMIN and ADMIN come from environment
        variables and are never read from the database, so this column shows what is actually in
        force rather than what a row happens to say. It is a separate axis from a seller&rsquo;s
        shop role — every seller owns their own shop, and none of them is an operator.
      </p>
    </>
  )
}

/**
 * The role, as a chip.
 *
 * Tokens only (D1), and the two elevated roles share one treatment: the
 * distinction a reader needs at a glance is "operator or not", and giving
 * SUPER_ADMIN its own colour would imply a difference in reach that does not
 * exist for anything on this page.
 */
function RoleChip({ role }: { role: string }) {
  const elevated = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const manager = role === 'MANAGER'
  return (
    <span
      className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
      style={
        elevated
          ? {
              background: 'var(--brand-tint)',
              borderColor: 'var(--brand)',
              color: 'var(--brand-strong)',
            }
          : manager
            ? {
                background: 'var(--warning-surface)',
                borderColor: 'var(--warning-border)',
                color: 'var(--warning-ink)',
              }
            : {
                background: 'var(--canvas-soft)',
                borderColor: 'var(--border)',
                color: 'var(--muted-1)',
              }
      }
    >
      {role.replace('_', ' ').toLowerCase()}
    </span>
  )
}
