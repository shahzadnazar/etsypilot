'use client'

import { useEffect, useMemo, useState } from 'react'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import {
  CALCULATIONS,
  SPECS,
  calculate,
  clipboardText,
  type CalculationKind,
} from '@/domain/calculator/engine'
import { cn } from '@/lib/utils/cn'

/*
 * The Simple Calculator.
 *
 * ONE component, rendered by both the in-app page and the public free-tool
 * page. Not two copies with a shared look: the free variant is an acquisition
 * surface, so it is the one most likely to drift, and a calculator that
 * disagrees with itself across two URLs is worse than not having the second URL.
 *
 * It computes on every keystroke — no Calculate button, because there is
 * nothing to wait for. The engine is pure arithmetic and the whole point of the
 * phase is that this stays fast.
 *
 * The formula under the result comes from the engine, not from this file. A
 * component that assembles its own formula string can render one that disagrees
 * with the number above it.
 */
export function SimpleCalculator({
  demo = false,
  initialKind = 'DISCOUNT',
  onResult,
}: {
  demo?: boolean
  initialKind?: CalculationKind
  /** The public page uses this to reveal its sign-up line after a result. */
  onResult?: (hasResult: boolean) => void
}) {
  const [kind, setKind] = useState<CalculationKind>(initialKind)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [copied, setCopied] = useState(false)

  const spec = SPECS[kind]
  const outcome = useMemo(() => calculate({ kind, a, b }), [kind, a, b])

  // Nothing typed yet is not an error. It is the starting state.
  const untouched = a.trim() === '' && b.trim() === ''
  const result = outcome.ok ? outcome.result : null
  const refusal = !outcome.ok && !untouched ? outcome.refusal : null

  /*
   * In an effect, not during render. Calling a parent's setState while
   * rendering a child throws "Cannot update a component while rendering a
   * different component" — the sign-up line on the public page is not worth a
   * render-phase side effect.
   */
  const hasResult = result !== null
  useEffect(() => {
    onResult?.(hasResult)
  }, [hasResult, onResult])

  function reset(): void {
    setA('')
    setB('')
    setCopied(false)
  }

  async function copy(): Promise<void> {
    if (!result) return
    try {
      await navigator.clipboard.writeText(clipboardText(result))
      setCopied(true)
    } catch {
      // Clipboard permission refused. Say nothing false — the button simply
      // does not claim success.
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-[18px]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="calc-kind" className="text-label text-muted-1">
            Calculation
          </label>
          <select
            id="calc-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as CalculationKind)
              setCopied(false)
            }}
            className="h-11 w-full rounded-control border border-line bg-surface px-3 text-body text-ink-1 md:h-[38px]"
          >
            {CALCULATIONS.map((k) => (
              <option key={k} value={k}>
                {SPECS[k].label}
              </option>
            ))}
          </select>
          <span className="text-caption text-muted-1">{spec.summary}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {spec.fields.map((field, index) => {
            const value = index === 0 ? a : b
            const setValue = index === 0 ? setA : setB
            const invalid = refusal?.field === field.key
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <label htmlFor={`calc-${field.key}`} className="text-label text-muted-1">
                  {field.label}
                </label>
                <div className="flex items-center gap-2">
                  {field.unit === 'CURRENCY' ? (
                    <span className="text-body text-muted-1" aria-hidden>
                      $
                    </span>
                  ) : null}
                  <input
                    id={`calc-${field.key}`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={value}
                    placeholder={field.placeholder}
                    aria-invalid={invalid || undefined}
                    aria-describedby={refusal ? 'calc-refusal' : undefined}
                    onChange={(event) => {
                      setValue(event.target.value)
                      setCopied(false)
                    }}
                    className={cn(
                      'tnum h-11 w-full rounded-control border bg-surface px-3 text-body text-ink-1 md:h-[38px]',
                      invalid ? 'border-danger' : 'border-line',
                    )}
                  />
                  {field.unit === 'PERCENT' ? (
                    <span className="text-body text-muted-1" aria-hidden>
                      %
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>

        {refusal ? (
          <p id="calc-refusal" role="alert" className="text-small" style={{ color: 'var(--danger)' }}>
            {refusal.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 rounded-card border border-line bg-canvas-soft p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-label text-muted-1">Result</span>
            {/*
              CALCULATED, always. The engine has no branch that returns
              anything else, and this badge is read from the result rather than
              written here (D49).
            */}
            <ProvenanceBadge
              type={result?.provenance ?? 'CALCULATED'}
              demo={demo}
              srDetail={result?.basis}
            />
          </div>

          {result ? (
            <>
              <Numeric className="text-metric text-ink-1">{result.display}</Numeric>
              {result.secondary ? (
                <span className="text-caption text-muted-1">{result.secondary}</span>
              ) : null}
              <Numeric className="text-caption text-muted-1">{result.formula}</Numeric>
            </>
          ) : (
            <>
              <span className="text-metric text-muted-1">—</span>
              <span className="text-caption text-muted-1">
                {untouched
                  ? `Enter ${spec.fields[0].label.toLowerCase()} and ${spec.fields[1].label.toLowerCase()}. The formula is ${spec.formulaShape}.`
                  : 'No result while the values above are incomplete.'}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copy}
            disabled={!result}
            className={cn(
              'h-11 rounded-control px-3 text-[12px] font-semibold md:h-[38px]',
              result
                ? 'bg-brand text-brand-on hover:bg-brand-strong'
                : 'cursor-not-allowed border border-line text-muted-1',
            )}
          >
            {copied ? 'Copied' : 'Copy result'}
          </button>
          <button
            type="button"
            onClick={reset}
            className="h-11 rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Reset
          </button>
          <span className="text-caption text-muted-1">
            Copying takes the formula too, not just the number.
          </span>
        </div>

        <p className="text-caption leading-relaxed text-muted-1">
          {result?.basis ?? 'Calculated from the values you enter. Not connected to your Etsy account.'}
        </p>
      </Card>

      <section aria-label="Quick calculations" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {CALCULATIONS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k)
              setCopied(false)
            }}
            className="text-left"
            aria-pressed={k === kind}
          >
            <Card
              className={cn(
                'flex h-full flex-col gap-1 p-[14px]',
                k === kind && 'border-brand bg-brand-tint',
              )}
            >
              <span className="text-small font-semibold text-ink-1">{SPECS[k].label}</span>
              <span className="text-caption leading-snug text-muted-1">{SPECS[k].summary}</span>
            </Card>
          </button>
        ))}
      </section>
    </div>
  )
}
