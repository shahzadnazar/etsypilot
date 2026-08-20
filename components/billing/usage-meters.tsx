/*
 * Usage meters.
 *
 * Each meter states what pauses at the limit AND what keeps working. The second
 * half is not padding: a limit that only says what stopped reads as a fault,
 * and a seller who thinks the product broke does not upgrade, they leave.
 */

import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import type { UsageMeter } from '@/domain/billing/usage'
import { formatCalendarDate } from '@/lib/utils/format'

export function UsageMeters({ meters }: { meters: UsageMeter[] }) {
  return (
    <section aria-label="Usage" className="grid gap-3 sm:grid-cols-2">
      {meters.map((m) => {
        const pct = m.limit > 0 ? Math.min(100, Math.round((m.used / m.limit) * 100)) : 0
        const atLimit = m.used >= m.limit
        return (
          <Card key={m.metric} className="flex flex-col gap-2 p-[14px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label text-muted-1">{m.label}</span>
              <Numeric className="text-small font-semibold text-ink-1">
                {m.used.toLocaleString('en-US')} / {m.limit.toLocaleString('en-US')}
              </Numeric>
            </div>

            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft"
              role="meter"
              aria-valuenow={m.used}
              aria-valuemin={0}
              aria-valuemax={m.limit}
              aria-label={`${m.label}: ${m.used} of ${m.limit} used`}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: atLimit ? 'var(--danger)' : 'var(--brand)' }}
              />
            </div>

            <span className="text-caption leading-snug text-muted-1">
              {m.resetsOn ? (
                <>Resets {formatCalendarDate(m.resetsOn)}. </>
              ) : null}
              At the limit: {m.pauses} {m.continues}
            </span>
          </Card>
        )
      })}
    </section>
  )
}
