/*
 * Related terms.
 *
 * A row whose demand could not be modelled shows "Sparse data" in the demand
 * column and an em dash in every column derived from it. It does NOT show a
 * competition band or an opportunity score, because both are computed from
 * demand: a score over a missing input is a number invented to fill a column.
 */

import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { RangeValue } from '@/components/provenance/estimate'
import { Card } from '@/components/ui/card'
import { NumericCell } from '@/components/ui/numeric'
import type { RelatedTerm } from '@/lib/signals/interface'

const COMPETITION_LABEL = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' } as const
const RELEVANCE_LABEL = { HIGH: 'High', MODERATE: 'Medium', LOW: 'Low' } as const

function Unknown({ reason }: { reason: string }) {
  return (
    <>
      <span aria-hidden title={reason}>—</span>
      <span className="sr-only">{reason}</span>
    </>
  )
}

export function RelatedTermsTable({ terms, demo }: { terms: RelatedTerm[]; demo: boolean }) {
  return (
    <>
      {/*
        Cards below md, table above — the mobile treatment artboard 25 specifies.
        A seven-column table cannot be made to fit 390px honestly: either it
        scrolls the whole page sideways or the figures are shrunk until the
        ranges stop being readable, and a range you cannot read is worse than a
        card that takes two lines.
      */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {terms.map((t) => {
          const sparse = t.demand.value === null
          return (
            <li key={t.term}>
              <Card className="flex flex-col gap-2 p-[14px]">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-small font-semibold text-ink-1">{t.term}</span>
                  <span className="shrink-0 text-caption text-muted-1">
                    {t.wordCount} words · {RELEVANCE_LABEL[t.relevance]}
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <MobileStat label="Demand">
                    {sparse ? (
                      <span className="text-muted-1">Sparse data</span>
                    ) : (
                      <RangeValue data={t.demand} suffix="/ mo" />
                    )}
                  </MobileStat>
                  <MobileStat label="Competition">
                    {t.competition?.value ? (
                      COMPETITION_LABEL[t.competition.value]
                    ) : (
                      <Unknown reason="Not enough observation to place this term in a competition band." />
                    )}
                  </MobileStat>
                  <MobileStat label="Opportunity">
                    {t.opportunity !== null && t.opportunity.value !== null ? (
                      t.opportunity.value
                    ) : (
                      <Unknown reason="Opportunity is demand divided by competing listings, and demand is unknown for this term." />
                    )}
                  </MobileStat>
                  <MobileStat label="30-day trend">
                    {t.trend30d === null || t.trend30d.value === null ? (
                      <Unknown reason="Not enough observation to measure a trend." />
                    ) : t.trend30d.value === 0 ? (
                      'flat'
                    ) : (
                      `${t.trend30d.value > 0 ? '▲' : '▼'} ${Math.abs(t.trend30d.value)}%`
                    )}
                  </MobileStat>
                </dl>
              </Card>
            </li>
          )
        })}
      </ul>

      <Card
        tabIndex={0}
        role="region"
        aria-label="Related terms, scrolls horizontally"
        className="hidden w-full max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:block"
      >
      <table className="w-full min-w-[720px] border-collapse text-body">
        <caption className="sr-only">
          Related terms with modelled demand, observed competition and a calculated
          opportunity score. Terms with too little observation show no score.
        </caption>
        <thead>
          <tr className="bg-canvas-soft text-left text-label text-muted-1">
            <th scope="col" className="px-4 py-2.5 font-semibold">Keyword</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Demand range</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Competition</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Opportunity</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">30-day trend</th>
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">Words</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Relevance</th>
          </tr>
        </thead>
        <tbody>
          {terms.map((t) => {
            const sparse = t.demand.value === null
            return (
              <tr key={t.term} className="border-t border-line">
                <td className="px-4 py-3 text-small text-ink-1">{t.term}</td>
                <NumericCell className="text-ink-2">
                  {sparse ? (
                    <span className="text-muted-1">Sparse data</span>
                  ) : (
                    <RangeValue data={t.demand} suffix="/ mo" />
                  )}
                </NumericCell>
                <td className="px-3 py-3 text-small text-ink-2">
                  {t.competition?.value ? (
                    <span className="flex items-center gap-1.5">
                      {COMPETITION_LABEL[t.competition.value]}
                      <ProvenanceBadge
                        type={t.competition.provenance.type}
                        demo={demo}
                        srDetail={t.competition.provenance.methodology}
                      />
                    </span>
                  ) : (
                    <Unknown reason="Not enough observation to place this term in a competition band." />
                  )}
                </td>
                <NumericCell className="text-ink-2">
                  {t.opportunity !== null && t.opportunity.value !== null ? (
                    t.opportunity.value
                  ) : (
                    <Unknown reason="Opportunity is demand divided by competing listings, and demand is unknown for this term." />
                  )}
                </NumericCell>
                <NumericCell className="text-ink-2">
                  {t.trend30d === null || t.trend30d.value === null ? (
                    <Unknown reason="Not enough observation to measure a trend." />
                  ) : t.trend30d.value === 0 ? (
                    'flat'
                  ) : (
                    `${t.trend30d.value > 0 ? '▲' : '▼'} ${Math.abs(t.trend30d.value)}%`
                  )}
                </NumericCell>
                <NumericCell className="text-muted-1">{t.wordCount}</NumericCell>
                <td className="px-4 py-3 text-small text-muted-1">{RELEVANCE_LABEL[t.relevance]}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </Card>
    </>
  )
}

function MobileStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label text-muted-1">{label}</dt>
      <dd className="tnum whitespace-nowrap text-small text-ink-2">{children}</dd>
    </div>
  )
}
