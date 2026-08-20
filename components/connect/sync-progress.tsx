/*
 * Staged sync.
 *
 * Never an indefinite spinner. Every stage says what it is doing and how far it
 * has got; a queued stage says "Queued" rather than showing 0 of 0, which reads
 * as failure.
 *
 * The rate-limit notice is the important one: it names the resume time, says
 * nothing is lost, and says the seller can keep working. A pause the product
 * cannot explain is indistinguishable from a break.
 */

import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import type { SyncState, SyncStageStatus } from '@/domain/connect/types'

const STATUS_LABEL: Record<SyncStageStatus, string> = {
  DONE: 'Done',
  RUNNING: 'Running',
  QUEUED: 'Queued',
  PAUSED: 'Paused',
}

export function SyncProgress({ sync }: { sync: SyncState }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line p-[18px]">
        <h2 className="text-section text-ink-1">Setting up {sync.shopName}</h2>
        <p className="mt-1 text-caption leading-relaxed text-muted-1">{sync.estimateNote}</p>

        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-soft">
            <div
              className="h-full rounded-full"
              style={{ width: `${sync.overallPercent}%`, background: 'var(--brand)' }}
            />
          </div>
          <Numeric className="text-small font-semibold text-ink-1">{sync.overallPercent}%</Numeric>
        </div>
      </div>

      <ul className="flex flex-col divide-y divide-line">
        {sync.stages.map((stage) => (
          <li key={stage.key} className="flex items-center justify-between gap-3 p-[18px]">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-small text-ink-1">{stage.label}</span>
              {stage.detail ? (
                <Numeric className="text-caption text-muted-1">{stage.detail}</Numeric>
              ) : (
                <span className="text-caption text-muted-1">
                  {stage.status === 'PAUSED'
                    ? 'Paused by Etsy’s rate limit — resumes automatically'
                    : 'Waiting for the stage above'}
                </span>
              )}
            </div>
            <span className="shrink-0 text-caption font-semibold text-muted-1">
              {STATUS_LABEL[stage.status]}
            </span>
          </li>
        ))}
      </ul>

      {sync.pausedNotice ? (
        <p
          className="border-t border-line p-[18px] text-small leading-relaxed"
          style={{ background: '#FFFBEB', color: '#92400E' }}
        >
          {sync.pausedNotice}
        </p>
      ) : null}
    </Card>
  )
}
