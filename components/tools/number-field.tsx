'use client'

/*
 * One numeric field, shared by every tool.
 *
 * Extracted after the second copy appeared. The behaviour worth keeping in one
 * place is the input filter: a keystroke that would not parse is REFUSED
 * rather than accepted and rendered as NaN. A calculator that shows NaN has
 * told the seller their input was fine and the arithmetic was not.
 */
const NUMBER = /^\d*\.?\d*$/

export function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  prefix?: string
  suffix?: string
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption font-semibold text-ink-2">{label}</span>
      <span className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
        {prefix ? <span className="shrink-0 text-small text-muted-1">{prefix}</span> : null}
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            if (NUMBER.test(e.target.value)) onChange(e.target.value)
          }}
          className="tnum h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
        />
        {suffix ? <span className="shrink-0 text-small text-muted-1">{suffix}</span> : null}
      </span>
      {hint ? <span className="text-caption leading-relaxed text-muted-1">{hint}</span> : null}
    </label>
  )
}
