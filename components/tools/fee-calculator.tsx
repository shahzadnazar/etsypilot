'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { calculateFees } from '@/domain/fees/calculate'
import { DEFAULT_FEE_RATES, FEE_RULES_EFFECTIVE, FEE_RULES_SOURCE } from '@/domain/fees/rules'
import { formatSignedCurrency } from '@/lib/utils/format'

/*
 * The Fee Calculator.
 *
 * Two decisions carry this screen.
 *
 * The rates are EDITABLE. Etsy changes its fees, they differ by country, and
 * no API reports the schedule — so a fixed rate set produces a confidently
 * wrong answer for anyone outside the United States, which is worse than no
 * tool. A seller can correct any rate and immediately see the effect.
 *
 * Every line shows its own arithmetic with real numbers in it: "6.5% of
 * $29.50", not "6.5%". The most common hand-calculation error is applying the
 * transaction fee to the item price instead of the item price plus shipping,
 * and the only way to surface that is to print the basis.
 */

const NUMBER = /^\d*\.?\d*$/

function Field({
  label,
  value,
  onChange,
  prefix,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  prefix?: string
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-2">{label}</span>
      <span className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
        {prefix ? <span className="text-small text-muted-1">{prefix}</span> : null}
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            // Refuse the keystroke rather than accept it and render NaN.
            if (NUMBER.test(e.target.value)) onChange(e.target.value)
          }}
          className="tnum h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
        />
      </span>
      {hint ? <span className="text-caption text-muted-1">{hint}</span> : null}
    </label>
  )
}

export function FeeCalculator() {
  const [itemPrice, setItemPrice] = useState('24.50')
  const [shipping, setShipping] = useState('5.00')
  const [tax, setTax] = useState('0')
  const [offsiteAd, setOffsiteAd] = useState(false)
  const [rates, setRates] = useState(DEFAULT_FEE_RATES)

  const result = useMemo(
    () =>
      calculateFees({
        itemPrice: Number(itemPrice) || 0,
        shipping: Number(shipping) || 0,
        tax: Number(tax) || 0,
        offsiteAd,
        rates,
      }),
    [itemPrice, shipping, tax, offsiteAd, rates],
  )

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <Card className="flex w-full flex-col gap-3 p-[18px] lg:w-[340px] lg:shrink-0">
        <h2 className="text-section text-ink-1">The sale</h2>
        <Field label="Item price" value={itemPrice} onChange={setItemPrice} prefix="$" />
        <Field
          label="Shipping the buyer pays"
          value={shipping}
          onChange={setShipping}
          prefix="$"
          hint="Zero if you offer free shipping — the cost is in your price instead."
        />
        <Field
          label="Sales tax collected"
          value={tax}
          onChange={setTax}
          prefix="$"
          hint="Etsy charges processing on tax, but it is not your income."
        />
        <label className="mt-1 flex min-h-[44px] items-center gap-2.5">
          <input
            type="checkbox"
            checked={offsiteAd}
            onChange={(e) => setOffsiteAd(e.target.checked)}
            className="h-6 w-6 accent-[var(--brand)]"
          />
          <span className="text-small text-ink-2">This sale came from an Etsy ad</span>
        </label>
      </Card>

      <div className="flex w-full min-w-0 flex-col gap-3">
        <Card className="p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section text-ink-1">What Etsy takes</h2>
            <ProvenanceBadge type="CALCULATED" />
          </div>

          <div
            tabIndex={0}
            role="region"
            aria-label="Fee breakdown, scrolls horizontally"
            className="mt-3 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <table className="w-full border-collapse text-small">
              <thead>
                <tr className="border-b border-line text-left text-caption text-muted-1">
                  <th className="py-1.5 font-semibold">Fee</th>
                  <th className="py-1.5 font-semibold">How it is worked out</th>
                  <th className="py-1.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => (
                  <tr key={line.key} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-semibold text-ink-1">{line.label}</td>
                    <td className="py-2 pr-3 text-ink-2">
                      {line.formula}
                      <span className="block text-caption text-muted-1">{line.note}</span>
                    </td>
                    <td className="py-2 text-right">
                      <Numeric className="font-semibold text-ink-1">
                        {formatSignedCurrency(line.amount, 'USD', { negate: line.amount > 0 })}
                      </Numeric>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-3 font-semibold text-ink-1">Total fees</td>
                  <td className="py-2 pr-3 text-muted-1">
                    {result.effectivePercent}% of the {formatSignedCurrency(result.buyerPays)} the
                    buyer paid
                  </td>
                  <td className="py-2 text-right">
                    <Numeric className="font-semibold text-ink-1">
                      {formatSignedCurrency(result.totalFees, 'USD', { negate: true })}
                    </Numeric>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-2 border-t border-line pt-3">
            <span className="text-label text-muted-1">You keep</span>
            <Numeric className="text-metric text-ink-1">
              {formatSignedCurrency(result.netToSeller)}
            </Numeric>
            <span className="text-caption text-muted-1">
              before your own product, packaging and labour costs — and before tax you owe.
            </span>
          </div>
        </Card>

        {/*
          * The rate set, editable and dated.
          *
          * Not hidden behind an "advanced" toggle: the rates ARE the
          * assumption, and a seller who cannot see which ones were used has
          * been handed a number to take on trust.
          */}
        <Card className="p-[18px]">
          <h2 className="text-section text-ink-1">The rates this used</h2>
          <p className="mt-1 max-w-[80ch] text-caption leading-relaxed text-muted-1">
            {FEE_RULES_SOURCE}, recorded {FEE_RULES_EFFECTIVE}. Etsy changes its fees and they
            differ by country — correct any rate below and the figures update.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {rates.map((rate, i) => (
              <label key={rate.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-small text-ink-2">
                  {rate.label}
                  <span className="block text-caption text-muted-1">{rate.basis}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <input
                    inputMode="decimal"
                    aria-label={`${rate.label} percentage`}
                    value={String(Math.round(rate.percent * 10000) / 100)}
                    onChange={(e) => {
                      if (!NUMBER.test(e.target.value)) return
                      const next = [...rates]
                      next[i] = { ...rate, percent: (Number(e.target.value) || 0) / 100 }
                      setRates(next)
                    }}
                    className="tnum h-11 w-16 rounded-control border border-line bg-surface px-2 text-right text-small text-ink-1 outline-none focus:border-brand md:h-[38px]"
                  />
                  <span className="text-caption text-muted-1">%</span>
                  <input
                    inputMode="decimal"
                    aria-label={`${rate.label} flat amount`}
                    value={String(rate.flat)}
                    onChange={(e) => {
                      if (!NUMBER.test(e.target.value)) return
                      const next = [...rates]
                      next[i] = { ...rate, flat: Number(e.target.value) || 0 }
                      setRates(next)
                    }}
                    className="tnum h-11 w-16 rounded-control border border-line bg-surface px-2 text-right text-small text-ink-1 outline-none focus:border-brand md:h-[38px]"
                  />
                </span>
              </label>
            ))}
          </div>
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
