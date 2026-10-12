/*
 * Usage meters.
 *
 * Each meter states what pauses at the limit AND what keeps working. The second
 * half is not padding: a limit that only says what stopped reads as a fault,
 * and a seller who thinks the product broke does not upgrade, they leave.
 *
 * A NULL LIMIT IS NOT A LIMIT OF ZERO. It means no plan is in force, because
 * nobody can pay on this deployment yet (lib/billing/index.ts). There is then
 * no bar to fill and nothing to pause, so the meter renders the count alone and
 * says so — rather than a full red bar, which is what `used >= 0` would have
 * drawn for every seller.
 */

import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import type { UsageMeter } from '@/domain/billing/usage'
import { formatCalendarDate } from '@/lib/utils/format'

export function UsageMeters({ meters }: { meters: UsageMeter[] }) {
  return (
    <section aria-label="Usage" className="grid gap-3 sm:grid-cols-2">
      {meters.map((m) => {
        const limit = m.limit
        const pct = limit !== null && limit > 0 ? Math.min(100, Math.round((m.used / limit) * 100)) : 0
        const atLimit = limit !== null && m.used >= limit
        return (
          <Card key={m.metric} className="flex flex-col gap-2 p-[14px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label text-muted-1">{m.label}</span>
              <Numeric className="text-small font-semibold text-ink-1">
                {limit === null
                  ? m.used.toLocaleString('en-US')
                  : `${m.used.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')}`}
              </Numeric>
            </div>

            {limit === null ? null : (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft"
                role="meter"
                aria-valuenow={m.used}
                aria-valuemin={0}
                aria-valuemax={limit}
                aria-label={`${m.label}: ${m.used} of ${limit} used`}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: atLimit ? 'var(--danger)' : 'var(--brand)' }}
                />
              </div>
            )}

            <span className="text-caption leading-snug text-muted-1">
              {m.resetsOn ? <>Resets {formatCalendarDate(m.resetsOn)}. </> : null}
              {limit === null
                ? 'No plan limits this yet, so nothing pauses.'
                : `At the limit: ${m.pauses} ${m.continues}`}
            </span>
          </Card>
        )
      })}
    </section>
  )
}
