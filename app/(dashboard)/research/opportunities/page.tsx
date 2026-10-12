import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { RangeValue } from '@/components/provenance/estimate'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Money, NumericCell } from '@/components/ui/numeric'
import {
  getOpportunities,
  PRODUCT_SORTS,
  SORT_LABEL,
} from '@/domain/research/opportunities'
import { getSession } from '@/lib/auth'
import { cn } from '@/lib/utils/cn'
import { isDemoMode } from '@/lib/etsy'
import { ModelledNotice } from '@/components/research/modelled-notice'
import { ResearchNotBuilt } from '@/components/research/not-built'

export const metadata: Metadata = { title: 'Opportunities' }

/*
 * Find hot products (artboard 21).
 *
 * Two kinds of column, and the table's whole job is keeping them apart: a
 * single modelled figure (price, reviews, favourites, age) and a modelled band
 * (sales, revenue — a range, therefore, and "Not enough data" where the model
 * has none). Both kinds are modelled; this comment used to call the first kind
 * observation and "publicly visible on the listing", which was the plan.
 *
 * The filters are a GET form. A filtered view is a URL, it survives a reload,
 * and it works with no JavaScript.
 */
export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

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

  const query = await searchParams
  const view = await getOpportunities(query)
  /*
   * No market-signals source on this deployment. See lib/signals/index.ts.
   */
  if (!view) {
    return (
      <ResearchNotBuilt
        title="Find hot products"
        what="Product-level sales, revenue and opportunity scores"
      />
    )
  }
  const filtered =
    view.term !== '' ||
    Object.values(view.filters).some((v) => v !== null)

  return (
    <>
      <PageHeader
        title="Find hot products"
        subtitle={`${view.market} · every figure is modelled sample data — sales and revenue are estimated ranges, and none of it is Etsy data`}
        actions={
          <Link
            href="/research/keywords"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Research a keyword
          </Link>
        }
      />

      <form
        method="get"
        action="/research/opportunities"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <label className="flex flex-1 items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand sm:max-w-[280px]">
          <span className="sr-only">Search products, shops or categories</span>
          <input
            name="q"
            type="search"
            defaultValue={view.term}
            placeholder="Search products, shops or categories"
            className="h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
          />
        </label>

        <NumberFilter name="minPrice" label="Min price" value={view.filters.minPrice} prefix="$" />
        <NumberFilter name="maxPrice" label="Max price" value={view.filters.maxPrice} prefix="$" />
        <NumberFilter
          name="minSales"
          label="Min estimated monthly sales"
          value={view.filters.minSales}
          suffix="sales+"
        />

        <label className="flex items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
          <span className="sr-only">Product type</span>
          <select
            name="digital"
            defaultValue={
              view.filters.digital === null ? '' : view.filters.digital ? 'true' : 'false'
            }
            className="h-11 bg-transparent text-small text-ink-2 outline-none md:h-[38px]"
          >
            <option value="">Any type</option>
            <option value="true">Digital</option>
            <option value="false">Physical</option>
          </select>
        </label>

        <label className="flex items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
          <span className="sr-only">Sort by</span>
          <select
            name="sort"
            defaultValue={view.sort}
            className="h-11 bg-transparent text-small text-ink-2 outline-none md:h-[38px]"
          >
            {PRODUCT_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABEL[sort]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
        >
          Apply
        </button>
        {filtered ? (
          <Link
            href="/research/opportunities"
            className="inline-flex h-11 items-center rounded-control px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Clear all
          </Link>
        ) : null}
      </form>

      <p className="mb-3 text-caption text-muted-1">
        <span className="tnum">{view.products.length.toLocaleString('en-US')}</span> of{' '}
        <span className="tnum">{view.total.toLocaleString('en-US')}</span> products · sorted by{' '}
        {SORT_LABEL[view.sort].toLowerCase()}
      </p>

      {view.products.length === 0 ? (
        /*
         * The artboard draws this state and names the reason: a sales floor
         * combined with a recency filter rules out almost everything, because a
         * new listing has no observed signal yet. So the empty state offers to
         * drop the filter that caused it rather than only "clear all".
         */
        <EmptyState
          title="No products match these filters"
          description={
            view.filters.minSales !== null
              ? `A minimum of ${view.filters.minSales} estimated monthly sales rules out every listing the model cannot size — and a new listing rarely has enough modelled history. The floor is applied to the low end of each range, so a product has to clear it even on the pessimistic reading.`
              : 'Nothing in the modelled set matches this combination. Widen a filter, or search a broader term.'
          }
          action={
            <div className="flex flex-wrap gap-2">
              {view.filters.minSales !== null ? (
                <Link
                  href={withoutParam(query, 'minSales')}
                  className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
                >
                  Remove the sales filter
                </Link>
              ) : null}
              <Link
                href="/research/opportunities"
                className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
              >
                Clear all filters
              </Link>
            </div>
          }
        />
      ) : (
        <Card
          tabIndex={0}
          role="region"
          aria-label="Products, scrolls horizontally"
          className="relative overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <table className="w-full min-w-[1000px] border-collapse text-body">
            <caption className="sr-only">
              Modelled products. Price, reviews, favourites and age are single modelled figures;
              estimated monthly sales and revenue are modelled ranges, and both are blank where the
              model has nothing.
            </caption>
            <thead>
              <tr className="bg-canvas-soft text-left text-label text-muted-1">
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Product
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Shop
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Price
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Reviews
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Favorites
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Est. monthly sales
                </th>
                <th scope="col" className="px-3 py-2.5 font-semibold">
                  Est. monthly revenue
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Age
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                  Opportunity
                </th>
              </tr>
            </thead>
            <tbody>
              {view.products.map((product) => (
                <tr key={product.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <span className="block text-small font-medium text-ink-1">{product.title}</span>
                    <span className="mt-0.5 block text-caption text-muted-2">
                      {product.category}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">{product.shop}</td>
                  <NumericCell className="text-ink-2">
                    <Money value={product.price} />
                  </NumericCell>
                  <NumericCell className="text-ink-2">
                    {product.reviews.toLocaleString('en-US')}
                  </NumericCell>
                  <NumericCell className="text-ink-2">
                    {product.favorites.toLocaleString('en-US')}
                  </NumericCell>
                  <td className="px-3 py-3 text-small text-ink-1">
                    <RangeValue data={product.monthlySales} />
                  </td>
                  <td className="px-3 py-3 text-small text-ink-1">
                    <RangeValue data={product.monthlyRevenue} prefix="$" />
                  </td>
                  <NumericCell className="text-ink-2">{ageOf(product.ageMonths)}</NumericCell>
                  <td className="px-4 py-3 text-right">
                    {product.opportunity === null ? (
                      <>
                        <span aria-hidden className="text-muted-1">
                          —
                        </span>
                        <span className="sr-only">
                          Not scored — the model has nothing to size this listing with
                        </span>
                      </>
                    ) : (
                      <span
                        className={cn(
                          'tnum inline-flex min-w-[34px] justify-center rounded-[6px] px-2 py-0.5 text-[12px] font-semibold',
                          product.opportunity.value! >= 70
                            ? 'text-brand-strong'
                            : 'text-ink-2',
                        )}
                        style={
                          product.opportunity.value! >= 70
                            ? { background: 'var(--brand-tint)' }
                            : undefined
                        }
                      >
                        {product.opportunity.value}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="mt-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceBadge type="ESTIMATED" demo={demoData} />
          <span className="max-w-prose text-caption leading-relaxed text-muted-1">
            Estimated columns are modelled ranges, and nothing under them was measured — the
            review velocity, favourites and price they are modelled from are modelled too. They
            exclude wholesale, off-platform and refunded orders, and they are not official Etsy
            figures. Confidence is carried per row.
          </span>
        </div>
        {view.unmodelled > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceBadge type="UNAVAILABLE" demo={demoData} />
            <span className="max-w-prose text-caption leading-relaxed text-muted-1">
              <span className="tnum">{view.unmodelled}</span> of these listings are too new in the
              model to size. They show &ldquo;Not enough data&rdquo; and no opportunity score, and
              they sort to the bottom rather than to zero.
            </span>
          </div>
        ) : null}
        <p className="text-caption text-muted-1">
          <Link
            href="/data/methodology"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Read the full methodology →
          </Link>
        </p>
      </div>

      <div className="mt-4">
        <ModelledNotice
          lead={
            <>
              <strong>Every figure on this page is modelled.</strong> Nothing here is Etsy data.
              Etsy publishes no product-level sales figures to anyone, and CobaltRank has no
              market-data source of its own either — so monthly sales, revenue and price bands are
              sample data, shown as ranges, and available in the demo only.
            </>
          }
          excludes="Ads, off-platform traffic, wholesale, refunds, and any shop that has opted out of public listing"
          methodologyHref="/data/methodology#keyword-opportunity"
        />
      </div>
    </>
  )
}

function NumberFilter({
  name,
  label,
  value,
  prefix,
  suffix,
}: {
  name: string
  label: string
  value: number | null
  prefix?: string
  suffix?: string
}) {
  return (
    <label className="flex items-center gap-1 rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
      <span className="sr-only">{label}</span>
      {prefix ? <span className="text-small text-muted-1">{prefix}</span> : null}
      <input
        name={name}
        type="number"
        min={0}
        inputMode="numeric"
        defaultValue={value ?? ''}
        placeholder={label}
        className="tnum h-11 w-[104px] bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
      />
      {suffix ? <span className="text-caption text-muted-1">{suffix}</span> : null}
    </label>
  )
}

/** "2 y", "11 mo", "3 wk" — the artboard's own scale. */
function ageOf(months: number): string {
  if (months >= 24) return `${Math.floor(months / 12)} y`
  if (months >= 1) return `${months} mo`
  return '< 1 mo'
}

/** Drop one filter and keep the rest, so "remove this" means only this. */
function withoutParam(query: Record<string, string | undefined>, drop: string): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (key !== drop && value !== undefined && value !== '') params.set(key, value)
  }
  return params.size > 0
    ? `/research/opportunities?${params}`
    : '/research/opportunities'
}
