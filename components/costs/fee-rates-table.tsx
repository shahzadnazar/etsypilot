import Link from 'next/link'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import type { FeeRate } from '@/domain/fees/rules'
import { formatCurrency, formatDate, formatPercent } from '@/lib/utils/format'

/*
 * The fee rates EtsyPilot applies.
 *
 * Read-only here, and editable in the Fee Calculator, which is where a seller
 * in another country corrects them for their own shop. Both surfaces read
 * domain/fees/rules.ts, so the schedule this page prints and the schedule that
 * tool calculates with are the same schedule.
 *
 * The effective date is not a footnote. A fee figure with no date on it is a
 * figure that was true once (D49).
 */
export function FeeRatesTable({
  rates,
  effective,
  source,
  limitations,
  currency,
  demo,
}: {
  rates: FeeRate[]
  effective: string
  source: string
  limitations: string[]
  currency: string
  demo: boolean
}) {
  return (
    <section aria-labelledby="fee-rates-heading" className="mt-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="fee-rates-heading" className="text-section text-ink-1">
            Fee rates
          </h2>
          <p className="text-caption text-muted-1">
            Recorded {formatDate(effective)} from {source}.
          </p>
        </div>
        {/*
          * Estimated, not verified. Etsy publishes no endpoint that reports the
          * fee schedule, so this is a set of rates someone read off a policy
          * page on a date — the strongest claim available, and weaker than
          * "verified" by a long way.
          */}
        <ProvenanceBadge type="ESTIMATED" demo={demo} />
      </div>

      <Card
        tabIndex={0}
        role="region"
        aria-label="Fee rates, scrolls horizontally"
        className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <table className="w-full min-w-[620px] border-collapse text-body">
          <caption className="sr-only">
            The published Etsy fee rates EtsyPilot applies, what each is charged on, and the
            condition attached to it.
          </caption>
          <thead>
            <tr className="bg-canvas-soft text-left text-label text-muted-1">
              <th scope="col" className="px-4 py-2.5 font-semibold">Fee</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Charged on</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Rate</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.key} className="border-t border-line align-top">
                <td className="px-4 py-3 text-small text-ink-1">
                  {rate.label}
                  <span className="mt-1 block max-w-prose text-caption leading-snug text-muted-1">
                    {rate.note}
                  </span>
                </td>
                <td className="px-3 py-3 text-small text-ink-2">{rate.basis}</td>
                <td className="tnum px-3 py-3 text-right text-small text-ink-1">
                  {rateText(rate, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ul className="flex flex-col gap-1.5">
        {limitations.map((limit) => (
          <li key={limit} className="text-caption leading-relaxed text-muted-1">
            {limit}
          </li>
        ))}
      </ul>

      <p className="text-caption text-muted-1">
        Rates differ by country and Etsy changes them.{' '}
        <Link
          href="/tools/fee-calculator"
          className="font-semibold text-brand-strong underline underline-offset-2"
        >
          Correct them for your shop in the Fee Calculator
        </Link>
        .
      </p>
    </section>
  )
}

/**
 * A rate that is zero prints as "0", never as blank.
 *
 * The regulatory operating fee is zero by default and applies in several
 * countries. A blank cell there reads as "does not apply to anybody"; a zero
 * the seller can see is the thing that prompts them to change it.
 */
function rateText(rate: FeeRate, currency: string): string {
  const percent = rate.percent !== 0 || rate.flat === 0 ? formatPercent(rate.percent * 100, 1) : ''
  const flat = rate.flat !== 0 ? formatCurrency(rate.flat, currency) : ''
  if (percent && flat) return `${percent} + ${flat}`
  // The listing fee is flat-only, and read "+ $0.20" while the "+" had nothing
  // to add to.
  return percent || flat
}
