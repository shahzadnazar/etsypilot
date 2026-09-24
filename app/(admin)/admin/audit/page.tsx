import { notFound } from 'next/navigation'
import { OperatorTitle } from '@/components/admin/operator-title'
import { Numeric } from '@/components/ui/numeric'
import { EmptyState } from '@/components/ui/states'
import { OperatorTable } from '@/components/admin/operator-table'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/domain/admin/access'
import {
  describeOutcome,
  describePermissionOutcome,
  entryIsRefusal,
  mergeAuditEntries,
  type AdminAuditEntry,
  type AdminAuditEvent,
  type AdminPermissionAuditEvent,
} from '@/domain/admin/audit'
import { PERMISSION_LABELS } from '@/domain/admin/permissions'
import { readAdminAuditLog, readPermissionAuditLog } from '@/lib/repositories/admin-audit-log'

/*
 * Every attempt to change a platform role. SUPER_ADMIN only.
 *
 * NOT ADMIN, NOT MANAGER, and `audit.view` is typed so that it cannot become
 * either: it is a SuperAdminOnlyCapability, a separate type that can() does
 * not accept, so no permissions editor can render a checkbox for it and no
 * role can be granted it. The reason is the point of the log — whoever can
 * read it can see who noticed.
 *
 * REFUSALS ARE THE POINT, not a footnote (D66). A log of role changes that
 * succeeded cannot answer "did someone try?", and that is the question asked
 * when something has gone wrong. Three wrong passwords in a row against this
 * editor is the most useful row this table will ever hold, and it is only here
 * because refusals are written.
 *
 * Read-only, like the rest of the panel. There is no filter that hides
 * refusals and no control that removes a row — the store has no delete, so
 * there could not be one.
 */
export const dynamic = 'force-dynamic'

export default async function AdminAuditPage() {
  const access = await requireAdmin('users.view')
  // 404, never 403. An ADMIN learns nothing about whether this page exists.
  if (!access.canSuperAdminOnly('audit.view')) notFound()

  /*
   * TWO STORES, ONE LOG. Role changes and permission changes are recorded
   * separately — their subjects are a person and a role, and the role log's
   * target_email is NOT NULL — but "what did operators do" is one question, so
   * they are merged by timestamp here rather than shown as two screens.
   */
  const [roleLog, permissionLog] = await Promise.all([
    readAdminAuditLog(),
    readPermissionAuditLog(),
  ])
  const entries = mergeAuditEntries(roleLog.events, permissionLog.events)
  const unreadable = roleLog.unreadable + permissionLog.unreadable
  const refusals = entries.filter(entryIsRefusal).length

  return (
    <>
      <OperatorTitle page="Audit log" />

      <PageHeader
        title="Audit log"
        subtitle={
          <>
            Every platform role change, every permission change and every refused attempt.{' '}
            {entries.length} {entries.length === 1 ? 'record' : 'records'}
            {refusals > 0 ? `, ${refusals} refused` : ''} · newest first. These records cannot be
            edited or removed — the store has no update and no delete.
          </>
        }
      />

      {unreadable > 0 ? (
        /*
         * Said out loud rather than swallowed. A row that cannot be rebuilt
         * into a valid outcome is dropped from the list, and a log that
         * quietly showed fewer rows than it holds would be worse than useless:
         * nobody could tell a complete log from a truncated one.
         */
        <Card
          role="alert"
          className="mb-3 p-[14px] text-small leading-relaxed"
          style={{
            background: 'var(--warning-surface)',
            borderColor: 'var(--warning-border)',
            color: 'var(--warning-ink)',
          }}
        >
          {unreadable} {unreadable === 1 ? 'record is' : 'records are'} unreadable and not shown
          below. They are still in the table; they could not be interpreted, and are reported
          rather than hidden.
        </Card>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing has been attempted yet"
          description={
            <>
              Rows appear here when a platform role or a role&rsquo;s permissions are changed — or
              when a change is refused, which is recorded just the same.
            </>
          }
        />
      ) : (
        <OperatorTable
          label="Audit log"
          minWidth={900}
          caption="Every platform role change, permission change and refused attempt, newest first."
        >
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-4 py-2.5 font-semibold">When</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Operator</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Subject</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Change</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={`${entry.kind}:${entry.id}`} className="border-t border-line align-top">
                  <td className="px-4 py-3 text-small text-ink-2">
                    <Numeric>{entry.at.toISOString().slice(0, 16).replace('T', ' ')}</Numeric>
                    <span className="block text-caption text-muted-1">UTC</span>
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {entry.event.actorEmail}
                    <span className="block text-caption text-muted-1">
                      {entry.event.actorRole.replace('_', ' ').toLowerCase()} at the time
                    </span>
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {entry.kind === 'ROLE' ? (
                      entry.event.targetEmail
                    ) : (
                      <>
                        {entry.event.subjectRole.toLowerCase()}
                        <span className="block text-caption text-muted-1">role, not a person</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {entry.kind === 'ROLE' ? (
                      <Change event={entry.event} />
                    ) : (
                      <PermissionChange event={entry.event} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <OutcomeChip entry={entry} />
                  </td>
                </tr>
              ))}
            </tbody>
        </OperatorTable>
      )}

      <p className="mt-3 max-w-prose text-caption leading-relaxed text-muted-1">
        Emails are recorded as they were at the time, not looked up now, so a record still says
        who it was about after an account is renamed or deleted. The outcome is derived from the
        record&rsquo;s own fields rather than stored beside them, so &ldquo;changed&rdquo; cannot
        appear on a record that carries no new role.
      </p>
    </>
  )
}

/** The before and after, from the union. Nothing here is stored as a sentence. */
function Change({ event }: { event: AdminAuditEvent }) {
  if (event.outcome.kind === 'APPLIED') {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-1">{event.outcome.from.replace('_', ' ').toLowerCase()}</span>
        <span aria-hidden className="text-muted-2">→</span>
        <span className="sr-only">to</span>
        <span className="font-semibold text-ink-1">{event.outcome.to.toLowerCase()}</span>
      </span>
    )
  }
  if (event.outcome.attempted) {
    return (
      <span className="text-muted-1">
        attempted {event.outcome.attempted.toLowerCase()}
      </span>
    )
  }
  return <span aria-hidden className="text-muted-2">—</span>
}

