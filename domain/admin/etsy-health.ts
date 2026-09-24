/*
 * Etsy connection health, as data.
 *
 * Pure: no database, no `server-only`, no React. What state a shop's
 * connection is in, and what that state means, are both decidable from here
 * and both testable without a Postgres.
 *
 * ── THE COLUMN IS NOT THE ANSWER ──────────────────────────────────────────
 *
 * `shops.connection_status` is one fact and `etsy_connections` holds two more
 * — an expiry and a revocation — and they can disagree. A row saying CONNECTED
 * beside a `revoked_at` three weeks old is not a contradiction to be resolved
 * quietly in favour of one of them: it is the single most useful thing an
 * operator can be told when a seller reports that nothing is importing. So
 * health is DERIVED from all three, and the disagreement is surfaced rather
 * than smoothed over.
 *
 * ── WHAT THIS DOES NOT CLAIM TO KNOW ──────────────────────────────────────
 *
 * PHASE-0-AUDIT lists five states that matter, and two of them —
 * "rate-limited mid-sync" and "sync failure" — are not properties of a
 * connection at all. They are properties of a sync RUN, and the only record of
 * one in this schema is an `events` row of type SYNC_FAILED. So the failing
 * state below is computed from that event and from nothing else, and a shop
 * with no such event is reported as having no failure ON RECORD rather than as
 * healthy. The difference matters: we do not run the syncs from here and we
 * cannot see one in flight.
 *
 * ── AND NOTHING HERE TALKS TO ETSY ────────────────────────────────────────
 *
 * Every figure is read from OUR tables. The operator area holds no
 * EtsyService and may make no Etsy call, read or write (D94) — so "is this
 * token actually still good?" is a question this screen cannot answer and does
 * not pretend to. It reports what we last recorded, and says so.
 */

import { countedAgainstThreshold, countedRows } from './provenance'
import type { Provenanced } from '@/lib/provenance/types'

/**
 * The connection vocabulary, as the product already defines it.
 *
 * Copied deliberately rather than imported. `lib/etsy/interface.ts` declares
 * `ConnectionStatus`, and it also declares `applyListingChanges` — importing
 * it, even for a type, would pull that file into the operator import closure,
 * and the write-boundary guard fails when an operator module so much as NAMES
 * the write method. A five-word duplication is the cheaper side of that trade.
 *
 * It cannot drift: tests/unit/admin-etsy-health.test.ts reads that file as
 * TEXT and asserts the two lists are the same set. Reading the file keeps them
 * in step without putting it in the closure — which is the same manoeuvre the
 * guard itself uses.
 */
export const CONNECTION_STATUSES = [
  'CONNECTED',
  'TOKEN_EXPIRED',
  'REVOKED',
  'DISCONNECTED',
  'DEMO',
] as const
export type ConnectionStatusValue = (typeof CONNECTION_STATUSES)[number]

/**
 * A token inside this window is worth acting on before it lapses.
 *
 * Seven days because reconnecting is the SELLER's action, not ours — we cannot
 * refresh it for them and we cannot do it on their behalf. The window has to
 * be long enough to reach somebody and get them to a computer.
 */
export const EXPIRING_SOON_DAYS = 7

/**
 * After this long with no sync, a connected shop is stale.
 *
 * Also seven days, and for a different reason: the product's own figures —
 * profit, pulse, the action center — are computed over synced rows, so a shop
 * that has not synced in a week is a shop being shown stale numbers. That is a
 * support case whether or not the seller has noticed yet.
 */
export const STALE_AFTER_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The derived state of one shop's connection.
 *
 * Ordered by urgency in HEALTH_ORDER below, which is also the order the screen
 * groups them in. Every one of them is a state the seller has to act on or a
 * state that needs nothing — there is no state here that an operator could
 * resolve, because there is no operator action that reaches Etsy.
 */
export type ConnectionHealth =
  | 'REVOKED'
  | 'TOKEN_EXPIRED'
  | 'DISCONNECTED'
  | 'SYNC_FAILING'
  | 'NEVER_SYNCED'
  | 'EXPIRING_SOON'
  | 'STALE'
  | 'HEALTHY'
  | 'DEMO'

