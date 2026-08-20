import { CircleSlash, HelpCircle, Link2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { DIAGNOSIS_LABEL, type Diagnosis } from '@/lib/events/types'

/*
 * The diagnosis badge (D4).
 *
 * Provenance answers where a number came from. Diagnosis answers whether an
 * event explains a change. They must never be confused - so these are 6px
 * rectangles with a leading 3px rule, never 999px pills.
 *
 * A diagnosis is never shown without the evidence panel that produced it. The
 * badge is an entry point, not a verdict.
 */

type Variant = {
  bg: string
  border: string
  rule: string
  fg: string
  icon: LucideIcon
  dashed: boolean
}

const VARIANTS: Record<Diagnosis, Variant> = {
  CORRELATED: {
    bg: 'var(--brand-tint)',
    border: 'var(--brand)',
    rule: 'var(--brand)',
    fg: 'var(--brand-strong)',
    icon: Link2,
    dashed: false,
  },
  RULED_OUT: {
    bg: 'var(--canvas-soft)',
    border: '#CBD5E1',
    rule: 'var(--muted-1)',
    fg: 'var(--muted-1)',
    icon: CircleSlash,
    dashed: false,
  },
  UNKNOWN: {
    bg: 'transparent',
    border: 'var(--muted-2)',
    rule: 'var(--muted-2)',
    fg: 'var(--muted-1)',
    icon: HelpCircle,
    dashed: true,
  },
}

export function DiagnosisBadge({
  diagnosis,
  className,
}: {
  diagnosis: Diagnosis
  className?: string
}) {
  const v = VARIANTS[diagnosis]
  const Icon = v.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-[7px] rounded-[6px] py-[5px] pl-2 pr-2.5 text-[10.5px] font-semibold uppercase leading-none tracking-[0.07em]',
        className,
      )}
      style={{
        background: v.bg,
        border: `1px ${v.dashed ? 'dashed' : 'solid'} ${v.border}`,
        borderLeft: `3px solid ${v.rule}`,
        color: v.fg,
      }}
    >
      <Icon size={13} aria-hidden strokeWidth={2.2} />
      {DIAGNOSIS_LABEL[diagnosis]}
    </span>
  )
}
