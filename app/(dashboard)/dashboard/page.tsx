import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Numeric } from '@/components/ui/numeric'
import { ProvenanceButton } from '@/components/provenance/provenance-button'
import { Card } from '@/components/ui/card'
import { UnavailableCard } from '@/components/ui/states'
import { ActionList } from '@/components/action-center/action-list'
import { getActions } from '@/domain/action-center/service'
import { getShopOverview } from '@/domain/shop/overview'
import { getSession } from '@/lib/auth'
import { greetingName } from '@/lib/utils/name'
import { shopContext } from '@/lib/permissions'
import { formatDate, formatDelta } from '@/lib/utils/format'
import { isDemoMode } from '@/lib/etsy'

export const metadata: Metadata = { title: 'Overview' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  /*
   * D11 ASKS THE MODE, NOT THE SHOP ROW.
 *
   * The provenance badge's demo override exists so "a screenshot taken in demo
   * mode can never be mistaken for a real shop's figures" — a statement about
   * whether the FIGURES are the fictional catalogue. That is `ETSY_MODE`.
 *
   * It was `session.isDemo`, which is `shops.is_demo`: whether this shop has
   * ever connected. On a live deployment every new signup carries it, so every
   * figure on every screen was stamped Demo while the mock was serving none of
   * them — and the stamp would then disappear the moment the shop connected,
   * which is precisely when it would start to matter if it were true.
   */
  const demoData = isDemoMode()
  const [overview, { actions, counts, source }] = await Promise.all([
    getShopOverview(ctx),
    getActions(ctx),
  ])

  const period = `${formatDate(overview.periodStart, overview.timezone)} – ${formatDate(
    overview.periodEnd,
    overview.timezone,
  )}`

  return (
    <>
      <PageHeader
        /*
         * No name, no comma. An account that has not told us a name is
         * greeted "Good morning" and nothing else, which reads perfectly
         * well — and is what stopped the screen saying "Good morning,
         * malikfarhanjamal7229" at someone who never chose that string as
         * a name.
         */
        title={session.name ? `Good morning, ${greetingName(session.name)}` : 'Good morning'}
        subtitle={`${overview.shopName} · ${period} · all figures in ${overview.currency}`}
      />

      {/* Never more than four large cards in one row (design brief 9.2). */}
      <section aria-label="Shop summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overview.metrics.map((metric) => {
          const delta = metric.deltaPercent === null ? null : formatDelta(metric.deltaPercent)
          return (
            <Card key={metric.key} className="flex flex-col gap-2 p-[14px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label text-muted-1">{metric.label}</span>
                <ProvenanceButton
                  metricKey={metric.methodologyKey}
                  type={metric.provenance.type}
                  demo={demoData}
                />
              </div>
              <Numeric className="text-metric text-ink-1">{metric.display}</Numeric>
              <span className="tnum flex flex-wrap items-center gap-1.5 text-caption text-muted-1">
                {delta ? (
                  <span
                    style={{
                      color:
                        delta.direction === 'down'
                          ? 'var(--danger)'
                          : delta.direction === 'up'
                            ? 'var(--success)'
                            : 'var(--muted-1)',
                    }}
                  >
                    {delta.text}
                  </span>
                ) : null}
                {metric.note ? <span>{metric.note}</span> : null}
              </span>
            </Card>
          )
        })}
      </section>

      {/*
        The Action Center outranks the chart. It is the answer to "what needs my
        attention?", so it sits directly under the KPI row rather than below a
        trend line that answers a question nobody asked first.
      */}
      <section aria-label="Action Center" className="mt-5">
        <h2 className="mb-3 text-section text-ink-1">What needs your attention</h2>
        <ActionList actions={actions} counts={counts} demo={demoData} source={source} />
      </section>

      {/* Etsy does not expose views. We say so rather than estimating them. */}
      <section aria-label="Unavailable metrics" className="mt-4 grid gap-3 lg:grid-cols-2">
        <UnavailableCard
          label="Listing views"
          reason="Etsy does not provide listing views through the public API."
          remedy="Import your Etsy Stats file to add this metric. EtsyPilot will not estimate it."
        />
      </section>

      <p className="mt-6 text-caption text-muted-1">
        The term &ldquo;Etsy&rdquo; is a trademark of Etsy, Inc. This Application uses Etsy&rsquo;s
        API, but is not endorsed or certified by Etsy.
      </p>
    </>
  )
}
