'use client'

import { useState } from 'react'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import type { ProfitView } from '@/domain/profit/service'
import { SCENARIO_LABEL, type ScenarioKind } from '@/domain/profit/types'
import { formatPercent } from '@/lib/utils/format'
import { Money, Numeric } from '@/components/ui/numeric'
import { cn } from '@/lib/utils/cn'
import { InputsPanel } from './inputs-panel'
import { MissingDataPanel } from './missing-data-panel'
import { ScenarioComparisonPanel } from './scenario-comparison'
import { TransactionsTable } from './transactions-table'
import { WaterfallTable } from './waterfall-table'

/*
 * Profit Reality — one surface, four views (D5).
 *
 * Coverage is stated above the tabs rather than inside one of them, because it
 * qualifies every number on the screen and not just the waterfall.
 */
const TABS = ['Waterfall', 'Scenarios', 'Costs', 'Transactions'] as const
type Tab = (typeof TABS)[number]

export function ProfitTabs({ view, demo }: { view: ProfitView; demo: boolean }) {
  const [tab, setTab] = useState<Tab>('Waterfall')
  const [scenario, setScenario] = useState<ScenarioKind>('BASE')

  /*
   * Scenarios apply to the waterfall, not to the ledger.
   *
   * Transactions and Costs describe what actually happened - real receipts,
   * real cost rules. Showing projected totals above a table of actual
   * transactions invites the reader to treat one as the sum of the other. So
   * those tabs always report the base case, whatever is selected on Scenarios.
   */
  const scenarioApplies = tab === 'Waterfall' || tab === 'Scenarios'
  const shown: ScenarioKind = scenarioApplies ? scenario : 'BASE'
  const result = view.results[shown]

  return (
    <>
      {result.coveragePercent < 100 ? (
        <div
          className="mb-4 rounded-card border p-4 text-small leading-relaxed"
          style={{ background: 'var(--warning-surface)', borderColor: 'var(--warning-border)', color: 'var(--warning-ink)' }}
        >
          {/*
            * No colour override. The panel already sets --warning-ink, and
            * font-semibold carries the emphasis. The literal darker amber that
            * used to be here was the last hard-coded colour in the product: it
            * did not flip with the theme, so in dark mode it was #78350F on a
            * dark amber ground — 1.7:1, unreadable.
            */}
          <strong className="font-semibold">
            Costs are confirmed for {result.coveragePercent}% of order value.
          </strong>{' '}
          The other{' '}
          <Money value={view.reconciliation.ruleCostedGross} currency={view.currency} /> is costed
          by your default rule ({view.costSetup.defaultRule.label}), which is your assumption rather
          than a confirmed cost. Net profit below includes it and is only as good as that rule. Per
          order, nothing is assumed: the ledger leaves cost and profit blank wherever no confirmed
          cost exists.
        </div>
      ) : null}

      <section aria-label="Profit summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Gross revenue"
          value={<Money value={result.grossRevenue} currency={view.currency} />}
          type={shown === 'BASE' ? 'VERIFIED' : 'CALCULATED'}
          demo={demo}
        />
        <Kpi
          label="Total costs"
          value={<Money value={result.totalCosts} currency={view.currency} negate />}
          type="CALCULATED"
          demo={demo}
        />
        <Kpi
          label="Net profit"
          value={<Money value={result.netProfit} currency={view.currency} />}
          type="CALCULATED"
          demo={demo}
        />
        <Kpi
          label="Net margin"
          /*
           * An em dash with a reason, not "0.0%". There is no margin without
           * revenue to be a margin of, and printing zero there reads as
           * breaking even beside a net profit of −$1,322.05.
           */
          value={
            result.marginPercent === null ? (
              <Numeric className="text-muted-1">
                <span title="No revenue in this period" aria-hidden>
                  —
                </span>
                <span className="sr-only">No revenue in this period, so there is no margin</span>
              </Numeric>
            ) : (
              formatPercent(result.marginPercent)
            )
          }
          type="CALCULATED"
          demo={demo}
        />
      </section>

      <div role="tablist" aria-label="Profit views" className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'rounded-control px-3 py-1.5 text-[12px] font-semibold',
              tab === t
                ? 'bg-brand-tint text-brand-strong'
                : 'border border-line text-ink-2 hover:bg-canvas-soft',
            )}
          >
            {t}
          </button>
        ))}

        {shown !== 'BASE' ? (
          <span className="ml-auto self-center text-caption text-muted-1">
            Showing the {SCENARIO_LABEL[shown].toLowerCase()} scenario — projected, not verified
          </span>
        ) : scenario !== 'BASE' && !scenarioApplies ? (
          <span className="ml-auto self-center text-caption text-muted-1">
            Showing actual figures — scenarios apply to the waterfall only
          </span>
        ) : null}
      </div>

      <div role="tabpanel" className="mt-3.5 flex flex-col gap-4">
        {tab === 'Waterfall' ? (
          <>
            <WaterfallTable result={result} currency={view.currency} demo={demo} />
            <MissingDataPanel items={result.missingData} currency={view.currency} />
          </>
        ) : null}

        {tab === 'Scenarios' ? (
          <>
            <ScenarioComparisonPanel
              comparison={view.comparison}
              selected={scenario}
              currency={view.currency}
              onSelect={setScenario}
            />
            <InputsPanel rows={view.inputs} demo={demo} />
            <p className="text-caption text-muted-1">
              Scenarios are planning tools, not a forecast of your shop.
            </p>
          </>
        ) : null}

        {tab === 'Costs' ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <CostCard title="Cost coverage" value={`${view.costSetup.coveragePercent}%`} detail={`${view.costSetup.listingsCovered} listings covered · ${view.costSetup.listingsMissing} missing a cost`} />
              <CostCard title="Default rule" value={view.costSetup.defaultRule.label} detail={view.costSetup.defaultRule.detail} />
              <CostCard title="Listing costs" value={view.costSetup.listingCosts.label} detail={view.costSetup.listingCosts.detail} />
              <CostCard title="POD & shipping" value={view.costSetup.imports.label} detail={view.costSetup.imports.detail} />
              <CostCard title="Ad spend" value={view.costSetup.adSpend.label} detail={view.costSetup.adSpend.detail} />
            </div>
            <MissingDataPanel items={result.missingData} currency={view.currency} />
          </>
        ) : null}

        {tab === 'Transactions' ? (
          <TransactionsTable reconciliation={view.reconciliation} currency={view.currency} />
        ) : null}
      </div>
    </>
  )
}

function Kpi({
  label,
  value,
  type,
  demo,
}: {
  label: string
  value: React.ReactNode
  type: 'VERIFIED' | 'CALCULATED'
  demo: boolean
}) {
  return (
    <Card className="flex flex-col gap-2 p-[14px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        <ProvenanceBadge type={type} demo={demo} />
      </div>
      <Numeric className="text-metric text-ink-1">{value}</Numeric>
    </Card>
  )
}

function CostCard({
  title,
  value,
  detail,
}: {
  title: string
  value: React.ReactNode
  detail: string
}) {
  return (
    <Card className="flex flex-col gap-1.5 p-[14px]">
      <span className="text-label text-muted-1">{title}</span>
      <Numeric className="text-[19px] font-semibold text-ink-1">{value}</Numeric>
      <span className="text-caption leading-snug text-muted-1">{detail}</span>
    </Card>
  )
}
