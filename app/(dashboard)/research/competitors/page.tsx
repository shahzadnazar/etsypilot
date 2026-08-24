import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { EstimateTile, RangeValue } from '@/components/provenance/estimate'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Money, NumericCell } from '@/components/ui/numeric'
import { getCompetitors } from '@/domain/research/competitors'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatRelative } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Competitors' }

/*
 * Competitor shop profile (artboard 34).
 *
 * Analyse, compare, track — never "spy". Everything on this page is visible to
 * anyone who opens the shop, and the estimates say plainly that only the owner
 * can see the real numbers.
 */
export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const query = await searchParams
  const ctx = shopContext(session, session.shopId)
  const view = await getCompetitors(ctx, query)
  const shop = view.selected

  return (
    <>
      <PageHeader
        title="Competitors"
        subtitle="Shops you are tracking, from what is publicly visible on their shop pages · estimates are modelled, not Etsy figures"
      />

      {view.notFound ? (
        <div
          role="alert"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--warning-surface)',
            borderColor: 'var(--warning-border)',
            color: 'var(--warning-ink)',
          }}
        >
          <strong className="font-semibold">
            “{view.notFound}” has not been observed.
          </strong>{' '}
          Nothing is modelled for a shop the sampler has not seen, so there is no profile to show —
          rather than a profile built on nothing.
        </div>
      ) : null}

      {view.shops.length === 0 ? (
        <EmptyState
          title="No shops tracked yet"
          description="Track a shop to see how its catalogue, pricing and tags move over time. Everything shown is public — EtsyPilot has no access to anyone else's Etsy account."
        />
      ) : (
        <>
          <nav aria-label="Tracked shops" className="mb-4 flex flex-wrap gap-2">
            {view.shops.map((tracked) => {
              const active = tracked.name === shop?.name
              return (
                <Link
                  key={tracked.name}
                  href={`/research/competitors?shop=${encodeURIComponent(tracked.name)}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-11 items-center rounded-control px-3 text-[12px] font-semibold md:h-[38px]',
                    active
                      ? 'bg-brand-tint text-brand-strong'
                      : 'border border-line text-ink-2 hover:bg-canvas-soft',
                  )}
                >
                  {tracked.name}
                </Link>
              )
            })}
          </nav>

          {shop ? (
            <>
              <Card className="mb-4 flex flex-wrap items-start justify-between gap-3 p-[18px]">
                <div className="flex flex-col gap-1">
                  <h2 className="text-section text-ink-1">{shop.name}</h2>
                  <p className="text-caption text-muted-1">
                    {shop.location} · opened {shop.openedYear} ·{' '}
                    <span className="tnum">{shop.activeListings.toLocaleString('en-US')}</span>{' '}
                    active listings · last observed {formatRelative(shop.observedAt)}
                  </p>
                </div>
                <span
                  className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    background: 'var(--success-surface)',
                    borderColor: 'var(--success-border)',
                    color: 'var(--success-ink)',
                  }}
                >
                  Tracked
                </span>
              </Card>

              <section aria-label="Publicly observable" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Observed
                  label="Active listings"
                  value={shop.activeListings.toLocaleString('en-US')}
                  note="Publicly observable"
                  demo={session.isDemo}
                />
                <Observed
                  label="Reviews"
                  value={shop.reviews.toLocaleString('en-US')}
                  note={`▲ ${shop.reviewsAdded30d} in 30 days`}
                  demo={session.isDemo}
                />
                <Observed
                  label="Median price"
                  value={<Money value={shop.medianPrice} />}
                  note="Across active listings"
                  demo={session.isDemo}
                />
                <Observed
                  label="New listings"
                  value={shop.newListings30d.toLocaleString('en-US')}
                  note={`Added in 30 days · ${shop.removedListings30d} removed`}
                  demo={session.isDemo}
                />
              </section>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <h2 className="text-section text-ink-1">Estimated</h2>
                <ProvenanceBadge type="ESTIMATED" demo={session.isDemo} />
                <span className="text-caption text-muted-1">
                  Modelled performance — not official Etsy figures
                </span>
              </div>

              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <EstimateTile
                  label="Est. monthly sales"
                  data={shop.monthlySales}
                  demo={session.isDemo}
                >
                  <RangeValue data={shop.monthlySales} />
                </EstimateTile>
                <EstimateTile
                  label="Est. monthly revenue"
                  data={shop.monthlyRevenue}
                  demo={session.isDemo}
                  note="Excludes refunds and wholesale"
                >
                  <RangeValue data={shop.monthlyRevenue} prefix="$" />
                </EstimateTile>
              </div>

              <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
                These ranges are modelled from public signals and can differ materially from actual
                results. Only the shop owner can see their real Etsy figures.{' '}
                <Link
                  href="/data/methodology"
                  className="font-semibold text-brand-strong underline underline-offset-2"
                >
                  How we model this →
                </Link>
              </p>

              {view.comparison ? (
                <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
                  <Card className="p-[18px]">
                    <h2 className="pb-1 text-section text-ink-1">Compared with your shop</h2>
                    <p className="pb-3 text-caption text-muted-1">
                      Both sides observable — yours from your connected shop, theirs from their
                      public pages.
                    </p>
                    <table className="w-full border-collapse text-body">
                      <caption className="sr-only">
                        Your shop against {shop.name}, on the figures both shops make visible.
                      </caption>
                      <thead>
                        <tr className="bg-canvas-soft text-left text-label text-muted-1">
                          <th scope="col" className="px-3 py-2 font-semibold">
                            Figure
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">
                            Yours
                          </th>
                          <th scope="col" className="px-3 py-2 text-right font-semibold">
                            {shop.name}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t border-line">
                          <th scope="row" className="px-3 py-2.5 text-left text-small font-normal text-ink-2">
                            Active listings
                          </th>
                          <NumericCell className="text-ink-1">
                            {view.comparison.yourListings.toLocaleString('en-US')}
                          </NumericCell>
                          <NumericCell className="text-ink-2">
                            {shop.activeListings.toLocaleString('en-US')}
                          </NumericCell>
                        </tr>
                        <tr className="border-t border-line">
                          <th scope="row" className="px-3 py-2.5 text-left text-small font-normal text-ink-2">
                            Median price
                          </th>
                          <NumericCell className="text-ink-1">
                            {/*
                             * An em dash for an empty catalogue, never $0.00 —
                             * which beside their $42 reads as ruinous
                             * undercutting rather than as an empty shop.
                             */}
                            <Money
                              value={view.comparison.yourMedianPrice}
                              unknownLabel="No listings to take a median of"
                            />
                          </NumericCell>
                          <NumericCell className="text-ink-2">
                            <Money value={shop.medianPrice} />
                          </NumericCell>
                        </tr>
                      </tbody>
                    </table>
                  </Card>

                  <Card className="p-[18px]">
                    <h2 className="pb-1 text-section text-ink-1">Tags they lean on</h2>
                    <p className="pb-3 text-caption text-muted-1">
                      Counted across their active listings, against how often each appears on yours.
                    </p>
                    <ul className="flex flex-col gap-2">
                      {view.comparison.gaps.map((gap) => (
                        <li
                          key={gap.tag}
                          className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 text-small"
                        >
                          <span className="text-ink-1">{gap.tag}</span>
                          <span className="tnum text-caption text-muted-1">
                            {gap.theirCount} of theirs ·{' '}
                            {gap.yourCount === 0 ? (
                              <span className="font-semibold text-brand-strong">
                                none of yours
                              </span>
                            ) : (
                              `${gap.yourCount} of yours`
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-caption leading-relaxed text-muted-1">
                      A tag they use and you do not is a gap worth reading, not an instruction. It
                      may not describe what you actually sell.{' '}
                      <Link
                        href="/research/keywords"
                        className="font-semibold text-brand-strong underline underline-offset-2"
                      >
                        Check the demand first →
                      </Link>
                    </p>
                  </Card>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </>
  )
}

function Observed({
  label,
  value,
  note,
  demo,
}: {
  label: string
  value: React.ReactNode
  note: string
  demo: boolean
}) {
  return (
    <Card className="flex flex-col gap-2 p-[14px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        {/*
         * VERIFIED, not estimated. These are counted off the shop's own public
         * pages — the same standing as a figure read from a receipt, and a
         * different standing from the modelled sales below.
         */}
        <ProvenanceBadge type="VERIFIED" demo={demo} srDetail="Counted from public shop pages" />
      </div>
      <span className="tnum text-[22px] font-semibold leading-none text-ink-1">{value}</span>
      <span className="text-caption text-muted-1">{note}</span>
    </Card>
  )
}
