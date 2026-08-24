import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { CostsForm } from '@/components/costs/costs-form'
import { FeeRatesTable } from '@/components/costs/fee-rates-table'
import { MissingCostsTable } from '@/components/costs/missing-costs-table'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Money, Numeric } from '@/components/ui/numeric'
import { getCostsView } from '@/domain/costs/service'
import { problemFromQuery, describeProblem } from '@/domain/costs/validate'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate, formatPercent } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Costs & fees' }

/*
 * Costs & fees (artboards 53–56, cost setup panel).
 *
 * Profit Reality's primary button — "Complete cost setup" — and every
 * missing-data row in its ledger point here. Before this page existed they
 * pointed at a tab on the screen the seller was already looking at, which is
 * why the gap never closed: the product kept saying "add costs" and never said
 * where.
 */
export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; field?: string; problem?: string; q?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { saved, field, problem, q } = await searchParams
  const ctx = shopContext(session, session.shopId)
  const view = await getCostsView(ctx)
  const report = problemFromQuery(field, problem)
  const period = `${formatDate(view.periodStart)} – ${formatDate(view.periodEnd)}`

  return (
    <>
      <PageHeader
        title="Costs & fees"
        subtitle={`${period} UTC · ${view.currency} · your cost inputs, and the fee rates EtsyPilot applies`}
        actions={
          <Link
            href="/profit"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Open Profit Reality
          </Link>
        }
      />

      {report ? (
        <div
          role="alert"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--danger-surface)',
            borderColor: 'var(--danger-border)',
            color: 'var(--danger-ink)',
          }}
        >
          <strong className="font-semibold">{describeProblem(report).message}</strong>{' '}
          {describeProblem(report).recovery}
        </div>
      ) : saved === '1' ? (
        <div
          role="status"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--success-surface)',
            borderColor: 'var(--success-border)',
            color: 'var(--success-ink)',
          }}
        >
          <strong className="font-semibold">Saved.</strong> Profit Reality recalculates from these
          on its next load. Nothing was sent to Etsy.
        </div>
      ) : null}

      <section aria-label="Cost coverage" className="grid gap-3 sm:grid-cols-3">
        <Card className="flex flex-col gap-2 p-[14px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-muted-1">Cost coverage</span>
            {/*
              * Calculated, not seller input. The inputs are the seller's; the
              * share of order value they cover is a ratio EtsyPilot works out
              * over verified order values. Dividing demotes (D32).
              */}
            <ProvenanceBadge type="CALCULATED" demo={session.isDemo} />
          </div>
          <Numeric className="text-metric text-ink-1">
            {view.coverage.percent === null ? (
              <>
                <span aria-hidden>—</span>
                <span className="sr-only">
                  No orders in this period, so there is no order value to cover
                </span>
              </>
            ) : (
              formatPercent(view.coverage.percent, 0)
            )}
          </Numeric>
          <span className="text-caption leading-snug text-muted-1">
            {view.coverage.percent === null
              ? 'No orders in this period. Coverage is a share of order value, and there is none to divide.'
              : `of order value carries a confirmed per-listing cost`}
          </span>
        </Card>

        <Card className="flex flex-col gap-2 p-[14px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-muted-1">Listings with a cost</span>
            <ProvenanceBadge type="SELLER_INPUT" demo={session.isDemo} />
          </div>
          {/*
            * "0 of 0 active listings · 0 missing a cost" is three true numbers
            * that together describe nothing, and read like a shop in perfect
            * order. A shop with no listings gets told it has no listings.
            */}
          <Numeric className="text-metric text-ink-1">
            {view.coverage.activeListings === 0 ? (
              <>
                <span aria-hidden>—</span>
                <span className="sr-only">No active listings yet</span>
              </>
            ) : (
              view.coverage.listingsCovered.toLocaleString('en-US')
            )}
          </Numeric>
          <span className="text-caption leading-snug text-muted-1">
            {view.coverage.activeListings === 0
              ? 'No active listings yet. Sync a shop and each listing appears here until it has a cost.'
              : `of ${view.coverage.activeListings.toLocaleString('en-US')} active listings · ${view.coverage.listingsMissing.toLocaleString('en-US')} missing a cost`}
          </span>
        </Card>

        <Card className="flex flex-col gap-2 p-[14px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-muted-1">Costed by your rule</span>
            <ProvenanceBadge type="CALCULATED" demo={session.isDemo} />
          </div>
          <Numeric className="text-metric text-ink-1">
            {/*
              * $0.00 here would say "none of your order value rests on an
              * assumption", which is true of a shop with no orders in the
              * flattering way that a zero always is. The em dash says there is
              * nothing to divide instead.
              */}
            <Money
              value={view.coverage.orderCount === 0 ? null : view.coverage.ruleCostedGross}
              currency={view.currency}
              unknownLabel="No orders in this period"
            />
          </Numeric>
          <span className="text-caption leading-snug text-muted-1">
            {view.coverage.orderCount === 0
              ? 'No orders in this period, so nothing has been costed by your rule yet.'
              : 'of order value has no confirmed cost, so your default rule is used. That is your assumption, not a confirmed figure.'}
          </span>
        </Card>
      </section>

      <CostsForm settings={view.settings} currency={view.currency} demo={session.isDemo} />

      <section aria-labelledby="imports-heading" className="mt-5">
        <h2 id="imports-heading" className="pb-2 text-section text-ink-1">
          Imported costs
        </h2>
        {view.imports.lastImportAt === null ? (
          <EmptyState
            title="Nothing imported yet"
            description="Print-on-demand and supplier invoices can be imported as CSV so per-order costs come from the invoice rather than from your default rule. Until then, every order is costed by the rule above."
          />
        ) : (
          <Card className="flex flex-col gap-1.5 p-[14px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label text-muted-1">POD & shipping</span>
              <ProvenanceBadge type="SELLER_INPUT" demo={session.isDemo} />
            </div>
            <span className="text-body text-ink-1">
              Last import {formatDate(view.imports.lastImportAt)} ·{' '}
              <span className="tnum">{view.imports.matched.toLocaleString('en-US')}</span> lines
              matched,{' '}
              <span className="tnum">{view.imports.unmatched.toLocaleString('en-US')}</span>{' '}
              unmatched
            </span>
            <span className="text-caption leading-snug text-muted-1">
              Unmatched lines are excluded from profit rather than averaged in.{' '}
              <Link href="/profit" className="font-semibold text-brand-strong underline underline-offset-2">
                Resolve them in the ledger
              </Link>
              .
            </span>
          </Card>
        )}
      </section>

      <MissingCostsTable
        rows={view.missingCosts}
        activeListings={view.coverage.activeListings}
        currency={view.currency}
        query={q ?? ''}
        demo={session.isDemo}
      />

      <FeeRatesTable
        rates={view.feeRates}
        effective={view.feeRulesEffective}
        source={view.feeRulesSource}
        limitations={view.feeLimitations}
        currency={view.currency}
        demo={session.isDemo}
      />
    </>
  )
}
