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

/*
 * How an OAuth attempt ended, and what the seller reads about it.
 *
 * Written here rather than in the route, because the route and the page must
 * not be able to describe different outcomes (D46). The route's outcome type is
 * `keyof typeof CONNECT_OUTCOMES`, so an outcome with no copy does not compile
 * and a message with no outcome has nowhere to be shown.
 *
 * Every failure says the same two things, because both are true and both are
 * what a seller actually wants to know: nothing was connected, and nothing was
 * changed on Etsy.
 */
export const CONNECT_OUTCOMES = {
  connected: {
    tone: 'ok',
    title: 'Shop connected',
    detail: 'Etsy approved the connection. Importing starts now — you can keep working while it runs.',
  },
  cancelled: {
    tone: 'info',
    title: 'Connection cancelled',
    detail: 'You declined on Etsy, so nothing was connected. Your shop is untouched and you can try again whenever you like.',
  },
  expired: {
    tone: 'warn',
    title: 'That connection attempt expired',
    detail: 'A connection has ten minutes to complete. Nothing was connected and nothing was changed on Etsy — start again from this page.',
  },
  state_mismatch: {
    tone: 'warn',
    title: 'That connection could not be verified',
    detail: 'The reply from Etsy did not match the request that started it, so it was refused. Nothing was connected. If you did not start a connection just now, you can ignore this.',
  },
  no_shop: {
    tone: 'info',
    title: 'That Etsy account has no shop',
    detail: 'Etsy approved the connection, but the account has no shop for EtsyPilot to read. Nothing was connected. Open a shop on Etsy first, then connect again.',
  },
  exchange_failed: {
    tone: 'warn',
    title: 'Etsy did not complete the connection',
    detail: 'Etsy refused the final step. Nothing was connected and nothing was changed on Etsy. Try again shortly; if it keeps happening the Etsy app may need its permissions reviewed.',
  },
  not_configured: {
    tone: 'info',
    title: 'No Etsy app is configured on this server',
    detail: 'EtsyPilot has no Etsy API credentials yet, so there is no shop to connect to. Demo mode needs none and stays fully usable.',
  },
} as const

export type ConnectOutcome = keyof typeof CONNECT_OUTCOMES

export function connectOutcome(raw: string | undefined): ConnectOutcome | null {
  return raw && raw in CONNECT_OUTCOMES ? (raw as ConnectOutcome) : null
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
