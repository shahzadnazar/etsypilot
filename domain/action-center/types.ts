/*
 * The Action model (PRD 4.1, artboard 108).
 *
 * Every field the PRD asks for is on the card: priority, severity, title,
 * explanation, evidence, destination, status, created, completed, dismissed.
 *
 * Two rules shape the model:
 *
 *   1. No dead-end alerts. `destination` is required, not optional - an action
 *      that goes nowhere cannot be constructed.
 *   2. The list is a record, not a queue that empties into nothing. Dismissed
 *      actions keep their reason and can be restored, so DISMISSED is a state
 *      with its own fields rather than a deletion.
 */

import type { ProvenanceType } from '@/lib/provenance/types'

export const ACTION_SEVERITIES = ['CRITICAL', 'ATTENTION', 'INFO'] as const
export type ActionSeverity = (typeof ACTION_SEVERITIES)[number]

export const ACTION_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'DISMISSED',
  'SNOOZED',
] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

/** Where the card goes. Required - see rule 1. */
export interface ActionDestination {
  label: string
  href: string
}

/** Partial completion, e.g. "12 of 38". */
export interface ActionProgress {
  current: number
  total: number
}

/**
 * What the card claims, and where the claim came from. Rendered as a single
 * evidence line beneath the explanation.
 */
export interface ActionEvidence {
  summary: string
  provenance: ProvenanceType
  /** e.g. "your receipts and cost setup" */
  source: string
}

export interface Action {
  id: string
  shopId: string
  /** Rank within the queue. Lower is more urgent; drives the numbered chip. */
  priority: number
  severity: ActionSeverity
  title: string
  /** One or two sentences. Says what is true, not what to feel about it. */
  explanation: string
  evidence: ActionEvidence
  destination: ActionDestination
  status: ActionStatus
  createdAt: string
  progress?: ActionProgress
  /** IN_PROGRESS only. */
  lastWorkedAt?: string
  lastWorkedBy?: string
  /** COMPLETED only. */
  completedAt?: string
  completedBy?: string
  /** COMPLETED only - links the card to the mutation that closed it. */
  operationId?: string
  /**
   * COMPLETED only. A measured outcome, never a projected one.
   * "Orders are up 4% since - measured, not claimed."
   */
  outcome?: string
  /** COMPLETED only - rollback stays reachable while the window is open. */
  rollbackAvailable?: boolean
  /** DISMISSED only. Kept so the card can be restored with its context. */
  dismissedAt?: string
  dismissedBy?: string
  dismissedReason?: string
  /** SNOOZED only. */
  snoozedUntil?: string
}

export const SEVERITY_LABEL: Record<ActionSeverity, string> = {
  CRITICAL: 'Critical',
  ATTENTION: 'Attention',
  INFO: 'Info',
}

export const STATUS_LABEL: Record<ActionStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  DISMISSED: 'Dismissed',
  SNOOZED: 'Snoozed',
}

/** Filter chips across the top of the Action Center. */
export type ActionFilter = 'OPEN' | 'DONE' | 'DISMISSED'

export const FILTER_LABEL: Record<ActionFilter, string> = {
  OPEN: 'Open',
  DONE: 'Done',
  DISMISSED: 'Dismissed',
}

export function matchesFilter(action: Action, filter: ActionFilter): boolean {
  switch (filter) {
    case 'OPEN':
      return action.status === 'OPEN' || action.status === 'IN_PROGRESS'
    case 'DONE':
      return action.status === 'COMPLETED'
    case 'DISMISSED':
      return action.status === 'DISMISSED' || action.status === 'SNOOZED'
  }
}

/**
 * Queue order: severity first, then explicit priority, then age.
 * Completed and dismissed cards sort after open ones regardless of severity -
 * they are a record, not work.
 */
export function compareActions(a: Action, b: Action): number {
  const rank = (x: Action) =>
    x.status === 'OPEN' || x.status === 'IN_PROGRESS' ? 0 : x.status === 'COMPLETED' ? 1 : 2
  if (rank(a) !== rank(b)) return rank(a) - rank(b)

  const sev: Record<ActionSeverity, number> = { CRITICAL: 0, ATTENTION: 1, INFO: 2 }
  if (sev[a.severity] !== sev[b.severity]) return sev[a.severity] - sev[b.severity]

  if (a.priority !== b.priority) return a.priority - b.priority
  return a.createdAt.localeCompare(b.createdAt)
}
