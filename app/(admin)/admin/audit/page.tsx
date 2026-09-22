import { notFound } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { requireAdmin } from '@/domain/admin/access'
import { describeOutcome, isRefusal, type AdminAuditEvent } from '@/domain/admin/audit'
import { readAdminAuditLog } from '@/lib/repositories/admin-audit-log'

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

  const { events, unreadable } = await readAdminAuditLog()
  const refusals = events.filter(isRefusal).length

  return (
    <>
      <title>Audit log · Operations · EtsyPilot</title>

      <div className="flex flex-col gap-1 pb-4">
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
          Audit log
        </h1>
        <p className="max-w-prose text-small leading-relaxed text-muted-1">
          Every platform role change and every refused attempt. {events.length}{' '}
          {events.length === 1 ? 'record' : 'records'}
          {refusals > 0 ? `, ${refusals} refused` : ''} · newest first. These records cannot be
          edited or removed — the store has no update and no delete.
        </p>
      </div>

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

      {events.length === 0 ? (
        <Card className="p-[18px] text-small leading-relaxed text-ink-2">
          Nothing has been attempted yet. Rows appear here when a platform role is changed — or
          when a change is refused, which is recorded just the same.
        </Card>
      ) : (
        <Card
          tabIndex={0}
          role="region"
          aria-label="Audit log, scrolls horizontally"
          className="w-full max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <table className="w-full min-w-[900px] border-collapse text-body">
            <caption className="sr-only">
              Every platform role change and refused attempt, newest first.
            </caption>
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-4 py-2.5 font-semibold">When</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Operator</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Account</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Change</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t border-line align-top">
                  <td className="tnum whitespace-nowrap px-4 py-3 text-small text-ink-2">
                    {event.at.toISOString().slice(0, 16).replace('T', ' ')}
                    <span className="block text-caption text-muted-1">UTC</span>
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {event.actorEmail}
                    <span className="block text-caption text-muted-1">
                      {event.actorRole.replace('_', ' ').toLowerCase()} at the time
                    </span>
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">{event.targetEmail}</td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    <Change event={event} />
                  </td>
                  <td className="px-4 py-3">
                    <OutcomeChip event={event} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
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
function OutcomeChip({ event }: { event: AdminAuditEvent }) {
  const refused = isRefusal(event)
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
      {describeOutcome(event.outcome)}
    </span>
  )
}
