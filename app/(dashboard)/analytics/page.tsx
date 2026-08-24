import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs'
import { SalesChart } from '@/components/analytics/sales-chart'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { EmptyState, UnavailableCard } from '@/components/ui/states'
import { Money, Numeric, NumericCell } from '@/components/ui/numeric'
import { getAnalytics, REPEAT_CUSTOMER_STANCE } from '@/domain/analytics/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate, formatPercent } from '@/lib/utils/format'
import type { ProvenanceType } from '@/lib/provenance/types'

export const metadata: Metadata = { title: 'Shop analytics' }

/*
 * Shop analytics (artboard 51).
 *
 * Every figure is computed from the shop's own receipts. Summing does not
 * demote and dividing does (D32), so gross sales and order count stay VERIFIED
 * while average order value and net margin are CALCULATED.
 *
 * Traffic and ads is an UNAVAILABLE card rather than an empty chart. Etsy
 * publishes no listing views, no search queries and no Etsy Ads performance,
 * and this product does not estimate them.
 */
export default async function AnalyticsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const view = await getAnalytics(ctx)
  const period = `${formatDate(view.periodStart)} – ${formatDate(view.periodEnd)}`

  return (
    <>
      <PageHeader
        title="Shop analytics"
        subtitle={`${period} UTC · ${view.currency} · verified orders and payments from your connected shop`}
        actions={
          <>
            <Link
              prefetch={false}
              href="/api/export/transactions"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Export report
            </Link>
            <Link
              href="/profit"
              className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
            >
              Open profit &amp; fees
            </Link>
          </>
        }
      />

      <AnalyticsTabs current="/analytics" />

      {view.empty ? (
        <EmptyState
          title="No orders in this period"
          description="Analytics is computed from your own Etsy receipts. When the first order arrives it appears here — nothing is modelled and nothing is filled in from other shops."
          action={
            <Link
              href="/settings/shops"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Check your shop connection
            </Link>
          }
        />
      ) : (
        <>
          <section
            aria-label="Headline figures"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          >
            <Kpi
              label="Gross sales"
              type="VERIFIED"
              demo={session.isDemo}
              value={<Money value={view.grossSales} currency={view.currency} />}
              change={view.change.grossSales}
            />
            <Kpi
              label="Orders"
              type="VERIFIED"
              demo={session.isDemo}
              value={view.orderCount.toLocaleString('en-US')}
              change={view.change.orders}
            />
            <Kpi
              label="Average order"
              /* A ratio over verified sums. Dividing demotes (D32). */
              type="CALCULATED"
              demo={session.isDemo}
              value={<Money value={view.averageOrder} currency={view.currency} />}
              change={view.change.averageOrder}
            />
            <Kpi
              label="Net margin"
              type="CALCULATED"
              demo={session.isDemo}
              value={view.netMargin === null ? null : formatPercent(view.netMargin)}
              note={`${view.coveragePercent}% cost coverage`}
            />
            <Kpi
              label="Refund rate"
              type="VERIFIED"
              demo={session.isDemo}
              value={view.refundRate === null ? null : formatPercent(view.refundRate)}
              note={`${view.refundedOrders} of ${view.orderCount.toLocaleString('en-US')} orders`}
            />
          </section>

          <Card className="mt-4 p-[18px]">
            <h2 className="pb-1 text-section text-ink-1">Sales and orders</h2>
            <SalesChart daily={view.daily} currency={view.currency} />
          </Card>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card className="p-[18px]">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
                <h2 className="text-section text-ink-1">Best performing listings</h2>
                <span className="text-caption text-muted-1">By verified order revenue</span>
              </div>
              <table className="w-full border-collapse text-body">
                <caption className="sr-only">
                  The listings with the most verified order revenue in this period, with the margin
                  each one earns after fees and your entered cost.
                </caption>
                <thead>
                  <tr className="bg-canvas-soft text-left text-label text-muted-1">
                    <th scope="col" className="px-3 py-2 font-semibold">
                      Listing
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Orders
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Revenue
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Margin
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {view.topListings.map((listing) => (
                    <tr key={listing.etsyListingId} className="border-t border-line align-top">
                      <td className="px-3 py-2.5 text-small text-ink-1">{listing.title}</td>
                      <NumericCell className="text-ink-2">
                        {listing.orders.toLocaleString('en-US')}
                      </NumericCell>
                      <NumericCell className="text-ink-2">
                        <Money value={listing.revenue} currency={view.currency} />
                      </NumericCell>
                      <NumericCell className="text-ink-1">
                        {listing.margin === null ? (
                          <>
                            <span aria-hidden className="text-muted-1">
                              —
                            </span>
                            <span className="sr-only">
                              No confirmed cost, so no margin is computed
                            </span>
                          </>
                        ) : (
                          formatPercent(listing.margin, 0)
                        )}
                      </NumericCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-[18px]">
              <h2 className="pb-2 text-section text-ink-1">Section contribution</h2>
              <ul className="flex flex-col gap-2.5">
                {view.sections.slice(0, 6).map((section) => (
                  <li key={section.section} className="flex flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2 text-small">
                      <span className="text-ink-1">{section.section}</span>
                      <span className="tnum text-ink-2">
                        <Money value={section.revenue} currency={view.currency} />
                      </span>
                    </span>
                    {/*
                     * A bar AND the figure beside it. The bar is a comparison
                     * aid, never the only place the number appears.
                     */}
                    <span aria-hidden className="block h-1.5 rounded-full bg-canvas-soft">
                      <span
                        className="block h-1.5 rounded-full bg-brand"
                        style={{ width: `${section.percent}%` }}
                      />
                    </span>
                    <span className="tnum text-caption text-muted-1">
                      {formatPercent(section.percent, 1)} of period revenue
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-section text-ink-1">Traffic and ads</h2>
                <ProvenanceBadge type="UNAVAILABLE" demo={session.isDemo} />
              </div>
              <UnavailableCard
                label="Views, search terms and ads performance"
                reason="Etsy does not provide listing views, search queries or Etsy Ads performance through its public API."
                remedy="Import your Etsy Stats export to add these metrics. EtsyPilot will not estimate them."
                action={
                  <Link
                    href="/settings/costs"
                    className="mt-1 inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
                  >
                    Enter ad spend for ROI
                  </Link>
                }
              />
              <p className="max-w-prose text-caption leading-relaxed text-muted-1">
                {REPEAT_CUSTOMER_STANCE}
              </p>
            </div>

            <Card className="p-[18px]">
              <h2 className="pb-2 text-section text-ink-1">Insights</h2>
              {view.insights.length === 0 ? (
                <p className="text-small leading-relaxed text-ink-2">
                  Nothing here stands out yet. An insight only appears when the figures on this page
                  support it — this panel stays empty rather than filling itself.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {view.insights.map((insight) => (
                    <li key={insight.headline} className="flex flex-col gap-0.5">
                      <span className="text-small font-semibold text-ink-1">
                        {insight.headline}
                      </span>
                      <span className="text-caption leading-relaxed text-muted-1">
                        {insight.detail}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  )
}

function Kpi({
  label,
  value,
  type,
  demo,
  change,
  note,
}: {
  label: string
  value: React.ReactNode
  type: ProvenanceType
  demo: boolean
  change?: number | null
  note?: string
}) {
  return (
    <Card className="flex flex-col gap-2 p-[14px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        <ProvenanceBadge type={type} demo={demo} />
      </div>
      <Numeric className="text-metric text-ink-1">
        {value ?? (
          <>
            <span aria-hidden className="text-muted-1">
              —
            </span>
            <span className="sr-only">Not available for this period</span>
          </>
        )}
      </Numeric>
      {change !== undefined && change !== null ? (
        <span
          className="tnum text-caption font-semibold"
          style={{ color: change >= 0 ? 'var(--success-ink)' : 'var(--danger-ink)' }}
        >
          {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}% vs the previous 30 days
        </span>
      ) : change === null ? (
        <span className="text-caption text-muted-1">No previous period to compare</span>
      ) : null}
      {note ? <span className="text-caption text-muted-1">{note}</span> : null}
    </Card>
  )
}
