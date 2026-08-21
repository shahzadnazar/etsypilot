import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { EstimateTile, RangeValue } from '@/components/provenance/estimate'
import { ProvenanceButton } from '@/components/provenance/provenance-button'
import { DemandChart } from '@/components/research/demand-chart'
import { RelatedTermsTable } from '@/components/research/related-terms'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import { DEFAULT_TERM, getKeywordView } from '@/domain/research/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Keywords' }

/*
 * Keyword Explorer.
 *
 * Every figure on this page is modelled. Nothing here is Etsy data, and the
 * page says so twice: once in the subtitle, once in the "How this data works"
 * panel that names the source, the refresh and what is excluded.
 *
 * Language is Analyze / Compare / Track. Never "spy".
 */
export default async function KeywordsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { q } = await searchParams
  const term = q?.trim() || DEFAULT_TERM
  const ctx = shopContext(session, session.shopId)
  const view = await getKeywordView(ctx, term)
  const demo = session.isDemo
  const { signals } = view

  const sparse = signals.demand.value === null

  return (
    <>
      <PageHeader
        title="Keywords"
        subtitle={`${term} · ${signals.market} · modelled from public marketplace signals — not official Etsy data`}
        actions={
          <>
            <Button variant="secondary">Compare a keyword</Button>
            <Button variant="primary">Save to list</Button>
          </>
        }
      />

      {sparse ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink-1">
            Too few public signals were observed for “{term}”.
          </strong>{' '}
          {signals.demand.provenance.methodology} Rather than print a small number that would
          look like a measurement, this page leaves demand, competition and opportunity blank.
        </Card>
      ) : null}

      <section aria-label="Keyword summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <EstimateTile label="Demand" data={signals.demand} demo={demo} note="Modelled monthly searches">
          <RangeValue data={signals.demand} suffix="/ mo" />
        </EstimateTile>

        <EstimateTile
          label="Competition"
          data={signals.competition}
          demo={demo}
          note={
            signals.competingListings.value
              ? `~${signals.competingListings.value.min.toLocaleString('en-US')}–${signals.competingListings.value.max.toLocaleString('en-US')} competing listings observed`
              : undefined
          }
        >
          {signals.competition.value
            ? signals.competition.value.charAt(0) + signals.competition.value.slice(1).toLowerCase()
            : 'Not enough data'}
        </EstimateTile>

        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-[14px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-muted-1">Opportunity</span>
            <ProvenanceButton metricKey="keywordOpportunity" type="CALCULATED" demo={demo} />
          </div>
          <Numeric className="text-[22px] font-semibold leading-none text-ink-1">
            {signals.opportunity?.value == null ? (
              <span className="text-body text-muted-1">Not enough data</span>
            ) : (
              <>
                {signals.opportunity.value}
                <span className="text-body font-normal text-muted-1"> / 100</span>
              </>
            )}
          </Numeric>
          <span className="text-caption leading-snug text-muted-1">
            Demand ÷ competing listings. Built from estimates, so it inherits their uncertainty.
          </span>
        </div>

        <EstimateTile label="30-day trend" data={signals.trend30d} demo={demo} note="Against the previous 30 days">
          {signals.trend30d.value === null ? (
            'Not enough data'
          ) : (
            <Numeric>
              {signals.trend30d.value > 0 ? '▲' : signals.trend30d.value < 0 ? '▼' : '▬'}{' '}
              {Math.abs(signals.trend30d.value)}%
            </Numeric>
          )}
        </EstimateTile>
      </section>

      <Card className="mt-4 p-[18px]">
        <h2 className="text-section text-ink-1">12-month demand trend</h2>
        <p className="mt-1 text-caption text-muted-1">
          Indexed · {signals.market} · modelled monthly, broken where observation was sparse
        </p>
        <div className="mt-3">
          <DemandChart history={signals.history} term={term} />
        </div>
      </Card>

      <section className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
          <h2 className="text-section text-ink-1">Related keywords</h2>
          <div className="flex gap-2">
            <Button variant="secondary">Save to list</Button>
            <Link
              href="/listings/ai-copilot"
              className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
            >
              Optimize a listing with selected
            </Link>
          </div>
        </div>
        <RelatedTermsTable terms={view.related} demo={demo} />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-[18px]">
          <h2 className="text-section text-ink-1">Top listings for this term</h2>
          <p className="mt-1 text-caption text-muted-1">
            Publicly visible on Etsy right now. Observed, not modelled.
          </p>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {signals.topListings.map((l) => (
              <li key={l.title} className="flex flex-col gap-0.5 py-2.5">
                <span className="text-small font-semibold text-ink-1">{l.title}</span>
                <Numeric className="text-caption text-muted-1">
                  {l.shop} · ${l.price} · {l.reviews.toLocaleString('en-US')} reviews
                </Numeric>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-[18px]">
          <h2 className="text-section text-ink-1">How this data works</h2>
          <p className="mt-2 text-small leading-relaxed text-ink-2">
            Etsy does not publish keyword search volume — to anyone. EtsyPilot models demand from
            public marketplace signals: listing counts, review velocity, favourites and observed
            ranking movement.
          </p>
          <dl className="mt-3 flex flex-col gap-2 text-caption">
            <Row label="Source category" value="Public marketplace signals" />
            <Row label="Last updated" value={formatDateTime(signals.observedAt)} />
            <Row
              label="Confidence"
              value={
                signals.demand.provenance.confidence
                  ? signals.demand.provenance.confidence.charAt(0) +
                    signals.demand.provenance.confidence.slice(1).toLowerCase()
                  : 'Not enough data'
              }
            />
            <Row label="Excludes" value="Ads, off-platform traffic, wholesale, refunds" />
          </dl>
          <ul className="mt-3 flex flex-col gap-1.5 text-caption leading-relaxed text-muted-1">
            {(signals.demand.provenance.limitations ?? []).map((l) => (
              <li key={l}>· {l}</li>
            ))}
          </ul>
          <Link
            href="/data/methodology#keyword-demand"
            className="mt-3 inline-block text-caption font-semibold text-brand-strong underline underline-offset-2"
          >
            Open the full methodology →
          </Link>
        </Card>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-1">{label}</dt>
      <dd className="text-right font-semibold text-ink-2">{value}</dd>
    </div>
  )
}
