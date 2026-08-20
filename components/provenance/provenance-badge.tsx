import {
  Calculator,
  CircleSlash,
  Pencil,
  ShieldCheck,
  TrendingUp,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { PROVENANCE_LABEL, type ProvenanceType } from '@/lib/provenance/types'

/*
 * The provenance badge.
 *
 * Pill fills are literal hex, not tokens (D1/D10), so they hold in both themes.
 *
 * Every badge carries an icon AND a word - never colour alone (artboard 89).
 *
 * D11: in demo mode the dashed "Demo" chip REPLACES the badge entirely,
 * whatever the underlying provenance type, so a screenshot taken in demo mode
 * can never be mistaken for a real shop's figures. That override lives here
 * rather than at each call site, because it must not be possible to forget.
 */

type Variant = { bg: string; border: string; fg: string; icon: LucideIcon }

const VARIANTS: Record<ProvenanceType, Variant> = {
  VERIFIED: { bg: '#F0FDF4', border: '#BBF7D0', fg: '#166534', icon: ShieldCheck },
  CALCULATED: { bg: '#ECFEFF', border: '#A5F3FC', fg: '#0E7490', icon: Calculator },
  ESTIMATED: { bg: '#FFFBEB', border: '#FDE68A', fg: '#B45309', icon: TrendingUp },
  SELLER_INPUT: { bg: 'var(--canvas-soft)', border: '#CBD5E1', fg: 'var(--ink-2)', icon: Pencil },
  AI_DRAFT: { bg: '#F5F3FF', border: '#DDD6FE', fg: '#6D28D9', icon: Wand2 },
  UNAVAILABLE: {
    bg: 'var(--canvas-soft)',
    border: 'var(--border)',
    fg: 'var(--muted-1)',
    icon: CircleSlash,
  },
}

export interface ProvenanceBadgeProps {
  type: ProvenanceType
  /** When true, renders the Demo chip instead. See D11. */
  demo?: boolean
  className?: string
  /** Screen readers get the full sentence, not just the word. */
  srDetail?: string
}

export function ProvenanceBadge({ type, demo = false, className, srDetail }: ProvenanceBadgeProps) {
  if (demo) return <DemoChip className={className} />

  const variant = VARIANTS[type]
  const Icon = variant.icon
  const label = PROVENANCE_LABEL[type]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-normal',
        className,
      )}
      style={{ background: variant.bg, borderColor: variant.border, color: variant.fg }}
    >
      <Icon size={11} aria-hidden strokeWidth={2.4} />
      <span>{label}</span>
      {srDetail ? <span className="sr-only">: {srDetail}</span> : null}
    </span>
  )
}

/**
 * The dashed Demo chip. Dashed rather than filled so it reads as provisional
 * even in a greyscale screenshot.
 */
export function DemoChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-dashed px-2 py-0.5 text-[10px] font-semibold leading-normal',
        className,
      )}
      style={{
        background: 'var(--canvas-soft)',
        borderColor: 'var(--muted-2)',
        color: 'var(--muted-1)',
      }}
    >
      Demo
      <span className="sr-only">: figures from the demo shop, not a real Etsy shop</span>
    </span>
  )
}
