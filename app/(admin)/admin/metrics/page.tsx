import { Numeric } from '@/components/ui/numeric'
import { EmptyState } from '@/components/ui/states'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/page-header'
import { MonthlySeriesChart } from '@/components/charts/monthly-series'
import { OperatorFigure } from '@/components/admin/operator-figure'
import { requireAdmin } from '@/domain/admin/access'
import {
  ONBOARDING_CAVEAT,
  onboardingFunnel,
  planDistribution,
  shopBreakdown,
  signupSeries,
  trialConversion,
  type Bucket,
} from '@/domain/admin/metrics'
import { adminReadMetrics } from '@/lib/repositories/admin-reads-every-shop'
import { formatNumber } from '@/lib/utils/format'

/*
 * Platform growth metrics. READ-ONLY, and AGGREGATE ONLY.
 *
 * ── NO ACCOUNT IS NAMED ON THIS SCREEN ────────────────────────────────────
 *
 * Not "is not shown": cannot be. Every figure arrives as a count or a grouped
 * count, and nothing in the view model has a field a name could occupy. A
 * metrics page that named people would be read as a leaderboard of sellers,
 * and the accounts list already exists for the question "who is this".
 *
 * ── TWO FIGURES THAT SAY WHAT THEY ARE ────────────────────────────────────
 *
 * The onboarding funnel reports a column nothing maintains, and the trial
 * conversion is computed over the trials still visible on a subscription row
 * rather than over everyone who ever trialled. Both are stated on the screen.
 * Omitting them would leave a reader not knowing the figure exists; presenting
 * them plain would have them believe something that is not so.
 *
 * ── A NUMBER WHERE A NUMBER WILL DO ───────────────────────────────────────
 *
 * One chart, for signups, where the SHAPE over time is the point. The funnel
 * is four numbers, the plan mix is four, the shop breakdown is three — a chart
 * of four numbers says the same thing with more ink and one more thing to
 * misread. The chart is the seller app's own, with its claim left behind:
 * MonthlySeriesChart draws, and each caller says what its figures are.
 *
 * NO `export const metadata`: static metadata survives notFound() and lands in
 * the flight payload of a 404.
 */
export const dynamic = 'force-dynamic'

/** How far back the signup series runs. Stated on the screen, never implied. */
const MONTHS = 12

