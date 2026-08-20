import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { MissingDataItem } from '@/domain/profit/types'
import { Money } from '@/components/ui/numeric'
import { cn } from '@/lib/utils/cn'

/*
 * Missing data.
 *
 * Rendered inside the panel, at full weight — incomplete coverage is a state
 * this product is designed for, not an error it apologises for in small print.
 *
 * Every gap carries a way out. Even the one EtsyPilot cannot close (Etsy does
 * not expose ad spend per listing) offers the explanation, so no row is a dead
 * end.
 */
export function MissingDataPanel({
  items,
  currency,
}: {
  items: MissingDataItem[]
  currency: string
}) {
  if (items.length === 0) {
    return (
      <Card className="p-[18px] text-small text-ink-2">
        Every order in this period has a confirmed cost. Nothing is excluded.
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-[18px]">
        <h3 className="text-section text-ink-1">Missing data</h3>
        <p className="mt-1 text-caption text-muted-1">
          What is not counted, and what it would take to count it.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-line">
        {items.map((item) => (
          <li key={item.code} className="flex flex-col gap-2 p-[18px]">
            <span className="text-small font-semibold text-ink-1">{item.title}</span>
            <span className="text-small leading-relaxed text-ink-2">{item.detail}</span>

            {item.affectedValue !== undefined ? (
              <span className="text-caption text-muted-1">
                <Money value={item.affectedValue} currency={currency} /> of order value affected
              </span>
            ) : null}

            <div className="mt-0.5 flex flex-wrap gap-2">
              {item.resolutions.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className={cn(
                    'rounded-control px-2.5 py-1.5 text-[11.5px] font-semibold',
                    r.kind === 'PRIMARY'
                      ? 'bg-brand text-white hover:bg-brand-strong'
                      : 'border border-line text-ink-2 hover:bg-canvas-soft',
                  )}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
