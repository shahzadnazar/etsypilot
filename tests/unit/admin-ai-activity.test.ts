import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  COST_STATEMENT,
  GENERATION_KINDS,
  GENERATION_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
  acceptanceRate,
  platformTotals,
  summariseByShop,
  type GenerationTally,
} from '@/domain/admin/ai-activity'
import { OPERATOR_NAV } from '@/domain/admin/navigation'

/*
 * AI ACTIVITY ACROSS EVERY SHOP.
 *
 * Two claims, and both are about restraint rather than about arithmetic:
 *
 *   THE TEXT IS NOT READ    ai_generations.input and .output are a seller's
 *                           own listing copy. Reading it is PERMITTED and is
 *                           still not done, so the guard has to enforce a
 *                           design decision rather than a rule.
 *   THE RATE IS HONEST      a DRAFT is undecided. Counting it as a rejection
 *                           reports the seller not having got to it as a
 *                           verdict on the AI.
 *
 * Comments are stripped, and the sweeps match a shape rather than a word.
 */

const PAGE = join('app', '(admin)', 'admin', 'ai', 'page.tsx')
const MODEL = join('domain', 'admin', 'ai-activity.ts')
const READS = join('lib', 'repositories', 'admin-reads-every-shop.ts')

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const SHOPS = [
  { shopId: 's1', shopName: 'Alpha', ownerEmail: 'a@x.com', isDemo: false },
  { shopId: 's2', shopName: 'Beta', ownerEmail: 'b@x.com', isDemo: false },
]

const tally = (
  shopId: string,
  kind: string,
  status: string,
  count: number,
): GenerationTally => ({ shopId, kind, status, count })

/* ───────────────────── the vocabulary is the schema's ───────────────────── */

describe('the kinds and statuses are the schema’s own', () => {
  it('MATCHES the column comments, which are read as text', () => {
    const schema = readFileSync(join('db', 'schema', 'index.ts'), 'utf8')
    const table = schema.slice(
      schema.indexOf('export const aiGenerations'),
      schema.indexOf('export const aiGenerations') + 900,
    )
    expect(table.length).toBeGreaterThan(100) // positive control

    for (const kind of GENERATION_KINDS) {
      expect(table, kind).toContain(kind)
    }
    for (const status of GENERATION_STATUSES) {
      expect(table, status).toContain(status)
    }
  })

  it('HAS NO FAILURE STATE, which the usage screen depends on', () => {
    /*
     * D37: a failed generation is never counted. That holds because a failed
     * generation leaves no row — there is no status it could be written with.
     * If one is ever added, this goes red and both screens need revisiting.
     */
    expect(GENERATION_STATUSES as readonly string[]).not.toContain('FAILED')
    expect(GENERATION_STATUSES as readonly string[]).not.toContain('ERROR')
  })

  it('has a label for every kind and status', () => {
    for (const kind of GENERATION_KINDS) expect(KIND_LABEL[kind].length, kind).toBeGreaterThan(0)
    for (const status of GENERATION_STATUSES) {
      expect(STATUS_LABEL[status].length, status).toBeGreaterThan(0)
    }
  })

  it('calls a DRAFT undecided, not "not accepted"', () => {
    // The label carries the meaning: a reader scanning the column must not
    // read an undecided draft as a rejection.
    expect(STATUS_LABEL.DRAFT.toLowerCase()).toContain('not yet decided')
  })
})

/* ─────────────────────────── the text is not read ────────────────────────── */