/**
 * Most urgent first, and the order is the whole of the precedence rule.
 *
 * A shop can be several of these at once — a revoked grant whose token also
 * expired and which last synced in March — and reporting the wrong one sends
 * an operator down the wrong conversation. Revocation outranks expiry because
 * a revoked grant cannot be refreshed; expiry outranks a stale sync because
 * the stale sync is a CONSEQUENCE of the expiry and fixing the cause fixes it.
 */
export const HEALTH_ORDER: readonly ConnectionHealth[] = [
  'REVOKED',
  'TOKEN_EXPIRED',
  'DISCONNECTED',
  'SYNC_FAILING',
  'NEVER_SYNCED',
  'EXPIRING_SOON',
  'STALE',
  'HEALTHY',
  'DEMO',
] as const

export interface HealthCopy {
  label: string
  /** ok | info | warn | danger. Maps to a token pair on the screen (D1). */
  tone: 'ok' | 'info' | 'warn' | 'danger'
  /** What is true. Never a guess about why. */
  detail: string
  /**
   * What resolves it, and WHO does it. Every one of these is the seller's,
   * because the operator area can make no Etsy call at all (D94/D94a). Saying
   * so on each state is cheaper than the support conversation that starts
   * "can you just reconnect it for me".
   */
  remedy: string
}

export const HEALTH_COPY: Record<ConnectionHealth, HealthCopy> = {
  REVOKED: {
    label: 'Grant revoked',
    tone: 'danger',
    detail:
      'The seller took the Etsy authorisation back, on Etsy or from Shop connections. Nothing is being read or written.',
    remedy: 'The seller reconnects from Settings → Shop connections. Nobody here can do it for them.',
  },
  TOKEN_EXPIRED: {
    label: 'Token expired',
    tone: 'danger',
    detail:
      'The stored authorisation is past its expiry and was not refreshed. Reads stopped at that point.',
    remedy: 'The app refreshes on the seller’s next visit; if that fails they reconnect.',
  },
  DISCONNECTED: {
    label: 'Not connected',
    tone: 'info',
    detail: 'This shop has no Etsy authorisation. It is not an error — it may never have had one.',
    remedy: 'The seller connects from Settings → Shop connections.',
  },
  SYNC_FAILING: {
    label: 'Last sync failed',
    tone: 'warn',
    detail:
      'The most recent sync run recorded a failure. The authorisation itself may be perfectly good.',
    remedy: 'The reason is on the row. A rate limit clears itself; anything else needs looking at.',
  },
  NEVER_SYNCED: {
    label: 'Never synced',
    tone: 'warn',
    detail:
      'Connected, and no sync has ever completed. Every figure in this seller’s app is empty because there is nothing behind it — which is not the same as a shop that synced once and then went quiet.',
    remedy: 'Worth investigating: a connected shop that never imported usually failed on the first run.',
  },
  EXPIRING_SOON: {
    label: 'Expiring soon',
    tone: 'warn',
    detail: 'The stored authorisation lapses within the week.',
    remedy: 'Usually refreshes itself on the seller’s next visit. Worth a note if they are inactive.',
  },
  STALE: {
    label: 'Sync is stale',
    tone: 'warn',
    detail:
      'Connected and authorised, and the last completed sync is more than a week old. The seller is being shown figures computed over old rows.',
    remedy: 'The seller’s next visit triggers a sync. If it does not, the reason is worth finding.',
  },
  HEALTHY: {
    label: 'Healthy',
    tone: 'ok',
    detail: 'Authorised, not expiring this week, and synced within the last week.',
    remedy: 'Nothing to do.',
  },
  DEMO: {
    label: 'Demo shop',
    tone: 'info',
    detail:
      'The Willow & Fern dataset. There is no Etsy authorisation because there is no Etsy shop behind it.',
    remedy: 'Nothing to do. A demo shop is not a broken connection.',
  },
}

