import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { DemandChart } from '@/components/research/demand-chart'
import { EstimateTile, RangeValue } from '@/components/provenance/estimate'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { NumericCell } from '@/components/ui/numeric'
import { getNiche, TARGET_MARGIN } from '@/domain/research/niche'
import { getSession } from '@/lib/auth'
import { formatRelative } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Niche research' }

const CROWDING_LABEL: Record<string, string> = { LOW: 'Low', MEDIUM: 'Moderate', HIGH: 'High' }

/*
 * Niche research (artboard 102).
 *
 * "What would have to be true" rather than a recommendation. EtsyPilot will not
 * tell a seller to enter a niche — a recommendation is a claim about a future
 * this product cannot see. Each condition instead carries a number that came
 * off this page, so the seller can disagree with it by checking the figure.
 */
export default async function NichePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; market?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const query = await searchParams
  const view = await getNiche(query)
  const { signals } = view

  return (
    <>
      <PageHeader
        title="Niche research"
        subtitle="Whether a niche is worth entering — demand, crowding, price ceiling and what would have to be true for you."
      />

      <form
        method="get"
        action="/research/niche"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <label className="flex flex-1 items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand sm:max-w-[320px]">
          <span className="sr-only">Niche</span>
          <input
            name="q"
            type="search"
            defaultValue={view.term}
            placeholder="A niche, e.g. linen table linens"
            className="h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
          />
        </label>
        <label className="flex items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
          <span className="sr-only">Market</span>
          <select
            name="market"
            defaultValue={view.market}
            className="h-11 bg-transparent text-small text-ink-2 outline-none md:h-[38px]"
          >
            <option>United States</option>
            <option>United Kingdom</option>
            <option>Canada</option>
            <option>Australia</option>
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
        >
          Analyse
        </button>
      </form>

      {view.sparse ? (
        /*
         * Everything down, not a partial answer. Crowding without demand, or a
         * price band without listings, would be a confident-looking row built
         * on nothing.
         */
        <EmptyState
          title={`“${view.term}” has not been sampled enough to model`}
          description={
            signals.demand.provenance.methodology ??
            'EtsyPilot samples public listing and autocomplete signals weekly, and a term has to appear across several weeks before it can be reported.'
          }
          action={
            <div className="flex flex-wrap gap-2">
              {view.known.map((known) => (
                <Link
                  key={known}
                  href={`/research/niche?q=${encodeURIComponent(known)}`}
                  className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
                >
                  {known}
                </Link>
              ))}
            </div>
          }
        />
      ) : (
        <>
          <section aria-label="Niche figures" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <EstimateTile
              label="Demand"
              data={signals.demand}
              demo={session.isDemo}
              note="monthly searches, band"
            >
              <RangeValue data={signals.demand} />
            </EstimateTile>

            <EstimateTile
              label="Listings"
              data={signals.listings}
              demo={session.isDemo}
              note="±8% sampling error"
            >
              <span className="tnum">
                {signals.listings.value === null
                  ? '—'
                  : signals.listings.value.toLocaleString('en-US')}
              </span>
            </EstimateTile>

            {signals.crowding ? (
              <EstimateTile
                label="Crowding"
                data={signals.crowding}
                demo={session.isDemo}
                note={signals.crowding.provenance.methodology}
              >
                {CROWDING_LABEL[signals.crowding.value ?? ''] ?? '—'}
              </EstimateTile>
            ) : null}

            {signals.priceBand ? (
              <EstimateTile
                label="Price band"
                data={signals.priceBand}
                demo={session.isDemo}
                note="middle 50% of listings"
              >
                <RangeValue data={signals.priceBand} prefix="$" />
              </EstimateTile>
            ) : null}

            {signals.concentration ? (
              <EstimateTile
                label="Concentration"
                data={signals.concentration}
                demo={session.isDemo}
                note="top 10 shops’ share"
              >
                <span className="tnum">{signals.concentration.value}%</span>
              </EstimateTile>
            ) : null}
          </section>

          <Card className="mt-4 p-[18px]">
            <h2 className="text-section text-ink-1">Twelve-month demand shape</h2>
            <p className="pb-2 text-caption text-muted-1">
              Modelled index · the line breaks where sampling was too thin to report · last observed{' '}
              {formatRelative(signals.observedAt)}
            </p>
            <DemandChart history={signals.history} term={view.term} />
          </Card>

          <section aria-labelledby="sub-niches" className="mt-5">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <h2 id="sub-niches" className="text-section text-ink-1">
                Sub-niches
              </h2>
              <span className="text-caption text-muted-1">Ranked by demand against crowding</span>
            </div>
            <Card
              tabIndex={0}
              role="region"
              aria-label="Sub-niches, scrolls horizontally"
              className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <table className="w-full min-w-[560px] border-collapse text-body">
                <caption className="sr-only">
                  Sub-segments of {view.term}, with modelled demand, observed listing counts and
                  price bands. A sub-niche with too few samples shows no figures rather than small
                  ones.
                </caption>
                <thead>
                  <tr className="bg-canvas-soft text-left text-label text-muted-1">
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Sub-niche
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Demand
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                      Listings
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">
                      Price band
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">
                      Crowding
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {signals.subNiches.map((sub) => (
                    <tr key={sub.name} className="border-t border-line align-top">
                      <td className="px-4 py-3 text-small text-ink-1">{sub.name}</td>
                      <td className="px-3 py-3 text-small text-ink-1">
                        <RangeValue data={sub.demand} />
                      </td>
                      <NumericCell className="text-ink-2">
                        {sub.listings.toLocaleString('en-US')}
                      </NumericCell>
                      <td className="px-3 py-3 text-small text-ink-2">
                        {sub.priceBand ? (
                          <RangeValue data={sub.priceBand} prefix="$" />
                        ) : (
                          <>
                            <span aria-hidden className="text-muted-1">
                              —
                            </span>
                            <span className="sr-only">
                              No price band — too few samples in this sub-niche
                            </span>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-small text-ink-2">
                        {sub.crowding ? (
                          CROWDING_LABEL[sub.crowding.value ?? '']
                        ) : (
                          <span className="text-muted-1">Unknown</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </section>

          <Card className="mt-5 p-[18px]">
            <h2 className="text-section text-ink-1">What would have to be true</h2>
            <p className="pb-3 max-w-prose text-caption leading-relaxed text-muted-1">
              EtsyPilot will not tell you to enter a niche. These are the conditions the numbers
              imply, each with the figure it came from, so you can disagree with one by checking it.
            </p>
            <ol className="flex flex-col gap-3">
              {view.conditions.map((condition, index) => (
                <li key={condition.text} className="flex gap-3">
                  <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[11px] font-semibold text-brand-strong">
                    {index + 1}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-small leading-relaxed text-ink-1">{condition.text}</span>
                    <span className="text-caption text-muted-1">From: {condition.from}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              <Link
                href={`/research/keywords?q=${encodeURIComponent(view.term)}`}
                className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
              >
                Research these keywords
              </Link>
              <Link
                href="/tools/fee-calculator"
                className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
              >
                Check margin in the Fee calculator
              </Link>
            </div>
            <p className="mt-3 text-caption leading-relaxed text-muted-1">
              The cost ceiling is worked out through the same fee engine the calculators use, at a{' '}
              {Math.round(TARGET_MARGIN * 100)}% margin target — so this figure and the calculator&rsquo;s
              cannot disagree.
            </p>
          </Card>
        </>
      )}

      <div className="mt-4 flex flex-wrap items-start gap-2">
        <ProvenanceBadge type="ESTIMATED" demo={session.isDemo} />
        <p className="max-w-prose text-caption leading-relaxed text-muted-1">
          Every figure on this page is estimated. Etsy publishes no search volume and no competitor
          sales; these are modelled from public listing and autocomplete signals sampled weekly,
          shown as ranges, and are not Etsy data.{' '}
          <Link
            href="/data/methodology"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Read the full methodology →
          </Link>
        </p>
      </div>
    </>
  )
}
