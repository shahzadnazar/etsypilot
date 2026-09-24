import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import {
  NEEDS_ATTENTION_STATUSES,
  STATUS_COPY,
  SUBSCRIPTION_STATUSES,
  TRIAL_ENDING_SOON_DAYS,
  countByPlan,
  countByStatus,
  limitsLine,
  needsAttention,
  planBucket,
  statusBucket,
  trialsEndingSoon,
  type SubscriptionRow,
} from '@/domain/admin/subscriptions'
import { PLANS } from '@/domain/billing/plans'
import { OPERATOR_NAV } from '@/domain/admin/navigation'

/*
 * SUBSCRIPTIONS ACROSS EVERY ACCOUNT.
 *
 * Three things can go wrong here and all three are quiet:
 *
 *   A LIMIT IS RESTATED    D46. "200 listings" written beside an operator
 *                          table is correct until the plan changes.
 *   A REFUND APPEARS       D83 removed them from the product. A column that
 *                          can still draw one is a screen waiting to lie.
 *   NO ROW READS AS FREE   D34. Never been through billing, and chose the free
 *                          tier, are different facts.
 *
 * Comments are stripped before anything is matched, and the sweeps match a
 * shape rather than a word — eight times in this build a guard has matched its
 * own documentation.
 */

const PAGE = 'app/(admin)/admin/subscriptions/page.tsx'
const MODEL = 'domain/admin/subscriptions.ts'
const READS = 'lib/repositories/admin-reads-every-shop.ts'

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const NOW = new Date('2026-09-23T12:00:00Z')
const day = (offset: number) => new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000)

function row(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    userId: 'u1',
    email: 'a@example.com',
    shopName: 'A Shop',
    plan: 'GROWTH',
    status: 'ACTIVE',
    renewsAt: day(20),
    trialEndsAt: null,
    cancelledAt: null,
    ...overrides,
  }
}

const countFor = (rows: SubscriptionRow[], bucket: string) =>
  countByPlan(rows).find((entry) => entry.bucket === bucket)?.count.value

/* ───────────────────────── the vocabulary is the product's ───────────────── */

describe('the status list is the billing model’s own', () => {
  it('MATCHES lib/billing/interface.ts, checked by the compiler and again here', () => {
    /*
     * domain/admin/subscriptions.ts declares the array `satisfies readonly
     * SubscriptionStatus[]` AND carries a type-level exhaustiveness check, so
     * a status added to the union with no entry here does not compile. This
     * asserts the same thing at runtime, because a cast would silence the type
     * and leave the summary silently one bucket short.
     */
    const source = readFileSync('lib/billing/interface.ts', 'utf8')
    const declared = source
      .slice(
        source.indexOf('export type SubscriptionStatus'),
        source.indexOf('export interface Subscription'),
      )
      .match(/'[A-Z_]+'/g)!
      .map((entry) => entry.replaceAll("'", ''))

    expect(declared.length).toBeGreaterThan(0)
    expect(new Set(SUBSCRIPTION_STATUSES)).toEqual(new Set(declared))
  })

  it('has copy for every status, and both attention statuses are real ones', () => {
    for (const status of SUBSCRIPTION_STATUSES) {
      expect(STATUS_COPY[status].label.length, status).toBeGreaterThan(0)
      expect(STATUS_COPY[status].detail.length, status).toBeGreaterThan(10)
    }
    for (const status of NEEDS_ATTENTION_STATUSES) {
      expect(SUBSCRIPTION_STATUSES as readonly string[], status).toContain(status)
    }
  })
})

/* ──────────────────────── the limits are not restated ────────────────────── */

