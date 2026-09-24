import { OperatorTitle } from '@/components/admin/operator-title'
import { ProvenanceButton } from '@/components/provenance/provenance-button'
import { OperatorSection } from '@/components/admin/operator-section'
import { OperatorFigure } from '@/components/admin/operator-figure'
import { Numeric } from '@/components/ui/numeric'
import { EmptyState } from '@/components/ui/states'
import { Card, CardBody } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/page-header'
import { requireAdmin } from '@/domain/admin/access'
import {
  STATE_LABEL,
  STATE_NOTE,
  STUCK_AFTER_MINUTES,
  assessOperation,
  countByState,
  failureReasons,
  needsAttention,
  stuck,
  type AssessedOperation,
  type OperationStateValue,
} from '@/domain/admin/operations'
import { adminListOperations } from '@/lib/repositories/admin-reads-every-shop'
import { formatDateTime, formatNumber } from '@/lib/utils/format'

/*
 * Bulk operations across every shop. READ-ONLY.
 *
 * ── THE SCREEN WHERE THE MISSING BUTTONS MATTER MOST ──────────────────────
 *
 * Retry, clear and roll back are the three most plausible support requests in
 * this product, and all three are foreclosed (D94a). They are also the three
 * whose consequences are worst: a retry is an Etsy WRITE against a real
 * seller's live listings, under their name, in front of their buyers, and a
 * rollback is another one. D50's gate — SELECT → CONFIGURE → VALIDATE → DIFF →
 * CONFIRM → APPLY → AUDIT → ROLLBACK — exists so nothing reaches Etsy without
 * the seller confirming it, and an operator retry button would be a way to the
 * far end of that gate without its near end.
 *
 * So the absence is NAMED on the page. D70's quieter cousin: a screen whose
 * missing control reads as a to-do is a screen where an operator waits for a
 * fix instead of telling the seller what to do.
 *
 * ── PER-ITEM ROWS, AND STILL NO CONTENT ───────────────────────────────────
 *
 * This is the one operator read that is deliberately not an aggregate: per-
 * item rows are what make partial success expressible, and "which listings
 * failed, and why" is what a support conversation asks. `before_value` and
 * `after_value` are still never read — they are the listing copy the job was
 * changing, and the reason is what diagnoses a failure, not the words.
 *
 * NO `export const metadata`: static metadata survives notFound() and lands in
 * the flight payload of a 404.
 */
export const dynamic = 'force-dynamic'