describe('the generated text never reaches the screen', () => {
  it('SELECTS NEITHER input NOR output', () => {
    const source = code(READS)
    const query = source.slice(
      source.indexOf('export async function adminCountGenerations'),
      source.indexOf('export async function adminCountGenerations') + 1400,
    )
    expect(query.length).toBeGreaterThan(100) // positive control
    for (const column of [
      'aiGenerations.input',
      'aiGenerations.output',
      'aiGenerations.listingId',
      'aiGenerations.actorId',
    ]) {
      expect(query, column).not.toContain(column)
    }
  })

  it('HAS NO FIELD THE TEXT COULD ARRIVE IN', () => {
    /*
     * The structural half. A query that stopped selecting the columns could
     * start again; a type with nowhere to put the text cannot carry it without
     * the change being visible in the diff.
     */
    const model = code(MODEL)
    for (const field of ['input', 'output', 'text:', 'body:', 'content:']) {
      expect(model, field).not.toContain(field)
    }
  })

  it('SAYS SO ON THE PAGE, because an unexplained absence gets helpfully fixed', () => {
    const source = readFileSync(PAGE, 'utf8')
    expect(source).toMatch(/generated text is deliberately not shown/i)
    expect(source).toMatch(/routine sight\s+rather than a deliberate act/i)
  })

  it('FINDS THOSE COLUMNS WHERE THEY REALLY ARE', () => {
    // The positive control. A sweep for absent columns passes perfectly when
    // the names are wrong, so it is first pointed at the schema.
    const schema = readFileSync(join('db', 'schema', 'index.ts'), 'utf8')
    expect(schema).toContain("input: jsonb('input')")
    expect(schema).toContain("output: text('output')")
  })
})

/* ──────────────────────── the acceptance rate ────────────────────────────── */

describe('the acceptance rate is honest about what it covers', () => {
  it('EXCLUDES DRAFTS FROM THE DENOMINATOR', () => {
    /*
     * The figure this screen most easily gets wrong. A shop that generated
     * fifty drafts this morning has not rejected them — counting them as
     * rejections would report the seller not having got to them yet as a 0%
     * verdict on the AI.
     */
    const rate = acceptanceRate({ ACCEPTED: 3, REJECTED: 1, DRAFT: 96 })
    expect(rate.value).toBe(75)
  })

  it('CARRIES THE COVERAGE, so a rate over four of a hundred says so', () => {
    const rate = acceptanceRate({ ACCEPTED: 3, REJECTED: 1, DRAFT: 96 })
    expect(rate.provenance.coverage).toBe(4)
    expect(rate.provenance.limitations?.join(' ')).toContain('96')
    expect(rate.provenance.limitations?.join(' ')).toMatch(/still drafts/i)
  })

  it('claims no limitation at full coverage', () => {
    const rate = acceptanceRate({ ACCEPTED: 3, REJECTED: 1, DRAFT: 0 })
    expect(rate.provenance.coverage).toBe(100)
    expect(rate.provenance.limitations).toBeUndefined()
  })

  it('IS UNAVAILABLE, NOT ZERO, when nothing has been decided', () => {
    /*
     * The single most misleading number this screen could carry. A shop with
     * only drafts has no acceptance rate at all.
     */
    const onlyDrafts = acceptanceRate({ ACCEPTED: 0, REJECTED: 0, DRAFT: 40 })
    expect(onlyDrafts.provenance.type).toBe('UNAVAILABLE')
    expect(onlyDrafts.value).toBeNull()
    expect(onlyDrafts.provenance.methodology).toMatch(/still a draft/i)
  })

  it('distinguishes "nothing generated" from "nothing decided"', () => {
    // Both are UNAVAILABLE and they are not the same fact, so they do not
    // share a sentence (D34).
    const none = acceptanceRate({ ACCEPTED: 0, REJECTED: 0, DRAFT: 0 })
    const undecided = acceptanceRate({ ACCEPTED: 0, REJECTED: 0, DRAFT: 40 })
    expect(none.provenance.methodology).toMatch(/no generations/i)
    expect(undecided.provenance.methodology).toMatch(/still a draft/i)
    expect(none.provenance.methodology).not.toBe(undecided.provenance.methodology)
  })

  it('reports a genuine 0% when everything decided was rejected', () => {
    // The converse of the rule above, and it matters: an honest zero must
    // still be reachable, or "unavailable" would be hiding a real finding.
    const rate = acceptanceRate({ ACCEPTED: 0, REJECTED: 12, DRAFT: 0 })
    expect(rate.provenance.type).toBe('CALCULATED')
    expect(rate.value).toBe(0)
  })

  it('IS NEVER VERIFIED, because a ratio is a formula over inputs', () => {
    expect(acceptanceRate({ ACCEPTED: 1, REJECTED: 1, DRAFT: 0 }).provenance.type).not.toBe(
      'VERIFIED',
    )
  })
})

