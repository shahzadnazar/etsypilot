'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { NumberField } from './number-field'
import { calculateProductProfit } from '@/domain/product-profit/calculate'
import { formatSignedCurrency } from '@/lib/utils/format'

/*
 * One product, end to end.
 *
 * The same eight-cost discipline as Profit Reality, for a single item and with
 * nothing read from Etsy — so a seller can price something before it exists.
 *
 * Your time is a field with a default rate in it, not an optional extra. A
 * handmade seller who omits labour concludes a product is profitable while
 * paying themselves below minimum wage, and that conclusion is the thing this
 * tool is for correcting.
 */
export function ProductProfit() {
  const [price, setPrice] = useState('32.00')
  const [shippingCharged, setShippingCharged] = useState('5.00')
  const [materials, setMaterials] = useState('8.50')
  const [packaging, setPackaging] = useState('1.20')
  const [shippingCost, setShippingCost] = useState('6.40')
  const [minutes, setMinutes] = useState('25')
  const [hourlyRate, setHourlyRate] = useState('20')

  const result = useMemo(
    () =>
      calculateProductProfit({
        price: Number(price) || 0,
        shippingCharged: Number(shippingCharged) || 0,
        materials: Number(materials) || 0,
        packaging: Number(packaging) || 0,
        shippingCost: Number(shippingCost) || 0,
        minutes: Number(minutes) || 0,
        hourlyRate: Number(hourlyRate) || 0,
      }),
    [price, shippingCharged, materials, packaging, shippingCost, minutes, hourlyRate],
  )

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <Card className="flex w-full flex-col gap-3 p-[18px] lg:w-[340px] lg:shrink-0">
        <h2 className="text-section text-ink-1">This product</h2>
        <NumberField label="Your price" value={price} onChange={setPrice} prefix="$" />
        <NumberField label="Shipping you charge" value={shippingCharged} onChange={setShippingCharged} prefix="$" />
        <NumberField label="Materials" value={materials} onChange={setMaterials} prefix="$" />
        <NumberField label="Packaging" value={packaging} onChange={setPackaging} prefix="$" />
        <NumberField
          label="Postage you actually pay"
          value={shippingCost}
          onChange={setShippingCost}
          prefix="$"
          hint="Rarely the same as what you charge."
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="Minutes per unit" value={minutes} onChange={setMinutes} />
          <NumberField label="Your hourly rate" value={hourlyRate} onChange={setHourlyRate} prefix="$" />
        </div>
      </Card>

      <div className="flex w-full min-w-0 flex-col gap-3">
        <Card className="p-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-section text-ink-1">What you keep</h2>
            <ProvenanceBadge type="CALCULATED" />
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            <Numeric
              className={result.profit < 0 ? 'text-metric text-danger' : 'text-metric text-ink-1'}
            >
              {formatSignedCurrency(result.profit)}
            </Numeric>
            <span className="text-caption text-muted-1">
              per sale ·{' '}
              {result.marginPercent === null ? 'no margin without revenue' : `${result.marginPercent}% margin`}
            </span>
          </div>

          {/*
            * A loss is stated in words, not left to be inferred from a minus
            * sign. This is the one sentence a seller most needs to read.
            */}
          {result.warning ? (
            <p
              role="alert"
              className="mt-2 rounded-card border p-3 text-small leading-relaxed"
              style={{
                background: 'var(--danger-surface)',
                borderColor: 'var(--danger-border)',
                color: 'var(--danger-ink)',
              }}
            >
              {result.warning} You would need to charge at least{' '}
              {formatSignedCurrency(result.breakEvenPrice)} to break even.
            </p>
          ) : (
            <p className="mt-2 text-small leading-relaxed text-ink-2">
              Break-even price at these costs is {formatSignedCurrency(result.breakEvenPrice)} —
              below that, each sale costs you money.
            </p>
          )}

          <div
            tabIndex={0}
            role="region"
            aria-label="Cost breakdown, scrolls horizontally"
            className="mt-3 overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <table className="w-full border-collapse text-small">
              <tbody>
                <tr className="border-b border-line">
                  <td className="py-2 pr-3 font-semibold text-ink-1">The buyer pays</td>
                  <td className="py-2 pr-3 text-muted-1">price + shipping</td>
                  <td className="py-2 text-right">
                    <Numeric className="font-semibold text-ink-1">
                      {formatSignedCurrency(result.revenue)}
                    </Numeric>
                  </td>
                </tr>
                {result.lines.map((line) => (
                  <tr key={line.key} className="border-b border-line">
                    <td className="py-2 pr-3 text-ink-2">{line.label}</td>
                    <td className="py-2 pr-3 text-caption text-muted-1">{line.formula}</td>
                    <td className="py-2 text-right">
                      <Numeric className="text-ink-1">
                        {formatSignedCurrency(line.amount, 'USD', { negate: line.amount > 0 })}
                      </Numeric>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
