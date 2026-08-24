import Link from 'next/link'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Money, NumericCell } from '@/components/ui/numeric'
import type { MissingCostRow } from '@/domain/costs/types'

/*
 * Listings with no cost of their own.
 *
 * This is the list behind "38 listings do not have a product cost" — the
 * sentence Profit Reality has been printing since Phase 6 with nowhere to send
 * anybody. Ordered by price descending, because the expensive listing with no
 * cost is the one distorting the waterfall most.
 *
 * The search is a GET form, not a client filter. It works with no JavaScript,
 * the result is linkable, and the no-results state is a real page rather than a
 * component that quietly renders nothing.
 */
const SHOWN = 12

export function MissingCostsTable({
  rows,
  activeListings,
  currency,
  query,
  demo,
}: {
  rows: MissingCostRow[]
  /*
   * How many active listings exist at all.
   *
   * Without it, a shop with NO listings and a shop where every listing is
   * costed are the same empty array, and the panel congratulated a brand new
   * seller on cost coverage they have not started. Absence and completeness
   * look identical from a count of zero; they are told apart by what the zero
   * is out of.
   */
  activeListings: number
  currency: string
  query: string
  demo: boolean
}) {
  const q = query.trim().toLowerCase()
  /*
   * Title OR listing id. The ledger's "Add a cost for this listing" arrives
   * here carrying an id, and a search that only knew about titles would answer
   * that link with "no listing matches" — the exact dead end the link was
   * retargeted to fix.
   */
  const matching =
    q === ''
      ? rows
      : rows.filter(
          (r) => r.title.toLowerCase().includes(q) || r.etsyListingId.toLowerCase() === q,
        )
  const shown = matching.slice(0, SHOWN)

  return (
    <section aria-labelledby="missing-costs-heading" className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="missing-costs-heading" className="text-section text-ink-1">
            Listings without a cost
          </h2>
          <p className="text-caption text-muted-1">
            Costed by your default rule until you set one. That is an assumption, and it is counted
            as one everywhere it is used.
          </p>
        </div>
        <ProvenanceBadge type="SELLER_INPUT" demo={demo} />
      </div>

      {activeListings === 0 ? (
        <EmptyState
          title="No listings to cost yet"
          description="Cost coverage is a share of your active listings, and there are none. Connect a shop and sync it, and every listing will appear here until it has a cost of its own."
          action={
            <Link
              href="/settings/shops"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Connect a shop
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        /*
         * Three states, not two. This one is genuinely good news; the one above
         * is an absence wearing its clothes, and the one below is a search that
         * found nothing.
         */
        <EmptyState
          title="Every active listing has a cost"
          description="Nothing is being priced by your default rule, so every order in the period can be costed from the listing itself."
          action={
            <Link
              href="/profit"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Open Profit Reality
            </Link>
          }
        />
      ) : (
        <>
          <form method="get" action="/settings/costs" className="flex flex-wrap items-center gap-2">
            <label className="flex flex-1 items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 focus-within:border-brand sm:max-w-[340px]">
              <span className="sr-only">Search listings without a cost</span>
              <input
                name="q"
                type="search"
                defaultValue={query}
                placeholder="Search by listing title"
                className="h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Search
            </button>
            <span className="tnum ml-auto text-caption text-muted-1">
              {matching.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')}{' '}
              listings
            </span>
          </form>

          {matching.length === 0 ? (
            <EmptyState
              title={`No listing without a cost matches “${query.trim()}”`}
              description="Every listing that matched your search already has a cost, or no listing has that title. Clear the search to see all of them."
              action={
                <Link
                  href="/settings/costs"
                  className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
                >
                  Clear search
                </Link>
              }
            />
          ) : (
            <Card
              tabIndex={0}
              role="region"
              aria-label="Listings without a cost, scrolls horizontally"
              className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <table className="w-full min-w-[560px] border-collapse text-body">
                <caption className="sr-only">
                  Active listings with no product cost set. Showing {shown.length} of{' '}
                  {matching.length}, highest price first.
                </caption>
                <thead>
                  <tr className="bg-canvas-soft text-left text-label text-muted-1">
                    <th scope="col" className="px-4 py-2.5 font-semibold">Listing</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Section</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Price</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                      Cost from your rule
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-semibold">Confirmed cost</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.etsyListingId} className="border-t border-line align-top">
                      <td className="px-4 py-3 text-small text-ink-1">{row.title}</td>
                      <td className="px-3 py-3 text-small text-ink-2">
                        {row.section ?? <span className="text-muted-1">No section</span>}
                      </td>
                      <NumericCell className="text-ink-2">
                        <Money value={row.price} currency={currency} />
                      </NumericCell>
                      <NumericCell className="text-ink-2">
                        <Money value={row.ruleCost} currency={currency} />
                      </NumericCell>
                      <td className="px-4 py-3 text-small text-muted-1">
                        {/*
                          * An em dash, not the rule figure repeated. The rule
                          * column already says what is being assumed; this
                          * column is asking whether anybody has confirmed it,
                          * and the answer is no.
                          */}
                        <span aria-hidden>—</span>
                        <span className="sr-only">No confirmed cost</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {matching.length > shown.length ? (
            <p className="text-caption text-muted-1">
              Showing the {shown.length} highest-priced of {matching.length.toLocaleString('en-US')}.
              Search to narrow the list.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
