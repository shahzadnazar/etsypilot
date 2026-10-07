'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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

/*
 * `?tab=transactions` now selects the Transactions tab.
 *
 * It did not. The tab was client state and the query was read by nothing, so
 * every link carrying `?tab=` — the ledger's "Resolve exceptions", the Action
 * Center's cost prompts — resolved to /profit and landed the reader on the
 * Waterfall, one tab away from the thing the link named. The link checker was
 * satisfied because /profit exists, which is exactly why this survived: a
 * broken promise that is not a broken URL.
 */
function tabFrom(value: string | null): Tab {
  const match = TABS.find((t) => t.toLowerCase() === (value ?? '').toLowerCase())
  return match ?? 'Waterfall'
}

/**
 * Why there is no net margin, which depends on which input is missing.
 *
 * Ordered by what the reader can act on: an unknown net profit is the bigger
 * fact, and it subsumes the revenue question — a shop with no revenue AND no
 * fee data is better told about the fees, because that is the one that will
 * still be true after their first sale.
 */
function marginAbsence(result: { netProfit: number | null; grossRevenue: number }): string {
  if (result.netProfit === null) {
    return 'Net profit is not known for this period, so there is no margin to show.'
  }
  return 'No revenue in this period, so there is no margin.'
}

export function ProfitTabs({ view, demo }: { view: ProfitView; demo: boolean }) {
  const params = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => tabFrom(params.get('tab')))
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
          {/*
            * ── AN ASSUMPTION CANNOT BE ATTRIBUTED TO A SELLER WHO MADE NONE ──
            *
            * The single sentence here said the uncosted remainder "is costed by
            * your default rule ({label}), which is your assumption rather than a
            * confirmed cost". Honest for a seller who set that rule. For one who
            * has set nothing it was false twice over: `label` renders "Not set",
            * so the page read "costed by your default rule (Not set)", and it
            * called that non-existent rule their assumption. Then "Net profit
            * below includes it" while the net profit tile beside it read "—".
            *
            * Two different facts, so two different sentences. The remainder is
            * either costed by a rule the seller owns, or it is not costed at all.
            */}
          {view.assumptions.cogsPercent !== null ? (
            <>
              The other{' '}
              <Money value={view.reconciliation.ruleCostedGross} currency={view.currency} /> is
              costed by your default rule ({view.costSetup.defaultRule.label}), which is your
              assumption rather than a confirmed cost.{' '}
              {result.netProfit === null
                ? 'Net profit is withheld anyway, because another figure the calculation needs is missing.'
                : 'Net profit below includes it and is only as good as that rule.'}{' '}
              Per order, nothing is assumed: the ledger leaves cost and profit blank wherever no
              confirmed cost exists.
            </>
          ) : (
            <>
              The other{' '}
              <Money value={view.reconciliation.ruleCostedGross} currency={view.currency} /> has no
              cost at all. You have set no default rule, and nothing is applied in its place — a
              cost nobody has entered is absent, not zero and not a guess. So net profit is
              withheld here and left blank in the ledger, rather than calculated from a figure you
              did not give us.
            </>
          )}
        </div>
      ) : null}

      <section aria-label="Profit summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Gross revenue"
          value={<Money value={result.grossRevenue} currency={view.currency} />}
          type={shown === 'BASE' ? 'VERIFIED' : 'CALCULATED'}
          demo={demo}
        />
        {/*
          THE BADGE HAS TO AGREE WITH THE VALUE.

          These were hardcoded `type="CALCULATED"`, and with the fee lines
          unknown the tiles rendered "Calculated — Not known": a provenance
          badge asserting a calculation beside an em dash saying there wasn't
          one. Seen in a browser on a shop with synced orders and no fee
          ledger. A badge that contradicts the figure next to it is worse than
          no badge, because the badge is the thing this product asks sellers to
          trust.
        */}
        <Kpi
          label="Total costs"
          value={<Money value={result.totalCosts} currency={view.currency} negate />}
          type={result.totalCosts === null ? 'UNAVAILABLE' : 'CALCULATED'}
          demo={demo}
        />
        <Kpi
          label="Net profit"
          value={<Money value={result.netProfit} currency={view.currency} />}
          type={result.netProfit === null ? 'UNAVAILABLE' : 'CALCULATED'}
          demo={demo}
        />
        <Kpi
          label="Net margin"
          /*
           * An em dash with THE RIGHT reason, not "0.0%".
           *
           * There are now two ways to have no margin and they are not the same
           * sentence. The reason used to be hardcoded to "no revenue in this
           * period", which was read out on a shop with $18,420.65 of revenue
           * whose margin was absent because its NET PROFIT was — the fees had
           * not been read. A screen reader was told something flatly false
           * while the sighted copy said nothing at all.
           */
          value={
            result.marginPercent === null ? (
              <Numeric className="text-muted-1">
                <span title={marginAbsence(result)} aria-hidden>
                  —
                </span>
                <span className="sr-only">{marginAbsence(result)}</span>
              </Numeric>
            ) : (
              formatPercent(result.marginPercent)
            )
          }
          type={result.marginPercent === null ? 'UNAVAILABLE' : 'CALCULATED'}
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
            {/*
              * ── THE PAGE SAYS WHICH ANSWER IT GIVES ───────────────────────
              *
              * Costs are applied when this screen is read, not frozen onto each
              * order when it synced (`order_items.cost_snapshot` stays null —
              * see lib/repositories/costs.ts for why). The consequence is that
              * editing a cost rule changes a period that has already closed,
              * and a seller who sees last month's net profit move is owed the
              * reason in the place the figure is. Both answers are defensible;
              * what is not defensible is the page not saying which one it gave.
              */}
            <p className="text-caption leading-relaxed text-muted-1">
              <strong className="font-semibold text-ink-2">
                Changing a cost restates this period.
              </strong>{' '}
              Your cost figures are applied when this page is read, and they carry no start date —
              so they apply to every order here, including orders that synced before you entered
              them. Correct a COGS percentage today and last month&rsquo;s net profit moves to
              match. That is deliberate: a corrected cost is a better answer about the past, not a
              new fact about the future. Every change is kept, with who made it and when, in the{' '}
              <Link
                href="/settings/audit-log"
                className="font-semibold text-brand-strong underline underline-offset-2"
              >
                audit log
              </Link>
              .
            </p>
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
  /** UNAVAILABLE included, because a tile whose value is absent must say so. */
  type: 'VERIFIED' | 'CALCULATED' | 'UNAVAILABLE'
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
