'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { NumberField } from './number-field'
import { calculateAdsRoi } from '@/domain/ads/roi'
import { formatSignedCurrency } from '@/lib/utils/format'

/*
 * Etsy Ads ROI.
 *
 * Everything here is typed in, because Etsy does not publish Ads performance
 * through its API — the same fact that makes getAdsPerformance() return
 * UNAVAILABLE in both adapters. The tool says so rather than implying the
 * figures could have been fetched and were not.
 *
 * The screen leads with contribution after ads rather than ROAS, because ROAS
 * is the number that flatters: 4x reads as a triumph and loses money at a 20%
 * margin. Showing the ratio first and the money second would be putting the
 * comfortable figure above the true one.
 */
export function AdsRoi() {
  const [spend, setSpend] = useState('100')
  const [revenue, setRevenue] = useState('400')
  const [orders, setOrders] = useState('6')
  const [margin, setMargin] = useState('20')

  const marginValue = margin.trim() === '' ? undefined : (Number(margin) || 0) / 100
  const result = useMemo(
    () =>
      calculateAdsRoi({
        spend: Number(spend) || 0,
        attributedRevenue: Number(revenue) || 0,
        ...(Number(orders) > 0 ? { attributedOrders: Number(orders) } : {}),
        ...(marginValue !== undefined ? { marginPercent: marginValue } : {}),
      }),
    [spend, revenue, orders, marginValue],
  )

  const losing = result.contributionAfterAds !== null && result.contributionAfterAds < 0

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <Card className="flex w-full flex-col gap-3 p-[18px] lg:w-[340px] lg:shrink-0">
        <h2 className="text-section text-ink-1">From your Etsy Ads dashboard</h2>
        <NumberField label="Ad spend" value={spend} onChange={setSpend} prefix="$" />
        <NumberField
          label="Revenue Etsy attributed"
          value={revenue}
          onChange={setRevenue}
          prefix="$"
          hint="Etsy’s own figure for sales it credits to your ads."
        />
        <NumberField label="Orders attributed" value={orders} onChange={setOrders} />
        <NumberField
          label="Your margin after fees and costs"
          value={margin}
          onChange={setMargin}
          suffix="%"
          hint="Leave blank if you don’t know it — the tool will withhold the money figures rather than assume one."
        />
      </Card>

      <div className="flex w-full min-w-0 flex-col gap-3">
        <Card className="p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section text-ink-1">What this means</h2>
            <ProvenanceBadge type="CALCULATED" />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-label text-muted-1">Money kept after ad spend</span>
              {result.contributionAfterAds === null ? (
                <Numeric className="text-metric text-muted-1">
                  <span title="Enter your margin" aria-hidden>—</span>
                  <span className="sr-only">
                    Enter your margin to see whether these ads made money
                  </span>
                </Numeric>
              ) : (
                <Numeric className={losing ? 'text-metric text-danger' : 'text-metric text-ink-1'}>
                  {formatSignedCurrency(result.contributionAfterAds)}
                </Numeric>
              )}
              <span className="text-caption leading-relaxed text-muted-1">
                {result.contributionAfterAds === null
                  ? 'Return on ad spend alone cannot tell you this.'
                  : losing
                    ? 'These ads cost more than the margin they brought in.'
                    : 'What is left after fees, product costs and the ads themselves.'}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-label text-muted-1">Return on ad spend</span>
              <Numeric className="text-metric text-ink-1">
                {result.roas === null ? '—' : `${result.roas.toFixed(2)}×`}
              </Numeric>
              <span className="text-caption leading-relaxed text-muted-1">
                {result.breakEvenRoas !== null
                  ? `You need ${result.breakEvenRoas.toFixed(2)}× just to break even at this margin.`
                  : result.formula}
              </span>
            </div>
          </div>

          {result.costPerOrder !== null ? (
            <p className="mt-3 border-t border-line pt-3 text-small text-ink-2">
              Cost per attributed order{' '}
              <Numeric className="font-semibold text-ink-1">
                {formatSignedCurrency(result.costPerOrder)}
              </Numeric>
            </p>
          ) : null}
        </Card>

        <ul className="flex flex-col gap-1.5">
          {result.limitations.map((l) => (
            <li key={l} className="max-w-[80ch] text-caption leading-relaxed text-muted-1">
              · {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