export default async function MetricsPage() {
  await requireAdmin('metrics.view')

  const now = new Date()
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1))
  const metrics = await adminReadMetrics(since)

  const signups = signupSeries(metrics, MONTHS, now)
  const funnel = onboardingFunnel(metrics)
  const shops = shopBreakdown(metrics)
  const plans = planDistribution(metrics)
  const conversion = trialConversion(metrics)

  const signedUpInWindow = signups.reduce((total, point) => total + point.value, 0)

  return (
    <>
      <title>Growth metrics · Operations · EtsyPilot</title>
      <PageHeader
        title="Growth metrics"
        subtitle={`${formatNumber(metrics.totalAccounts)} accounts · ${formatNumber(metrics.totalShops)} shops · aggregate only, no account is named here · read-only`}
      />

      {metrics.totalAccounts === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Every figure here is counted from real rows. This screen is not seeded and shows nothing that is not in the database."
        />
      ) : (
        <>
          <Card className="mb-3 p-[18px]">
            <h2 className="text-small font-semibold text-ink-1">Signups</h2>
            <p className="mt-0.5 max-w-prose text-caption leading-relaxed text-muted-1">
              The last {MONTHS} months, counted from when each account was created.
            </p>
            <div className="mt-3">
              {/*
                * The one chart on the screen, because the SHAPE over time is
                * the thing. A month with no signups is plotted at zero rather
                * than breaking the line — the month was in the window we
                * queried, so nought is an observation, not an absence.
                */}
              <MonthlySeriesChart
                points={signups}
                stroke="var(--success)"
                description={`Accounts created in each of the last ${MONTHS} months. ${formatNumber(signedUpInWindow)} in total across the window.`}
                caption={
                  <>
                    Counted, not modelled. {formatNumber(signedUpInWindow)} accounts created in
                    this window, of {formatNumber(metrics.totalAccounts)} in total — the
                    difference is accounts created before it.
                  </>
                }
              />
            </div>
          </Card>

          <div className="mb-3 grid gap-3 lg:grid-cols-2">
            <Section
              title="Onboarding"
              blurb="Every state, including the ones at zero, plus anything stored that the code does not recognise."
            >
              <Buckets buckets={funnel} />
              {/*
                * The caveat is rendered from the same module the funnel is
                * computed in, rather than as a sentence somebody remembered to
                * write beside it.
                */}
              <p
                className="mt-3 max-w-prose rounded-card border px-3 py-2 text-caption leading-relaxed"
                style={{
                  background: 'var(--warning-surface)',
                  borderColor: 'var(--warning-border)',
                  color: 'var(--warning-ink)',
                }}
              >
                {ONBOARDING_CAVEAT}
              </p>
            </Section>

            <Section
              title="Shops"
              blurb="A demo shop is neither connected nor unconnected — it is a shop with no Etsy behind it by design, and counting it as either would misstate the number this section exists to report."
            >
              <Buckets buckets={shops} />
            </Section>
          </div>

          <div className="mb-3 grid gap-3 lg:grid-cols-2">
            <Section
              title="Plan mix"
              blurb="Every plan, plus accounts that have never been through billing — which is not the same as choosing the free tier."
            >
              <Buckets buckets={plans} />
            </Section>

            <Section
              title="Trial conversion"
              blurb="Of the accounts with a trial still visible on their subscription, the share now paying."
            >
              <OperatorFigure
                label="Converted"
                figure={conversion}
                suffix="%"
                footnote={
                  <>
                    {formatNumber(metrics.trialedAndPaying)} of{' '}
                    {formatNumber(metrics.everTrialed)} visible trials
                  </>
                }
              />
            </Section>
          </div>
        </>
      )}

      <Card className="mt-4 p-[18px]">
        <h2 className="text-small font-semibold text-ink-1">What is on this screen, and what is not</h2>
        <p className="mt-1 max-w-prose text-caption leading-relaxed text-muted-1">
          Totals only. No account is named here and none can be — every figure arrives as a count,
          and nothing on this page has a field an address could occupy. If you need to know who an
          account is, that is what the accounts list is for, and it is gated separately.
        </p>
        <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
          Nothing here is a forecast. Every number is a count of rows that exist, over a window
          that is stated — there is no projection, no target and no trend line fitted through the
          signups.
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
    <Card className="p-[18px]">
      <h2 className="text-small font-semibold text-ink-1">{title}</h2>
      <p className="mt-0.5 max-w-prose text-caption leading-relaxed text-muted-1">{blurb}</p>
      <div className="mt-3">{children}</div>
    </Card>
  )
}

/**
 * A list of counts with proportion bars.
 *
 * A share of nothing renders as no percentage at all rather than as 0%. "0% of
 * no accounts" is a division by zero dressed up as a measurement, and a reader
 * cannot tell it from a real nought (D34).
 */
function Buckets({ buckets }: { buckets: Bucket[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {buckets.map((bucket) => (
        <li key={bucket.key} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-caption text-muted-1">{bucket.label}</span>
            <Numeric className="text-small text-ink-1">
              {formatNumber(bucket.count)}
              {bucket.percent === null ? (
                <span className="ml-1.5 text-caption text-muted-2">
                  <span aria-hidden>—</span>
                  <span className="sr-only">no share, because there is nothing to take a share of</span>
                </span>
              ) : (
                <span className="ml-1.5 text-caption text-muted-1">{bucket.percent}%</span>
              )}
            </Numeric>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft"
            role="img"
            aria-label={`${bucket.label}: ${formatNumber(bucket.count)}${
              bucket.percent === null ? '' : `, ${bucket.percent}%`
            }`}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${bucket.percent ?? 0}%`, background: 'var(--brand)' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
