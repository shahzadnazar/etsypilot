import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/domain/admin/access'
import { isRefusalReason, REFUSAL_COPY } from '@/domain/admin/audit'
import { ASSIGNABLE_ROLES, roleSource } from '@/domain/admin/roles'
import { adminReadAccount } from '@/lib/repositories/admin-reads-every-shop'
import { changeRole } from '../../actions'
import { ChangeRoleSubmit } from './submit'

/*
 * The confirmation screen for a role change.
 *
 * ITS OWN PAGE, not a control in the list row, and that is the design rather
 * than a shortcut. GitHub does the same thing before a permission change for
 * reasons that apply here unchanged:
 *
 *   - A password field belongs on a page that explains why it is being asked
 *     for. Twenty of them down a table is a screen that trains people to type
 *     their password into any box that appears in a row.
 *   - The change is stated in words before it happens — WHO, from WHAT, to
 *     WHAT — so a misclick in the list is caught here rather than in the
 *     audit log afterwards.
 *   - One form per page works without JavaScript. Twenty inline forms with a
 *     shared password field would not.
 *
 * requireAdmin() is called here too, not inherited from the layout: the layout
 * passes children through for a refused request (so a refusal renders the
 * ordinary 404 rather than a bare error document), which means the page is
 * what refuses. A sweep asserts every operator page does this.
 */
export const dynamic = 'force-dynamic'

