'use client'

import { Fragment, useId, useMemo, useState } from 'react'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { calculateProductProfit } from '@/domain/product-profit/calculate'
import {
  DEFAULT_FEE_RATES,
  FEE_RULES_EFFECTIVE,
  FEE_RULES_SOURCE,
  type FeeRate,
} from '@/domain/fees/rules'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PUBLIC PROFIT CALCULATOR. ISSUE 2, ON THE PAGE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The approved design shipped a calculator with Etsy's fees written into the
 * markup as literals — `6.5%`, `$0.20`, `3% + $0.25` — beside a panel of fee
 * inputs that were rendered, focusable, editable, and bound to nothing. A
 * seller outside the United States could type their own processing rate, watch
 * the field accept it, and read a total that had ignored it.
 *
 * Three separate failures in one component, and they compound:
 *
 *   A RATE IS NOT A CONSTANT  Etsy changes its fees, and they differ by
 *                             country and by currency. A number baked into a
 *                             component is true until it is not, and nothing
 *                             in the markup says when it was recorded.
 *   AN INPUT THAT DOES        Worse than a disabled field. A control that
 *   NOTHING LIES TWICE        accepts a value implies the value was used, so
 *                             the wrong answer arrives wearing the seller's
 *                             own correction.
 *   A CLAMPED LOSS READS      `Math.max(0, netProfit)` renders a product that
 *   AS BREAK-EVEN             loses $6 a sale as "$0.00", and a seller reading
 *                             that keeps selling it.
 *
 * ── WHAT THIS DOES INSTEAD ───────────────────────────────────────────────
 *
 * It owns no arithmetic. Every figure on the panel comes from
 * `calculateProductProfit` — the same domain function the product's own
 * /tools calculator runs, over the same editable rate table from
 * domain/fees/rules.ts, which carries the date it was recorded and the
 * country it was recorded for. This component parses strings, hands numbers
 * over, and renders what comes back.
 *
 * That split is what makes `tests/unit/product-profit.test.ts` worth
 * anything: its ten cases — positive, negative, break-even, zero price,
 * missing optional costs, altered rates, the ads toggle both ways, invalid
 * input, the margin, the rounding — test the arithmetic a visitor sees,
 * because there is no second copy of it here.
 *
 * ── THE FIGURES ARE LABELLED "ESTIMATED", NOT "YOUR PROFIT" ───────────────
 *
 * Nothing here was read from Etsy. These are published rates applied to
 * numbers a stranger typed, which under the product's own provenance rules
 * (D32: dividing or multiplying demotes) is CALCULATED at best and never
 * VERIFIED. The limitations come back from the domain with the result, so the
 * panel cannot show a figure without them.
 */

/* ── money in, money out ──────────────────────────────────────────────── */

/*
 * A keystroke is accepted only if the field still parses as money afterwards.
 * Empty is allowed — a seller clearing a field is mid-edit, not entering a
 * letter — and read as zero, which is what an absent cost is here.
 *
 * This is the first line of defence and not the only one: `amount()` in the
 * domain treats a NaN or an Infinity that reaches it as zero, because the next
 * caller of that function will not be this component.
 */
/*
 * What Etsy's own rate table says about Offsite Ads, for the checkbox's label.
 * One source for the percentages, shared with the arithmetic that applies them.
 */
const OFFSITE_NOTE =
  DEFAULT_FEE_RATES.find((rate) => rate.key === 'offsite')?.note ??
  'Charged only on orders Etsy attributed to one of its ads.'

const MONEY = /^\d*(\.\d{0,2})?$/
const WHOLE = /^\d*$/
const RATE = /^\d*(\.\d{0,3})?$/

