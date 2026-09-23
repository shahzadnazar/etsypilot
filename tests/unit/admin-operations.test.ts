import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ATTENTION_STATES,
  ITEM_STATUSES,
  OPERATION_STATES,
  STATE_LABEL,
  STATE_NOTE,
  STUCK_AFTER_MINUTES,
  assessOperation,
  countByState,
  failureReasons,
  needsAttention,
  stuck,
  type OperationItemRow,
  type OperationRow,
} from '@/domain/admin/operations'
import { OPERATOR_NAV } from '@/domain/admin/navigation'

/*
 * BULK OPERATIONS ACROSS EVERY SHOP.
 *
 * The screen where the missing buttons matter most. Retry, clear and roll back
 * are the three most plausible support requests in the product and the three
 * whose consequences are worst — every one of them is an Etsy write against a
 * real seller's live listings.
 *
 * So the guards here are weighted towards two things: that no control exists,
 * and that the per-item read stays a read of REASONS rather than of the
 * seller's copy.
 *
 * Comments are stripped, and the sweeps match a shape rather than a word.
 */

const PAGE = join('app', '(admin)', 'admin', 'operations', 'page.tsx')
const MODEL = join('domain', 'admin', 'operations.ts')
const READS = join('lib', 'repositories', 'admin-reads-every-shop.ts')

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const NOW = new Date('2026-09-23T12:00:00Z')
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60 * 1000)

function row(overrides: Partial<OperationRow> = {}): OperationRow {
  return {
    id: 'op-1',
    shopId: 'shop-1',
    shopName: 'A Shop',
    ownerEmail: 'a@x.com',
    state: 'COMPLETED',
    fields: ['price'],
    listingCount: 10,
    createdAt: minutesAgo(5),
    completedAt: minutesAgo(1),
    ...overrides,
  }
}

function item(overrides: Partial<OperationItemRow> = {}): OperationItemRow {
  return {
    operationId: 'op-1',
    listingId: 'lst-1',
    status: 'FAILED',
    error: 'Price must be greater than zero',
    attempts: 1,
    ...overrides,
  }
}

/* ────────────────── the vocabulary is the product's own ──────────────────── */

describe('the state vocabulary matches the two places that define it', () => {
  it('MATCHES domain/bulk-editor/types.ts, read as text and never imported', () => {
    /*
     * Read rather than imported: that module imports `ListingState` from
     * lib/etsy/interface.ts, which also declares applyListingChanges — and the
     * write-boundary guard fails on an operator module that so much as NAMES
     * the write method. Reading the file keeps the two in step without putting
     * either in the closure.
     */
    const source = readFileSync(join('domain', 'bulk-editor', 'types.ts'), 'utf8')
    const declared = source
      .slice(
        source.indexOf('export const OPERATION_STATES'),
        source.indexOf('export type OperationState'),
      )
      .match(/'[A-Z_]+'/g)!
      .map((entry) => entry.replaceAll("'", ''))

    expect(declared.length).toBeGreaterThan(0)
    expect(new Set(OPERATION_STATES)).toEqual(new Set(declared))
  })

  it('MATCHES THE SCHEMA COMMENT too, which is the other source', () => {
    /*
     * Two sources, both checked, because they have drifted from each other
     * before in this codebase and the screen is built from neither directly.
     */
    const schema = readFileSync(join('db', 'schema', 'index.ts'), 'utf8')
    const table = schema.slice(
      schema.indexOf('export const bulkOperations'),
      schema.indexOf('export const bulkOperationItems'),
    )
    expect(table.length).toBeGreaterThan(100) // positive control
    for (const state of OPERATION_STATES) {
      expect(table, state).toContain(state)
    }
  })

  it('COUNTS NINE, from the sources rather than from a literal', () => {
    /*
     * The brief for this screen said ten states. The schema comment and the
     * state machine both define nine, and nothing was invented to make up the
     * difference — a tenth state with no transition into it would be a bucket
     * that can never be non-zero.
     *
     * Pinned to the SOURCE rather than to the number nine, so this stays true
     * if a tenth is ever genuinely added.
     */
    const source = readFileSync(join('domain', 'bulk-editor', 'types.ts'), 'utf8')
    const declared = source
      .slice(
        source.indexOf('export const OPERATION_STATES'),
        source.indexOf('export type OperationState'),
      )
      .match(/'[A-Z_]+'/g)!
    expect(OPERATION_STATES.length).toBe(declared.length)
  })

  it('matches the item statuses in the schema', () => {
    const schema = readFileSync(join('db', 'schema', 'index.ts'), 'utf8')
    const table = schema.slice(schema.indexOf('export const bulkOperationItems'))
    for (const status of ITEM_STATUSES) {
      expect(table.slice(0, 900), status).toContain(status)
    }
  })

  it('does not IMPORT the bulk editor, which would breach the Etsy boundary', () => {
    const source = code(MODEL)
    expect(source).not.toContain('bulk-editor')
    expect(source).not.toContain('lib/etsy')
    expect(source).not.toContain('applyListingChanges')
  })

  it('has a label and a note for every state', () => {
    for (const state of OPERATION_STATES) {
      expect(STATE_LABEL[state].length, state).toBeGreaterThan(0)
      // Terse is fine and "Every item applied." is nineteen characters. The
      // floor is only here to catch an empty or placeholder note.
      expect(STATE_NOTE[state].length, state).toBeGreaterThan(12)
    }
  })
})

