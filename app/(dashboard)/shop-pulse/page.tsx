import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProvenanceButton } from '@/components/provenance/provenance-button'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { BaselineChart } from '@/components/shop-pulse/baseline-chart'
import { ChangesPanel } from '@/components/shop-pulse/changes-panel'
import { NotYet } from '@/components/settings/not-yet'
import { Card } from '@/components/ui/card'
import { getShopPulse } from '@/domain/shop-pulse/service'
import { getSession } from '@/lib/auth'
import { DEMO_EVENTS } from '@/lib/etsy/demo-events'
import { shopContext } from '@/lib/permissions'
import { formatDate, formatDelta } from '@/lib/utils/format'
import { Money, Numeric } from '@/components/ui/numeric'

export const metadata: Metadata = { title: 'Shop Pulse' }

export default async function ShopPulsePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const pulse = await getShopPulse(ctx)
  const demo = session.isDemo

  const period = `${formatDate(pulse.periodStart)} – ${formatDate(pulse.periodEnd)}`
  const affected = new Set(pulse.changes.flatMap((c) => c.affectedListingIds)).size

  const ordersDelta = formatDelta(pulse.orders.deviationPercent)
  const revenueDelta = formatDelta(pulse.revenue.deviationPercent)

  return (
    <>
      <PageHeader
        title="Shop Pulse"
        subtitle={`${period} UTC measured against this shop's own ${pulse.orders.windowDays}-day baseline · ${pulse.currency} · ${pulse.changes.length} changes detected`}
        actions={
          <>
            <NotYet
              label="Export evidence"
              reason="There is no Shop Pulse export dataset yet. Each change's evidence is on its card."
            />
            {/*
              * The listings a detected change touched, filtered to what the
              * audit flagged — a real destination, where this was a dead
              * primary button.
              */}
            <Link href="/listings?health=ERRORS" className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]">
              Review {affected} affected listings
            </Link>
          </>
        }
      />

      <section aria-label="Pulse summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Orders"
          value={String(Math.round(pulse.orders.actualTotal))}
          delta={ordersDelta}
          note={`vs calculated baseline ${Math.round(pulse.orders.expectedTotal)}`}
          type="VERIFIED"
          demo={demo}
        />
        <Kpi
          label="Revenue"
          value={<Money value={pulse.revenue.actualTotal} />}
          delta={revenueDelta}
          note={
            <>
              vs calculated baseline <Money value={pulse.revenue.expectedTotal} />
            </>
          }
          type="VERIFIED"
          demo={demo}
        />
        <Kpi
          label="Changes detected"
          value={String(pulse.changes.length)}
          note={`${pulse.counts.CORRELATED} correlated · ${pulse.counts.RULED_OUT} ruled out · ${pulse.counts.UNKNOWN} unknown`}
          type="CALCULATED"
          demo={demo}
        />
        <Kpi
          label="Baseline coverage"
          value={`${pulse.orders.coveragePercent}%`}
          note={`${pulse.orders.listingsTooNew} listings too new to baseline`}
          type="CALCULATED"
          demo={demo}
          methodologyKey="shopPulseBaseline"
        />
      </section>

      <Card className="mt-4 p-[18px]">
        <h2 className="text-section text-ink-1">Orders against your baseline</h2>
        <div className="mt-3">
          <BaselineChart
            baseline={pulse.orders}
            events={DEMO_EVENTS}
            periodStart={pulse.periodStart}
          />
        </div>
      </Card>

      <div className="mt-4">
        <ChangesPanel changes={pulse.changes} />
      </div>
    </>
  )
}

function Kpi({
  label,
  value,
  delta,
  note,
  type,
  demo,
  methodologyKey,
}: {
  label: string
  value: React.ReactNode
  delta?: { text: string; direction: 'up' | 'down' | 'flat' }
  note: React.ReactNode
  type: 'VERIFIED' | 'CALCULATED'
  demo: boolean
  methodologyKey?: string
}) {
  return (
    <Card className="flex flex-col gap-2 p-[14px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        {methodologyKey ? (
          <ProvenanceButton metricKey={methodologyKey} type={type} demo={demo} />
        ) : (
          <ProvenanceBadge type={type} demo={demo} />
        )}
      </div>
      <Numeric className="text-metric text-ink-1">{value}</Numeric>
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
        <span>{note}</span>
      </span>
    </Card>
  )
}
