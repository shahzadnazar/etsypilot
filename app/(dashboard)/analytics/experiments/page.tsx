import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs'
import { NotYet } from '@/components/settings/not-yet'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import {
  getExperiments,
  MIN_POST_DAYS,
  VERDICT_LABEL,
  type Verdict,
} from '@/domain/analytics/experiments'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Experiments' }

const VERDICT_FILL: Record<Verdict, { bg: string; border: string; fg: string }> = {
  POSITIVE: {
    bg: 'var(--success-surface)',
    border: 'var(--success-border)',
    fg: 'var(--success-ink)',
  },
  NEGATIVE: { bg: 'var(--danger-surface)', border: 'var(--danger-border)', fg: 'var(--danger-ink)' },
  INCONCLUSIVE: { bg: 'var(--canvas-soft)', border: 'var(--border)', fg: 'var(--ink-2)' },
}

/*
 * Experiment tracker (artboards 59–60).
 *
 * The screen most likely to be read as a causal claim, so it is the most
 * careful. A live Etsy shop has no control group: seasonality, competitors and
 * Etsy's own ranking all moved during the same window. Every card therefore
 * says what it cannot tell you, and a verdict is downgraded to inconclusive
 * whenever another recorded change lands inside the measurement window.
 *
 * Rates, not totals. Two windows of different lengths are not comparable until
 * they are divided by their lengths — the artboard's own card compares "41
 * orders / 14 d" against "52 orders / 7 d", which understates the movement by
 * more than half. Both figures are shown so the reader can see the arithmetic.
 */
export default async function ExperimentsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const view = await getExperiments(ctx)

  return (
    <>
      <PageHeader
        title="Experiments"
        subtitle="What changed, what followed it, and what that can and cannot tell you · verified orders · UTC"
        actions={
          <NotYet
            label="New experiment"
            variant="primary"
            reason="Arrives with scheduling. Start one from a bulk job for now."
          />
        }
      />

      <AnalyticsTabs current="/analytics/experiments" />

      {view.empty ? (
        <EmptyState
          title="No experiments yet"
          description="An experiment records what you changed, when, and on which listings — so that what follows can be measured against what came before. Attach one to a bulk job to start."
          action={
            <Link
              href="/listings/bulk-editor"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Open the bulk editor
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {view.results.map((result) => {
            const fill = VERDICT_FILL[result.verdict]
            return (
              <Card key={result.experiment.id} className="flex flex-col gap-3 p-[18px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <span
                      className="inline-flex w-fit items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: fill.bg,
                        borderColor: fill.border,
                        color: fill.fg,
                      }}
                    >
                      {VERDICT_LABEL[result.verdict]}
                    </span>
                    <h2 className="text-section text-ink-1">{result.experiment.name}</h2>
                    <p className="max-w-prose text-caption leading-relaxed text-muted-1">
                      Hypothesis: {result.experiment.hypothesis} Started{' '}
                      {formatDate(result.experiment.startedAt)} · primary metric: verified orders ·{' '}
                      {result.experiment.listingIds.length} listings.
                      {result.experiment.rolledBackAt
                        ? ` Rolled back ${formatDate(result.experiment.rolledBackAt)}.`
                        : ''}
                    </p>
                  </div>
                  {result.experiment.linkedJobId ? (
                    <Link
                      href={`/listings/change-history?job=${result.experiment.linkedJobId}`}
                      className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
                    >
                      Open change #{result.experiment.linkedJobId}
                    </Link>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Window label="Before" window={result.before} />
                  <Window label="After" window={result.after} />
                  <div className="flex flex-col gap-1 rounded-card border border-line p-3">
                    <span className="text-label text-muted-1">Orders per day</span>
                    <span className="tnum text-[19px] font-semibold text-ink-1">
                      {result.ratePercentChange === null ? (
                        <>
                          <span aria-hidden className="text-muted-1">
                            —
                          </span>
                          <span className="sr-only">Nothing to compare against</span>
                        </>
                      ) : (
                        `${result.ratePercentChange > 0 ? '+' : ''}${result.ratePercentChange}%`
                      )}
                    </span>
                    <span className="text-caption text-muted-1">
                      The comparable figure — the two windows are different lengths
                    </span>
                  </div>
                </div>

                <p className="max-w-prose text-small leading-relaxed text-ink-2">
                  {result.reasoning}
                </p>

                {result.overlappingEvents.length > 0 ? (
                  <div
                    className="rounded-card border p-3 text-caption leading-relaxed"
                    style={{
                      background: 'var(--warning-surface)',
                      borderColor: 'var(--warning-border)',
                      color: 'var(--warning-ink)',
                    }}
                  >
                    <strong className="font-semibold">Something else happened too.</strong>{' '}
                    {result.overlappingEvents
                      .map((event) => `${event.description} on ${formatDate(event.at)}`)
                      .join('; ')}
                    . Shop Pulse has the detail.
                  </div>
                ) : null}

                <details className="text-caption text-muted-1">
                  <summary className="inline-flex min-h-[24px] cursor-pointer items-center py-1 font-semibold text-brand-strong">
                    What this cannot tell you
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {result.limitations.map((limitation) => (
                      <li key={limitation} className="leading-relaxed">
                        {limitation}
                      </li>
                    ))}
                  </ul>
                </details>
              </Card>
            )
          })}
        </div>
      )}

      <p className="mt-4 max-w-prose text-caption leading-relaxed text-muted-1">
        A verdict here is a correlation between a change and what followed it, never a cause.
        EtsyPilot does not call a result before {MIN_POST_DAYS} days of post-change data, and
        downgrades any reading to inconclusive when another recorded change lands inside the same
        window.{' '}
        <Link
          href="/shop-pulse"
          className="font-semibold text-brand-strong underline underline-offset-2"
        >
          Shop Pulse
        </Link>{' '}
        uses the same vocabulary for the same reason.
      </p>
    </>
  )
}

function Window({
  label,
  window,
}: {
  label: string
  window: { orders: number; days: number; rate: number }
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line p-3">
      <span className="text-label text-muted-1">{label}</span>
      <span className="tnum text-[19px] font-semibold text-ink-1">
        {window.orders} orders / {window.days} d
      </span>
      <span className="tnum text-caption text-muted-1">{window.rate} orders per day</span>
    </div>
  )
}
