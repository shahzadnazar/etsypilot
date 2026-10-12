import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { BillingHistory } from '@/components/billing/billing-history'
import { PlanCards } from '@/components/billing/plan-cards'
import { UsageMeters } from '@/components/billing/usage-meters'
import { Card } from '@/components/ui/card'
import { getBillingView } from '@/domain/billing/service'
import { missingEmailSenderConfig } from '@/domain/billing/trial'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatCalendarDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Billing & plan' }

/*
 * Dynamic, not prerendered.
 *
 * This page reads a subscription that the cancel, resume and plan-change routes
 * mutate. Prerendered, it kept serving the state from build time: the
 * routes returned 303, the ledger changed, and the screen showed the old plan —
 * a cancellation that silently appears not to work is worse than one that
 * refuses, which is the whole failure this phase exists to avoid.
 */
export const dynamic = 'force-dynamic'

/*
 * Billing (D22, D45).
 *
 * The acceptance criterion for this phase is "no dark patterns", so the screen
 * is arranged around leaving rather than around upgrading:
 *
 *   - Cancel is a one-click form on this page. Not in a modal, not behind a
 *     survey, not "contact us". The page prints the step counts for both flows
 *     so the symmetry is visible and not merely claimed.
 *   - Every plan card prices its own change before its button, including the
 *     proration on an upgrade and the "nothing is charged, nothing is deleted"
 *     on a downgrade.
 *   - Charges are not refunded, and the card says so in a sentence rather than
 *     leaving it as an absence for a seller to find out after cancelling.
 *   - Declined charges stay in the history.
 */
export default async function BillingPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const view = await getBillingView(ctx)

  /*
   * ── NOBODY CAN PAY YET, SO THERE IS NO SUBSCRIPTION TO DESCRIBE ─────────
   *
   * This page used to run on MockBillingProvider in every deployment, so a
   * live seller was shown a Solo subscription renewing on 12 September, a Visa
   * ending 4242, four invoices and "$10.39 today, for the 23 days left in this
   * period". None of it existed.
   *
   * It is NOT the "not built" state the Research screens got. The plans are
   * real, priced, and listed on /pricing; what is missing is the ability to
   * pay for one. So the page still shows them, with the counts that are
   * genuinely measured, and says plainly that nothing can be bought and
   * nothing is being charged.
   */
  if (!view.open) return <BillingNotOpen view={view} />

  const sub = view.subscription!

  const renewalLine = sub.renewsOn
    ? `renews ${formatCalendarDate(sub.renewsOn)}`
    : sub.status === 'CANCELLING'
      ? `ends ${formatCalendarDate(sub.currentPeriodEnd)} — nothing renews`
      : 'nothing renews — no card on file'

  return (
    <>
      <PageHeader
        title="Billing & plan"
        subtitle={`${view.currentPlan!.name} · $${view.currentPlan!.priceMonthly} per month · ${renewalLine}${sub.paymentMethod ? ` · ${sub.paymentMethod.brand} ending ${sub.paymentMethod.last4}` : ''}`}
      />

      {view.isDemo ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink-1">This is a demo subscription.</strong>{' '}
          Cancelling, resuming and changing plan all work here and are reversible — they run
          against the demo billing service, so no card is charged and no real money moves. The
          flows are real; the money is not.
        </Card>
      ) : null}

      {view.trial ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink-1">
            {view.trial.daysLeft} days left in your {view.currentPlan!.name} trial · ends{' '}
            {formatCalendarDate(view.trial.endsOn)}
          </strong>{' '}
          {view.trial.message}
        </Card>
      ) : null}

      {sub.status === 'CANCELLING' ? (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-small leading-relaxed text-ink-2">
            <strong className="font-semibold text-ink-1">Your plan is cancelled.</strong> You keep
            everything until {formatCalendarDate(sub.currentPeriodEnd)}, then move to Free. Nothing
            is deleted.
          </span>
          <form action="/api/billing/resume" method="post">
            <button
              type="submit"
              className="h-11 rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              {view.cancellation!.resumeLabel}
            </button>
          </form>
        </Card>
      ) : null}

      {view.pressure ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink-1">
            {view.pressure.label}: {view.pressure.used.toLocaleString('en-US')} of{' '}
            {view.pressure.limit!.toLocaleString('en-US')} used.
          </strong>{' '}
          {view.pressure.pauses} {view.pressure.continues}
        </Card>
      ) : null}

      <UsageMeters meters={view.meters} />

      <div className="mt-5">
        <PlanCards
          plans={view.plans}
          currentPlanKey={view.currentPlan!.key}
          changes={view.changes}
          currency={view.currency}
        />
      </div>

      {/* D22: no fourth card. A quiet line, no price, no waitlist pressure. */}
      <p className="mt-4 max-w-[80ch] text-small leading-relaxed text-muted-1">{view.agencyNote}</p>

      <section aria-label="Billing history" className="mt-5">
        <h2 className="pb-2 text-section text-ink-1">Billing history</h2>
        <BillingHistory invoices={view.invoices} />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-[18px]">
          <h2 className="text-section text-ink-1">Cancellation</h2>

          {/*
            Stated up front, above the button that makes it matter. A seller
            deciding whether to cancel should not have to click to find out
            that this period's charge does not come back.
          */}
          <p className="text-small leading-relaxed text-ink-2">{view.cancellationTerms}</p>

          <ul className="flex flex-col gap-1.5">
            {view.cancellation!.effects.map((line) => (
              <li key={line} className="text-small leading-relaxed text-ink-2">
                · {line}
              </li>
            ))}
          </ul>

          {sub.status !== 'CANCELLING' ? (
            <form action="/api/billing/cancel" method="post" className="mt-1">
              <button
                type="submit"
                className="h-11 rounded-control border px-3 text-[12px] font-semibold md:h-[38px]"
                style={{ borderColor: 'var(--danger-border)', color: 'var(--danger-ink)' }}
              >
                Cancel plan
              </button>
            </form>
          ) : null}

          {/*
            The step counts, printed. The invariant in lifecycle.ts refuses to
            load if cancelling ever takes more steps than subscribing; this is
            the same fact where the seller can see it.
          */}
          <p className="text-caption leading-relaxed text-muted-1">
            Cancelling takes {view.flows.cancel.length} step —{' '}
            {view.flows.cancel.map((s) => s.label).join(', ')} — and subscribing takes{' '}
            {view.flows.subscribe.length}. No email, no retention call, no confirmation maze.
          </p>
        </Card>

        <Card className="flex flex-col gap-3 p-[18px]">
          <h2 className="text-section text-ink-1">Trial terms</h2>
          {/*
            * ── THESE TWO LINES CONTRADICTED THE TERMS OF SERVICE ──────────
            *
            * They read "7 days of Full access, no card required" and "Nothing
            * charges automatically at the end". Terms §8 — the version the
            * owner chose — says a payment method IS required to start a trial,
            * and that the subscription begins and the card is charged for the
            * first period when the trial ends. Both documents are
            * seller-facing, and they disagreed about the one fact a seller
            * would act on.
            *
            * TRIAL_TERMS in domain/billing/plans.ts has carried
            * `cardRequired: true` and the owner's approved sentence all along,
            * so the page was contradicting its own module as well. It renders
            * that sentence now instead of restating it, which is how the
            * restatement came to drift.
            */}
          <ul className="flex flex-col gap-1.5 text-small leading-relaxed text-ink-2">
            <li>
              · {view.trialTerms.days} days of {view.trialTerms.plan},{' '}
              {view.trialTerms.cardRequired ? 'card required' : 'no card required'}
            </li>
            <li>· One trial per account, not per shop</li>
            <li>· Bulk jobs pause if you drop below the plan they need</li>
          </ul>
          <p className="text-small leading-relaxed text-ink-2">{view.trialTerms.terms}</p>

          <h3 className="mt-2 text-section text-ink-1">If you exceed a limit</h3>
          <p className="text-small leading-relaxed text-ink-2">{view.limitPolicy}</p>
        </Card>
      </div>
    </>
  )
}

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   BILLING IS NOT OPEN. THE PLANS ARE REAL; NOBODY CAN BUY ONE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Three things a seller needs from this screen while that is true, and it can
 * give all three honestly:
 *
 *   1. What the tiers are. Real, priced, and the same list /pricing shows.
 *   2. What they are using. Counted from their own shop, with no denominator,
 *      because no plan has set one.
 *   3. That nothing is being charged and nothing will be without their saying
 *      so — which is the question a billing page exists to answer.
 *
 * What it must not do is show a subscription, a renewal date, a card, an
 * invoice or a proration, because there are none. The cancel and upgrade
 * buttons are absent for the same reason: a button that posts to a route which
 * refuses is worse than no button.
 */
