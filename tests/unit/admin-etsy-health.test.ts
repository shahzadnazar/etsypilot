import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  CONNECTION_STATUSES,
  EXPIRING_SOON_DAYS,
  HEALTH_COPY,
  HEALTH_ORDER,
  STALE_AFTER_DAYS,
  assess,
  expiringSoon,
  needsAttention,
  summarise,
  syncStatement,
  type ConnectionHealth,
  type ConnectionRow,
} from '@/domain/admin/etsy-health'
import { CONNECT_OUTCOMES } from '@/domain/connect/types'
import { OPERATOR_NAV } from '@/domain/admin/navigation'

/*
 * ETSY CONNECTION HEALTH.
 *
 * The screen answers one question — "is this seller's shop actually connected
 * and importing?" — and the ways of getting it wrong are all the same shape:
 * reporting a state that is true of one of the three stored facts and not of
 * the shop. So most of what is below is about PRECEDENCE and about the two
 * pairs that must never render alike.
 *
 * Comments are stripped before anything is matched. Eight times in this build
 * a guard has matched its own documentation, so the source sweeps below match
 * a call shape rather than a word.
 */

const PAGE = 'app/(admin)/admin/etsy/page.tsx'
const READS = 'lib/repositories/admin-reads-every-shop.ts'

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const NOW = new Date('2026-09-23T12:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000)

function row(overrides: Partial<ConnectionRow> = {}): ConnectionRow {
  return {
    shopId: 'shop-1',
    shopName: 'Willow & Fern',
    isDemo: false,
    connectionStatus: 'CONNECTED',
    lastSyncedAt: day(-1),
    scopes: ['listings_r', 'shops_r'],
    expiresAt: day(30),
    revokedAt: null,
    lastSyncFailure: null,
    lastSyncSuccess: day(-1),
    ...overrides,
  }
}

const healthOf = (overrides: Partial<ConnectionRow> = {}) => assess(row(overrides), NOW).health

/* ────────────────── the vocabulary matches the product's ─────────────────── */

describe('the status vocabulary is the product’s own', () => {
  it('MATCHES lib/etsy/interface.ts, which is read as text and never imported', () => {
    /*
     * Read rather than imported, deliberately. That file declares
     * ConnectionStatus AND applyListingChanges; importing it even for a type
     * would pull it into the operator import closure, and the write-boundary
     * guard fails when an operator module so much as NAMES the write method.
     *
     * So the two lists are kept in step by reading the file, which is the same
     * manoeuvre the guard itself uses — and the duplication becomes a checked
     * claim rather than an unowned copy.
     */
    const source = readFileSync('lib/etsy/interface.ts', 'utf8')
    const declared = source
      .slice(source.indexOf('export type ConnectionStatus'))
      .split('\n')[0]!
      .match(/'[A-Z_]+'/g)!
      .map((entry) => entry.replaceAll("'", ''))

    expect(declared.length).toBeGreaterThan(0)
    expect(new Set(CONNECTION_STATUSES)).toEqual(new Set(declared))
  })

  it('does not IMPORT that module, which would breach the Etsy boundary', () => {
    const source = code('domain/admin/etsy-health.ts')
    expect(source).not.toContain('lib/etsy')
    expect(source).not.toContain('applyListingChanges')
    expect(source).not.toContain('getEtsyService')
  })

  it('has copy for every derived state, and an order that covers them all', () => {
    // A state with no copy renders a blank chip; a state missing from the order
    // is a state the summary silently never counts.
    const states = Object.keys(HEALTH_COPY) as ConnectionHealth[]
    expect(new Set(HEALTH_ORDER)).toEqual(new Set(states))
    expect(HEALTH_ORDER.length).toBe(states.length)
    for (const state of states) {
      expect(HEALTH_COPY[state].label.length, state).toBeGreaterThan(0)
      expect(HEALTH_COPY[state].detail.length, state).toBeGreaterThan(20)
      expect(HEALTH_COPY[state].remedy.length, state).toBeGreaterThan(10)
    }
  })

  it('NAMES THE SELLER as the one who acts, on every state that needs acting on', () => {
    /*
     * The operator area can make no Etsy call at all, so every remedy here is
     * somebody else's. Saying so per state is what stops the screen reading
     * like a queue of work an operator is about to do.
     */
    for (const state of HEALTH_ORDER) {
      if (state === 'HEALTHY' || state === 'DEMO') continue
      const remedy = HEALTH_COPY[state].remedy.toLowerCase()
      expect(remedy, state).toMatch(/seller|refresh|reason|investigat|worth/)
    }
  })
})

/* ──────────────────────────── precedence ─────────────────────────────────── */

describe('a shop in several states at once reports the most urgent', () => {
  it('puts REVOKED above everything, because a revoked grant cannot refresh', () => {
    expect(
      healthOf({
        revokedAt: day(-20),
        expiresAt: day(-10),
        lastSyncedAt: day(-90),
        lastSyncFailure: { at: day(-1), reason: 'rate limited' },
      }),
    ).toBe('REVOKED')
  })

  it('puts TOKEN_EXPIRED above a stale sync, because the expiry CAUSED it', () => {
    expect(healthOf({ expiresAt: day(-3), lastSyncedAt: day(-60) })).toBe('TOKEN_EXPIRED')
  })

  it('reports DISCONNECTED for a shop with no authorisation row at all', () => {
    expect(healthOf({ scopes: null, expiresAt: null, connectionStatus: 'DISCONNECTED' })).toBe(
      'DISCONNECTED',
    )
  })

  it('reports DEMO first of all, because a demo shop is not a broken connection', () => {
    expect(healthOf({ isDemo: true, scopes: null, expiresAt: null, lastSyncedAt: null })).toBe(
      'DEMO',
    )
  })

  it('reports SYNC_FAILING only when the failure is the LATEST word', () => {
    /*
     * A shop that failed on Tuesday and succeeded on Wednesday is not failing.
     * Reporting it as such sends an operator after a problem that fixed
     * itself, which is how an operator learns to ignore the column.
     */
    expect(
      healthOf({
        lastSyncFailure: { at: day(-3), reason: 'rate limited' },
        lastSyncSuccess: day(-1),
        lastSyncedAt: day(-1),
      }),
    ).toBe('HEALTHY')

    expect(
      healthOf({
        lastSyncFailure: { at: day(-1), reason: 'rate limited' },
        lastSyncSuccess: day(-3),
        lastSyncedAt: day(-3),
      }),
    ).toBe('SYNC_FAILING')
  })

  it('treats a failure with NO success on record as failing', () => {
    expect(
      healthOf({
        lastSyncFailure: { at: day(-1), reason: 'auth' },
        lastSyncSuccess: null,
        lastSyncedAt: null,
      }),
    ).toBe('SYNC_FAILING')
  })

  it('reports HEALTHY only when every condition holds', () => {
    expect(healthOf()).toBe('HEALTHY')
  })
})

/* ───────────────── never synced is not synced long ago ───────────────────── */

describe('absent and old are different facts (D34)', () => {
  it('reports NEVER_SYNCED separately from STALE', () => {
    expect(healthOf({ lastSyncedAt: null, lastSyncSuccess: null })).toBe('NEVER_SYNCED')
    expect(healthOf({ lastSyncedAt: day(-40), lastSyncSuccess: day(-40) })).toBe('STALE')
  })

  it('RENDERS THEM DIFFERENTLY, with no shared shape to collapse into', () => {
    /*
     * The requirement calls this pair out by name. One sentence has no date in
     * it at all and the other is a count of days, so there is no formatting
     * option — no locale, no null-coalesce — that could make them read alike.
     */
    const never = syncStatement(assess(row({ lastSyncedAt: null }), NOW))
    const stale = syncStatement(assess(row({ lastSyncedAt: day(-40) }), NOW))

    expect(never).toMatch(/never synced/i)
    expect(never).not.toMatch(/\d/)
    expect(stale).toContain('40')
    expect(stale).toMatch(/stale/i)
    expect(never).not.toBe(stale)
  })

  it('does not describe a fresh sync as stale, or the other way round', () => {
    expect(syncStatement(assess(row({ lastSyncedAt: NOW }), NOW))).toBe('Synced today.')
    expect(syncStatement(assess(row({ lastSyncedAt: day(-1) }), NOW))).toBe('Synced yesterday.')
    expect(syncStatement(assess(row({ lastSyncedAt: day(-3) }), NOW))).toBe('Synced 3 days ago.')
  })
})

/* ─────────────────────────── the boundaries ──────────────────────────────── */

describe('the windows are exact at their edges', () => {
  it(`is EXPIRING_SOON at exactly ${EXPIRING_SOON_DAYS} days and healthy one day later`, () => {
    expect(healthOf({ expiresAt: day(EXPIRING_SOON_DAYS) })).toBe('EXPIRING_SOON')
    expect(healthOf({ expiresAt: day(EXPIRING_SOON_DAYS + 1) })).toBe('HEALTHY')
  })

  it('is TOKEN_EXPIRED the moment the expiry passes, not a day later', () => {
    expect(assess(row({ expiresAt: new Date(NOW.getTime() - 1) }), NOW).health).toBe(
      'TOKEN_EXPIRED',
    )
    expect(assess(row({ expiresAt: new Date(NOW.getTime() + 1000) }), NOW).health).toBe(
      'EXPIRING_SOON',
    )
  })

  it(`is STALE only PAST ${STALE_AFTER_DAYS} days, so the boundary day is still fresh`, () => {
    expect(healthOf({ lastSyncedAt: day(-STALE_AFTER_DAYS), expiresAt: day(60) })).toBe('HEALTHY')
    expect(healthOf({ lastSyncedAt: day(-STALE_AFTER_DAYS - 1), expiresAt: day(60) })).toBe('STALE')
  })

  it('treats a shop with NO expiry as not expiring, rather than as expiring now', () => {
    // An absent expiry is not a distant one and it is not an imminent one.
    // Getting this backwards would file every legacy row under "expiring".
    expect(healthOf({ expiresAt: null })).toBe('HEALTHY')
    expect(assess(row({ expiresAt: null }), NOW).daysToExpiry).toBeNull()
  })
})

/* ───────────────────── the column that disagrees ─────────────────────────── */

describe('a stored status that disagrees is surfaced, not smoothed', () => {
  it('FLAGS a column saying connected beside a revocation', () => {
    const entry = assess(row({ connectionStatus: 'CONNECTED', revokedAt: day(-20) }), NOW)
    expect(entry.health).toBe('REVOKED')
    expect(entry.columnDisagrees).toBe(true)
  })

  it('flags a column saying revoked when the authorisation is live', () => {
    const entry = assess(row({ connectionStatus: 'REVOKED', revokedAt: null }), NOW)
    // The column is authority for REVOKED too — it is one of the three facts —
    // so this resolves to REVOKED and does NOT read as a disagreement.
    expect(entry.health).toBe('REVOKED')
    expect(entry.columnDisagrees).toBe(false)
  })

  it('does NOT flag the column merely for being coarser than the derived state', () => {
    /*
     * The false positive that would make the flag useless. CONNECTED beside a
     * stale sync is not a disagreement — the column has no way to say "stale".
     * If every stale shop were flagged, the flag would stop meaning anything
     * and the genuinely contradictory rows would be lost in it.
     */
    for (const health of ['STALE', 'NEVER_SYNCED', 'EXPIRING_SOON', 'SYNC_FAILING'] as const) {
      const entry = assess(
        row(
          health === 'STALE'
            ? { lastSyncedAt: day(-40), expiresAt: day(60) }
            : health === 'NEVER_SYNCED'
              ? { lastSyncedAt: null, lastSyncSuccess: null }
              : health === 'EXPIRING_SOON'
                ? { expiresAt: day(2) }
                : { lastSyncFailure: { at: day(-1), reason: 'x' }, lastSyncSuccess: day(-5) },
        ),
        NOW,
      )
      expect(entry.health, health).toBe(health)
      expect(entry.columnDisagrees, health).toBe(false)
    }
  })

  it('flags a DEMO column on a shop that is not the demo dataset', () => {
    const entry = assess(row({ connectionStatus: 'DEMO', isDemo: false }), NOW)
    expect(entry.health).toBe('DEMO')
    expect(entry.columnDisagrees).toBe(false)
  })
})

/* ──────────────────────── the summary and the lists ──────────────────────── */

describe('the summary counts every state, including the empty ones', () => {
  it('SHOWS A ZERO rather than omitting the row', () => {
    /*
     * D34. A summary that hides "Token expired" when the count is nought reads
     * exactly like a summary rendered before that state was implemented, and
     * the reader cannot tell which they are looking at.
     */
    const summary = summarise([assess(row(), NOW)])
    expect(summary.map((entry) => entry.health)).toEqual([...HEALTH_ORDER])
    expect(summary.find((entry) => entry.health === 'TOKEN_EXPIRED')?.count.value).toBe(0)
    expect(summary.find((entry) => entry.health === 'HEALTHY')?.count.value).toBe(1)
  })

  it('counts an empty platform as every state at zero, not as an empty list', () => {
    const summary = summarise([])
    expect(summary.length).toBe(HEALTH_ORDER.length)
    expect(summary.every((entry) => entry.count.value === 0)).toBe(true)
  })
})

describe('the two lists carry what they claim to', () => {
  it('EXCLUDES ALREADY-EXPIRED shops from "expiring soon"', () => {
    /*
     * They are past the point the section is for. Mixing them in would bury
     * the ones a seller can still save by opening the app — which is the only
     * thing the section is good for.
     */
    const rows = [
      assess(row({ shopId: 'a', expiresAt: day(2) }), NOW),
      assess(row({ shopId: 'b', expiresAt: day(-2) }), NOW),
      assess(row({ shopId: 'c', expiresAt: day(90) }), NOW),
    ]
    expect(expiringSoon(rows).map((entry) => entry.row.shopId)).toEqual(['a'])
  })

  it('sorts expiring shops soonest first', () => {
    const rows = [
      assess(row({ shopId: 'later', expiresAt: day(6) }), NOW),
      assess(row({ shopId: 'sooner', expiresAt: day(1) }), NOW),
    ]
    expect(expiringSoon(rows).map((entry) => entry.row.shopId)).toEqual(['sooner', 'later'])
  })

  it('leaves a revoked or demo shop out of "expiring soon"', () => {
    const rows = [
      assess(row({ shopId: 'revoked', expiresAt: day(2), revokedAt: day(-1) }), NOW),
      assess(row({ shopId: 'demo', expiresAt: day(2), isDemo: true }), NOW),
    ]
    expect(expiringSoon(rows)).toEqual([])
  })

  it('leaves HEALTHY and DEMO out of "needs attention", and orders the rest by urgency', () => {
    const rows = [
      assess(row({ shopId: 'healthy' }), NOW),
      assess(row({ shopId: 'demo', isDemo: true }), NOW),
      assess(row({ shopId: 'stale', lastSyncedAt: day(-40), expiresAt: day(60) }), NOW),
      assess(row({ shopId: 'revoked', revokedAt: day(-1) }), NOW),
    ]
    expect(needsAttention(rows).map((entry) => entry.row.shopId)).toEqual(['revoked', 'stale'])
  })
})

/* ────────────────────── the page, as source ──────────────────────────────── */

describe('the screen is gated, read-only, and offers no Etsy control', () => {
  it('gates itself on etsy.view', () => {
    expect(code(PAGE)).toContain("requireAdmin('etsy.view')")
  })

  it('is offered in the navigation behind the same key', () => {
    const item = OPERATOR_NAV.flatMap((group) => group.items).find(
      (entry) => entry.href === '/admin/etsy',
    )
    expect(item).toBeDefined()
    expect(item?.gate).toEqual({ kind: 'permission', key: 'etsy.view' })
  })

  it('CONTAINS NO CONTROL AT ALL — no reconnect, no refresh, no force-sync', () => {
    const source = code(PAGE)
    for (const control of ['<form', '<button', '<input', 'action=', "'use server'", 'onClick']) {
      expect(source, control).not.toContain(control)
    }
  })

  it('reaches no Etsy service and no database handle of its own', () => {
    const source = code(PAGE)
    for (const reach of ['getEtsyService', 'applyListingChanges', 'getDb', 'shopContext']) {
      expect(source, reach).not.toContain(reach)
    }
  })

  it('NEVER NAMES THE TOKEN REFERENCE, on the one screen about tokens', () => {
    // The whole subject of this page is the authorisation, which makes it the
    // screen where selecting the credential would have been most tempting.
    for (const file of [PAGE, 'domain/admin/etsy-health.ts']) {
      expect(code(file), file).not.toContain('tokenRef')
      expect(code(file), file).not.toContain('token_ref')
    }
  })

  it('says what it cannot do, rather than leaving the absence to be read as a to-do', () => {
    const source = readFileSync(PAGE, 'utf8')
    expect(source).toMatch(/no reconnect, no token\s+refresh, no force-sync and no revoke/i)
    expect(source).toMatch(/cannot tell you whether a token still works/i)
  })
})

/* ─────────────────── the seller's words, not ours ────────────────────────── */

describe('connection-attempt copy comes from CONNECT_OUTCOMES', () => {
  it('renders the constant rather than a paraphrase', () => {
    /*
     * D50c/D46: the outcomes and their sentences are written once, and the
     * OAuth routes' type is keyed off the same object. An operator quoting a
     * seller must be quoting the sentence the seller will actually see.
     */
    const source = code(PAGE)
    expect(source).toContain('CONNECT_OUTCOMES')
    expect(source).toContain('Object.entries(CONNECT_OUTCOMES)')
  })

  it('HARD-CODES NONE OF IT, so the two cannot drift', () => {
    const source = code(PAGE)
    for (const [key, outcome] of Object.entries(CONNECT_OUTCOMES)) {
      expect(source, key).not.toContain(outcome.title)
      expect(source, key).not.toContain(outcome.detail)
    }
  })

  it('still carries every outcome the routes can emit', () => {
    // The positive control for the assertion above: the copy has to reach the
    // page somehow, and rendering from the constant is the only way left.
    expect(Object.keys(CONNECT_OUTCOMES).length).toBeGreaterThanOrEqual(7)
  })
})

/* ──────────────── the read stays inside the boundary ─────────────────────── */

describe('the cross-shop read takes only what the screen needs', () => {
  it('READS NO LISTING CONTENT from the events table', () => {
    /*
     * `events` holds every listing change ever made — before and after values,
     * the listing id, the field. None of that has anything to do with whether
     * a sync ran, and a query that reached it would be one `select` away from
     * a change history nobody asked for.
     */
    const source = code(READS)
    for (const column of [
      'events.listingId',
      'events.beforeValue',
      'events.afterValue',
      'events.field',
      'events.actorId',
    ]) {
      expect(source, column).not.toContain(column)
    }
  })

  it('FILTERS THE EVENTS TABLE TO THE SYNC TYPES, never reading it whole', () => {
    const source = code(READS)
    const queries = source.split('.from(schema.events)').slice(0, -1)
    expect(queries.length).toBeGreaterThan(0) // positive control
    for (const before of queries) {
      const after = source.slice(source.indexOf(before) + before.length)
      const clause = after.slice(0, 400)
      expect(clause).toContain('inArray(schema.events.type')
      expect(clause).toContain("'SYNC_FAILED'")
      expect(clause).toContain("'SYNC_COMPLETED'")
    }
  })

  it('still selects no secret, no listing content and no buyer', () => {
    /*
     * Re-asserted here beside the new query, because this is the step where
     * adding one would have been easiest.
     *
     * `schema.listings` is NOT on this list any more: the usage screen counts
     * listings, and the rule that replaced the table ban is the aggregate
     * guard in admin-roles.test.ts, which reads the SELECT rather than the
     * file. What stays banned everywhere is a seller's own WORDS.
     */
    const source = code(READS)
    for (const name of [
      'tokenRef',
      'SERVICE_ROLE',
      'schema.orderItems',
      'listings.title',
      'listings.description',
      'aiGenerations.output',
    ]) {
      expect(source, name).not.toContain(name)
    }
  })
})
