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
import { EmptyState } from '@/components/ui/states'
import { getShopPulse } from '@/domain/shop-pulse/service'
import { getSession } from '@/lib/auth'
import { pulseChartEvents } from '@/domain/shop-pulse/chart-events'
import { shopContext } from '@/lib/permissions'
import { formatDate, formatDelta } from '@/lib/utils/format'
import { Money, Numeric } from '@/components/ui/numeric'
import { isDemoMode } from '@/lib/etsy'

export const metadata: Metadata = { title: 'Shop Pulse' }

export default async function ShopPulsePage() {
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
  const pulse = await getShopPulse(ctx)

  const period = `${formatDate(pulse.periodStart)} – ${formatDate(pulse.periodEnd)}`
  const affected = new Set(pulse.changes.flatMap((c) => c.affectedListingIds)).size

  /*
   * ══════════════════════════════════════════════════════════════════════
   *   "0 CHANGES DETECTED" IS A DIAGNOSIS, AND THIS SCREEN ONLY DEALS IN
   *   DIAGNOSES.
   * ══════════════════════════════════════════════════════════════════════
   *
   * Shop Pulse labels every finding CORRELATED, RULED_OUT or UNKNOWN. All
   * three are verdicts reached from two periods of orders, and with no orders
   * in either the page rendered a subtitle reading "0 changes detected", KPI
   * tiles of 0 orders and 0 revenue, and a baseline chart of nothing — which
   * together say "we looked and your shop is steady". Seen in a browser
   * against a live-mode server on a shop that had never synced.
   *
   * There is no fourth label for "not read", and there should not be: it is
   * not a diagnosis. So the page says it instead of diagnosing.
   */
  if (pulse.source.kind === 'NOT_SYNCED' || pulse.source.kind === 'NO_SHOP') {
    return (
      <>
        <PageHeader
          title="Shop Pulse"
          subtitle="Why your orders changed, measured against your own baseline."
        />
        <EmptyState
          title={pulse.source.kind === 'NO_SHOP' ? 'This shop could not be found' : 'Not synced yet'}
          description={
            pulse.source.kind === 'NO_SHOP'
              ? 'The shop this page was opened for is no longer in EtsyPilot. Nothing is wrong with your shop on Etsy.'
              : 'Shop Pulse compares this period against your own 30-day baseline, and EtsyPilot has not read your orders yet — so it has nothing to compare and will not tell you your shop is steady. Once a sync runs, every change appears here with the evidence behind it.'
          }
        />
      </>
    )
  }

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
          demo={demoData}
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
          demo={demoData}
        />
        <Kpi
          label="Changes detected"
          value={String(pulse.changes.length)}
          note={`${pulse.counts.CORRELATED} correlated · ${pulse.counts.RULED_OUT} ruled out · ${pulse.counts.UNKNOWN} unknown`}
          type="CALCULATED"
          demo={demoData}
        />
        <Kpi
          label="Baseline coverage"
          value={`${pulse.orders.coveragePercent}%`}
          /*
           * The baseline's own note, not a sentence assembled here.
           *
           * This read "{listingsTooNew} listings too new to baseline" from
           * DEMO_BASELINE on every shop. Outside demo mode that count is null
           * — `listings` has no creation date — and the note says what was
           * measured instead.
           */
          note={pulse.orders.coverageNote}
          type="CALCULATED"
          demo={demoData}
          methodologyKey="shopPulseBaseline"
        />
      </section>

      <Card className="mt-4 p-[18px]">
        <h2 className="text-section text-ink-1">Orders against your baseline</h2>
        <div className="mt-3">
          <BaselineChart
            baseline={pulse.orders}
            /*
              * This shop's events, not the fixture's. The chart draws a marker
              * per recorded change, and DEMO_EVENTS put Willow & Fern's price
              * changes, bulk job and stockout on every seller's baseline.
              */
            events={await pulseChartEvents(ctx)}
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
