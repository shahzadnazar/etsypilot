import { Money, Numeric } from '@/components/ui/numeric'
import { EmptyState } from '@/components/ui/states'
import { OperatorTable } from '@/components/admin/operator-table'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/page-header'
import { requireAdmin } from '@/domain/admin/access'
import {
  STATUS_COPY,
  TRIAL_ENDING_SOON_DAYS,
  countByPlan,
  countByStatus,
  limitsLine,
  needsAttention,
  planBucket,
  statusBucket,
  trialsEndingSoon,
  type SubscriptionRow,
} from '@/domain/admin/subscriptions'
import { adminListSubscriptions } from '@/lib/repositories/admin-reads-every-shop'
import { formatDate } from '@/lib/utils/format'

/*
 * Every account's plan and status. READ-ONLY.
 *
 * ── NOTHING ABOUT MONEY CHANGES FROM HERE ─────────────────────────────────
 *
 * No upgrade, no downgrade, no cancel, no reactivate, and no refund. D94a
 * forecloses the first four — `subscriptions` is not on the operator write
 * allowlist — and D83 removed the fifth from the product altogether: nothing
 * in EtsyPilot can produce a credit for a plan charge, so there is no column,
 * no state and no count here that implies one exists. A screen that can still
 * draw a refund is a screen waiting to lie.
 *
 * ── THE LIMITS COME FROM PLANS ────────────────────────────────────────────
 *
 * D46. "200 listings" is written once, in domain/billing/plans.ts, and read by
 * the pricing page, the usage meters and this screen. A second copy beside an
 * operator table is a copy that is correct until the plan changes.
 *
 * NO `export const metadata`: static metadata survives notFound() and lands in
 * the flight payload of a 404. React 19 hoists <title> from here instead.
 */
export const dynamic = 'force-dynamic'