/* ──────────────────────── stuck, and only stuck ──────────────────────────── */

describe('an applying job is stuck only after the window', () => {
  it(`is stuck at exactly ${STUCK_AFTER_MINUTES} minutes and not a minute before`, () => {
    const at = assessOperation(
      row({ state: 'APPLYING', createdAt: minutesAgo(STUCK_AFTER_MINUTES) }),
      [],
      NOW,
    )
    const under = assessOperation(
      row({ state: 'APPLYING', createdAt: minutesAgo(STUCK_AFTER_MINUTES - 1) }),
      [],
      NOW,
    )
    expect(at.stuck).toBe(true)
    expect(under.stuck).toBe(false)
  })

  it('NEVER CALLS A SETTLED JOB STUCK, however old it is', () => {
    /*
     * A completed job's age is not a running time. Reporting one would make
     * every old COMPLETED row look like a four-month apply, and a list of
     * "stuck" jobs that is mostly finished ones is a list nobody reads.
     */
    for (const state of OPERATION_STATES) {
      if (state === 'APPLYING') continue
      const entry = assessOperation(row({ state, createdAt: minutesAgo(100_000) }), [], NOW)
      expect(entry.stuck, state).toBe(false)
      expect(entry.minutesRunning, state).toBeNull()
    }
  })

  it('reports the running time only while it is running', () => {
    expect(
      assessOperation(row({ state: 'APPLYING', createdAt: minutesAgo(42) }), [], NOW)
        .minutesRunning,
    ).toBe(42)
  })

  it('lists the stuck jobs longest-running first', () => {
    const rows = [
      assessOperation(row({ id: 'short', state: 'APPLYING', createdAt: minutesAgo(40) }), [], NOW),
      assessOperation(row({ id: 'long', state: 'APPLYING', createdAt: minutesAgo(400) }), [], NOW),
      assessOperation(row({ id: 'fine', state: 'APPLYING', createdAt: minutesAgo(2) }), [], NOW),
    ]
    expect(stuck(rows).map((entry) => entry.row.id)).toEqual(['long', 'short'])
  })
})

/* ─────────────────────── attention and its order ─────────────────────────── */

describe('what needs a human, and in what order', () => {
  it('PUTS PARTIAL SUCCESS FIRST', () => {
    /*
     * A wholly failed job is obvious and the seller knows. A partial one
     * leaves a shop in a state nobody chose — some listings changed and some
     * did not — and the seller may not have noticed which.
     */
    expect(ATTENTION_STATES[0]).toBe('PARTIAL_SUCCESS')
    const rows = [
      assessOperation(row({ id: 'failed', state: 'FAILED' }), [], NOW),
      assessOperation(row({ id: 'partial', state: 'PARTIAL_SUCCESS' }), [], NOW),
    ]
    expect(needsAttention(rows).map((entry) => entry.row.id)).toEqual(['partial', 'failed'])
  })

  it('puts a STUCK applying job above one that is still legitimately running', () => {
    const rows = [
      assessOperation(row({ id: 'running', state: 'APPLYING', createdAt: minutesAgo(2) }), [], NOW),
      assessOperation(row({ id: 'stuck', state: 'APPLYING', createdAt: minutesAgo(90) }), [], NOW),
    ]
    expect(needsAttention(rows).map((entry) => entry.row.id)).toEqual(['stuck', 'running'])
  })

  it('leaves settled states off the list entirely', () => {
    const rows = OPERATION_STATES.filter(
      (state) => !(ATTENTION_STATES as readonly string[]).includes(state),
    ).map((state) => assessOperation(row({ id: state, state }), [], NOW))
    expect(needsAttention(rows)).toEqual([])
  })
})

/* ────────────────────────── the state counts ─────────────────────────────── */

