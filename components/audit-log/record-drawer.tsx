import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { isRefusal, SOURCE_LABEL, type AuditRecord } from '@/domain/audit-log/types'
import { formatDateTime } from '@/lib/utils/format'
import { ReachedChip } from './reached-chip'

/*
 * One record, in full (artboard 109's 376px drawer).
 *
 * The artboard designs the REFUSED case, and that is the right one to design:
 * a successful apply is answered by the listing itself, while a refusal leaves
 * no trace anywhere except here. So this panel leads with why, then the
 * sequence with the fingerprint recorded at confirm and the refusal at the
 * gate, then the change that never happened — struck through, because it did
 * not happen.
 *
 * "This record cannot be edited or removed" sits at the foot of it. The store
 * behind this has no update and no delete, so that sentence describes the code
 * rather than an intention.
 */
export function RecordDrawer({ record }: { record: AuditRecord }) {
  const refused = isRefusal(record)

  return (
    <Card
      role="region"
      aria-label={`Record ${record.id}`}
      className="flex w-full shrink-0 flex-col gap-4 p-[18px] lg:w-[376px]"
    >
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <span className="tnum text-label text-muted-1">Record · {record.id}</span>
          <Link
            href="/settings/audit-log"
            className="text-caption font-semibold text-brand-strong underline underline-offset-2"
          >
            Close
          </Link>
        </div>
        <h2 className="text-section text-ink-1">{record.action}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <ReachedChip reached={record.reached} />
          {/* formatDateTime already appends the zone. */}
          <span className="tnum text-caption text-muted-1">{formatDateTime(record.at)}</span>
        </div>
      </div>

      {record.explanation ? (
        <section className="flex flex-col gap-1.5">
          <h3 className="text-label text-muted-1">
            {refused ? 'Why it was refused' : 'What happened'}
          </h3>
          <p className="text-small leading-relaxed text-ink-2">{record.explanation}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-label text-muted-1">Sequence</h3>
        <ol className="flex flex-col gap-2">
          {record.sequence.map((step) => (
            <li key={`${step.at}-${step.label}`} className="flex flex-col gap-0.5">
              <span className="text-small font-semibold text-ink-1">
                <span className="tnum text-muted-1">{time(step.at)}</span> · {step.label}
              </span>
              <span
                className="text-caption leading-snug"
                style={{ color: step.terminal ? 'var(--danger-ink)' : 'var(--muted-1)' }}
              >
                {step.detail}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {record.wouldHaveChanged.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-label text-muted-1">What would have changed</h3>
          {record.wouldHaveChanged.map((line) => (
            <div
              key={`${line.target}-${line.field}`}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-1.5"
            >
              <span className="text-caption text-ink-2">
                {line.target} · {line.field}
              </span>
              <span className="tnum text-caption">
                {/*
                  * Struck through on purpose, both halves. Neither value is the
                  * listing's current price: the before is what it was at
                  * confirm and the after is what was never applied. Showing the
                  * after as live text would be the drawer asserting a change
                  * the row above says did not happen.
                  */}
                <span className="text-muted-1 line-through">{line.before}</span>
                <span aria-hidden> → </span>
                <span className="text-muted-1 line-through">{line.after}</span>
              </span>
            </div>
          ))}
          {record.wouldHaveChangedMore > 0 ? (
            <span className="text-caption text-muted-1">+ {record.wouldHaveChangedMore} more</span>
          ) : null}
          <p className="text-caption leading-relaxed text-muted-1">
            None of this was sent. The listings on Etsy are as they were.
          </p>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-label text-muted-1">Actor</h3>
          <span className="text-small text-ink-1">
            {record.actor.name} · {record.actor.role}
          </span>
          <span className="tnum text-caption text-muted-1">
            Session {record.actor.session} · {record.actor.device}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-label text-muted-1">Source</h3>
          <span className="text-small text-ink-1">{SOURCE_LABEL[record.source]}</span>
          <span className="text-caption text-muted-1">{record.origin}</span>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {refused && record.jobHref ? (
          <Link
            href={record.jobHref}
            className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
          >
            Re-run validation
          </Link>
        ) : null}
        {record.jobHref ? (
          <Link
            href={record.jobHref}
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Open the job
          </Link>
        ) : null}
        <Link
          href="/api/export/audit-log"
          className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
        >
          Export record
        </Link>
      </div>

      <p className="text-caption text-muted-1">This record cannot be edited or removed.</p>
    </Card>
  )
}

/** "14:02" — the date is already in the record header above the sequence. */
function time(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date(iso))
}
