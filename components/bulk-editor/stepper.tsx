import { Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/*
 * The workflow, made visible (artboard 40, design.md §12).
 *
 * Showing all five steps at all times is the point: the seller can see that
 * validation and review stand between them and a live change, before they have
 * configured anything.
 */
export const BULK_STEPS = [
  'Select listings',
  'Choose fields',
  'Configure',
  'Validate',
  'Review & publish',
] as const

export function BulkStepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2" aria-label="Bulk edit progress">
      {BULK_STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex items-center gap-2 rounded-control px-2.5 py-1.5 text-[12px]',
                active && 'bg-brand-tint font-semibold text-brand-strong',
                done && 'text-ink-2',
                !active && !done && 'text-muted-1',
              )}
              aria-current={active ? 'step' : undefined}
            >
              <span
                className={cn(
                  'tnum flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold',
                  active && 'bg-brand text-white',
                  done && 'bg-success text-white',
                  !active && !done && 'border border-line text-muted-1',
                )}
              >
                {done ? <Check size={11} strokeWidth={3} aria-hidden /> : i + 1}
              </span>
              {label}
              {done ? <span className="sr-only">(complete)</span> : null}
            </span>
            {i < BULK_STEPS.length - 1 ? (
              <span aria-hidden className="h-px w-4 bg-line" />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
