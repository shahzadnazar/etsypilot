import { describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import {
  LISTING_CONTENT_MAX_AGE_MS,
  MAX_CONTENT_AGE_MS,
  OTHER_CONTENT_MAX_AGE_MS,
  maxContentAgeMs,
  windowHours,
  withinWindow,
} from '@/lib/etsy/freshness'
import { SYNC_AGGREGATES } from '@/lib/repositories/sync-state'
import { withheldReason, refreshWouldHelp, type ShopDataSource } from '@/domain/sync/source'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   NO SURFACE MAY DISPLAY ETSY CONTENT WHOSE AGGREGATE WAS READ OUTSIDE
 *   THAT AGGREGATE'S WINDOW.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Etsy API Terms §5, "Display of Data":
 *
 *     "You will not display listing content more than six (6) hours older
 *      than the corresponding information [on the Etsy Site or Etsy Apps].
 *      You will not display any other Etsy content more than twenty-four (24)
 *      hours older than the content displayed."
 *
 * Before this task nothing refreshed at all. syncShopListings and
 * syncShopOrders existed, were tested, and had no caller outside
 * tests/integration — so a seller could connect a shop and read "Not synced
 * yet" for ever, and docs/legal/PRIVACY-POLICY-DRAFT.md §5 carried a CONFIRM
 * note claiming "a sync runs when you connect a shop and when it is
 * triggered", which was false in both halves.
 *
 * ── WHY THIS IS NOT A LIST OF PAGE NAMES ──────────────────────────────────
 *
 * The obvious guard enumerates /profit, /analytics, /shop-pulse and the rest
 * and checks each one. It passes for ever, including on the day somebody adds
 * a screen — which is the only day it matters. So the rule is tied to two
 * things that a new screen cannot avoid touching:
 *
 *   THE WINDOWS, by value. 6h and 24h, each negative-controlled, so a constant
 *   edited to 7 or 25 fails here rather than at an audit.
 *
 *   THE AGGREGATE, through the union. Every member of SYNC_AGGREGATES must
 *   have a window; the loaders must withhold rows for every source that is not
 *   a displayable SYNCED one; and no file under app/ or components/ may decide
 *   for itself what the source kinds mean. A screen added next month either
 *   calls withheldReason() or renders nothing at all, and if it hand-rolls the
 *   comparison this fails.
 *
 * ── AND IT HAS TO SURVIVE ITS OWN DOCUMENTATION ───────────────────────────
 *
 * Eight separate guards in this repo have been broken by matching their own
 * comments. The sweeps below read `code()`, which strips comments, and this
 * file is excluded from every tree it walks — the literals it has to contain
 * in order to check for them are exactly the literals it bans.
 */

const ROOTS = ['app', 'components']

/** This file states the banned literals in order to ban them. */
const SELF = 'tests/unit/freshness-window.test.ts'

/**
 * The one module allowed to read the source kinds, because it is the module
 * every surface asks instead of reading them.
 */
const DECIDER = 'components/sync/data-withheld.tsx'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const surfaceFiles = ROOTS.flatMap((root) => walk(root)).sort()

describe('Etsy API Terms §5: the display windows', () => {
  it('are six hours and twenty-four hours, and nothing else', () => {
    /*
     * The negative control for both numbers. These are quoted from the clause,
     * so an edit to either is a change to what the product promises Etsy and a
     * change to what docs/legal/PRIVACY-POLICY-DRAFT.md §5 tells sellers —
     * tests/unit/legal-claims.test.ts reads the same two constants and fails
     * if the document and the code disagree.
     */
    expect(LISTING_CONTENT_MAX_AGE_MS).toBe(6 * 60 * 60 * 1000)
    expect(OTHER_CONTENT_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000)
    expect(windowHours('LISTINGS')).toBe(6)
    expect(windowHours('ORDERS')).toBe(24)
  })

  it('cover every aggregate that reads from our own tables', () => {
    /*
     * Anti-vacuity, and the half that a total Record cannot state on its own:
     * the map is total by the type system, but a SYNC_AGGREGATES that had been
     * emptied would make it trivially total and every sweep below vacuous.
     */
    expect(SYNC_AGGREGATES.length).toBeGreaterThanOrEqual(2)
    expect(Object.keys(MAX_CONTENT_AGE_MS).sort()).toEqual([...SYNC_AGGREGATES].sort())
    for (const aggregate of SYNC_AGGREGATES) {
      expect(maxContentAgeMs(aggregate), `${aggregate} has no window`).toBeGreaterThan(0)
    }
  })

  it('are applied per aggregate, not one window over everything', () => {
    /*
     * Six hours over orders would be four times the Etsy requests for nothing;
     * twenty-four over listings is the term breach. The two numbers being
     * different is the property, so a map that collapsed to one value fails
     * here even if both values are legal on their own.
     */
    expect(maxContentAgeMs('LISTINGS')).not.toBe(maxContentAgeMs('ORDERS'))
  })

  it('treat the boundary and both sides of it the way the clause words it', () => {
    const now = new Date('2026-10-12T12:00:00.000Z')
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()

    // "more than six (6) hours older" — six hours exactly is not more than six.
    expect(withinWindow(ago(LISTING_CONTENT_MAX_AGE_MS), 'LISTINGS', now)).toBe(true)
    expect(withinWindow(ago(LISTING_CONTENT_MAX_AGE_MS + 1000), 'LISTINGS', now)).toBe(false)
    expect(withinWindow(ago(OTHER_CONTENT_MAX_AGE_MS), 'ORDERS', now)).toBe(true)
    expect(withinWindow(ago(OTHER_CONTENT_MAX_AGE_MS + 1000), 'ORDERS', now)).toBe(false)

    // And the windows are not interchangeable: seven hours is fine for orders
    // and is not fine for listings. Both numbers, in one assertion each.
    expect(withinWindow(ago(7 * 3_600_000), 'LISTINGS', now)).toBe(false)
    expect(withinWindow(ago(7 * 3_600_000), 'ORDERS', now)).toBe(true)
    expect(withinWindow(ago(25 * 3_600_000), 'ORDERS', now)).toBe(false)
  })
})

describe('what a stale aggregate does to a surface', () => {
  const now = new Date('2026-10-12T12:00:00.000Z')
  const staleListings: ShopDataSource = {
    kind: 'STALE',
    aggregate: 'LISTINGS',
    lastSyncedAt: new Date(now.getTime() - 7 * 3_600_000).toISOString(),
    maxAgeMs: LISTING_CONTENT_MAX_AGE_MS,
  }

  it('is withheld, and is told apart from never having been read', () => {
    expect(withheldReason(staleListings)).toBe('STALE')
    expect(withheldReason({ kind: 'NOT_SYNCED' })).toBe('NEVER_SYNCED')
    expect(withheldReason({ kind: 'NO_SHOP' })).toBe('NO_SHOP')
    expect(withheldReason({ kind: 'DEMO' })).toBeNull()
    expect(withheldReason({ kind: 'SYNCED', lastSyncedAt: now.toISOString() })).toBeNull()
  })

  it('asks for a re-read, and a missing shop row does not', () => {
    expect(refreshWouldHelp(staleListings)).toBe(true)
    expect(refreshWouldHelp({ kind: 'NOT_SYNCED' })).toBe(true)
    expect(refreshWouldHelp({ kind: 'NO_SHOP' })).toBe(false)
    expect(refreshWouldHelp({ kind: 'DEMO' })).toBe(false)
  })

  it('never reaches a loader as rows: the gate is "not SYNCED", not a list', () => {
    /*
     * The loaders are where the rows would come from, and the shape that makes
     * a new withholding state safe by default is `!== 'SYNCED'` rather than an
     * enumeration of the states that withhold. Read from the source, because
     * the loaders are `server-only` and bound to a database; the behaviour
     * itself is measured in tests/integration/refresh-on-read.int.ts.
     */
    for (const loader of ['domain/orders/load.ts', 'domain/listings/load.ts']) {
      const source = code(loader)
      const gate = source.indexOf("source.kind !== 'SYNCED'")
      expect(gate, `${loader} no longer gates its read on a displayable source`).toBeGreaterThan(-1)

      // And every read of the mirrored tables happens after that gate.
      for (const read of ['readOrders(', 'readListings(']) {
        const at = source.indexOf(read)
        if (at === -1) continue
        expect(at, `${loader} reads ${read} before deciding whether it may`).toBeGreaterThan(gate)
      }
    }
  })

  it('is decided by shopDataSource before it reports a source as displayable', () => {
    /*
     * Scoped to the FUNCTION BODY, not the file. The union above it declares
     * `kind: 'SYNCED'` as a type, which comes first in the file and made the
     * first draft of this assertion fail for a reason that had nothing to do
     * with the order anything happens in.
     */
    const file = code('domain/sync/source.ts')
    const at = file.indexOf('export async function shopDataSource')
    expect(at, 'shopDataSource is gone').toBeGreaterThan(-1)
    const body = file.slice(at, file.indexOf('\nexport ', at + 1))

    const checks = body.indexOf('withinWindow(')
    const synced = body.indexOf("kind: 'SYNCED'")
    expect(checks, 'shopDataSource no longer consults the window').toBeGreaterThan(-1)
    expect(synced, 'shopDataSource no longer reports a SYNCED source').toBeGreaterThan(-1)
    expect(
      synced,
      'shopDataSource calls an aggregate SYNCED before asking whether it is inside its window',
    ).toBeGreaterThan(checks)
  })
})

describe('no surface decides for itself what a source kind means', () => {
  it('finds the surfaces it is reasoning about', () => {
    /*
     * Anti-vacuity, the assertion that matters most here: the sweep below is
     * satisfied by a tree with no screens in it. These are the screens that
     * show a seller Etsy-derived content, and the count is a floor rather than
     * an equality so that adding one is not a test edit.
     */
    expect(surfaceFiles.length).toBeGreaterThan(50)
    const askers = surfaceFiles.filter((f) => /\bwithheldReason\s*\(/.test(code(f)))
    expect(
      askers.length,
      'no surface asks whether its data may be displayed — the rule below is vacuous',
    ).toBeGreaterThanOrEqual(5)
    expect(askers).toContain('app/(dashboard)/profit/page.tsx')
    expect(askers).toContain('app/(dashboard)/analytics/page.tsx')
    expect(askers).toContain('app/(dashboard)/shop-pulse/page.tsx')
  })

  it('and none of them compares the kind itself', () => {
    /*
     * The rule. A screen that writes its own `source.kind === …` is a screen
     * that will not learn about the next state added to the union — and the
     * failure mode is the one this product exists to prevent: the loader has
     * already withheld the rows, so the page falls through and renders a
     * screenful of zeroes as a measurement of the seller's shop.
     *
     * DEMO is deliberately not banned. It names a mode, not a freshness, and
     * every screen is entitled to ask whether it is showing the sample
     * catalogue; isDemoMode() answers the same question elsewhere.
     */
    const banned = ['SYNCED', 'NOT_SYNCED', 'STALE', 'NO_SHOP']
    const offences: string[] = []
    for (const file of surfaceFiles) {
      if (file === DECIDER) continue
      const source = code(file)
      for (const kind of banned) {
        if (new RegExp(`\\.kind\\s*(===|!==)\\s*['"]${kind}['"]`).test(source)) {
          offences.push(`${file}: compares .kind against '${kind}'`)
        }
      }
    }
    expect(
      offences,
      'ask withheldReason(source) instead — see components/sync/data-withheld.tsx',
    ).toEqual([])
  })

  it('and the decider still handles every member of the union', () => {
    /*
     * The other half, and the vacuity the sweep above cannot see: if
     * withheldReason stopped distinguishing the states, every surface would
     * dutifully call a function that always said the same thing. Checked by
     * behaviour rather than by reading the file.
     */
    const answers = new Set(
      (
        [
          { kind: 'DEMO' },
          { kind: 'NOT_SYNCED' },
          { kind: 'NO_SHOP' },
          { kind: 'SYNCED', lastSyncedAt: '2026-10-12T12:00:00.000Z' },
          {
            kind: 'STALE',
            aggregate: 'ORDERS',
            lastSyncedAt: '2026-10-10T12:00:00.000Z',
            maxAgeMs: OTHER_CONTENT_MAX_AGE_MS,
          },
        ] satisfies ShopDataSource[]
      ).map((source) => String(withheldReason(source))),
    )
    expect(answers.size).toBe(4)
  })

  it('and this guard does not match its own text', () => {
    /*
     * Eight recorded instances in this repo of a guard broken by its own
     * documentation. This file necessarily contains every literal it bans, so
     * it is excluded from the walk — and that exclusion is asserted rather
     * than assumed, because the sweep passing while silently reading no files
     * looks identical to the sweep passing.
     */
    expect(surfaceFiles).not.toContain(SELF)
    expect(surfaceFiles).toContain(DECIDER)
  })
})
