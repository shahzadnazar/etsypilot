import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProfitTabs } from '@/components/profit/profit-tabs'
import { EmptyState } from '@/components/ui/states'
import { getProfitView } from '@/domain/profit/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Profit Reality' }

export default async function ProfitPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const view = await getProfitView(ctx)
  const period = `${formatDate(view.periodStart)} – ${formatDate(view.periodEnd)}`

  /*
   * ══════════════════════════════════════════════════════════════════════
   *   THE WORST FIGURE THIS PRODUCT HAS EVER RENDERED, MEASURED IN A
   *   BROWSER: "NET PROFIT −$1,322.05" FOR A SHOP NOBODY HAD READ.
   * ══════════════════════════════════════════════════════════════════════
   *
   * With no orders, `totalsFrom([])` is correct to report fees of zero — an
   * empty period genuinely has none — so every figure on the page computed
   * cleanly: gross $0.00, and a net profit of minus the seller's own fixed
   * costs. Those costs are DEMO_COST_INPUTS, so a real seller saw a $1,322
   * loss assembled from demo constants, on the screen this product is named
   * for.
   *
   * The demo provenance badge was on every one of those figures, because
   * `is_demo` is still true before an Etsy connection — which hid it. The
   * moment a shop connects, `is_demo` goes false and the badges vanish while
   * the numbers stay wrong until a sync runs. A mitigation that disappears
   * exactly when the data becomes real is not a safeguard.
   *
   * So the page does not render a waterfall it has no orders for. `source` is
   * on the view for this; `feesAreKnown` cannot answer it, because "no orders
   * at all" and "no orders in this period" are a different question from
   * "fees unread", and the fee branch is deliberately not overloaded with it.
   */
  if (view.source.kind === 'NOT_SYNCED' || view.source.kind === 'NO_SHOP') {
    return (
      <>
        <PageHeader
          title="Profit Reality"
          subtitle="Gross revenue to net profit, with every cost line and where it came from."
        />
        <EmptyState
          title={view.source.kind === 'NO_SHOP' ? 'This shop could not be found' : 'Not synced yet'}
          description={
            view.source.kind === 'NO_SHOP'
              ? 'The shop this page was opened for is no longer in EtsyPilot. Nothing is wrong with your shop on Etsy.'
              : 'Profit is computed from your own order receipts, and EtsyPilot has not read them yet. Rather than show you a waterfall of zeroes and a loss made up of nothing but your fixed costs, this page waits for the first sync.'
          }
          action={
            <Link
              href="/settings/shops"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Shop connections
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Profit Reality"
        /*
         * The subtitle said "verified revenue and fees" unconditionally, which
         * is a claim about the page's inputs — and false on a shop whose fee
         * ledger has not been read, which is every shop today. The waterfall
         * below says Unavailable on those lines; the header has to agree with
         * it rather than contradict it two inches higher.
         */
        subtitle={`${period} UTC · ${view.currency} · ${
          view.verified.etsyFees === null
            ? 'verified revenue, fees not yet read, your cost inputs'
            : 'verified revenue and fees, your cost inputs'
        }`}
        actions={
          <>
            <Link
              prefetch={false}
              href="/api/export/transactions"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Export CSV
            </Link>
            {/*
              * The artboard's primary action, and until Costs & fees existed
              * there was nowhere for it to go.
              */}
            <Link
              href="/settings/costs"
              className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
            >
              Complete cost setup
            </Link>
          </>
        }
      />
      <ProfitTabs view={view} demo={session.isDemo} />
    </>
  )
}
