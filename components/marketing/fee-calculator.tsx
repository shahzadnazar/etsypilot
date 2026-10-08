'use client'

import { useMemo, useState } from 'react'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { calculateFees } from '@/domain/fees/calculate'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SECOND INTERACTIVE PROOF. REAL FEE ARITHMETIC, NO SIGNUP.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * /tools/etsy-seller-calculator already exists behind the shell. This is the
 * same domain function — `calculateFees` from domain/fees/calculate.ts — run
 * in the page, so a visitor types a price and watches the arithmetic happen
 * without navigating away or creating an account.
 *
 * It is the same function and not a copy, which is the whole point: a
 * marketing calculator that reimplements the rates will disagree with the
 * product the week after Etsy changes one, and the visitor will find out by
 * being wrong in front of a customer.
 *
 * ── A CLIENT COMPONENT, AND NOTHING ELSE ON THE PAGE IS ───────────────────
 *
 * This needs state, so it ships JavaScript. Every other section on the page is
 * a server component and the motion is CSS, so this is the only interactive
 * bundle a visitor downloads. `calculateFees` is pure arithmetic over a rate
 * table — no network, no database, nothing server-only in its import graph.
 */

const PRESETS = [18, 24.5, 42, 85]

export function FeeCalculator() {
  const [price, setPrice] = useState('24.50')
  const [shipping, setShipping] = useState('0')
  const [offsiteAd, setOffsiteAd] = useState(false)

  const parsed = Number.parseFloat(price)
  const parsedShipping = Number.parseFloat(shipping)

  const breakdown = useMemo(
    () =>
      calculateFees({
        itemPrice: Number.isFinite(parsed) ? parsed : 0,
        shipping: Number.isFinite(parsedShipping) ? parsedShipping : 0,
        tax: 0,
        offsiteAd,
      }),
    [parsed, parsedShipping, offsiteAd],
  )

  const money = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

  return (
    <div
      className="overflow-hidden border"
      style={{
        borderColor: 'var(--border)',
        borderRadius: 'var(--paper-radius)',
        background: 'var(--surface)',
      }}
    >
      <div
        className="flex flex-wrap items-end gap-4 border-b px-4 py-3.5 md:px-5"
        style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
      >
        <label className="flex flex-col gap-1">
          <span className="mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--muted-1)' }}>
            Item price
          </span>
          <span
            className="flex items-center gap-1 border px-2"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', borderRadius: '3px' }}
          >
            <span className="figure text-[13px]" style={{ color: 'var(--muted-1)' }}>
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="figure h-9 w-24 bg-transparent text-[14px] outline-none"
              style={{ color: 'var(--ink-1)' }}
              aria-label="Item price in dollars"
            />
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--muted-1)' }}>
            Shipping charged
          </span>
          <span
            className="flex items-center gap-1 border px-2"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)', borderRadius: '3px' }}
          >
            <span className="figure text-[13px]" style={{ color: 'var(--muted-1)' }}>
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={shipping}
              onChange={(event) => setShipping(event.target.value)}
              className="figure h-9 w-20 bg-transparent text-[14px] outline-none"
              style={{ color: 'var(--ink-1)' }}
              aria-label="Shipping charged to the buyer, in dollars"
            />
          </span>
        </label>

        <label className="flex items-center gap-2 pb-1.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
          <input
            type="checkbox"
            checked={offsiteAd}
            onChange={(event) => setOffsiteAd(event.target.checked)}
            /*
             * 24px, not 16. WCAG 2.2 SC 2.5.8 is a minimum target of 24×24,
             * and tests/unit/tap-targets.test.ts enforces it across the
             * product — it caught this one the moment it was written.
             */
            className="h-6 w-6"
            style={{ accentColor: 'var(--brand)' }}
          />
          Sale came from an Etsy ad
        </label>

        <span className="ml-auto flex flex-wrap gap-1.5 pb-1">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setPrice(preset.toFixed(2))}
              className="figure border px-2 py-1 text-[11.5px]"
              style={{
                borderColor: 'var(--border)',
                borderRadius: '3px',
                background: 'var(--surface)',
                color: 'var(--ink-2)',
              }}
            >
              ${preset.toFixed(2)}
            </button>
          ))}
        </span>
      </div>

      <table className="w-full border-collapse">
        <caption className="sr-only">
          Etsy&rsquo;s fees on this sale, line by line, with the arithmetic for each.
        </caption>
        <tbody>
          {breakdown.lines.map((line) => (
            <tr key={line.key} className="fade-in border-t" style={{ borderColor: 'var(--border)' }}>
              <th
                scope="row"
                className="px-4 py-2.5 text-left text-[13px] font-medium md:px-5"
                style={{ color: 'var(--ink-2)' }}
              >
                {line.label}
                <span className="mono mt-0.5 block text-[11px]" style={{ color: 'var(--muted-1)' }}>
                  {line.formula}
                </span>
              </th>
              <td className="hidden px-2 py-2.5 align-middle sm:table-cell">
                {/*
                  * CALCULATED, not VERIFIED. These are Etsy's published rates
                  * applied to a number the visitor typed — the product's own
                  * rule (D32) is that dividing or multiplying demotes, and a
                  * rate table EtsyPilot cannot verify against Etsy's API is
                  * not a verified charge.
                  */}
                <ProvenanceBadge type="CALCULATED" demo={false} />
              </td>
              <td
                className="figure px-4 py-2.5 text-right align-middle text-[13.5px] md:px-5"
                style={{ color: line.amount === 0 ? 'var(--muted-1)' : 'var(--danger)' }}
              >
                {line.amount === 0 ? (
                  <span className="text-[12px]">$0.00</span>
                ) : (
                  <>
                    <span aria-hidden>({money(line.amount)})</span>
                    <span className="sr-only">minus {money(line.amount)}</span>
                  </>
                )}
              </td>
            </tr>
          ))}

          <tr className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}>
            <th
              scope="row"
              className="display px-4 py-3 text-left text-[15px] md:px-5"
              style={{ color: 'var(--ink-1)' }}
            >
              You keep
              <span className="mono mt-0.5 block text-[11px] font-normal" style={{ color: 'var(--muted-1)' }}>
                before your own costs — materials, labour, postage
              </span>
            </th>
            <td className="hidden sm:table-cell" />
            <td
              className="figure px-4 py-3 text-right text-[16px] font-semibold md:px-5"
              style={{ color: 'var(--ink-1)' }}
            >
              {money(breakdown.netToSeller)}
            </td>
          </tr>
        </tbody>
      </table>

      <div
        className="border-t px-4 py-3 text-[12px] leading-relaxed md:px-5"
        style={{ borderColor: 'var(--border)', color: 'var(--muted-1)' }}
      >
        {/*
          * The product's own limitations, read from the domain rather than
          * written here, so the page cannot claim more than the calculator
          * does. The rates carry the date they were recorded because Etsy
          * publishes no fee-rates endpoint — EtsyPilot cannot verify them
          * either, and says so rather than implying it can.
          */}
        Rates recorded {breakdown.effectiveFrom}. {breakdown.limitations[0]}
      </div>
    </div>
  )
}