const num = (raw: string) => {
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

/*
 * A loss prints as −$6.12 rather than ($6.12). Accounting parentheses are a
 * convention a bookkeeper reads and a first-time seller does not, and the one
 * thing this panel may not be ambiguous about is the sign.
 */
const signedMoney = (n: number) => (n < 0 ? `−${money(Math.abs(n))}` : money(n))

/* ── the form's own shape ─────────────────────────────────────────────── */

interface FieldSpec {
  key: keyof typeof INITIAL
  label: string
  hint: string
  prefix?: string
  suffix?: string
  pattern: RegExp
}

const INITIAL = {
  price: '42.00',
  shippingCharged: '5.00',
  materials: '12.50',
  packaging: '1.20',
  shippingCost: '6.40',
  minutes: '25',
  hourlyRate: '20.00',
  otherCosts: '0.00',
}

const WHAT_THE_BUYER_PAYS: FieldSpec[] = [
  {
    key: 'price',
    label: 'Item price',
    hint: 'What the listing sells for.',
    prefix: '$',
    pattern: MONEY,
  },
  {
    key: 'shippingCharged',
    label: 'Shipping you charge',
    hint: 'Zero if you offer free shipping.',
    prefix: '$',
    pattern: MONEY,
  },
]

const WHAT_IT_COSTS_YOU: FieldSpec[] = [
  {
    key: 'materials',
    label: 'Product cost',
    hint: 'Materials, or what you paid for the item.',
    prefix: '$',
    pattern: MONEY,
  },
  {
    key: 'packaging',
    label: 'Packaging',
    hint: 'Boxes, labels, inserts, tissue.',
    prefix: '$',
    pattern: MONEY,
  },
  {
    key: 'shippingCost',
    label: 'Shipping you pay',
    hint: 'Rarely the same as what you charge.',
    prefix: '$',
    pattern: MONEY,
  },
  {
    key: 'minutes',
    label: 'Your time',
    hint: 'Minutes per unit, making and packing.',
    suffix: 'min',
    pattern: WHOLE,
  },
  {
    key: 'hourlyRate',
    label: 'Your hourly rate',
    hint: 'What an hour of your work is worth.',
    prefix: '$',
    pattern: MONEY,
  },
  {
    key: 'otherCosts',
    label: 'Other costs',
    hint: 'Anything else this sale costs you.',
    prefix: '$',
    pattern: MONEY,
  },
]

export function ProfitCalculator() {
  const [form, setForm] = useState(INITIAL)
  const [offsiteAd, setOffsiteAd] = useState(false)
  const [showRates, setShowRates] = useState(false)
  /*
   * The rate table is held as strings, exactly like the money fields, so a
   * seller can clear a field and type into it. It starts as a copy of the
   * published set and is converted back to numbers on every render.
   */
  const [rates, setRates] = useState(() =>
    DEFAULT_FEE_RATES.map((rate) => ({
      key: rate.key,
      percent: (rate.percent * 100).toString(),
      flat: rate.flat.toFixed(2),
    })),
  )

  const ratesId = useId()
  const edited = rates.some((row, index) => {
    const published = DEFAULT_FEE_RATES[index]
    if (!published) return true
    return num(row.percent) / 100 !== published.percent || num(row.flat) !== published.flat
  })

  const feeRates: FeeRate[] = useMemo(
    () =>
      DEFAULT_FEE_RATES.map((published, index) => {
        const row = rates[index]
        if (!row) return published
        return { ...published, percent: num(row.percent) / 100, flat: num(row.flat) }
      }),
    [rates],
  )

  const result = useMemo(
    () =>
      calculateProductProfit({
        price: num(form.price),
        shippingCharged: num(form.shippingCharged),
        materials: num(form.materials),
        packaging: num(form.packaging),
        shippingCost: num(form.shippingCost),
        minutes: num(form.minutes),
        hourlyRate: num(form.hourlyRate),
        otherCosts: num(form.otherCosts),
        offsiteAd,
        rates: feeRates,
      }),
    [form, offsiteAd, feeRates],
  )

  const loss = result.profit < 0
  /*
   * One token for the outcome, used for the figure, the margin and the rule
   * under them — so the three cannot disagree about which way this went. The
   * text tokens, not the mark tokens: `--success-mark` (#10B981) is 2.5:1 on
   * white and fails SC 1.4.3 as text. See DESIGN.md.
   */
  const outcome = loss ? 'var(--danger)' : 'var(--success)'

  const set = (key: keyof typeof INITIAL, pattern: RegExp) => (value: string) => {
    if (!pattern.test(value)) return
    setForm((current) => ({ ...current, [key]: value }))
  }

  return (
    <div
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)]"
      style={{ alignItems: 'start' }}
    >
      {/* ── the inputs ───────────────────────────────────────────────── */}
      <div
        className="border"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          borderRadius: 'var(--card-radius)',
        }}
      >
        <FieldGroup
          title="What the buyer pays"
          fields={WHAT_THE_BUYER_PAYS}
          form={form}
          onChange={set}
        />
        <FieldGroup
          title="What it costs you"
          fields={WHAT_IT_COSTS_YOU}
          form={form}
          onChange={set}
        />

        <div className="border-t px-4 py-3.5" style={{ borderColor: 'var(--border)' }}>
          <label className="flex items-start gap-2.5 text-[13px]" style={{ color: 'var(--ink-2)' }}>
            <input
              type="checkbox"
              checked={offsiteAd}
              onChange={(event) => setOffsiteAd(event.target.checked)}
              /* 24px: WCAG 2.2 SC 2.5.8, enforced across the product by
                 tests/unit/tap-targets.test.ts. */
              className="mt-px h-6 w-6 shrink-0"
              style={{ accentColor: 'var(--brand)' }}
            />
            <span>
              This sale came from an Etsy ad
              {/*
                * This sentence is READ FROM THE RATE TABLE, not written here.
                *
                * It names the two percentages Etsy charges, and a percentage
                * typed into a component is the whole of ISSUE 2 in miniature:
                * the day Etsy changes it, the arithmetic moves with
                * domain/fees/rules.ts and the copy beside it does not.
                * tests/unit/landing-page.test.ts sweeps this file for a
                * published rate and would fail on the literal.
                */}
              <span className="mt-0.5 block text-[11.5px]" style={{ color: 'var(--muted-1)' }}>
                {OFFSITE_NOTE} Set your rate under Fee assumptions and this figure moves.
              </span>
            </span>
          </label>
        </div>

        {/* ── the rates, which are inputs and not decoration ─────────── */}
        <div className="border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            aria-expanded={showRates}
            aria-controls={ratesId}
            onClick={() => setShowRates((open) => !open)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold"
            style={{ color: 'var(--brand-strong)', minHeight: '44px' }}
          >
            <span aria-hidden className="text-[10px]">
              {showRates ? '▴' : '▾'}
            </span>
            Fee assumptions
            <span className="font-normal" style={{ color: 'var(--muted-1)' }}>
              {edited ? '· edited by you' : `· ${FEE_RULES_SOURCE}`}
            </span>
          </button>

          {showRates ? (
            <div
              id={ratesId}
              className="border-t px-4 py-3.5"
              style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
            >
              <p className="text-[12px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                Recorded {FEE_RULES_EFFECTIVE} from {FEE_RULES_SOURCE}. Etsy publishes no endpoint
                for its own fee schedule, so these are a dated assumption rather than a figure this
                site can verify — and they differ by country. Change any of them and every number on
                the right recalculates.
              </p>

              <div className="mt-3 flex flex-col gap-3">
                {DEFAULT_FEE_RATES.map((published, index) => {
                  const row = rates[index]
                  if (!row) return null
                  return (
                    <div key={published.key} className="flex flex-wrap items-end gap-2.5">
                      <span className="min-w-[9.5rem] flex-1">
                        <span
                          className="block text-[12.5px] font-semibold"
                          style={{ color: 'var(--ink-1)' }}
                        >
                          {published.label}
                        </span>
                        <span
                          className="mt-0.5 block text-[11px] leading-snug"
                          style={{ color: 'var(--muted-1)' }}
                        >
                          {published.basis}
                        </span>
                      </span>
                      <RateInput
                        label={`${published.label} percentage`}
                        suffix="%"
                        value={row.percent}
                        onChange={(value) => {
                          if (!RATE.test(value)) return
                          setRates((current) =>
                            current.map((item, i) =>
                              i === index ? { ...item, percent: value } : item,
                            ),
                          )
                        }}
                      />
                      <RateInput
                        label={`${published.label} flat amount`}
                        prefix="$"
                        value={row.flat}
                        onChange={(value) => {
                          if (!MONEY.test(value)) return
                          setRates((current) =>
                            current.map((item, i) => (i === index ? { ...item, flat: value } : item)),
                          )
                        }}
                      />
                    </div>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() =>
                  setRates(
                    DEFAULT_FEE_RATES.map((rate) => ({
                      key: rate.key,
                      percent: (rate.percent * 100).toString(),
                      flat: rate.flat.toFixed(2),
                    })),
                  )
                }
                disabled={!edited}
                className="mt-3.5 border px-3 text-[12.5px] font-semibold"
                style={{
                  borderColor: 'var(--border-strong)',
                  background: 'var(--surface)',
                  color: edited ? 'var(--ink-1)' : 'var(--muted-2)',
                  borderRadius: 'var(--paper-radius)',
                  minHeight: '36px',
                }}
              >
                Reset to the published rates
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── the outcome ──────────────────────────────────────────────── */}
      <div
        className="border"
        style={{
          borderColor: loss ? 'var(--danger-border)' : 'var(--border)',
          background: 'var(--surface)',
          borderRadius: 'var(--card-radius)',
        }}
      >
        <div
          className="px-4 py-4"
          style={{ background: loss ? 'var(--danger-surface)' : 'var(--success-surface)' }}
        >
          <span
            className="mono flex items-center gap-2 text-[10.5px] uppercase tracking-[0.07em]"
            style={{ color: 'var(--muted-1)' }}
          >
            Estimated net profit
            <ProvenanceBadge
              type="CALCULATED"
              demo={false}
              srDetail="Calculated from the numbers you entered and the fee rates shown, not read from Etsy."
            />
          </span>
          {/*
            * The sign is rendered, never clamped. `calculateProductProfit`
            * returns a negative number for a product that loses money and this
            * prints it — the colour is the second signal and the minus sign is
            * the first, because colour alone is not a message (SC 1.4.1).
            */}
          <span
            className="figure mt-1.5 block text-[30px] font-semibold leading-none"
            style={{ color: outcome }}
            data-outcome={loss ? 'loss' : 'profit'}
          >
            {signedMoney(result.profit)}
          </span>
          <span className="mt-2 block text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
            {result.marginPercent === null ? (
              /* No revenue is not a 0% margin. A margin is a share OF
                 something, and there is nothing to be a share of. */
              <>No margin to report — nothing was sold at this price.</>
            ) : (
              <>
                <span className="figure font-semibold" style={{ color: outcome }}>
                  {result.marginPercent.toFixed(1)}%
                </span>{' '}
                margin on the {money(result.revenue)} the buyer pays
              </>
            )}
          </span>
        </div>

        {result.warning ? (
          <p
            className="border-y px-4 py-2.5 text-[12.5px] font-semibold leading-snug"
            style={{
              borderColor: 'var(--danger-border)',
              background: 'var(--danger-surface)',
              color: 'var(--danger)',
            }}
          >
            {result.warning}
          </p>
        ) : null}

        <table className="w-full border-collapse">
          <caption className="sr-only">
            Every fee and cost subtracted from what the buyer pays, with the arithmetic for each.
          </caption>
          <tbody>
            <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
              <th
                scope="row"
                className="px-4 py-2 text-left text-[12.5px] font-semibold"
                style={{ color: 'var(--ink-1)' }}
              >
                What the buyer pays
              </th>
              <td
                className="figure px-4 py-2 text-right text-[13px] font-semibold"
                style={{ color: 'var(--ink-1)' }}
              >
                {money(result.revenue)}
              </td>
            </tr>

            {result.lines.map((line) => (
              <Fragment key={line.key}>
                <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <th
                    scope="row"
                    className="px-4 py-2 text-left text-[12.5px] font-normal"
                    style={{ color: 'var(--ink-2)' }}
                  >
                    {line.label}
                    <span className="mono mt-0.5 block text-[10.5px]" style={{ color: 'var(--muted-1)' }}>
                      {line.formula}
                    </span>
                  </th>
                  <td
                    className="figure px-4 py-2 align-top text-right text-[13px]"
                    style={{
                      color: line.amount === 0 ? 'var(--muted-1)' : 'var(--ink-1)',
                      /* U+2212 is a character like any other, and the browser
                         will break a line after it — which rendered "−" above
                         "$12.50" on two lines in a narrow column, and a minus
                         sign separated from its amount is the one typographic
                         accident this panel cannot afford. */
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span aria-hidden>{line.amount === 0 ? money(0) : `−${money(line.amount)}`}</span>
                    <span className="sr-only">
                      {line.amount === 0 ? money(0) : `minus ${money(line.amount)}`}
                    </span>
                  </td>
                </tr>

                {/*
                  * ── THE FEE ROW IS THE ONE WORTH OPENING ────────────────
                  *
                  * "Etsy fees" as a single figure is the right shape beside
                  * materials and postage, and it is also the one line a seller
                  * cannot check. It is three or four rates on three DIFFERENT
                  * bases — the transaction fee on item plus the postage you
                  * charge, processing on the whole of what the buyer paid,
                  * the listing fee on neither — which is why "6.5% of the
                  * price", the sum sellers do by hand, is always too low.
                  *
                  * So every rate gets its own row with its own arithmetic in
                  * it, read from the same result rather than recomputed here.
                  * This is the content the page's previous fee-only
                  * calculator carried, now inside the one that also subtracts
                  * the seller's own costs.
                  */}
                {line.key === 'fees'
                  ? result.feeLines.map((fee) => (
                      <tr key={fee.key} style={{ background: 'var(--canvas-soft)' }}>
                        <th
                          scope="row"
                          className="py-1 pl-7 pr-4 text-left text-[11.5px] font-normal"
                          style={{ color: 'var(--muted-1)' }}
                        >
                          {fee.label}
                          <span className="mono ml-1.5 text-[10.5px]">· {fee.formula}</span>
                        </th>
                        <td
                          className="figure px-4 py-1 text-right text-[11.5px]"
                          style={{ color: 'var(--muted-1)', whiteSpace: 'nowrap' }}
                        >
                          {fee.amount === 0 ? money(0) : `−${money(fee.amount)}`}
                        </td>
                      </tr>
                    ))
                  : null}
              </Fragment>
            ))}

            <tr
              className="border-t"
              style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
            >
              <th
                scope="row"
                className="px-4 py-2 text-left text-[12.5px] font-semibold"
                style={{ color: 'var(--ink-1)' }}
              >
                Total fees and costs
              </th>
              <td
                className="figure px-4 py-2 text-right text-[13px] font-semibold"
                style={{ color: 'var(--ink-1)', whiteSpace: 'nowrap' }}
              >
                −{money(result.totalCosts)}
              </td>
            </tr>

            <tr className="border-t" style={{ borderColor: 'var(--border)' }}>
              <th
                scope="row"
                className="px-4 py-2 text-left text-[12.5px] font-normal"
                style={{ color: 'var(--ink-2)' }}
              >
                Break-even price
                <span className="mono mt-0.5 block text-[10.5px]" style={{ color: 'var(--muted-1)' }}>
                  where profit reaches zero, at these costs
                </span>
              </th>
              <td
                className="figure px-4 py-2 align-top text-right text-[13px]"
                style={{ color: 'var(--ink-1)' }}
              >
                {money(result.breakEvenPrice)}
              </td>
            </tr>
          </tbody>
        </table>

        {/*
          * The limitations come back FROM the domain with the result, so this
          * panel cannot print a figure while omitting what it does not cover.
          */}
        <ul
          className="flex flex-col gap-1.5 border-t px-4 py-3 text-[11.5px] leading-relaxed"
          style={{ borderColor: 'var(--border)', color: 'var(--muted-1)' }}
        >
          {result.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ── pieces ───────────────────────────────────────────────────────────── */

function FieldGroup({
  title,
  fields,
  form,
  onChange,
}: {
  title: string
  fields: FieldSpec[]
  form: typeof INITIAL
  onChange: (key: keyof typeof INITIAL, pattern: RegExp) => (value: string) => void
}) {
  return (
    <fieldset className="border-b px-4 py-3.5" style={{ borderColor: 'var(--border)' }}>
      <legend
        className="mono text-[10.5px] uppercase tracking-[0.07em]"
        style={{ color: 'var(--muted-1)' }}
      >
        {title}
      </legend>
      <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <MoneyField
            key={field.key}
            spec={field}
            value={form[field.key]}
            onChange={onChange(field.key, field.pattern)}
          />
        ))}
      </div>
    </fieldset>
  )
}

function MoneyField({
  spec,
  value,
  onChange,
}: {
  spec: FieldSpec
  value: string
  onChange: (value: string) => void
}) {
  const id = useId()

  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
        {spec.label}
      </label>
      <span
        className="mt-1 flex items-center gap-1 border px-2"
        style={{
          borderColor: 'var(--border-strong)',
          background: 'var(--surface)',
          borderRadius: 'var(--paper-radius)',
        }}
      >
        {spec.prefix ? (
          <span aria-hidden className="figure text-[13px]" style={{ color: 'var(--muted-1)' }}>
            {spec.prefix}
          </span>
        ) : null}
        {/*
          * `type="text"` with `inputMode="decimal"`, deliberately. A
          * number input's value is the empty string for anything the browser
          * considers invalid, which means a typo silently becomes zero and the
          * field cannot be guarded — and its spinners are a 12px target. The
          * pattern above does the guarding instead, and the keypad is the
          * numeric one either way.
          */}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={`${id}-hint`}
          className="figure w-full bg-transparent text-[14px] outline-none"
          style={{ color: 'var(--ink-1)', minHeight: '42px' }}
        />
        {spec.suffix ? (
          <span aria-hidden className="mono text-[11px]" style={{ color: 'var(--muted-1)' }}>
            {spec.suffix}
          </span>
        ) : null}
      </span>
      <span
        id={`${id}-hint`}
        className="mt-1 block text-[11px] leading-snug"
        style={{ color: 'var(--muted-1)' }}
      >
        {spec.hint}
      </span>
    </div>
  )
}

function RateInput({
  label,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  prefix?: string
  suffix?: string
}) {
  return (
    <span
      className="flex items-center gap-1 border px-2"
      style={{
        borderColor: 'var(--border-strong)',
        background: 'var(--surface)',
        borderRadius: 'var(--paper-radius)',
      }}
    >
      {prefix ? (
        <span aria-hidden className="figure text-[12px]" style={{ color: 'var(--muted-1)' }}>
          {prefix}
        </span>
      ) : null}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="figure w-[4.5rem] bg-transparent text-[13px] outline-none"
        style={{ color: 'var(--ink-1)', minHeight: '38px' }}
      />
      {suffix ? (
        <span aria-hidden className="mono text-[11px]" style={{ color: 'var(--muted-1)' }}>
          {suffix}
        </span>
      ) : null}
    </span>
  )
}
