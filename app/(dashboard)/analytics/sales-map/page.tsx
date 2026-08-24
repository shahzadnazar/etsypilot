import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { AnalyticsTabs } from '@/components/analytics/analytics-tabs'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Money, NumericCell } from '@/components/ui/numeric'
import { getSalesMap, SUPPRESSION_THRESHOLD } from '@/domain/analytics/sales-map'
import { isDemoMode } from '@/lib/etsy'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Sales map' }

/*
 * Sales map (artboards 57–58).
 *
 * Aggregated by country from the seller's own receipts. Countries with fewer
 * than five orders are folded into one row BEFORE the data leaves the domain —
 * suppressing them in this component would mean the figure had already been
 * computed and shipped to the browser.
 *
 * The artboard draws a world choropleth. This page does not, and that is a
 * decision rather than an omission: the demo shop sells to six countries, a
 * world map of six shaded countries is mostly empty space, and the geography
 * adds nothing the ranked table does not already say. The five-step scale from
 * the artboard is kept, applied to proportional bars, so the visual language is
 * the same one a map would have used.
 */
export default async function SalesMapPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const view = await getSalesMap(ctx)
  const period = `${formatDate(view.periodStart)} – ${formatDate(view.periodEnd)}`
  const named = view.rows.filter((r) => !r.aggregate)
  const maxOrders = Math.max(...named.map((r) => r.orders), 1)

  return (
    <>
      <PageHeader
        title="Sales map"
        subtitle={`${period} UTC · orders aggregated from your own Etsy order receipts`}
      />

      <AnalyticsTabs current="/analytics/sales-map" />

      {/*
       * Artboard 58 is the unconnected state, and in demo mode that is what a
       * seller is looking at: the map is real, the shop behind it is not.
       */}
      {isDemoMode() ? (
        <div
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--warning-surface)',
            borderColor: 'var(--warning-border)',
            color: 'var(--warning-ink)',
          }}
        >
          <strong className="font-semibold">This is the demo shop&rsquo;s map.</strong> Your sales
          map comes from your own Etsy order receipts, which only Etsy can release to you.{' '}
          <Link href="/settings/shops" className="font-semibold underline underline-offset-2" style={{ color: 'inherit' }}>
            Connect your shop
          </Link>{' '}
          to see yours.
        </div>
      ) : null}

      {view.empty ? (
        <EmptyState
          title="No orders in this period"
          description="The sales map is built from your order receipts. With no orders there is nothing to place on it — nothing is filled in from other shops or from a regional average."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <Card className="flex flex-col gap-3 p-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-section text-ink-1">Orders by country</h2>
              <ProvenanceBadge type="VERIFIED" demo={session.isDemo} />
            </div>

            <ul className="flex flex-col gap-2.5">
              {named.map((row) => (
                <li key={row.code} className="flex flex-col gap-1">
                  <span className="flex items-baseline justify-between gap-2 text-small">
                    <span className="text-ink-1">{row.name}</span>
                    <span className="tnum text-ink-2">
                      {row.orders.toLocaleString('en-US')} orders
                    </span>
                  </span>
                  <span aria-hidden className="block h-2 rounded-full bg-canvas-soft">
                    <span
                      className="block h-2 rounded-full bg-brand"
                      style={{ width: `${(row.orders / maxOrders) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-caption leading-relaxed text-muted-1">
              Regions with fewer than {SUPPRESSION_THRESHOLD} orders are suppressed for privacy and
              counted together below. Individual buyer names and addresses are never shown or
              stored.
            </p>
          </Card>

          <Card
            tabIndex={0}
            role="region"
            aria-label="Sales by country, scrolls horizontally"
            className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <table className="w-full min-w-[420px] border-collapse text-body">
              <caption className="sr-only">
                Orders, sales and average order value by country for the period, from your own
                receipts. Countries with fewer than {SUPPRESSION_THRESHOLD} orders are grouped.
              </caption>
              <thead>
                <tr className="bg-canvas-soft text-left text-label text-muted-1">
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    Country
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Orders
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                    Sales
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                    AOV
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.rows.map((row) => (
                  <tr key={row.code} className="border-t border-line">
                    <td className="px-4 py-3 text-small text-ink-1">
                      {row.name}
                      {row.aggregate ? (
                        <span className="mt-0.5 block text-caption text-muted-1">
                          Each under {SUPPRESSION_THRESHOLD} orders, so they are counted together
                        </span>
                      ) : null}
                    </td>
                    <NumericCell className="text-ink-2">
                      {row.orders.toLocaleString('en-US')}
                    </NumericCell>
                    <NumericCell className="text-ink-2">
                      <Money value={row.sales} currency={view.currency} />
                    </NumericCell>
                    <NumericCell className="text-ink-1">
                      {row.averageOrder === null ? (
                        <>
                          <span aria-hidden className="text-muted-1">
                            —
                          </span>
                          <span className="sr-only">
                            Not shown for grouped regions — it would describe a group you cannot see
                            the members of
                          </span>
                        </>
                      ) : (
                        <Money value={row.averageOrder} currency={view.currency} />
                      )}
                    </NumericCell>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-canvas-soft">
                  <th scope="row" className="px-4 py-3 text-left text-small font-semibold text-ink-1">
                    Total · every region
                  </th>
                  <NumericCell className="font-semibold text-ink-1">
                    {view.totalOrders.toLocaleString('en-US')}
                  </NumericCell>
                  <NumericCell className="font-semibold text-ink-1">
                    <Money
                      value={view.rows.reduce((sum, r) => sum + r.sales, 0)}
                      currency={view.currency}
                    />
                  </NumericCell>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}

      <p className="mt-4 max-w-prose text-caption leading-relaxed text-muted-1">
        No world map is drawn here. This shop sells to {named.length} countries above the
        suppression threshold, and a shaded world map of {named.length} countries says less than
        the ranked table does. The figures are the same either way.
      </p>
    </>
  )
}
