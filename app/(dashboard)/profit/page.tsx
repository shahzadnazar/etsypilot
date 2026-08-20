import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { ProvenanceButton } from '@/components/provenance/provenance-button'
import { Card } from '@/components/ui/card'
import { computeWaterfall } from '@/domain/profit/waterfall'
import { getSession } from '@/lib/auth'
import { getEtsyService } from '@/lib/etsy'
import { DEMO_COST_INPUTS, PERIOD_END, PERIOD_START } from '@/lib/etsy/demo-dataset'
import { shopContext } from '@/lib/permissions'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Profit Reality' }

/*
 * Profit Reality, waterfall tab.
 *
 * Phase 5 builds the Scenarios, Costs and Transactions tabs. What is here now
 * is the honest core: the eight-cost line computed from real orders, with
 * coverage stated above it.
 */
export default async function ProfitPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const orders = await getEtsyService().getOrders(ctx.shopId, {
    since: PERIOD_START,
    until: PERIOD_END,
  })

  const profit = computeWaterfall(orders, DEMO_COST_INPUTS)

  const period = `${formatDate(PERIOD_START)} – ${formatDate(PERIOD_END)}`
  const maxLine = Math.max(...profit.lines.map((l) => Math.abs(l.amount)))

  return (
    <>
      <PageHeader
        title="Profit Reality"
        subtitle={`${period} · USD · base scenario · verified revenue and fees, your cost inputs`}
      />

      {/* Coverage is stated before any figure, not beneath it. */}
      {profit.coveragePercent < 100 ? (
        <div
          className="mb-4 rounded-card border p-4 text-small"
          style={{ background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}
        >
          <strong className="font-semibold" style={{ color: '#78350F' }}>
            Costs are confirmed for {profit.coveragePercent}% of order value.
          </strong>{' '}
          The figures below exclude the rest rather than assuming a cost — they are a floor, not an
          estimate of your whole shop.
        </div>
      ) : null}

      <section aria-label="Profit summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Summary label="Gross revenue" value={formatCurrency(profit.grossRevenue)} type="VERIFIED" demo={session.isDemo} />
        <Summary label="Total costs" value={`−${formatCurrency(profit.totalCosts)}`} type="CALCULATED" demo={session.isDemo} />
        <Summary
          label="Net profit"
          value={formatCurrency(profit.netProfit)}
          type="CALCULATED"
          demo={session.isDemo}
          methodologyKey="netProfit"
        />
        <Summary label="Net margin" value={formatPercent(profit.marginPercent)} type="CALCULATED" demo={session.isDemo} />
      </section>

      <Card className="mt-4 p-[18px]">
        <h2 className="text-section text-ink-1">Gross revenue to net profit</h2>
        <p className="mt-1 text-caption text-muted-1">
          Waterfall · USD · {period} · base scenario
        </p>

        <table className="mt-4 w-full border-collapse text-body">
          <caption className="sr-only">
            Profit waterfall for {period}, in US dollars, for the demo shop Willow and Fern.
          </caption>
          <thead>
            <tr className="text-left text-label text-muted-1">
              <th scope="col" className="pb-2 font-semibold">Line</th>
              <th scope="col" className="pb-2 text-right font-semibold">Amount</th>
              <th scope="col" className="pb-2 pl-4 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {profit.lines.map((line) => {
              const isNet = line.key === 'net'
              return (
                <tr key={line.key} className="border-t border-line">
                  <td className={`py-2.5 ${isNet ? 'font-semibold text-ink-1' : 'text-ink-2'}`}>
                    {line.label}
                    {/* Magnitude bar: comparison without a decorative chart. */}
                    <span
                      aria-hidden
                      className="mt-1.5 block h-1 rounded-full"
                      style={{
                        width: `${Math.max(2, (Math.abs(line.amount) / maxLine) * 100)}%`,
                        background:
                          line.amount < 0 ? 'var(--muted-2)' : isNet ? 'var(--success)' : 'var(--brand)',
                        opacity: line.amount < 0 ? 0.45 : 1,
                      }}
                    />
                  </td>
                  <td
                    className={`tnum whitespace-nowrap py-2.5 text-right ${
                      isNet ? 'font-semibold text-ink-1' : 'text-ink-2'
                    }`}
                  >
                    {line.amount < 0 ? '−' : ''}
                    {formatCurrency(Math.abs(line.amount))}
                  </td>
                  <td className="py-2.5 pl-4">
                    <ProvenanceBadge
                      type={line.provenance.type}
                      demo={session.isDemo}
                      srDetail={line.provenance.methodology}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card className="mt-4 p-[18px]">
        <h2 className="text-section text-ink-1">Missing data</h2>
        <ul className="mt-2 flex flex-col gap-1.5">
          {profit.missingData.map((item) => (
            <li key={item} className="text-small text-ink-2">
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}

function Summary({
  label,
  value,
  type,
  demo,
  methodologyKey,
}: {
  label: string
  value: string
  type: 'VERIFIED' | 'CALCULATED'
  demo: boolean
  methodologyKey?: string
}) {
  return (
    <Card className="flex flex-col gap-2 p-[14px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        {methodologyKey ? (
          <ProvenanceButton metricKey={methodologyKey} type={type} demo={demo} />
        ) : (
          <ProvenanceBadge type={type} demo={demo} />
        )}
      </div>
      <span className="tnum text-metric text-ink-1">{value}</span>
    </Card>
  )
}
