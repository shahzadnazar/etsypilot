import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ListingFilters } from '@/components/listings/listing-filters'
import { ListingsTable } from '@/components/listings/listings-table'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { getListingsView, EXPIRING_WITHIN_DAYS } from '@/domain/listings/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Listings' }

/*
 * All Listings (artboard 36).
 *
 * The catalogue, with the two things a seller cannot get from Etsy's own
 * listings page beside each row: what this product's rules say about the
 * listing, and what it earns after fees and cost.
 *
 * The footnote under the table is not decoration. Three claims on this screen
 * have different standing — the fields are verified, the margin is calculated
 * from a cost the seller supplied, and views are not available at all — and a
 * table that let them look alike would be the whole product's argument
 * undone in one screen.
 */
export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const query = await searchParams
  const ctx = shopContext(session, session.shopId)
  const view = await getListingsView(ctx, query)

  /*
   * "0 active · 0 drafts · 0 expiring within 7 days" is three true numbers that
   * together describe nothing, and it reads like a shop in order. Same
   * correction as the cost coverage card (D69): absence is told apart from
   * completeness by what the zero is out of.
   */
  const summary =
    view.total === 0
      ? 'No listings synced yet'
      : [
          `${view.counts.active.toLocaleString('en-US')} active`,
          `${view.counts.drafts.toLocaleString('en-US')} drafts`,
          `${view.counts.expiring.toLocaleString('en-US')} expiring within ${EXPIRING_WITHIN_DAYS} days`,
        ].join(' · ')

  return (
    <>
      <PageHeader
        title="Listings"
        subtitle={
          view.total === 0 ? summary : `${summary} · verified from your connected shop`
        }
        actions={
          <>
            <Link
              href="/listings/audit"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Run an audit
            </Link>
            <Link
              href="/listings/bulk-editor"
              className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
            >
              Open bulk editor
            </Link>
          </>
        }
      />

      {/*
        * No filter bar and no footnote with nothing to filter or qualify. A
        * row of empty dropdowns above "No listings yet" is furniture, and the
        * three provenance notes below explain columns that are not on screen.
        */}
      {view.total > 0 ? <ListingFilters view={view} /> : null}
      <ListingsTable view={view} />

      {view.total === 0 ? null : (
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge type="VERIFIED" demo={session.isDemo} />
          <span className="text-caption text-muted-1">
            Listing fields — title, price, quantity, section, renewal — are read from your connected
            shop.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge type="CALCULATED" demo={session.isDemo} />
          <span className="max-w-prose text-caption leading-relaxed text-muted-1">
            Margin is your price less the recorded fee rates and the cost you entered.{' '}
            <span className="tnum">{view.withoutCost.toLocaleString('en-US')}</span> listings have
            no confirmed cost and show “—” rather than a figure from your default rule —{' '}
            <Link
              href="/settings/costs"
              className="font-semibold text-brand-strong underline underline-offset-2"
            >
              add costs
            </Link>
            . Etsy has charged nothing on an unsold listing, so the fees here are what the recorded
            rates produce, not a charge Etsy has confirmed.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge type="UNAVAILABLE" demo={session.isDemo} />
          <span className="text-caption text-muted-1">
            Views are not available through Etsy’s public API, so there is no views column.
          </span>
        </div>
        <p className="text-caption text-muted-1">
          SEO health runs the same rules as{' '}
          <Link
            href="/listings/audit"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Listing Audit
          </Link>
          . They are EtsyPilot’s thresholds, not Etsy’s requirements, except where a rule says it
          blocks publishing.
        </p>
      </div>
      )}
    </>
  )
}