export default async function SubscriptionsPage() {
  const access = await requireAdmin('subscriptions.view')
  const rows = await adminListSubscriptions()

  /*
   * The address is gated on users.view, separately. `subscriptions.view` is
   * about plans, not about people: a viewer holding only this one gets the
   * distribution and the states — enough to answer "how many are past due" —
   * and no roll of who the sellers are.
   */
  const mayNameAccounts = access.can('users.view')

  const now = new Date()
  const plans = countByPlan(rows)
  const statuses = countByStatus(rows)
  const attention = needsAttention(rows)
  const endingTrials = trialsEndingSoon(rows, now)

  return (
    <>
      <title>Subscriptions · Operations · EtsyPilot</title>
      <PageHeader
        title="Subscriptions"
        subtitle={`${rows.length === 1 ? '1 account' : `${rows.length} accounts`} · plan limits read from the pricing definitions, not restated here · read-only`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Rows appear here as people sign up. This screen is not seeded and shows nothing that is not really in the database."
        />
      ) : (
        <>
          <Section
            title="By plan"
            blurb="Every plan, including the ones nobody is on. A breakdown that hides an empty tier reads exactly like one written before that tier existed."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {plans.map((entry) => (
                <Card key={entry.bucket} className="flex flex-col gap-1 p-3">
                  <span className="text-label text-muted-1">{entry.label}</span>
                  <Numeric className="text-[22px] font-semibold leading-none text-ink-1">
                    {entry.count}
                  </Numeric>
                  {entry.plan ? (
                    <>
                      <span className="text-caption text-muted-1">
                        {/*
                          * Money, not formatCurrency.
                          *
                          * A price is the one figure on this screen where a
                          * missing value has a plausible wrong reading: a
                          * blank or a 0.00 next to a plan name says FREE, and
                          * "we do not know what this costs" is not free. Money
                          * renders null as an em dash with "Not known" behind
                          * it, and there is no prop through which a caller can
                          * substitute a fallback figure.
                          */}
                        <Money value={entry.plan.priceMonthly} unknownLabel="Price not known" /> /
                        month
                      </span>
                      {/*
                        * Read from PLANS, never restated. D46: the limit is
                        * written once and this screen is not a second place
                        * that states it.
                        */}
                      <span className="text-caption leading-snug text-muted-1">
                        {limitsLine(entry.plan)}
                      </span>
                    </>
                  ) : entry.bucket === 'NO_RECORD' ? (
                    <span className="text-caption leading-snug text-muted-1">
                      Never been through billing. Not the same as choosing the free tier.
                    </span>
                  ) : (
                    <span className="text-caption leading-snug text-muted-1">
                      A stored plan key the code does not recognise. Should be zero.
                    </span>
                  )}
                </Card>
              ))}
            </div>
          </Section>

          <Section
            title="By status"
            blurb="Every status the billing model defines, plus accounts with no record at all."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {statuses.map((entry) => (
                <Card key={entry.bucket} className="flex flex-col gap-1 p-3">
                  <span className="text-label text-muted-1">{entry.label}</span>
                  <Numeric className={`text-[22px] font-semibold leading-none ${toneInk(entry.tone)}`}>
                    {entry.count}
                  </Numeric>
                </Card>
              ))}
            </div>
          </Section>

          <Section
            title="Needs attention"
            blurb="Past due and cancelling, worst first. Both are worth knowing before the seller writes in — and neither is fixable from here."
          >
            {attention.length === 0 ? (
              <EmptyState
                quiet
                title="Nothing is past due or cancelling"
                description={
                  <>
                    An account appears here when its billing status turns past due, or when it is
                    set to cancel at period end. Measured over{' '}
                    {rows.length === 1 ? 'the one account' : `all ${rows.length} accounts`}, not a
                    section that failed to load.
                  </>
                }
              />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {attention.map((row) => {
                  const status = statusBucket(row.status)
                  const copy = status in STATUS_COPY ? STATUS_COPY[status as keyof typeof STATUS_COPY] : null
                  return (
                    <li
                      key={row.userId}
                      className="flex flex-col gap-0.5 border-b border-line pb-2 last:border-0 last:pb-0"
                    >
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="text-small font-medium text-ink-1">
                          {mayNameAccounts ? (row.email ?? '—') : (row.shopName ?? 'A shop')}
                        </span>
                        {copy ? <StatusChip status={status as keyof typeof STATUS_COPY} /> : null}
                        <Numeric className="text-caption text-muted-1">
                          {(row.plan && planBucket(row.plan) !== 'UNKNOWN' ? row.plan : 'unknown plan').toLowerCase()}
                        </Numeric>
                      </span>
                      {copy ? (
                        <span className="max-w-prose text-caption leading-relaxed text-muted-1">
                          {copy.detail}
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          <Section
            title={`Trials ending within ${TRIAL_ENDING_SOON_DAYS} days`}
            blurb="Only accounts whose status is actually trialing. A trial date left behind on an account that has since converted is a stale column, not a trial."
          >
            {endingTrials.length === 0 ? (
              <EmptyState
                quiet
                title={`No trial ends in the next ${TRIAL_ENDING_SOON_DAYS} days`}
                description="An account appears here as its trial approaches that window. Trials that have already ended are not listed — this section is for the ones that can still be reached in time."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {endingTrials.map((entry) => (
                  <li
                    key={entry.row.userId}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-small font-medium text-ink-1">
                      {mayNameAccounts ? (entry.row.email ?? '—') : (entry.row.shopName ?? 'A shop')}
                    </span>
                    <Numeric className="text-small" style={{ color: 'var(--warning-ink)' }}>
                      {entry.daysLeft === 0
                        ? 'Ends today'
                        : entry.daysLeft === 1
                          ? 'Ends tomorrow'
                          : `Ends in ${entry.daysLeft} days`}
                    </Numeric>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Every account" blurb="Alphabetical by address.">
            <SubscriptionTable rows={rows} mayNameAccounts={mayNameAccounts} />
          </Section>
        </>
      )}

      <Card className="mt-4 p-[18px]">
        <h2 className="text-small font-semibold text-ink-1">What this screen cannot do</h2>
        <p className="mt-1 max-w-prose text-caption leading-relaxed text-muted-1">
          No upgrade, no downgrade, no cancel, no reactivate and no comp. Subscriptions are not on
          the operator write allowlist, so a plan change from here is refused by construction
          rather than by policy — a test walks every module reachable from this page and fails if
          one could write the table.
        </p>
        <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
          There is no refund either, and that is not a missing feature: EtsyPilot does not refund
          plan charges at all, for anyone, and the seller agrees to that when they agree to the
          charge. Nothing in the product can produce a credit, so nothing here can show one.
        </p>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ pieces */

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <Card className="mb-3 p-[18px]">
      <h2 className="text-small font-semibold text-ink-1">{title}</h2>
      <p className="mt-0.5 max-w-prose text-caption leading-relaxed text-muted-1">{blurb}</p>
      <div className="mt-3">{children}</div>
    </Card>
  )
}


function toneInk(tone: 'ok' | 'info' | 'warn' | 'danger'): string {
  switch (tone) {
    case 'ok':
      return 'text-success-strong'
    case 'warn':
      return 'text-warning-strong'
    case 'danger':
      return 'text-danger-strong'
    default:
      return 'text-ink-1'
  }
}

function StatusChip({ status }: { status: keyof typeof STATUS_COPY }) {
  const copy = STATUS_COPY[status]
  const style =
    copy.tone === 'ok'
      ? { background: 'var(--success-surface)', borderColor: 'var(--success-border)', color: 'var(--success-ink)' }
      : copy.tone === 'danger'
        ? { background: 'var(--danger-surface)', borderColor: 'var(--danger-border)', color: 'var(--danger-ink)' }
        : copy.tone === 'warn'
          ? { background: 'var(--warning-surface)', borderColor: 'var(--warning-border)', color: 'var(--warning-ink)' }
          : { background: 'var(--canvas-soft)', borderColor: 'var(--border)', color: 'var(--muted-1)' }

  return (
    <span
      className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      {/* A word, never colour alone (artboard 89). */}
      {copy.label}
    </span>
  )
}

function SubscriptionTable({
  rows,
  mayNameAccounts,
}: {
  rows: readonly SubscriptionRow[]
  mayNameAccounts: boolean
}) {
  return (
    <OperatorTable
      label="Subscriptions"
      minWidth={760}
      borderless
      caption="Every account with its plan, billing status, renewal date and trial end."
    >
        <thead>
          <tr className="bg-canvas-soft text-left text-label text-muted-1">
            {mayNameAccounts ? (
              <th scope="col" className="px-4 py-2.5 font-semibold">Account</th>
            ) : null}
            <th scope="col" className="px-3 py-2.5 font-semibold">Shop</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Plan</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Renews</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Trial ends</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = statusBucket(row.status)
            const bucket = planBucket(row.plan)
            return (
              <tr key={row.userId} className="border-t border-line align-top">
                {mayNameAccounts ? (
                  <td className="px-4 py-3 text-small text-ink-1">{row.email ?? <Absent reason="No address on this account" />}</td>
                ) : null}
                <td className="px-3 py-3 text-small text-ink-2">
                  {row.shopName ?? <Absent reason="No shop — provisioning did not finish" />}
                </td>
                <td className="px-3 py-3 text-small text-ink-2">
                  {/*
                    * NO RECORD is not the free plan, and does not render as
                    * one (D34). An account that has never been through billing
                    * and an account that chose the free tier are different
                    * facts, and the second is a decision the seller made.
                    */}
                  {bucket === 'NO_RECORD' ? (
                    <span className="text-muted-1">No billing record</span>
                  ) : bucket === 'UNKNOWN' ? (
                    <span style={{ color: 'var(--warning-ink)' }}>
                      Unrecognised: {row.plan}
                    </span>
                  ) : (
                    bucket.toLowerCase()
                  )}
                </td>
                <td className="px-3 py-3">
                  {status === 'NO_RECORD' ? (
                    <span className="text-caption text-muted-1">—<span className="sr-only">No billing record</span></span>
                  ) : status === 'UNKNOWN' ? (
                    <span className="text-caption" style={{ color: 'var(--warning-ink)' }}>
                      Unrecognised: {row.status}
                    </span>
                  ) : (
                    <StatusChip status={status} />
                  )}
                </td>
                <td className="px-3 py-3 text-small text-ink-2">
                  {row.renewsAt ? (
                    <Numeric>{formatDate(row.renewsAt.toISOString())}</Numeric>
                  ) : (
                    <Absent reason="No renewal date — this plan does not renew, or there is no record" />
                  )}
                </td>
                <td className="px-4 py-3 text-small text-ink-2">
                  {row.trialEndsAt ? (
                    <Numeric>{formatDate(row.trialEndsAt.toISOString())}</Numeric>
                  ) : (
                    <Absent reason="Not on a trial" />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
    </OperatorTable>
  )
}

/** D34: an em dash alone is a value nobody can interpret. The reason is read. */
function Absent({ reason }: { reason: string }) {
  return (
    <>
      <span aria-hidden title={reason} className="text-muted-2">
        —
      </span>
      <span className="sr-only">{reason}</span>
    </>
  )
}