/** One shop's connection, as the repository returns it. */
export interface ConnectionRow {
  shopId: string
  shopName: string
  isDemo: boolean
  /** The column. One of three facts, and not necessarily the true one. */
  connectionStatus: string
  lastSyncedAt: Date | null
  /** Null when the shop has never had an `etsy_connections` row at all. */
  scopes: string[] | null
  expiresAt: Date | null
  revokedAt: Date | null
  /** The most recent SYNC_FAILED event, if there is one on record. */
  lastSyncFailure: { at: Date; reason: string | null } | null
  /** The most recent SYNC_COMPLETED event, if there is one on record. */
  lastSyncSuccess: Date | null
}

/**
 * Generic over the row, so a caller's richer record survives assessment.
 *
 * The repository returns an owner's address alongside the connection; the
 * health model has no use for it and deliberately does not know it exists —
 * `ConnectionRow` is the minimum this module needs to decide a state. Making
 * the wrapper generic keeps the caller's extra fields rather than forcing an
 * identity column into a module about tokens, and rather than making the page
 * carry two parallel arrays and keep their indexes in step.
 */
export interface AssessedConnection<T extends ConnectionRow = ConnectionRow> {
  row: T
  health: ConnectionHealth
  /**
   * True when `shops.connection_status` disagrees with what the connection row
   * actually shows. Surfaced, never smoothed: a column claiming CONNECTED
   * beside a revocation date is the fastest answer to "why is nothing
   * importing", and resolving it silently in favour of either side throws that
   * away.
   */
  columnDisagrees: boolean
  /** Whole days until the token lapses. Null when there is no expiry on record. */
  daysToExpiry: number | null
  /** Whole days since the last completed sync. Null when there has never been one. */
  daysSinceSync: number | null
}

function wholeDaysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

/**
 * Decide one shop's health.
 *
 * `now` is a parameter rather than a call to Date.now(), so every boundary in
 * the tests is exact rather than approximately today.
 */
export function assess<T extends ConnectionRow>(row: T, now: Date): AssessedConnection<T> {
  const daysToExpiry = row.expiresAt ? wholeDaysBetween(now, row.expiresAt) : null
  const daysSinceSync = row.lastSyncedAt ? wholeDaysBetween(row.lastSyncedAt, now) : null

  const expired = row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()
  const revoked = row.revokedAt !== null

  /*
   * A failure counts only when it is the LATEST word on the subject. A shop
   * that failed on Tuesday and succeeded on Wednesday is not failing, and
   * reporting it as such would send an operator after a problem that fixed
   * itself — which is how an operator learns to ignore the column.
   */
  const failing =
    row.lastSyncFailure !== null &&
    (row.lastSyncSuccess === null ||
      row.lastSyncFailure.at.getTime() > row.lastSyncSuccess.getTime())

  const health = ((): ConnectionHealth => {
    if (row.isDemo || row.connectionStatus === 'DEMO') return 'DEMO'
    if (revoked || row.connectionStatus === 'REVOKED') return 'REVOKED'
    if (expired || row.connectionStatus === 'TOKEN_EXPIRED') return 'TOKEN_EXPIRED'
    /*
     * No connection row at all, or the column says so. Checked AFTER
     * revocation and expiry, because a shop can be disconnected BY one of
     * those and the cause is the more useful answer.
     */
    if (row.scopes === null || row.connectionStatus === 'DISCONNECTED') return 'DISCONNECTED'
    if (failing) return 'SYNC_FAILING'
    if (row.lastSyncedAt === null) return 'NEVER_SYNCED'
    if (daysToExpiry !== null && daysToExpiry <= EXPIRING_SOON_DAYS) return 'EXPIRING_SOON'
    if (daysSinceSync !== null && daysSinceSync > STALE_AFTER_DAYS) return 'STALE'
    return 'HEALTHY'
  })()

  /*
   * What the column WOULD say if it agreed with the connection row. Compared
   * only for the four states the column can express — the derived set is
   * finer-grained, and a column reading CONNECTED beside a stale sync is not a
   * disagreement, it is the column being coarser.
   */
  const impliedByColumn: Record<string, boolean> = {
    REVOKED: health === 'REVOKED',
    TOKEN_EXPIRED: health === 'TOKEN_EXPIRED',
    DISCONNECTED: health === 'DISCONNECTED',
    DEMO: health === 'DEMO',
    CONNECTED: !['REVOKED', 'TOKEN_EXPIRED', 'DISCONNECTED', 'DEMO'].includes(health),
  }
  const columnDisagrees = impliedByColumn[row.connectionStatus] === false

  return { row, health, columnDisagrees, daysToExpiry, daysSinceSync }
}

