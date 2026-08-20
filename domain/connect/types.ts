/*
 * Etsy connection.
 *
 * The security shape of this file matters more than its size.
 *
 *   - There is no password field. Not on the form, not in the types, not in the
 *     mock. EtsyPilot never receives an Etsy password, and the way to guarantee
 *     that is to have nowhere to put one.
 *   - There is no token field either. Access tokens live server-side in Phase
 *     11, never in a view model, never in a response body, and never in browser
 *     storage.
 *   - Scopes are chosen before the redirect and shown in plain language with
 *     what breaks without each one, so "approve everything" is not the only
 *     path a seller understands.
 *
 * Phase 11 supplies the real OAuth exchange. This is the state machine it
 * plugs into, and the states are the ones the seller actually experiences —
 * including the two failures, cancelled and rate-limited.
 */

export const CONNECTION_STEPS = [
  'DISCONNECTED',
  'CHOOSING_SCOPES',
  'AWAITING_ETSY',
  'SYNCING',
  'CONNECTED',
  'CANCELLED',
] as const
export type ConnectionStep = (typeof CONNECTION_STEPS)[number]

export interface EtsyScope {
  key: string
  label: string
  /** Etsy's own scope strings, shown so the grant is inspectable. */
  scopes: string[]
  requirement: 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL'
  /** What it enables. */
  enables: string
  /** What stops working without it. Never left implicit. */
  withoutIt: string
}

export const ETSY_SCOPES: EtsyScope[] = [
  {
    key: 'read',
    label: 'Read shop & listings',
    scopes: ['listings_r', 'shops_r'],
    requirement: 'REQUIRED',
    enables: 'Shows your listings, tags, prices and inventory, and runs audits.',
    withoutIt: 'EtsyPilot cannot show your shop at all.',
  },
  {
    key: 'write',
    label: 'Manage listings',
    scopes: ['listings_w'],
    requirement: 'RECOMMENDED',
    enables: 'Publishes edits, bulk changes and scheduled updates that you confirm.',
    withoutIt: 'EtsyPilot can only suggest changes — you would apply them on Etsy yourself.',
  },
  {
    key: 'finance',
    label: 'Orders & financials',
    scopes: ['transactions_r', 'billing_r'],
    requirement: 'RECOMMENDED',
    enables: 'Powers profit, fees, the sales map and delivery status. Buyer locations are aggregated.',
    withoutIt: 'Profit Reality and Shop Pulse have nothing to measure.',
  },
  {
    key: 'inventory',
    label: 'Inventory updates',
    scopes: ['listings_w'],
    requirement: 'OPTIONAL',
    enables: 'Lets automation rules adjust quantities.',
    withoutIt: 'Quantities stay exactly as you set them on Etsy.',
  },
]

/** Stated on the connect screen, in the seller's words rather than ours. */
export const CANNOT_DO = [
  'Send messages to your buyers.',
  'See buyer names, emails or addresses individually.',
  'Publish anything without your confirmation.',
  'Access shops you have not connected.',
] as const

export const TRADEMARK_NOTICE =
  'The term “Etsy” is a trademark of Etsy, Inc. This Application uses Etsy’s API, but is not endorsed or certified by Etsy.'

export type SyncStageStatus = 'DONE' | 'RUNNING' | 'QUEUED' | 'PAUSED'

export interface SyncStage {
  key: string
  label: string
  status: SyncStageStatus
  /** e.g. "412 of 412". Null while queued — never a fake 0 of 0. */
  detail: string | null
  /** Completed units over total, for the bar. Null while queued. */
  progress: { done: number; total: number } | null
}

export interface SyncState {
  shopName: string
  stages: SyncStage[]
  /** Computed from the stages, never stated separately. */
  overallPercent: number
  /** Set when Etsy rate-limits us. Says when it resumes and that nothing is lost. */
  pausedNotice: string | null
  estimateNote: string
}

export interface ConnectionState {
  step: ConnectionStep
  shopName: string | null
  grantedScopes: string[]
  connectedAt: string | null
  lastSyncedAt: string | null
  sync: SyncState | null
  /** Set on CANCELLED. Explains that nothing was connected. */
  notice: string | null
}

export function selectedScopeStrings(keys: string[]): string[] {
  const selected = ETSY_SCOPES.filter((s) => keys.includes(s.key) || s.requirement === 'REQUIRED')
  return [...new Set(selected.flatMap((s) => s.scopes))]
}

export function overallPercent(stages: SyncStage[]): number {
  const weighted = stages.map((s) =>
    s.status === 'DONE' ? 1 : s.progress ? s.progress.done / Math.max(1, s.progress.total) : 0,
  )
  if (weighted.length === 0) return 0
  return Math.round((weighted.reduce((a, b) => a + b, 0) / weighted.length) * 100)
}
