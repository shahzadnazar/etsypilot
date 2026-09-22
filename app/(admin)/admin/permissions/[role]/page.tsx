import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/domain/admin/access'
import { isRefusalReason, REFUSAL_COPY } from '@/domain/admin/audit'
import {
  isEditableRole,
  NON_DELEGATABLE,
  NON_DELEGATABLE_LABELS,
  PERMISSION_LABELS,
} from '@/domain/admin/permissions'
import { PERMISSIONS } from '@/domain/admin/roles'
import { readPermissionMatrix } from '@/lib/repositories/admin-permissions'
import { changePermissions } from '../actions'

/*
 * The checkboxes for one role.
 *
 * THE LIST IS `PERMISSIONS`, and that is the whole answer to "how do
 * audit.view and roles.write stay out of this screen". They are not in
 * PERMISSIONS — they are SUPER_ADMIN_ONLY, a separate type — so there is no
 * iteration here that could produce a checkbox for them and no literal naming
 * one. Adding either would mean adding it to PERMISSIONS, which is a change
 * three other tests already fail on.
 *
 * SUPER_ADMIN cannot reach this page: isEditableRole() refuses it and the
 * route 404s. That is not a convenience — a super admin who could empty their
 * own set would lock themselves out of the screen that would restore it.
 */
export const dynamic = 'force-dynamic'

export default async function EditRolePermissionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>
  searchParams: Promise<{ outcome?: string }>
}) {
  const access = await requireAdmin('users.view')
  if (!access.canSuperAdminOnly('roles.write')) notFound()

  const { role } = await params
  const { outcome } = await searchParams

  /*
   * 404 for anything that is not an editable role — including SUPER_ADMIN,
   * including USER, including a typo. Not an error page: a URL that names a
   * role with no editable set is a URL that does not exist.
   */
  if (!isEditableRole(role)) notFound()

  const matrix = await readPermissionMatrix()
  const granted = matrix[role]
  const refusal = isRefusalReason(outcome) ? outcome : null

  return (
    <div className="mx-auto w-full max-w-[620px]">
      <title>Edit permissions · Operations · EtsyPilot</title>

      <Link
        href="/admin/permissions"
        className="text-small text-muted-1 underline underline-offset-2 hover:text-ink-2"
      >
        ← Permissions
      </Link>

      <h1 className="mt-3 text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
        {role.replace('_', ' ').toLowerCase()} permissions
      </h1>
      <p className="mt-1 max-w-prose text-small leading-relaxed text-muted-1">
        Applies to every account holding this role, not to one person. Unticking everything is
        allowed and means exactly that: the role keeps its name and loses the panel.
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

      <form action={changePermissions} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="role" value={role} />

        <Card className="flex flex-col gap-4 p-[18px]">
          <fieldset className="flex flex-col gap-2.5">
            <legend className="pb-1.5 text-label font-semibold text-ink-1">
              What this role may do
            </legend>
            {PERMISSIONS.map((permission) => (
              <label key={permission} className="flex items-start gap-2.5 text-small text-ink-2">
                <input
                  type="checkbox"
                  name="permissions"
                  value={permission}
                  defaultChecked={granted.includes(permission)}
                  className="mt-px h-6 w-6 shrink-0 accent-[var(--brand)]"
                />
                <span>
                  <span className="font-semibold text-ink-1">
                    {PERMISSION_LABELS[permission].title}
                  </span>
                  <span className="block text-caption leading-relaxed text-muted-1">
                    {PERMISSION_LABELS[permission].detail}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="border-t border-line pt-3 text-caption leading-relaxed text-muted-1">
            {/*
              * Named, not silently absent. A reader who knows these exist
              * should see that leaving them out was a decision.
              */}
            <span className="font-semibold text-ink-2">Not available to grant:</span>{' '}
            {NON_DELEGATABLE.map((capability, index) => (
              <span key={capability}>
                {index > 0 ? ', ' : ''}
                <code className="text-ink-2">{capability}</code> (
                {NON_DELEGATABLE_LABELS[capability].toLowerCase()})
              </span>
            ))}
            . They answer only to super admin and cannot be delegated to anyone.
          </div>

          <div className="flex flex-col gap-1.5 border-t border-line pt-4">
            <label htmlFor="password" className="text-label font-semibold text-ink-1">
              Confirm your password
            </label>
            <p className="text-caption leading-relaxed text-muted-1">
              Yours — {access.email}. The same check a role change asks for, for the same reason: a
              session cookie shows someone signed in on this machine, not who is at the keyboard
              now.
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
            <Button type="submit" variant="primary">
              Save permissions
            </Button>
            <Link
              href="/admin/permissions"
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
    </div>
  )
}