/**
 * The outcome chip.
 *
 * The refusal chip is an OUTLINE, not a filled red alarm — same call D66 made
 * on the seller log. A refusal is usually the product working, and a wall of
 * red trains people to skim past the one that matters.
 */
function OutcomeChip({ entry }: { entry: AdminAuditEntry }) {
  const refused = entryIsRefusal(entry)
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
      style={
        refused
          ? { background: 'transparent', borderColor: 'var(--border)', color: 'var(--muted-1)' }
          : {
              background: 'var(--brand-tint)',
              borderColor: 'var(--brand)',
              color: 'var(--brand-strong)',
            }
      }
    >
      {entry.kind === 'ROLE'
        ? describeOutcome(entry.event.outcome)
        : describePermissionOutcome(entry.event.outcome)}
    </span>
  )
}

/**
 * The permissions that came and went, from the union.
 *
 * Named rather than counted, because "granted 2" tells an investigator nothing
 * about which two — and which two is the entire question a permission audit is
 * asked. The counted form is the chip; this is the detail beside it.
 */
function PermissionChange({ event }: { event: AdminPermissionAuditEvent }) {
  // Bound once: narrowing a property does not survive into the closures below.
  const outcome = event.outcome
  if (outcome.kind === 'REFUSED') {
    if (!outcome.attempted) return <span aria-hidden className="text-muted-2">—</span>
    return (
      <span className="text-muted-1">
        attempted{' '}
        {outcome.attempted.length === 0
          ? 'none'
          : outcome.attempted.map((p) => PERMISSION_LABELS[p].title).join(', ')}
      </span>
    )
  }

  const added = outcome.to.filter((p) => !outcome.from.includes(p))
  const removed = outcome.from.filter((p) => !outcome.to.includes(p))
  if (added.length === 0 && removed.length === 0) {
    return <span className="text-muted-1">no change</span>
  }
  return (
    <span className="flex flex-col gap-0.5">
      {added.length > 0 ? (
        <span>
          <span aria-hidden className="text-brand">+</span>
          <span className="sr-only">granted</span>{' '}
          {added.map((p) => PERMISSION_LABELS[p].title).join(', ')}
        </span>
      ) : null}
      {removed.length > 0 ? (
        <span className="text-muted-1">
          <span aria-hidden>−</span>
          <span className="sr-only">revoked</span>{' '}
          {removed.map((p) => PERMISSION_LABELS[p].title).join(', ')}
        </span>
      ) : null}
    </span>
  )
}