describe('the state counts cover everything', () => {
  it('SHOWS EVERY STATE, including the ones at zero', () => {
    const counted = countByState([assessOperation(row(), [], NOW)])
    expect(counted.map((entry) => entry.state)).toEqual([...OPERATION_STATES, 'UNKNOWN'])
    expect(counted.find((entry) => entry.state === 'FAILED')?.count).toBe(0)
    expect(counted.find((entry) => entry.state === 'COMPLETED')?.count).toBe(1)
  })

  it('counts an UNRECOGNISED state rather than dropping the row', () => {
    // A row the code cannot interpret still exists, and hiding it would make
    // the counts disagree with the table underneath for no visible reason.
    const entry = assessOperation(row({ state: 'QUEUED' }), [], NOW)
    expect(entry.state).toBe('UNKNOWN')
    expect(countByState([entry]).find((c) => c.state === 'UNKNOWN')?.count).toBe(1)
  })

  it('counts an empty platform as every state at zero', () => {
    expect(countByState([]).length).toBe(OPERATION_STATES.length + 1)
  })
})

/* ──────────────────────── the failure reasons ────────────────────────────── */

describe('per-item failures are what make partial success expressible', () => {
  it('attaches only the FAILED items belonging to that operation', () => {
    const entry = assessOperation(
      row({ id: 'op-1', state: 'PARTIAL_SUCCESS' }),
      [
        item({ operationId: 'op-1', listingId: 'a', status: 'FAILED' }),
        item({ operationId: 'op-1', listingId: 'b', status: 'SUCCEEDED' }),
        item({ operationId: 'op-2', listingId: 'c', status: 'FAILED' }),
      ],
      NOW,
    )
    expect(entry.failures.map((failure) => failure.listingId)).toEqual(['a'])
  })

  it('GROUPS REASONS, busiest first', () => {
    /*
     * Forty listings failing for one reason is one finding, and reading it
     * forty times buries the second reason underneath.
     */
    const entry = assessOperation(
      row({ state: 'FAILED' }),
      [
        item({ listingId: '1', error: 'Rate limited' }),
        item({ listingId: '2', error: 'Rate limited' }),
        item({ listingId: '3', error: 'Price must be greater than zero' }),
      ],
      NOW,
    )
    expect(failureReasons([entry])).toEqual([
      { reason: 'Rate limited', count: 2 },
      { reason: 'Price must be greater than zero', count: 1 },
    ])
  })

  it('COUNTS A FAILURE WITH NO REASON under its own heading', () => {
    /*
     * Dropping it would understate the failures; merging it with a real reason
     * would attribute them wrongly. "We do not know why these failed" is a
     * finding in itself.
     */
    const entry = assessOperation(
      row({ state: 'FAILED' }),
      [item({ listingId: '1', error: null }), item({ listingId: '2', error: null })],
      NOW,
    )
    const reasons = failureReasons([entry])
    expect(reasons).toHaveLength(1)
    expect(reasons[0]!.count).toBe(2)
    expect(reasons[0]!.reason).toMatch(/no reason was recorded/i)
  })

  it('returns nothing when nothing failed, rather than a zero row', () => {
    expect(failureReasons([assessOperation(row(), [], NOW)])).toEqual([])
  })
})

/* ───────────────── the read takes reasons, never content ─────────────────── */

describe('the per-item read is a read of reasons', () => {
  it('SELECTS NEITHER before_value NOR after_value', () => {
    /*
     * They hold the listing copy the job was changing — the old title and the
     * new one. An operator diagnosing a failure needs the reason, not the
     * words.
     */
    const source = code(READS)
    const query = source.slice(
      source.indexOf('export async function adminListOperations'),
      source.indexOf('export async function adminListOperations') + 2600,
    )
    expect(query.length).toBeGreaterThan(200) // positive control
    for (const column of [
      'bulkOperationItems.beforeValue',
      'bulkOperationItems.afterValue',
      'bulkOperations.config',
    ]) {
      expect(query, column).not.toContain(column)
    }
  })

  it('NARROWS THE ITEMS to failed rows on failing operations', () => {
    // An unfiltered read of this table would be a change history of every bulk
    // edit ever made.
    const source = code(READS)
    const query = source.slice(
      source.indexOf('export async function adminListOperations'),
      source.indexOf('export async function adminListOperations') + 2600,
    )
    expect(query).toContain('inArray(schema.bulkOperationItems.operationId, failing)')
    expect(query).toContain("eq(schema.bulkOperationItems.status, 'FAILED')")
    expect(query).toContain("['FAILED', 'PARTIAL_SUCCESS']")
  })

  it('HAS NO FIELD THE CONTENT COULD ARRIVE IN', () => {
    /*
     * Field SHAPES, not words. A substring sweep for `config` fired on the
     * DRAFT state note — "Being configured. Nothing has been validated or
     * applied." — which is the page explaining the state, not a field holding
     * a seller's find-and-replace strings. The umpteenth instance in this
     * build of a guard matching its own documentation.
     */
    const model = code(MODEL)
    const FIELD_SHAPES: [string, RegExp][] = [
      ['a before value', /\bbeforeValue\b|\bbefore\s*:/],
      ['an after value', /\bafterValue\b|\bafter\s*:/],
      ['the job configuration', /\bconfig\s*[:.]/],
    ]
    for (const [name, pattern] of FIELD_SHAPES) {
      expect(model, name).not.toMatch(pattern)
    }
  })

  it('FINDS THOSE COLUMNS WHERE THEY REALLY ARE', () => {
    // The positive control for the two sweeps above.
    const schema = readFileSync(join('db', 'schema', 'index.ts'), 'utf8')
    expect(schema).toContain("beforeValue: jsonb('before_value')")
    expect(schema).toContain("afterValue: jsonb('after_value')")
  })

  it('reads the field NAMES but not their values', () => {
    // "What was it changing" is answerable without reading what it was
    // changing them to.
    const source = code(READS)
    expect(source).toContain('fields: schema.bulkOperations.fields')
  })
})

