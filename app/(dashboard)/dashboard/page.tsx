import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { UnavailableCard } from '@/components/ui/states'
import { getShopOverview } from '@/domain/shop/overview'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate, formatDelta } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Overview' }

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const overview = await getShopOverview(ctx)

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
                <ProvenanceBadge
                  type={metric.provenance.type}
                  demo={session.isDemo}
                  srDetail={metric.provenance.methodology}
                />
              </div>
              <span className="tnum text-metric text-ink-1">{metric.display}</span>
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
        Phase 2 replaces this with the Action Center, which outranks the chart.
        Until then the page says what is coming rather than showing a
        placeholder chart that implies data we are not yet computing.
      */}
      <section aria-label="Next" className="mt-4 grid gap-3 lg:grid-cols-2">
        <Card className="p-[18px]">
          <h2 className="text-section text-ink-1">Action Center</h2>
          <p className="mt-2 max-w-prose text-body text-ink-2">
            The prioritised queue that answers &ldquo;what needs my attention?&rdquo; arrives in
            Phase 2, with evidence and a destination on every card.
          </p>
        </Card>

        {/* Etsy does not expose views. We say so rather than estimating them. */}
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