/* ───────────────────────────── the folding ──────────────────────────────── */

describe('the tallies fold into per-shop and platform figures', () => {
  it('sums a shop across kinds and statuses', () => {
    const activity = summariseByShop(
      [
        tally('s1', 'TITLE', 'ACCEPTED', 4),
        tally('s1', 'TITLE', 'REJECTED', 1),
        tally('s1', 'TAGS', 'DRAFT', 5),
      ],
      SHOPS,
    )
    const alpha = activity.find((shop) => shop.shopId === 's1')!
    expect(alpha.total).toBe(10)
    expect(alpha.byKind.TITLE).toBe(5)
    expect(alpha.byKind.TAGS).toBe(5)
    expect(alpha.byStatus.ACCEPTED).toBe(4)
    expect(alpha.acceptance.value).toBe(80)
  })

  it('INCLUDES A SHOP WITH NOTHING, at zero, rather than dropping it', () => {
    const activity = summariseByShop([tally('s1', 'TITLE', 'ACCEPTED', 1)], SHOPS)
    const beta = activity.find((shop) => shop.shopId === 's2')!
    expect(beta.total).toBe(0)
    expect(beta.acceptance.value).toBeNull()
  })

  it('COUNTS AN UNRECOGNISED KIND rather than silently dropping it', () => {
    /*
     * Dropping it would make the per-kind figures add up to less than the
     * total with nothing on screen to explain the gap — and the gap is the
     * finding.
     */
    const activity = summariseByShop(
      [tally('s1', 'HAIKU', 'ACCEPTED', 7), tally('s1', 'TITLE', 'ACCEPTED', 3)],
      SHOPS,
    )
    const alpha = activity.find((shop) => shop.shopId === 's1')!
    expect(alpha.total).toBe(10)
    expect(alpha.byKind.TITLE).toBe(3)
    expect(alpha.unrecognised).toBe(7)
  })

  it('ignores a tally for a shop that is not in the list', () => {
    const activity = summariseByShop([tally('ghost', 'TITLE', 'ACCEPTED', 9)], SHOPS)
    expect(activity.every((shop) => shop.total === 0)).toBe(true)
  })

  it('sorts busiest first', () => {
    const activity = summariseByShop(
      [tally('s2', 'TITLE', 'ACCEPTED', 9), tally('s1', 'TITLE', 'ACCEPTED', 1)],
      SHOPS,
    )
    expect(activity.map((shop) => shop.shopId)).toEqual(['s2', 's1'])
  })

  it('totals the platform and counts only the shops that generated anything', () => {
    const activity = summariseByShop([tally('s1', 'TITLE', 'ACCEPTED', 4)], SHOPS)
    const totals = platformTotals(activity)
    expect(totals.total).toBe(4)
    expect(totals.activeShops).toBe(1)
    expect(totals.byKind.TITLE).toBe(4)
    expect(totals.acceptance.value).toBe(100)
  })

  it('reports an empty platform as zero across every bucket, not as nothing', () => {
    const totals = platformTotals(summariseByShop([], SHOPS))
    expect(totals.total).toBe(0)
    for (const kind of GENERATION_KINDS) expect(totals.byKind[kind], kind).toBe(0)
    expect(totals.acceptance.value).toBeNull()
  })
})

/* ─────────────────────── volume, not invented money ─────────────────────── */