/**
 * Count by health, in urgency order, with every state present.
 *
 * Every state, including the ones at zero, and that is D34 rather than
 * tidiness: a summary that omits "Token expired" when the count is nought
 * reads identically to a summary rendered before that state was implemented.
 * A visible zero is a measurement. An absent row is not.
 */
export interface HealthCount {
  health: ConnectionHealth
  /** Provenanced, so a health count cannot render without saying where from. */
  count: Provenanced<number>
  copy: HealthCopy
}

export function summarise(assessed: readonly AssessedConnection<ConnectionRow>[]): HealthCount[] {
  return HEALTH_ORDER.map((health) => {
    const count = assessed.filter((entry) => entry.health === health).length
    /*
     * CALCULATED for the two states that come from a THRESHOLD, VERIFIED for
     * the ones a row carries outright.
     *
     * "Never connected" and "Revoked" are facts in the table: there is a row
     * or there is not, revoked_at is set or it is not. "Expiring soon" and
     * "Stale" are comparisons against EXPIRING_SOON_DAYS and
     * STALE_AFTER_DAYS — numbers this product chose, and a different choice
     * would give a different count. Badging those VERIFIED would put our own
     * editorial judgement behind the word Etsy's data earns.
     */
    return {
      health,
      count:
        health === 'EXPIRING_SOON' || health === 'STALE'
          ? countedAgainstThreshold(
              count,
              HEALTH_COPY[health].detail,
              health === 'EXPIRING_SOON'
                ? `${EXPIRING_SOON_DAYS} days`
                : `${STALE_AFTER_DAYS} days`,
            )
          : countedRows(count, 'etsy_connections'),
      copy: HEALTH_COPY[health],
    }
  })
}

/**
 * The shops whose token lapses within the window, soonest first.
 *
 * Already-expired shops are NOT here. They are past the point this section is
 * for — the section exists to catch the ones that can still be saved by a
 * seller visiting the app, and mixing in the ones that cannot would bury them.
 */
export function expiringSoon<T extends ConnectionRow>(
  assessed: readonly AssessedConnection<T>[],
): AssessedConnection<T>[] {
  return assessed
    .filter(
      (entry) =>
        entry.daysToExpiry !== null &&
        entry.daysToExpiry >= 0 &&
        entry.daysToExpiry <= EXPIRING_SOON_DAYS &&
        entry.health !== 'REVOKED' &&
        entry.health !== 'DEMO',
    )
    .sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))
}

/** Everything that needs a human, most urgent first. */
export function needsAttention<T extends ConnectionRow>(
  assessed: readonly AssessedConnection<T>[],
): AssessedConnection<T>[] {
  const rank = (entry: AssessedConnection<T>) => HEALTH_ORDER.indexOf(entry.health)
  return assessed
    .filter((entry) => entry.health !== 'HEALTHY' && entry.health !== 'DEMO')
    .sort((a, b) => rank(a) - rank(b) || a.row.shopName.localeCompare(b.row.shopName))
}

/**
 * How the last sync reads, in words.
 *
 * D34, and this is the case the requirement calls out by name: "never synced"
 * and "synced a long time ago" are different facts and must not render alike.
 * They do not share a code path here — one returns a sentence with no date in
 * it at all, the other returns a count of days — so there is no formatting
 * option that could collapse them into the same dash.
 */
export function syncStatement(entry: AssessedConnection<ConnectionRow>): string {
  if (entry.row.lastSyncedAt === null) {
    return 'Never synced — no import has ever completed for this shop.'
  }
  const days = entry.daysSinceSync ?? 0
  if (days <= 0) return 'Synced today.'
  if (days === 1) return 'Synced yesterday.'
  if (days <= STALE_AFTER_DAYS) return `Synced ${days} days ago.`
  return `Last synced ${days} days ago — stale.`
}
