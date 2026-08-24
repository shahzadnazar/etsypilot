import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ChangeHistoryView } from '@/domain/change-history/service'
import { rollbackFingerprint } from '@/domain/change-history/rollback'
import { formatDate, formatDateTime } from '@/lib/utils/format'

/*
 * The rollback confirmation (artboard 45).
 *
 * Three properties, and none of them is decoration:
 *
 *   1. The button's number is DERIVED. "Roll back 119" and "3 will be skipped"
 *      come from one drift report, so the count on the button cannot disagree
 *      with the sentence above it.
 *
 *   2. The acknowledgement names the number. A checkbox reading "I understand"
 *      is a click; one reading "119 live listings will be restored to their
 *      Aug 12 values" is a statement the seller can be wrong about and notice.
 *
 *   3. The fingerprint travels with the form. If the catalogue moves between
 *      this render and the submit, the server refuses rather than applying to
 *      whatever is left — the same gate that refused BE-2288.
 */
export function RollbackPanel({ view }: { view: ChangeHistoryView }) {
  const selected = view.selected
  if (!selected) return null

  const { row, drift } = selected
  const { job } = row
  const fingerprint = rollbackFingerprint(drift)
  const sample = job.items.slice(0, 3)

  return (
    <Card className="flex w-full shrink-0 flex-col gap-4 p-[18px] xl:w-[400px]">
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <span className="tnum text-label text-muted-1">Job #{job.id}</span>
          <Link
            href="/listings/change-history"
            className="text-caption font-semibold text-brand-strong underline underline-offset-2"
          >
            Close
          </Link>
        </div>
        <h2 className="text-section text-ink-1">
          {formatDate(job.at)} · {job.summary} on {job.items.length} listings
        </h2>
        <span className="tnum text-caption text-muted-1">
          {formatDateTime(job.at)} · by {job.actor}
        </span>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-label text-muted-1">Before → after</h3>
        {sample.map((item) => (
          <div
            key={`${item.listingId}-${item.field}`}
            className="flex flex-col gap-0.5 border-b border-line pb-1.5"
          >
            <span className="text-caption text-ink-2">{item.listingTitle}</span>
            <span className="tnum text-caption">
              <span style={{ color: 'var(--danger-ink)' }}>− {item.before}</span>
              <span className="mx-1.5 text-muted-1" aria-hidden>
                →
              </span>
              <span style={{ color: 'var(--success-ink)' }}>+ {item.after}</span>
            </span>
          </div>
        ))}
        {job.items.length > sample.length ? (
          <span className="text-caption text-muted-1">
            + {job.items.length - sample.length} more listings in this job
          </span>
        ) : null}
      </section>

      {job.linkedExperiment ? (
        <p className="text-caption leading-relaxed text-muted-1">
          Linked experiment: “{job.linkedExperiment.name}” · started{' '}
          {formatDate(job.linkedExperiment.startedAt)}. Rolling this back changes what the
          experiment is measuring.
        </p>
      ) : null}

      {row.rollback.kind === 'AVAILABLE' ? (
        <form
          method="post"
          action="/api/listings/rollback"
          className="flex flex-col gap-3 border-t border-line pt-4"
        >
          <input type="hidden" name="job" value={job.id} />
          <input type="hidden" name="fingerprint" value={fingerprint} />

          <h3 className="text-section text-ink-1">Roll back this change</h3>
          <p className="text-caption leading-relaxed text-ink-2">
            EtsyPilot re-checks current state first.
            {drift.blocked.length > 0 ? (
              <>
                {' '}
                <strong className="font-semibold">
                  {drift.blocked.length} listings have changed on Etsy since this job
                </strong>{' '}
                and will be skipped rather than overwritten.
              </>
            ) : (
              ' Nothing in this job has been edited on Etsy since, so all of it can be restored.'
            )}
          </p>

          <label className="flex items-start gap-2 text-caption leading-relaxed text-ink-2">
            <input
              type="checkbox"
              name="acknowledge"
              value="yes"
              required
              className="mt-0.5 h-6 w-6 shrink-0 accent-[color:var(--brand)]"
            />
            <span>
              I understand{' '}
              <span className="tnum font-semibold">{drift.restorable.length}</span> live listings
              will be restored to their {formatDate(job.at)} values.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="primary">
              Roll back {drift.restorable.length}
            </Button>
            <Link
              href="/listings/change-history"
              className="inline-flex h-11 items-center rounded-control px-3.5 text-[12.5px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Cancel
            </Link>
          </div>

          <p className="text-caption leading-relaxed text-muted-1">
            The rollback is itself a write. It appends a new job rather than deleting this one —
            the record of what happened survives the undoing of it.
          </p>
        </form>
      ) : (
        <div className="border-t border-line pt-4">
          <h3 className="text-section text-ink-1">This job cannot be rolled back</h3>
          <p className="mt-1 text-caption leading-relaxed text-ink-2">
            {row.rollback.kind === 'WINDOW_CLOSED'
              ? `It is past your ${row.rollback.window}-day rollback window. The record stays readable, and you can still make the change by hand.`
              : row.rollback.kind === 'NOT_ON_PLAN'
                ? `Rollback is not included on ${row.rollback.planName}. Your history stays readable.`
                : row.rollback.reason}
          </p>
        </div>
      )}
    </Card>
  )
}
