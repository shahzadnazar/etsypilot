import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/domain/admin/access'
import {
  EDITABLE_ROLES,
  NON_DELEGATABLE,
  NON_DELEGATABLE_LABELS,
  PERMISSION_LABELS,
} from '@/domain/admin/permissions'
import { PERMISSIONS } from '@/domain/admin/roles'
import { readPermissionMatrix } from '@/lib/repositories/admin-permissions'

/*
 * The permission matrix. Who may do what, at a glance.
 *
 * READ-ONLY HERE, with an Edit link per editable role. The checkboxes live on
 * their own page, which is the pattern the role editor already established and
 * for the same reasons: a password field belongs on a screen that explains why
 * it is being asked for, and a row of password boxes down a table trains
 * people to type their password into anything that looks like a form. One
 * change, one screen, one audit record.
 *
 * SUPER_ADMIN IS SHOWN AND CANNOT BE EDITED. Showing it matters — a matrix
 * that silently omitted the role holding every capability would be a matrix
 * that misdescribes the system. Not editing it matters more: a super admin who
 * can remove their own capabilities can lock themselves out of the only screen
 * that would restore them, and the way back is an environment variable and a
 * restart.
 *
 * The two non-delegatable capabilities are NAMED at the bottom rather than
 * omitted, because a reader who knows they exist should be able to see that
 * their absence is deliberate rather than an oversight.
 */
export const dynamic = 'force-dynamic'

export default async function AdminPermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>
}) {
  const access = await requireAdmin('users.view')
  // 404, not a read-only view: an ADMIN must not learn this screen exists.
  if (!access.canSuperAdminOnly('roles.write')) notFound()

  const matrix = await readPermissionMatrix()
  const { changed } = await searchParams

  const rows = [
    { role: 'SUPER_ADMIN' as const, granted: PERMISSIONS, editable: false },
    ...EDITABLE_ROLES.map((role) => ({ role, granted: matrix[role], editable: true })),
  ]

  return (
    <>
      <title>Permissions · Operations · EtsyPilot</title>

      <div className="flex flex-col gap-1 pb-4">
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
          Permissions
        </h1>
        <p className="max-w-prose text-small leading-relaxed text-muted-1">
          What each platform role may do. Set per role, not per person — one set for all admins,
          one for all managers. Changes take effect on their next request and need your password.
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
          <strong className="font-semibold">Permissions changed</strong> for{' '}
          {changed.toLowerCase()}. The record is in the{' '}
          <Link href="/admin/audit" className="underline underline-offset-2">
            audit log
          </Link>
          .
        </Card>
      ) : null}

      <Card
        tabIndex={0}
        role="region"
        aria-label="Permission matrix, scrolls horizontally"
        className="w-full max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <table className="w-full min-w-[860px] border-collapse text-body">
          <caption className="sr-only">
            Each platform role and the permissions it holds. Super admin is not editable.
          </caption>
          <thead>
            <tr className="bg-canvas-soft text-left text-label text-muted-1">
              <th scope="col" className="px-4 py-2.5 font-semibold">Role</th>
              {PERMISSIONS.map((permission) => (
                <th key={permission} scope="col" className="px-2 py-2.5 text-center font-semibold">
                  {PERMISSION_LABELS[permission].title}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 font-semibold">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ role, granted, editable }) => (
              <tr key={role} className="border-t border-line align-top">
                <th scope="row" className="px-4 py-3 text-left text-small font-semibold text-ink-1">
                  {role.replace('_', ' ').toLowerCase()}
                  {!editable ? (
                    <span className="block text-caption font-normal text-muted-1">
                      Always all seven
                    </span>
                  ) : null}
                </th>
                {PERMISSIONS.map((permission) => {
                  const held = granted.includes(permission)
                  return (
                    <td key={permission} className="px-2 py-3 text-center">
                      {/*
                        * A glyph plus screen-reader text, not a disabled
                        * checkbox. A disabled checkbox on a read-only view
                        * looks like a control that is temporarily unavailable;
                        * this is not a control at all — the control is one
                        * click away, on its own page.
                        */}
                      <span aria-hidden className={held ? 'text-brand' : 'text-muted-2'}>
                        {held ? '●' : '—'}
                      </span>
                      <span className="sr-only">
                        {PERMISSION_LABELS[permission].title}:{' '}
                        {held ? 'granted' : 'not granted'}
                      </span>
                    </td>
                  )
                })}
                <td className="px-4 py-3 text-small">
                  {editable ? (
                    <Link
                      href={`/admin/permissions/${role}`}
                      className="font-semibold text-brand underline underline-offset-2"
                    >
                      Edit
                      <span className="sr-only"> {role.toLowerCase()} permissions</span>
                    </Link>
                  ) : (
                    <span className="text-caption text-muted-1">Not editable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-3 max-w-prose p-[18px] text-small leading-relaxed text-ink-2">
        <p className="font-semibold text-ink-1">Two capabilities are not in this table.</p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {NON_DELEGATABLE.map((capability) => (
            <li key={capability} className="flex gap-2">
              <span aria-hidden className="text-muted-2">·</span>
              <span>
                <code className="text-ink-1">{capability}</code> —{' '}
                {NON_DELEGATABLE_LABELS[capability]}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-muted-1">
          They answer only to super admin and cannot be granted to anyone, including by this
          screen. Both are how someone covers their tracks: whoever can change these permissions
          can grant themselves the rest, and whoever can read the audit log can see who noticed.
          They are named here so their absence reads as a decision rather than a gap.
        </p>
      </Card>

      <p className="mt-3 max-w-prose text-caption leading-relaxed text-muted-1">
        This table is what is enforced, not a description of it. Every check in the operator panel
        reads these sets — the pages, the navigation and the actions all resolve through one
        place, so a box unticked here is a page that 404s on the next request.
      </p>
    </>
  )
}
