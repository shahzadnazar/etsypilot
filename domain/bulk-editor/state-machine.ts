/*
 * The operation state machine.
 *
 * Illegal transitions throw. The point is not tidiness: APPLYING is only
 * reachable from READY, and READY only from VALIDATING, so there is no ordering
 * of calls that reaches a write without validation having run first.
 */

import { AppError } from '@/lib/errors/types'
import type { OperationState } from './types'

const TRANSITIONS: Record<OperationState, OperationState[]> = {
  DRAFT: ['VALIDATING'],
  VALIDATING: ['READY', 'FAILED'],
  // No transition from READY to anything but APPLYING or back to DRAFT for
  // reconfiguration. Confirmation happens at the boundary into APPLYING.
  READY: ['APPLYING', 'DRAFT'],
  APPLYING: ['COMPLETED', 'PARTIAL_SUCCESS', 'FAILED'],
  COMPLETED: ['ROLLBACK_AVAILABLE'],
  PARTIAL_SUCCESS: ['ROLLBACK_AVAILABLE', 'APPLYING'],
  FAILED: ['DRAFT'],
  ROLLBACK_AVAILABLE: ['ROLLED_BACK'],
  ROLLED_BACK: [],
}

export function canTransition(from: OperationState, to: OperationState): boolean {
  return TRANSITIONS[from].includes(to)
}

export function assertTransition(from: OperationState, to: OperationState): void {
  if (canTransition(from, to)) return
  throw new AppError({
    kind: 'VALIDATION',
    code: 'ILLEGAL_OPERATION_TRANSITION',
    message: 'That bulk job cannot move to that step from where it is.',
    recovery:
      'Reload the job to see its current state. Nothing was sent to Etsy — this was refused before any write.',
    context: { from, to },
  })
}

/** Terminal for the purposes of "is this job still doing something?". */
export function isSettled(state: OperationState): boolean {
  return (
    state === 'COMPLETED' ||
    state === 'PARTIAL_SUCCESS' ||
    state === 'FAILED' ||
    state === 'ROLLBACK_AVAILABLE' ||
    state === 'ROLLED_BACK'
  )
}
