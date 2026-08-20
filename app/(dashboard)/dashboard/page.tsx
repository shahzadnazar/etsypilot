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
import { shopContext } from '@/lib/permissions'
import { formatDate, formatDelta } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Overview' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const [overview, { actions, counts }] = await Promise.all([
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
        title={`Good morning, ${session.name.split(' ')[0]}`}
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
                  demo={session.isDemo}
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
        <ActionList actions={actions} counts={counts} demo={session.isDemo} />
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
