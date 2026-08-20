import { Card } from '@/components/ui/card'
import type { ScenarioComparison } from '@/domain/profit/scenarios'
import { SCENARIO_LABEL, type ScenarioKind } from '@/domain/profit/types'
import { formatPercent } from '@/lib/utils/format'
import { Money, Numeric } from '@/components/ui/numeric'
import { cn } from '@/lib/utils/cn'

/*
 * Three scenarios, side by side.
 *
 * Each states its basis alongside its number. A scenario labelled only
 * "Optimistic $5,610" invites the reader to treat it as a forecast; one that
 * says "costs low, sales up 8%" makes the assumption inspectable.
 */
export function ScenarioComparisonPanel({
  comparison,
  selected,
  currency,
  onSelect,
}: {
  comparison: ScenarioComparison[]
  selected: ScenarioKind
  currency: string
  onSelect?: (kind: ScenarioKind) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {comparison.map((s) => {
        const active = s.kind === selected
        const Wrapper = onSelect ? 'button' : 'div'
        return (
          <Wrapper
            key={s.kind}
            {...(onSelect ? { onClick: () => onSelect(s.kind), 'aria-pressed': active } : {})}
            className="text-left"
          >
            <Card
              className={cn(
                'flex h-full flex-col gap-2 p-[14px]',
                active && 'border-brand bg-brand-tint',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-label text-muted-1">{SCENARIO_LABEL[s.kind]}</span>
                {active ? (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-strong">
                    Showing
                  </span>
                ) : null}
              </div>
              <Money
                value={s.netProfit}
                currency={currency}
                className="text-[24px] font-semibold leading-none text-ink-1"
              />
              <Numeric className="text-caption text-muted-1">
                {formatPercent(s.marginPercent)} margin
              </Numeric>
              <span className="mt-auto pt-1 text-caption leading-snug text-muted-1">{s.basis}</span>
            </Card>
          </Wrapper>
        )
      })}
    </div>
  )
}