/* ──────────── the page is gated, read-only, and retries nothing ──────────── */

describe('the screen offers no retry, clear, cancel or rollback', () => {
  it('gates itself on operations.view', () => {
    expect(code(PAGE)).toContain("requireAdmin('operations.view')")
  })

  it('is offered in the navigation behind the same key', () => {
    const item = OPERATOR_NAV.flatMap((group) => group.items).find(
      (entry) => entry.href === '/admin/operations',
    )
    expect(item?.gate).toEqual({ kind: 'permission', key: 'operations.view' })
  })

  it('CONTAINS NO CONTROL OF ANY KIND', () => {
    const source = code(PAGE)
    for (const control of ['<form', '<button', '<input', 'action=', "'use server'", 'onClick', 'href=']) {
      expect(source, control).not.toContain(control)
    }
  })

  it('reaches no Etsy service, no bulk-editor service, and no database handle', () => {
    const source = code(PAGE)
    for (const reach of ['getEtsyService', 'applyListingChanges', 'getDb', 'shopContext', 'bulk-editor/service']) {
      expect(source, reach).not.toContain(reach)
    }
  })

  it('OFFERS NO ROLLBACK ACTION, while still naming the rollback STATES', () => {
    /*
     * A substring sweep for `rollback` fired on ROLLBACK_AVAILABLE and
     * ROLLED_BACK — two of the nine states the screen has to be able to
     * report — and on the page's own sentence saying there is no rollback
     * here. Both are the screen doing its job.
     *
     * What is forbidden is an ACTION: a call, a member access, an import or a
     * link. A state label has none of those shapes.
     */
    const source = code(PAGE)
    const ACTION_SHAPES: [string, RegExp][] = [
      ['a call', /\browllback\(|\brollback\w*\s*\(/i],
      ['a member access', /\.roll(back|edBack)\b/i],
      ['an import', /from\s+'[^']*rollback/i],
      ['a link', /href=[^>]*rollback/i],
      ['a retry call', /\bretry\w*\s*\(/i],
    ]
    for (const [name, pattern] of ACTION_SHAPES) {
      expect(source, name).not.toMatch(pattern)
    }

    /*
     * And the converse, which is the half that matters: the two rollback
     * STATES are still reportable. The page does not spell them out — it
     * renders STATE_LABEL, so the labels live in the model — and asserting
     * against the page's own source was the wrong place to look. Checked where
     * they are.
     */
    expect(STATE_LABEL.ROLLBACK_AVAILABLE).toBe('Rollback available')
    expect(STATE_LABEL.ROLLED_BACK).toBe('Rolled back')
    expect(source).toContain('STATE_LABEL[state]')
  })

  it('SAYS SO, naming all four and the gate they would bypass', () => {
    /*
     * D70's quieter cousin: a screen whose missing control reads as a to-do is
     * a screen where an operator waits for a fix instead of telling the seller
     * what to do. Whitespace-normalised, because the sentence wraps.
     */
    const prose = readFileSync(PAGE, 'utf8').replace(/\s+/g, ' ')
    expect(prose).toMatch(/no retry, no clear, no cancel and no rollback/i)
    expect(prose).toMatch(/far end of that gate without its near end/i)
    expect(prose).toMatch(/seller.{0,10}s to retry from the bulk editor/i)
  })
})
