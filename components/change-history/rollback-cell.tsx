import Link from 'next/link'
import type { RollbackState } from '@/domain/change-history/types'

/*
 * The Rollback column.
 *
 * Four answers to "can I undo this?", and the distinctions are the point:
 *
 *   Available · 28 d     within the window, and the listings still hold it
 *   Expired              the plan's window has closed. Time, nothing else.
 *   Nothing to restore   the catalogue moved, or the job never landed
 *   Not on your plan     Free keeps history readable but not reversible
 *
 * "Expired" and "the catalogue moved" would both be a greyed-out link if this
 * were a boolean, and only one of them means the change is permanent.
 */
export function RollbackCell({ state, jobId }: { state: RollbackState; jobId: string }) {
  if (state.kind === 'AVAILABLE') {
    return (
      <span className="flex flex-col gap-0.5">
        <Link
          href={`/listings/change-history?job=${jobId}`}
          className="tnum text-[12.5px] font-semibold text-brand-strong underline-offset-2 hover:underline"
        >
          Available · {state.daysLeft} d
        </Link>
        {state.blocked > 0 ? (
          <span className="text-caption text-muted-1">
            {state.blocked} changed since — would be skipped
          </span>
        ) : null}
      </span>
    )
  }

  if (state.kind === 'WINDOW_CLOSED') {
    return (
      <span className="text-[12.5px] font-medium text-muted-2">
        Expired
        <span className="mt-0.5 block text-caption">
          Past your {state.window}-day window. The record stays readable.
        </span>
      </span>
    )
  }

  if (state.kind === 'NOT_ON_PLAN') {
    return (
      <span className="text-[12.5px] font-medium text-muted-2">
        Not on {state.planName}
        <span className="mt-0.5 block text-caption">
          History stays readable.{' '}
          <Link href="/billing" className="font-semibold text-brand-strong underline underline-offset-2">
            Compare plans
          </Link>
        </span>
      </span>
    )
  }

  return (
    <span className="text-[12.5px] font-medium text-muted-2">
      Nothing to restore
      <span className="mt-0.5 block text-caption">{state.reason}</span>
    </span>
  )
}