export default async function OperationsPage() {
  const access = await requireAdmin('operations.view')
  const { operations, failedItems } = await adminListOperations()

  const mayNameOwners = access.can('users.view')

  const now = new Date()
  const assessed = operations.map((row) => assessOperation(row, failedItems, now))
  const states = countByState(assessed)
  const attention = needsAttention(assessed)
  const stalled = stuck(assessed)
  const reasons = failureReasons(assessed)

  return (
    <>
      <OperatorTitle page="Operations" />
      <PageHeader
        title="Bulk operations"
        subtitle={`${operations.length === 1 ? '1 operation' : `${formatNumber(operations.length)} operations`} · newest first · read-only`}
      />

      {operations.length === 0 ? (
        <EmptyState
          title="No bulk operations yet"
          description="Rows appear here as sellers use the bulk editor. This screen is not seeded and shows nothing that is not really in the database."
        />
      ) : (
        <>
          <section aria-labelledby="states-heading" className="mb-4">
            {/*
              * The heading stays sr-only and the methodology button does not.
              * One clickable explanation for the row rather than one per tile
              * — see the note in components/admin/operator-section.tsx.
              */}
            <div className="mb-2 flex justify-end">
              <h2 id="states-heading" className="sr-only">
                Operations by state
              </h2>
              <ProvenanceButton metricKey="operatorOperationState" type="VERIFIED" />
            </div>
            {/*
              * Every state, including the ones at zero. D34: "Failed: —" and no
              * Failed row at all read identically to somebody scanning for
              * trouble, and only one of them means there is none.
              */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {states.map(({ state, label, count }) => (
                <Card key={state} className="p-3">
                  <OperatorFigure
                    frame="bare"
                    label={label}
                    figure={count}
                    valueClassName={`text-[20px] font-semibold leading-none ${
                      state === 'FAILED' || state === 'PARTIAL_SUCCESS'
                        ? 'text-danger-strong'
                        : state === 'UNKNOWN'
                          ? 'text-warning-strong'
                          : 'text-ink-1'
                    }`}
                  />
                </Card>
              ))}
            </div>
          </section>

          <OperatorSection
            title={`Stuck in applying for over ${STUCK_AFTER_MINUTES} minutes`}
            blurb="An apply is rate-limited against Etsy, so a large job legitimately takes a while. Past this window it is not running, it is stuck."
          >
            {stalled.length === 0 ? (
              <EmptyState
                quiet
                title={`Nothing has been applying for more than ${STUCK_AFTER_MINUTES} minutes`}
                description="A job appears here once it has been in the applying state past that threshold. One currently running and inside the window is not listed — it is in the state counts above."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {stalled.map((entry) => (
                  <li
                    key={entry.row.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-small font-medium text-ink-1">
                      {entry.row.shopName ?? <Orphaned />}
                    </span>
                    <Numeric className="text-small" style={{ color: 'var(--danger-ink)' }}>
                      Running {formatNumber(entry.minutesRunning ?? 0)} minutes
                    </Numeric>
                    <Numeric className="w-full text-caption text-muted-1">
                      {formatNumber(entry.row.listingCount)} listings ·{' '}
                      {formatDateTime(entry.row.createdAt.toISOString())}
                    </Numeric>
                  </li>
                ))}
              </ul>
            )}
          </OperatorSection>

          <OperatorSection
            title="Why items failed"
            blurb="Grouped by reason. Forty listings failing for one reason is one finding; reading it forty times buries the second reason underneath."
          >
            {reasons.length === 0 ? (
              <EmptyState
                quiet
                title="No failed items"
                description="An item appears here when an operation fails or partially succeeds and records a reason against a listing. That is a measured state, not a section that did not load."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {reasons.map(({ reason, count }) => (
                  <li
                    key={reason}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2 last:border-0 last:pb-0"
                  >
                    <span className="max-w-prose text-small leading-relaxed text-ink-2">
                      {reason}
                    </span>
                    <Numeric className="text-small font-semibold text-ink-1">
                      {formatNumber(count)}
                    </Numeric>
                  </li>
                ))}
              </ul>
            )}
          </OperatorSection>

          <OperatorSection
            title="Needs attention"
            blurb="Partially succeeded, failed, or still applying. Partial success first: a wholly failed job is obvious and the seller knows, while a partial one leaves a shop in a state nobody chose."
          >
            {attention.length === 0 ? (
              <EmptyState
                quiet
                title="Nothing is failed, partially succeeded, or applying"
                description={
                  <>
                    An operation appears here when it enters one of those states. Measured across{' '}
                    {formatNumber(operations.length)} operations.
                  </>
                }
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {attention.map((entry) => (
                  <li key={entry.row.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <OperationRow entry={entry} mayNameOwners={mayNameOwners} showFailures />
                  </li>
                ))}
              </ul>
            )}
          </OperatorSection>

          <OperatorSection title="Every operation" blurb="Newest first, capped at the most recent 200.">
            <ul className="flex flex-col gap-3">
              {assessed.map((entry) => (
                <li key={entry.row.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <OperationRow entry={entry} mayNameOwners={mayNameOwners} showFailures={false} />
                </li>
              ))}
            </ul>
          </OperatorSection>
        </>
      )}

      <Card className="mt-4">
        <CardBody>
          <h2 className="text-small font-semibold text-ink-1">What this screen cannot do</h2>
          <p className="mt-1 max-w-prose text-caption leading-relaxed text-muted-1">
            There is no retry, no clear, no cancel and no rollback here, and that is not work left
            undone. Every one of those is an Etsy write against a real seller&rsquo;s live listings,
            and a bulk change reaches Etsy only through the seller confirming a diff they have read.
            An operator control here would be a way to the far end of that gate without its near
            end.
          </p>
          <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
            A stuck or failed job is the seller&rsquo;s to retry from the bulk editor, where they
            see what will change before it does. The reasons above are what makes that conversation
            possible.
          </p>
          <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
            The listing values a job was changing are not read either — not the old title and not
            the new one. A failure is diagnosed by its reason, not by the seller&rsquo;s copy.
          </p>
        </CardBody>
      </Card>
    </>
  )
}



/**
 * An operation whose shop row is gone.
 *
 * Named rather than left as a blank cell, because an orphaned job is a data
 * finding and an empty cell is a rendering one — and a reader cannot tell
 * which they are looking at (D34).
 */
function Orphaned() {
  return (
    <span style={{ color: 'var(--warning-ink)' }}>
      Shop row missing
      <span className="sr-only"> — this operation outlived the shop it belonged to</span>
    </span>
  )
}

function StateChip({ state, stuck }: { state: OperationStateValue | 'UNKNOWN'; stuck: boolean }) {
  const danger = state === 'FAILED' || state === 'PARTIAL_SUCCESS' || stuck
  const warn = state === 'UNKNOWN' || state === 'APPLYING'
  const style = danger
    ? { background: 'var(--danger-surface)', borderColor: 'var(--danger-border)', color: 'var(--danger-ink)' }
    : warn
      ? { background: 'var(--warning-surface)', borderColor: 'var(--warning-border)', color: 'var(--warning-ink)' }
      : { background: 'var(--canvas-soft)', borderColor: 'var(--border)', color: 'var(--muted-1)' }

  return (
    <span
      className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      {/* A word, never colour alone (artboard 89). */}
      {state === 'UNKNOWN' ? 'Unrecognised state' : STATE_LABEL[state]}
      {stuck ? ' · stuck' : ''}
    </span>
  )
}

function OperationRow({
  entry,
  mayNameOwners,
  showFailures,
}: {
  entry: AssessedOperation
  mayNameOwners: boolean
  showFailures: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-small font-medium text-ink-1">
          {entry.row.shopName ?? <Orphaned />}
        </span>
        {mayNameOwners && entry.row.ownerEmail ? (
          <span className="text-caption text-muted-1">{entry.row.ownerEmail}</span>
        ) : null}
        <StateChip state={entry.state} stuck={entry.stuck} />
        <Numeric className="ml-auto text-caption text-muted-1">
          {formatDateTime(entry.row.createdAt.toISOString())}
        </Numeric>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-caption text-muted-1">
        <Numeric>{formatNumber(entry.row.listingCount)} listings</Numeric>
        {/*
          * The field NAMES the job touches — price, tags — never their values.
          * "What was it changing" is answerable without reading what it was
          * changing them to.
          */}
        <span>
          {entry.row.fields.length > 0 ? entry.row.fields.join(', ') : 'No fields recorded'}
        </span>
        {entry.row.completedAt ? (
          <Numeric>Completed {formatDateTime(entry.row.completedAt.toISOString())}</Numeric>
        ) : (
          <span>
            <span aria-hidden>Not completed</span>
            <span className="sr-only">
              Not completed — no completion time recorded, which is not the same as completing
              instantly
            </span>
          </span>
        )}
      </div>

      {entry.state !== 'UNKNOWN' ? (
        <p className="max-w-prose text-caption leading-relaxed text-muted-1">
          {STATE_NOTE[entry.state]}
        </p>
      ) : (
        <p className="max-w-prose text-caption leading-relaxed" style={{ color: 'var(--warning-ink)' }}>
          The stored state is <Numeric>{entry.row.state}</Numeric>, which the code does
          not recognise. It is counted and not interpreted.
        </p>
      )}

      {showFailures && entry.failures.length > 0 ? (
        <div className="mt-1 rounded-card border border-line bg-canvas-soft p-2.5">
          <p className="text-caption font-semibold text-ink-2">
            {formatNumber(entry.failures.length)}{' '}
            {entry.failures.length === 1 ? 'item failed' : 'items failed'}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {entry.failures.slice(0, 10).map((failure) => (
              <li key={`${failure.operationId}-${failure.listingId}`} className="text-caption leading-relaxed text-muted-1">
                <Numeric>{failure.listingId}</Numeric>
                {' — '}
                {/*
                  * The reason, never the before and after values. An operator
                  * diagnosing a failure needs why it failed, not the copy the
                  * job was writing.
                  */}
                {failure.error ?? 'No reason was recorded with the failure.'}
                {failure.attempts > 1 ? (
                  <Numeric> · {failure.attempts} attempts</Numeric>
                ) : null}
              </li>
            ))}
          </ul>
          {entry.failures.length > 10 ? (
            <p className="mt-1 text-caption text-muted-1">
              {formatNumber(entry.failures.length - 10)} more not shown here. The grouped reasons
              above cover all of them.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