describe('there is no cost figure, and the page says why', () => {
  it('INVENTS NO PRICE', () => {
    /*
     * Nothing in the schema records money, tokens or a model against a
     * generation. Multiplying a count by a rate typed into a page would be a
     * number that looks precise and is invented (D34).
     */
    /*
     * SHAPES, NOT WORDS — the twelfth instance in this build of a guard
     * matching its own documentation. COST_STATEMENT says, in words, that
     * nothing records "a price, a token count or a model", and a sweep for
     * `token` fired on the sentence explaining that there are none.
     *
     * What is forbidden is a cost FIGURE: a currency literal, a per-unit rate,
     * a field that could hold one, or arithmetic over one. English prose about
     * their absence has none of those shapes.
     */
    const INVENTED_COST: [string, RegExp][] = [
      ['a currency literal', /\$\s*\d/],
      ['a currency code beside a number', /\d\s*USD\b/],
      ['a per-unit rate', /(perToken|costPer|pricePer|ratePer)/i],
      ['a cost field', /\b(cost|price|tokens?|spend)\s*[:=]/i],
      ['arithmetic over a rate', /\*\s*0\.\d+/],
    ]
    for (const file of [MODEL, PAGE]) {
      const source = code(file)
      for (const [name, pattern] of INVENTED_COST) {
        expect(source, `${file} :: ${name}`).not.toMatch(pattern)
      }
    }
  })

  it('STILL LETS THE PAGE SAY there is no cost to show', () => {
    // The converse. If this goes red because the sentence was deleted to make
    // the sweep pass, the sweep has won an argument it should have lost.
    expect(COST_STATEMENT).toMatch(/token count/i)
    expect(readFileSync(PAGE, 'utf8')).toContain('{COST_STATEMENT}')
  })

  it('states what the volume figure is instead', () => {
    expect(COST_STATEMENT).toMatch(/volume, not money/i)
    expect(COST_STATEMENT).toMatch(/invented/i)
    expect(code(PAGE)).toContain('{COST_STATEMENT}')
  })

  it('CONFIRMS THE SCHEMA HAS NO COST COLUMN, so the claim is checked', () => {
    const schema = readFileSync(join('db', 'schema', 'index.ts'), 'utf8')
    const table = schema.slice(
      schema.indexOf('export const aiGenerations'),
      schema.indexOf('export const aiGenerations') + 900,
    )
    for (const column of ['cost', 'token', 'price', 'model']) {
      expect(table.toLowerCase(), column).not.toContain(column)
    }
  })
})

/* ────────────────────── the page is gated and read-only ──────────────────── */

describe('the screen is gated, read-only, and approves nothing', () => {
  it('gates itself on ai.view', () => {
    expect(code(PAGE)).toContain("requireAdmin('ai.view')")
  })

  it('is offered in the navigation behind the same key', () => {
    const item = OPERATOR_NAV.flatMap((group) => group.items).find(
      (entry) => entry.href === '/admin/ai',
    )
    expect(item?.gate).toEqual({ kind: 'permission', key: 'ai.view' })
  })

  it('CONTAINS NO CONTROL — no retry, no approve, no clear', () => {
    const source = code(PAGE)
    for (const control of ['<form', '<button', '<input', 'action=', "'use server'", 'onClick']) {
      expect(source, control).not.toContain(control)
    }
  })

  it('says so, naming the gate AI drafts actually go through', () => {
    // D37: AI reaches Etsy through the bulk editor or not at all, and the
    // operator area is outside that gate by construction.
    // Whitespace-normalised first: the sentence wraps across lines in the
    // source, and a regex over the raw file fails on the newline rather than
    // on the claim.
    const prose = readFileSync(PAGE, 'utf8').replace(/\s+/g, ' ')
    expect(prose).toMatch(/bulk editor.{0,10}s confirmation gate or not at all/i)
  })

  it('states its window rather than implying one', () => {
    // "347 generations" with no period attached is not a figure.
    expect(code(PAGE)).toContain('WINDOW_DAYS')
    expect(code(PAGE)).toContain('Last ${WINDOW_DAYS} days')
  })
})