export default async function ChangeRolePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ outcome?: string }>
}) {
  const access = await requireAdmin('users.view')
  const { userId } = await params
  const { outcome } = await searchParams

  /*
   * roles.write is 404, not 403, and not a disabled form.
   *
   * An ADMIN must not see this screen at all — that was the requirement, and
   * rendering it greyed out would tell them the capability exists and that
   * they are one role away from it. The list does not link here for them
   * either; this is the half that holds when someone types the URL.
   */
  if (!access.canSuperAdminOnly('roles.write')) notFound()

  const target = await adminReadAccount(userId)
  if (!target) notFound()

  const fromEnvironment = roleSource(target.resolvedRole) === 'ENVIRONMENT'
  /*
   * The role this form is starting from, and the one the heading calls
   * "currently".
   *
   * resolvedRole rather than storedRole, so the pre-selected radio cannot
   * disagree with the sentence above it. Past this line they are the same
   * value — a DATABASE source means resolvePlatformRole() returned the stored
   * value — with one exception that matters: a row edited directly to hold
   * 'ADMIN' is not storable, so it resolves to USER. The heading would say
   * "currently user" while storedRole pre-selected nothing at all.
   */
  const currentRole = target.resolvedRole
  const refusal = isRefusalReason(outcome) ? outcome : null

  return (
    <div className="mx-auto w-full max-w-[560px]">
      <title>Change role · Operations · EtsyPilot</title>

      <Link
        href="/admin/users"
        className="text-small text-muted-1 underline underline-offset-2 hover:text-ink-2"
      >
        ← Accounts
      </Link>

      <h1 className="mt-3 text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
        Change platform role
      </h1>
      <p className="mt-1 text-small leading-relaxed text-muted-1">
        {target.email} · currently{' '}
        <span className="font-semibold text-ink-2">
          {target.resolvedRole.replace('_', ' ').toLowerCase()}
        </span>
      </p>

      {refusal ? (
        <Card
          role="alert"
          className="mt-4 p-[14px] text-small leading-relaxed"
          style={{
            background: 'var(--danger-surface)',
            borderColor: 'var(--danger-border)',
            color: 'var(--danger-ink)',
          }}
        >
          <strong className="font-semibold">Not changed.</strong> {REFUSAL_COPY[refusal]}.
          {refusal === 'WRONG_PASSWORD' || refusal === 'RATE_LIMITED' ? (
            <>
              {' '}
              This attempt was recorded in the{' '}
              <Link href="/admin/audit" className="underline underline-offset-2">
                audit log
              </Link>
              .
            </>
          ) : null}
        </Card>
      ) : null}

      {fromEnvironment ? (
        /*
         * No form at all for an env-derived role, and the reason is spelled
         * out rather than left as a missing control.
         *
         * D70: a control that appears to work and does not is worse than no
         * control. Writing platform_role for someone in SUPER_ADMIN_EMAILS
         * SUCCEEDS — the row changes — and changes nothing about their access,
         * because resolvePlatformRole() reads the environment first. A form
         * here would report success and do nothing, which is the worst
         * available outcome. The domain action refuses it too; this is the
         * half that explains it.
         */
        <Card className="mt-4 p-[18px] text-small leading-relaxed text-ink-2">
          <p className="font-semibold text-ink-1">This role cannot be changed here.</p>
          <p className="mt-1.5">
            {target.email} resolves to {target.resolvedRole.replace('_', ' ').toLowerCase()} from an
            environment variable, not from the database. The panel writes one column and that
            column does not decide this account&rsquo;s access — editing it would change the row
            and change nothing else.
          </p>
          <p className="mt-1.5 text-muted-1">
            Change it by editing <code className="text-ink-2">SUPER_ADMIN_EMAILS</code> or{' '}
            <code className="text-ink-2">ADMIN_EMAILS</code> where this deployment is configured,
            and restarting. That is deliberate: it is what stops a database compromise from
            minting an administrator, and it is the way back in if this panel is ever locked.
          </p>
        </Card>
      ) : (
        <form action={changeRole} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="targetUserId" value={target.id} />

          <Card className="flex flex-col gap-4 p-[18px]">
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-1.5 text-label font-semibold text-ink-1">New role</legend>
              {ASSIGNABLE_ROLES.map((role) => (
                <label key={role} className="flex items-start gap-2.5 text-small text-ink-2">
                  <input
                    type="radio"
                    name="role"
                    value={role}
                    required
                    defaultChecked={currentRole === role}
                    className="mt-px h-6 w-6 shrink-0 accent-[var(--brand)]"
                  />
                  <span>
                    <span className="font-semibold text-ink-1">
                      {role === 'MANAGER' ? 'Manager' : 'User'}
                    </span>
                    <span className="block text-caption leading-relaxed text-muted-1">
                      {role === 'MANAGER'
                        ? 'Sees the account list. No money, no seller data, no audit log.'
                        : 'No operator access at all. /admin does not exist for them.'}
                    </span>
                  </span>
                </label>
              ))}
              {/*
               * Only two options, and there is no third for a reason worth
               * stating on the screen an operator is looking at: the list is
               * ASSIGNABLE_ROLES, and super admin and admin are not in it.
               */}
              <p className="pt-1 text-caption leading-relaxed text-muted-1">
                Super admin and admin are not offered here. They are set by environment variable so
                that writing a database row cannot grant them — including from this panel.
              </p>
            </fieldset>

            <div className="flex flex-col gap-1.5 border-t border-line pt-4">
              <label htmlFor="password" className="text-label font-semibold text-ink-1">
                Confirm your password
              </label>
              <p className="text-caption leading-relaxed text-muted-1">
                Yours — {access.email} — not theirs. A session cookie shows someone signed in on
                this machine at some point; it cannot show who is at the keyboard now.
              </p>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="mt-1 h-11 rounded-control border border-line bg-surface px-3 text-body text-ink-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <ChangeRoleSubmit currentRole={currentRole} />
              <Link
                href="/admin/users"
                className="inline-flex h-11 items-center rounded-control px-3.5 text-[12.5px] font-semibold text-ink-2 hover:bg-canvas-soft"
              >
                Cancel
              </Link>
              <span className="text-caption text-muted-1">
                Recorded either way, including if the password is wrong.
              </span>
            </div>
          </Card>
        </form>
      )}
    </div>
  )
}