describe('plan limits are read from PLANS, never written here (D46)', () => {
  it('RESTATES NO LIMIT as a literal, in the model or on the page', () => {
    /*
     * The failure this catches: someone writes "2,000 listings" into the
     * operator table because it is quicker than threading the plan through.
     * It is correct that day and unowned afterwards.
     *
     * MATCHED AS A SHAPE, not as a digit run, and the first draft was the
     * digit run: it flagged `DAY_MS = 24 * 60 * 60 * 1000` because Solo's AI
     * limit happens to be 60. A restated limit is a NUMBER FOLLOWED BY ITS
     * UNIT — "60 AI generations", "2,000 listings", "$29" — and arithmetic is
     * not. The ninth time in this build that a guard has matched something it
     * was never about.
     */
    for (const file of [MODEL, PAGE]) {
      const source = code(file)
      for (const plan of PLANS) {
        for (const [value, unit] of [
          [plan.limits.listings, 'listings'],
          [plan.limits.aiGenerations, 'AI generations|generations'],
        ] as const) {
          if (value === 0) continue // Free's zero is "no shop", tested below.
          const spellings = [String(value), value.toLocaleString('en-US')].join('|')
          const restated = new RegExp(`(${spellings})\\s*(${unit})`, 'i')
          expect(source, `${file} :: ${plan.key} ${value} ${unit}`).not.toMatch(restated)
        }
        if (plan.priceMonthly > 0) {
          expect(source, `${file} :: ${plan.key} price`).not.toMatch(
            new RegExp(`\\$\\s*${plan.priceMonthly}\\b`),
          )
        }
      }
    }
  })

  it('FINDS A RESTATED LIMIT WHERE ONE REALLY IS', () => {
    /*
     * The positive control. A pattern that matches nothing passes the sweep
     * above perfectly, so it is first pointed at the pricing page — which
     * states every limit, legitimately, because that is the page whose job is
     * to state them.
     */
    const pricing = readFileSync('domain/billing/plans.ts', 'utf8')
    const growth = PLANS.find((plan) => plan.key === 'GROWTH')!
    expect(pricing).toMatch(
      new RegExp(`(${growth.limits.listings.toLocaleString('en-US')})\\s*listings`, 'i'),
    )
  })

  it('reads the plan object instead', () => {
    const source = code(PAGE)
    expect(source).toContain('limitsLine(entry.plan)')
    expect(source).toContain('entry.plan.priceMonthly')
  })

  it('renders a zero listing limit as "no shop connection", not as a cap of nought', () => {
    /*
     * Free connects no shop, so it manages no listings. Rendering that as
     * "0 listings" reads as a shop sitting at its limit — the same defect the
     * sidebar meter already avoids.
     */
    const free = PLANS.find((plan) => plan.key === 'FREE')!
    expect(limitsLine(free)).toContain('no shop connection')
    expect(limitsLine(free)).not.toMatch(/\b0 listings\b/)

    const growth = PLANS.find((plan) => plan.key === 'GROWTH')!
    expect(limitsLine(growth)).toContain(growth.limits.listings.toLocaleString('en-US'))
  })
})

/* ─────────────────────────── D83: no refunds ─────────────────────────────── */