function BillingNotOpen({ view }: { view: Awaited<ReturnType<typeof getBillingView>> }) {
  const missingSender = missingEmailSenderConfig()

  return (
    <>
      <PageHeader
        title="Billing & plan"
        subtitle="No plan — billing is not open yet, and nothing is being charged"
      />

      <Card className="mb-4 flex flex-col gap-2 p-4">
        <strong className="text-small font-semibold text-ink-1">
          You are not on a plan, and you have not been charged anything.
        </strong>
        <p className="text-small leading-relaxed text-ink-2">
          CobaltRank has no payment provider connected, so there is no way to buy a plan, no card
          on file and no invoice. Every feature you can reach is available meanwhile, and no plan
          limit is applied to any of it — the limits on the cards below are what each tier{' '}
          <em>will</em> cap when billing opens.
        </p>
        {missingSender.length > 0 ? (
          <p className="text-caption leading-relaxed text-muted-1">
            The {view.trialTerms.days}-day trial takes a card and promises an email before it ends.
            This deployment has no email sender either, so the trial refuses to start rather than
            charge somebody without the warning they were promised.
          </p>
        ) : null}
      </Card>

      <UsageMeters meters={view.meters} />

      <div className="mt-5">
        {/*
          * No `currentPlanKey`, so no card is marked "YOUR PLAN" and none
          * offers a priced change. The cards still list what each tier
          * includes, which is the part that is true.
          */}
        <PlanCards plans={view.plans} currentPlanKey={null} changes={[]} currency={view.currency} />
      </div>

      <p className="mt-4 max-w-[80ch] text-small leading-relaxed text-muted-1">{view.agencyNote}</p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 p-[18px]">
          <h2 className="text-section text-ink-1">What the trial will be</h2>
          {/*
            * The owner's approved sentence, rendered rather than restated.
            * The restatement on the open page said "no card required", which
            * contradicted both this constant and Terms §8.
            */}
          <p className="text-small leading-relaxed text-ink-2">{view.trialTerms.terms}</p>
          <p className="text-caption leading-relaxed text-muted-1">
            It cannot be started yet, for the reasons above.
          </p>
        </Card>

        <Card className="flex flex-col gap-3 p-[18px]">
          <h2 className="text-section text-ink-1">If you exceed a limit</h2>
          <p className="text-small leading-relaxed text-ink-2">{view.limitPolicy}</p>
          <p className="text-caption leading-relaxed text-muted-1">
            Nothing is limited today, because no plan is in force.
          </p>
        </Card>
      </div>
    </>
  )
}
