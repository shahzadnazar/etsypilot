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
import { isDemoMode } from '@/lib/etsy'

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
  searchParams: Promise<{
    saved?: string
    field?: string
    problem?: string
    q?: string
    blocked?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { saved, field, problem, q, blocked } = await searchParams
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
      ) : blocked === 'demo' ? (
        /*
         * ── A SAVE THAT CANNOT TAKE EFFECT SAYS SO ─────────────────────────
         *
         * In demo mode every cost figure on every screen comes from
         * DEMO_COST_INPUTS, so a cost rule written here could not be read back
         * — the form would show the fixture again and the seller would conclude
         * their save was lost. Which is exactly the defect this slice set out
         * to fix, so the refusal is explicit rather than a quiet no-op.
         */
        <div
          role="status"
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{
            background: 'var(--warning-surface)',
            borderColor: 'var(--warning-border)',
            color: 'var(--warning-ink)',
          }}
        >
          <strong className="font-semibold">Nothing was saved.</strong> This is the demo shop, and
          its costs are part of the sample data — every figure on these screens is Willow &amp;
          Fern&rsquo;s, so a cost entered here could not be shown back to you. Connect your own shop
          and your costs are yours to set. Nothing was sent to Etsy either way.
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
          on its next load — including periods that have already closed, because your cost
          figures carry no start date. Nothing was sent to Etsy.
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
            <ProvenanceBadge type="CALCULATED" demo={demoData} />
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
            <ProvenanceBadge type="SELLER_INPUT" demo={demoData} />
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

        {/*
          * ── THE TITLE IS A CLAIM, AND IT HAS TO BE TRUE ───────────────────
          *
          * "Costed by your rule" over an order-value figure, with the caption
          * "your default rule is used. That is your assumption, not a confirmed
          * figure." Both are statements about a rule the seller set. With none
          * set, this card named an assumption they had not made and attributed
          * a costing that is not happening — the remainder is not costed at all,
          * which is why Profit Reality withholds net profit.
          */}
        <Card className="flex flex-col gap-2 p-[14px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-muted-1">
              {view.settings.defaultRulePercent === null
                ? 'Not costed at all'
                : 'Costed by your rule'}
            </span>
            <ProvenanceBadge type="CALCULATED" demo={demoData} />
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
              ? view.settings.defaultRulePercent === null
                ? 'No orders in this period, and no default rule to cost them by.'
                : 'No orders in this period, so nothing has been costed by your rule yet.'
              : view.settings.defaultRulePercent === null
                ? 'of order value has no confirmed cost, and no default rule to fall back on. It is left out of profit rather than costed by a guess.'
                : 'of order value has no confirmed cost, so your default rule is used. That is your assumption, not a confirmed figure.'}
          </span>
        </Card>
      </section>

      <CostsForm settings={view.settings} currency={view.currency} demo={demoData} />

      {/*
        * ── THE PAGE SAYS WHICH ANSWER IT GIVES ────────────────────────
        *
        * A cost rule can be read two ways and both are defensible: freeze it
        * onto each order as it syncs, or apply the current rules whenever a
        * figure is read. EtsyPilot does the second — `order_items.cost_snapshot`
        * stays null, and lib/repositories/costs.ts records why. The visible
        * consequence is that editing a figure here moves a number the seller
        * has already seen and may have acted on, so the form that does it says
        * so, next to the fields, before they save rather than after.
        */}
      <p className="mt-3 text-caption leading-relaxed text-muted-1">
        <strong className="font-semibold text-ink-2">Changing these restates the past.</strong>{' '}
        These figures carry no start date, so they apply to every order EtsyPilot holds —
        including orders that synced before you entered them. Correct a percentage today and last
        month&rsquo;s net profit moves to match, which is what you want from a correction and worth
        knowing before a figure you have already reported changes. Every edit is kept, with who
        made it and when, in the{' '}
        <Link
          href="/settings/audit-log"
          className="font-semibold text-brand-strong underline underline-offset-2"
        >
          audit log
        </Link>
        .
      </p>

      <section aria-labelledby="imports-heading" className="mt-5">
        <h2 id="imports-heading" className="pb-2 text-section text-ink-1">
          Imported costs
        </h2>
        {view.imports.lastImportAt === null ? (
          /*
           * "Until then, every order is costed by the rule above" describes a
           * rule that may not exist. With none set, nothing costs those orders
           * — the same sentence the coverage card and Profit Reality now tell.
           */
          <EmptyState
            title="Nothing imported yet"
            description={
              view.settings.defaultRulePercent === null
                ? 'Print-on-demand and supplier invoices can be imported as CSV so per-order costs come from the invoice rather than from a rule. Until then, orders with no confirmed cost have none at all, and are left out of profit.'
                : 'Print-on-demand and supplier invoices can be imported as CSV so per-order costs come from the invoice rather than from your default rule. Until then, every order is costed by the rule above.'
            }
          />
        ) : (
          <Card className="flex flex-col gap-1.5 p-[14px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label text-muted-1">POD & shipping</span>
              <ProvenanceBadge type="SELLER_INPUT" demo={demoData} />
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
        hasDefaultRule={view.settings.defaultRulePercent !== null}
        currency={view.currency}
        query={q ?? ''}
        demo={demoData}
      />

      <FeeRatesTable
        rates={view.feeRates}
        effective={view.feeRulesEffective}
        source={view.feeRulesSource}
        limitations={view.feeLimitations}
        currency={view.currency}
        demo={demoData}
      />
    </>
  )
}