describe('nothing here implies a subscription refund exists (D83)', () => {
  /*
   * PATTERNS, NOT THE WORD, and the reason is the tenth instance in this build
   * of a guard matching its own documentation. The page tells the reader, in
   * words, that EtsyPilot "does not refund plan charges at all" — and a
   * substring sweep for `refund` fired on the sentence promising there are
   * none. A guard that can only be satisfied by deleting the promise will be
   * satisfied by deleting the promise.
   *
   * What is actually forbidden is a refund AFFORDANCE: an identifier, a
   * member access, a constant, a status, or a column header. English prose has
   * none of those shapes, so the page can keep saying what it does not do.
   */
  const REFUND_AFFORDANCES: [string, RegExp][] = [
    ['an identifier', /\brefund[A-Za-z]*\s*[:(=]/],
    ['a member access', /\.refund/i],
    ['a constant', /\bREFUND[A-Z_]*\b/],
    ['the removed status', /'REFUNDED'/],
    ['a column header', /<th[^>]*>[^<]*refund/i],
    ['a chargeback or credit note', /\b(chargeback|credit note|reimburse)/i],
  ]

  it('OFFERS NO REFUND AFFORDANCE in the model or on the page', () => {
    /*
     * D83 removed them from the product outright — no method, no invoice kind,
     * no REFUNDED status, no window, no terms. So an affordance here would be
     * a control for something that cannot happen.
     *
     * The ORDER refund — money a seller returned to a buyer — is untouched and
     * lives in the profit waterfall. Different noun, different money, and not
     * on this screen.
     */
    for (const file of [MODEL, PAGE]) {
      const source = code(file)
      for (const [name, pattern] of REFUND_AFFORDANCES) {
        expect(source, `${file} :: ${name}`).not.toMatch(pattern)
      }
    }
  })

  it('STILL LETS THE PAGE SAY there is no refund', () => {
    /*
     * The converse, and the thing the previous nine instances of this mistake
     * cost: the promise must survive the guard. If this goes red because the
     * sentence was deleted to make the sweep pass, the sweep has won an
     * argument it should have lost.
     */
    expect(readFileSync(PAGE, 'utf8')).toMatch(/does not refund\s+plan charges at all/i)
  })

  it('reads no refund column and no billing-provider handle', () => {
    /*
     * stripe_customer_id is not exactly a secret, and it is a handle into the
     * provider — an identifier that lets somebody look up a payment method is
     * one a support screen has no use for.
     */
    const source = code(READS)
    const query = source.slice(
      source.indexOf('export async function adminListSubscriptions'),
      source.indexOf('export async function adminListSubscriptions') + 1600,
    )
    expect(query.length).toBeGreaterThan(100) // positive control
    for (const column of ['stripeCustomerId', 'stripeSubscriptionId', 'refund']) {
      expect(query.toLowerCase(), column).not.toContain(column.toLowerCase())
    }
  })

  it('FINDS THE AFFORDANCE WHERE ONE LEGITIMATELY LIVES', () => {
    /*
     * The positive control. A sweep for an absent shape passes perfectly when
     * the pattern is wrong, so the member-access detector is first pointed at
     * the ORDER refund — `orders.refunds`, money a seller returned to a buyer,
     * which D83 deliberately kept.
     */
    const schema = readFileSync('db/schema/index.ts', 'utf8')
    const memberAccess = REFUND_AFFORDANCES.find(([name]) => name === 'a member access')![1]
    expect(schema).toContain('refunds')
    expect(`orders.refunds`).toMatch(memberAccess)
  })
})

/* ─────────────────── no record is not the free plan ──────────────────────── */

describe('an account with no billing row is its own state (D34)', () => {
  it('BUCKETS IT SEPARATELY FROM FREE', () => {
    expect(planBucket(null)).toBe('NO_RECORD')
    expect(planBucket('FREE')).toBe('FREE')
    expect(statusBucket(null)).toBe('NO_RECORD')
  })

  it('counts it separately, so the free tier is not inflated by it', () => {
    const rows = [row({ plan: null, status: null }), row({ userId: 'u2', plan: 'FREE' })]
    expect(countFor(rows, 'FREE')).toBe(1)
    expect(countFor(rows, 'NO_RECORD')).toBe(1)
  })

  it('RENDERS IT DIFFERENTLY, with no shared shape to collapse into', () => {
    const source = readFileSync(PAGE, 'utf8')
    expect(source).toContain('No billing record')
    expect(source).toMatch(/Never been through billing/i)
  })

  it('does not hide an unrecognised plan key under the cheapest tier', () => {
    /*
     * A silent fallback to FREE is how a data problem stays hidden. The count
     * should be zero; when it is not, that IS the finding.
     */
    expect(planBucket('ENTERPRISE')).toBe('UNKNOWN')
    expect(statusBucket('REFUNDED')).toBe('UNKNOWN')
    const rows = [row({ plan: 'ENTERPRISE' })]
    expect(countFor(rows, 'FREE')).toBe(0)
    expect(countFor(rows, 'UNKNOWN')).toBe(1)
  })
})

/* ──────────────────────────── the counts ─────────────────────────────────── */

describe('the breakdowns count every bucket, including the empty ones', () => {
  it('lists EVERY PLAN, in the order PLANS declares, plus the two non-plan buckets', () => {
    const counted = countByPlan([])
    expect(counted.map((entry) => entry.bucket)).toEqual([
      ...PLANS.map((plan) => plan.key),
      'NO_RECORD',
      'UNKNOWN',
    ])
    expect(counted.every((entry) => entry.count.value === 0)).toBe(true)
  })

  it('lists EVERY STATUS, in the order the model declares', () => {
    const counted = countByStatus([])
    expect(counted.map((entry) => entry.bucket)).toEqual([
      ...SUBSCRIPTION_STATUSES,
      'NO_RECORD',
      'UNKNOWN',
    ])
  })

  it('counts accurately across a mixed platform', () => {
    const rows = [
      row({ userId: '1', plan: 'FREE', status: 'ACTIVE' }),
      row({ userId: '2', plan: 'SOLO', status: 'PAST_DUE' }),
      row({ userId: '3', plan: 'GROWTH', status: 'CANCELLING' }),
      row({ userId: '4', plan: null, status: null }),
    ]
    expect(countFor(rows, 'SOLO')).toBe(1)
    expect(countByStatus(rows).find((e) => e.bucket === 'PAST_DUE')?.count.value).toBe(1)
    expect(countByStatus(rows).find((e) => e.bucket === 'TRIALING')?.count.value).toBe(0)
  })
})

/* ────────────────────── attention and ending trials ──────────────────────── */

describe('what needs a human', () => {
  it('is PAST_DUE and CANCELLING, worst first, and nothing else', () => {
    const rows = [
      row({ userId: 'cancelling', status: 'CANCELLING' }),
      row({ userId: 'active', status: 'ACTIVE' }),
      row({ userId: 'pastdue', status: 'PAST_DUE' }),
      row({ userId: 'cancelled', status: 'CANCELLED' }),
      row({ userId: 'trialing', status: 'TRIALING' }),
    ]
    expect(needsAttention(rows).map((entry) => entry.userId)).toEqual(['pastdue', 'cancelling'])
  })

  it('does not treat CANCELLED as needing attention — the period has ended', () => {
    expect(needsAttention([row({ status: 'CANCELLED' })])).toEqual([])
  })
})

describe('trials ending soon', () => {
  it('only counts rows whose STATUS is trialing', () => {
    /*
     * A trialEndsAt left behind on an account that has since converted is a
     * stale column, not a trial. Counting it would put paying customers on a
     * list headed "about to lose access".
     */
    const rows = [
      row({ userId: 'converted', status: 'ACTIVE', trialEndsAt: day(2) }),
      row({ userId: 'trialing', status: 'TRIALING', trialEndsAt: day(2) }),
    ]
    expect(trialsEndingSoon(rows, NOW).map((entry) => entry.row.userId)).toEqual(['trialing'])
  })

  it('EXCLUDES TRIALS THAT HAVE ALREADY ENDED', () => {
    const rows = [row({ status: 'TRIALING', trialEndsAt: day(-1) })]
    expect(trialsEndingSoon(rows, NOW)).toEqual([])
  })

  it(`includes the boundary day and excludes the one after it`, () => {
    const inside = row({ userId: 'in', status: 'TRIALING', trialEndsAt: day(TRIAL_ENDING_SOON_DAYS) })
    const outside = row({ userId: 'out', status: 'TRIALING', trialEndsAt: day(TRIAL_ENDING_SOON_DAYS + 1) })
    expect(trialsEndingSoon([inside, outside], NOW).map((e) => e.row.userId)).toEqual(['in'])
  })

  it('sorts soonest first', () => {
    const rows = [
      row({ userId: 'later', status: 'TRIALING', trialEndsAt: day(5) }),
      row({ userId: 'sooner', status: 'TRIALING', trialEndsAt: day(1) }),
    ]
    expect(trialsEndingSoon(rows, NOW).map((e) => e.row.userId)).toEqual(['sooner', 'later'])
  })

  it('ignores a trialing row with no end date rather than assuming today', () => {
    expect(trialsEndingSoon([row({ status: 'TRIALING', trialEndsAt: null })], NOW)).toEqual([])
  })
})

/* ────────────────────── the page is gated and read-only ──────────────────── */

describe('the screen is gated, read-only, and changes no money', () => {
  it('gates itself on subscriptions.view', () => {
    expect(code(PAGE)).toContain("requireAdmin('subscriptions.view')")
  })

  it('is offered in the navigation behind the same key', () => {
    const item = OPERATOR_NAV.flatMap((group) => group.items).find(
      (entry) => entry.href === '/admin/subscriptions',
    )
    expect(item?.gate).toEqual({ kind: 'permission', key: 'subscriptions.view' })
  })

  it('CONTAINS NO CONTROL — no upgrade, no cancel, no comp', () => {
    const source = code(PAGE)
    for (const control of ['<form', '<button', '<input', 'action=', "'use server'", 'onClick']) {
      expect(source, control).not.toContain(control)
    }
  })

  it('reaches no database handle and no billing provider of its own', () => {
    const source = code(PAGE)
    for (const reach of ['getDb', 'getBilling', 'stripe', 'shopContext']) {
      expect(source.toLowerCase(), reach).not.toContain(reach.toLowerCase())
    }
  })

  it('says what it cannot do, rather than leaving the absence to read as a to-do', () => {
    const source = readFileSync(PAGE, 'utf8')
    expect(source).toMatch(/No upgrade, no downgrade, no cancel/i)
    expect(source).toMatch(/does not refund\s+plan charges at all/i)
  })

  it('gates the account address on users.view, separately from the plan data', () => {
    expect(code(PAGE)).toContain("access.can('users.view')")
  })
})
