import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Money, Numeric } from '@/components/ui/numeric'
import { getBillingView, upgradeRequired } from '@/domain/billing/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatCalendarDate } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Billing & plan' }

/*
 * Billing (D22).
 *
 * Three tiers. No Agency card — a quiet line under the table instead, with no
 * price, no "coming soon" badge and no waitlist. Every bullet describes
 * something that is built.
 *
 * Two usage meters, both counted rather than stated. Meters for connected shops
 * and team seats came out with multi-user: a meter for a capacity nobody has is
 * an advertisement dressed as a status.
 *
 * Phase 8 adds Stripe. Nothing on this page changes when it does.
 */
export default async function BillingPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const view = await getBillingView(ctx)

  const upgrades = view.meters
    .map((m) => upgradeRequired(m, view.currentPlan.key))
    .filter((u): u is NonNullable<typeof u> => u !== null)

  return (
    <>
      <PageHeader
        title="Billing & plan"
        subtitle={`${view.currentPlan.name} · $${view.currentPlan.priceMonthly} per month · renews ${view.renewsOn ? formatCalendarDate(view.renewsOn) : '—'} · ${view.paymentMethod ?? 'no card on file'}`}
        actions={
          <>
            <Button variant="secondary">Invoices</Button>
            <Button variant="secondary">Update payment</Button>
          </>
        }
      />

      {upgrades.map((u) => (
        <Card key={u.title} className="mb-4 p-4 text-small leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink-1">Upgrade required · {u.title}</strong>{' '}
          {u.body}
        </Card>
      ))}

      <section aria-label="Usage" className="grid gap-3 sm:grid-cols-2">
        {view.meters.map((m) => {
          const pct = Math.min(100, Math.round((m.used / m.limit) * 100))
          return (
            <Card key={m.label} className="flex flex-col gap-2 p-[14px]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-label text-muted-1">{m.label}</span>
                <Numeric className="text-small font-semibold text-ink-1">
                  {m.used.toLocaleString('en-US')} / {m.limit.toLocaleString('en-US')}
                </Numeric>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--danger)' : 'var(--brand)' }}
                />
              </div>
              <span className="text-caption leading-snug text-muted-1">At the limit: {m.atLimit}</span>
            </Card>
          )
        })}
      </section>

      <section aria-label="Plans" className="mt-5 grid gap-3 lg:grid-cols-3">
        {view.plans.map((plan) => {
          const current = plan.key === view.currentPlan.key
          return (
            <Card
              key={plan.key}
              className={cn('flex flex-col gap-3 p-[18px]', current && 'border-brand bg-brand-tint')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-section text-ink-1">{plan.name}</h2>
                {current ? (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-strong">
                    Your plan
                  </span>
                ) : null}
              </div>

              <Numeric className="text-metric text-ink-1">
                ${plan.priceMonthly}
                <span className="text-body font-normal text-muted-1">
                  {plan.priceMonthly === 0 ? '' : ' / mo'}
                </span>
              </Numeric>
              <p className="text-caption text-muted-1">{plan.positioning}</p>

              <ul className="flex flex-col gap-1.5">
                {plan.includes.map((line) => (
                  <li key={line} className="text-small leading-relaxed text-ink-2">
                    · {line}
                  </li>
                ))}
                {plan.excludes.map((line) => (
                  <li key={line} className="text-small leading-relaxed text-muted-1">
                    · {line}
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-2">
                <Button variant={current ? 'secondary' : 'primary'}>
                  {current ? 'Manage plan' : plan.priceMonthly > view.currentPlan.priceMonthly ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                </Button>
              </div>
            </Card>
          )
        })}
      </section>

      {/* D22: no fourth card. A quiet line, no price, no waitlist pressure. */}
      <p className="mt-4 max-w-[80ch] text-small leading-relaxed text-muted-1">{view.agencyNote}</p>

      <p className="mt-3 max-w-[80ch] text-caption leading-relaxed text-muted-1">
        {view.limitPolicy} {view.refundTerms}
      </p>

      <section aria-label="Billing history" className="mt-5">
        <h2 className="pb-2 text-section text-ink-1">Billing history</h2>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-body">
            <caption className="sr-only">
              Charges and refunds on this account, newest first. Refunds are labelled as refunds
              rather than shown as a negative charge.
            </caption>
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-4 py-2.5 font-semibold">Date</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Description</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
                <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {view.invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-line">
                  <td className="px-4 py-3 text-small text-ink-2">
                    <Numeric>{formatCalendarDate(inv.date)}</Numeric>
                  </td>
                  <td className="px-3 py-3 text-small text-ink-1">{inv.description}</td>
                  <td className="px-3 py-3 text-right">
                    <Money
                      value={inv.amount}
                      currency={view.currency}
                      negate={inv.kind === 'REFUND'}
                      className="text-small text-ink-2"
                    />
                  </td>
                  <td className="px-4 py-3 text-small text-muted-1">
                    {inv.kind === 'REFUND' ? 'Refunded' : 'Paid'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <p className="mt-3 max-w-[80ch] text-caption leading-relaxed text-muted-1">
        Trial: {view.trial.days} days of {view.trial.plan}, no card required. {view.trial.endNote}
      </p>
    </>
  )
}
