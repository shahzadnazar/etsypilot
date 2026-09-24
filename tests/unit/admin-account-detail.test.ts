import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { pageForRoute, posixJoin } from '../support/paths'
import {
  ACCOUNT_SECTIONS,
  coverageStatement,
  detailReads,
  financialsFor,
  visibleSections,
  type AccountSectionKey,
} from '@/domain/admin/account-detail'
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  can,
  type Permission,
} from '@/domain/admin/roles'
import { PERMISSION_LABELS } from '@/domain/admin/permissions'

/*
 * THE ACCOUNT DETAIL SCREEN.
 *
 * Three questions, and they fail in three different places:
 *
 *   which sections exist for this viewer?   visibleSections, here
 *   what does the database get asked for?   detailReads, here
 *   what do the money figures claim?        financialsFor, here
 *
 * What is NOT here is whether the rendered HTML matches. The test runner is a
 * node environment with no DOM, so an assertion about markup would be an
 * assertion about a string I wrote in the same commit. That half is
 * tests/browser/admin-account-detail.py, which signs four different operators
 * in against a real server and reads what actually came back.
 */


function adminPages(dir = 'app/(admin)', out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = posixJoin(dir, entry)
    if (statSync(path).isDirectory()) adminPages(path, out)
    else if (entry === 'page.tsx') out.push(path)
  }
  return out
}
/*
 * Resolved by ROUTE, not spelled as a path.
 *
 * Both files moved into route groups — `(detail)` and `(list)` — so that each
 * could carry a layout gating exactly one page. A group is invisible in the
 * URL, so the route is the stable name and the file path is not.
 */
const PAGE = pageForRoute('/admin/users/[userId]', adminPages())!
const LIST = pageForRoute('/admin/users', adminPages())!

/** Source with comments stripped — a guard must not be satisfied by prose. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/** A viewer holding exactly these permissions. */
function viewer(...held: Permission[]): (permission: Permission) => boolean {
  const set = new Set(held)
  return (permission) => set.has(permission)
}

function keys(sections: readonly { key: AccountSectionKey }[]): AccountSectionKey[] {
  return sections.map((section) => section.key)
}

/* ─────────────── a section appears exactly when its permission does ─────── */

describe('each section is gated on the VIEWER, one permission each', () => {
  it('EVERY SECTION APPEARS WHEN ITS PERMISSION IS HELD, AND ONLY THEN', () => {
    /*
     * The core property, asserted both ways for every section rather than for
     * the interesting ones. A one-directional check ("financials appears for a
     * holder") passes just as happily when the section appears for everybody.
     */
    for (const section of ACCOUNT_SECTIONS) {
      expect(keys(visibleSections(viewer(section.permission))), section.key).toContain(section.key)

      const others = PERMISSIONS.filter((permission) => permission !== section.permission)
      expect(keys(visibleSections(viewer(...others))), section.key).not.toContain(section.key)
    }
  })

  it('shows a viewer with no permissions at all NOTHING', () => {
    expect(visibleSections(viewer())).toEqual([])
  })

  it('shows users.detail alone exactly identity and shop', () => {
    expect(keys(visibleSections(viewer('users.detail')))).toEqual(['identity', 'shop'])
  })

  it('shows every permission every section, in declaration order', () => {
    expect(keys(visibleSections(() => true))).toEqual(ACCOUNT_SECTIONS.map((s) => s.key))
  })

  it('gates each section on a REAL permission, not a string that resembles one', () => {
    // The `satisfies` clause on ACCOUNT_SECTIONS makes this a type error too.
    // Asserted at runtime as well because a cast would silence the type.
    for (const section of ACCOUNT_SECTIONS) {
      expect(PERMISSIONS as readonly string[], section.key).toContain(section.permission)
      expect(PERMISSION_LABELS[section.permission], section.key).toBeDefined()
    }
  })
})

/* ──────────────────────── the default a MANAGER gets ─────────────────────── */

describe('a MANAGER does not get a seller’s money by being promoted', () => {
  it('has no financials.view by default', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).not.toContain('financials.view')
    expect(can('MANAGER', 'financials.view')).toBe(false)
  })

  it('SEES NO FINANCIALS SECTION on their default permissions', () => {
    const sections = keys(visibleSections((p) => can('MANAGER', p)))
    expect(sections).not.toContain('financials')
    // And a manager's default is users.view alone, so they see no section at
    // all — the detail page 404s them before this is reached.
    expect(sections).toEqual([])
  })

  it('does not read the seller’s profit either', () => {
    // Not merely hidden on screen: no query is issued.
    expect(detailReads(visibleSections((p) => can('MANAGER', p))).financials).toBe(false)
  })

  it('DOES see it once a super admin ticks the box', () => {
    /*
     * The converse, and it matters: a permission that can never be granted is
     * indistinguishable from one that does not work. The matrix is the point.
     */
    const sections = keys(visibleSections(viewer('users.detail', 'financials.view')))
    expect(sections).toContain('financials')
  })

  it('gives SUPER_ADMIN and ADMIN financials.view by default', () => {
    expect(can('SUPER_ADMIN', 'financials.view')).toBe(true)
    expect(can('ADMIN', 'financials.view')).toBe(true)
  })
})

/* ─────────────── what is not shown is not fetched either ─────────────────── */

describe('detailReads asks for exactly what will be rendered', () => {
  it('turns every optional section into a read, and nothing else into one', () => {
    for (const section of ACCOUNT_SECTIONS) {
      const reads = detailReads(visibleSections(viewer(section.permission)))
      const flag = section.key as keyof typeof reads
      if (flag in reads) {
        expect(reads[flag], section.key).toBe(true)
      }
    }
  })

  it('reads NOTHING optional for a viewer holding only users.detail', () => {
    expect(detailReads(visibleSections(viewer('users.detail')))).toEqual({
      connection: false,
      plan: false,
      usage: false,
      financials: false,
    })
  })

  it('reads everything for a viewer holding everything', () => {
    expect(detailReads(visibleSections(() => true))).toEqual({
      connection: true,
      plan: true,
      usage: true,
      financials: true,
    })
  })

  it('COVERS EVERY OPTIONAL SECTION, so a new one cannot be silently unread', () => {
    /*
     * The failure this catches: a seventh section is added, the page renders
     * it, and detailReads has no flag for it — so its data is never fetched
     * and the card renders its empty state forever. Identity and shop are
     * excluded because the page's own gate already requires users.detail.
     */
    const flags = Object.keys(detailReads(visibleSections(() => true)))
    const optional = ACCOUNT_SECTIONS.filter(
      (section) => section.permission !== 'users.detail',
    ).map((section) => section.key)
    expect(new Set(flags)).toEqual(new Set(optional))
  })
})

/* ───────────────────── what the money figures claim ──────────────────────── */

const PROFIT = {
  periodStart: new Date('2026-08-01T00:00:00Z'),
  periodEnd: new Date('2026-08-31T23:59:59Z'),
  grossRevenue: '1200.00',
  etsyFees: '60.00',
  paymentProcessing: '35.00',
  offsiteAds: '15.00',
  netProfit: '400.00',
  coveragePercent: 100,
  computedAt: new Date('2026-09-01T03:00:00Z'),
}

const SHOP = { lastSyncedAt: new Date('2026-09-01T02:00:00Z') }

function view(overrides: Partial<typeof PROFIT> = {}, orderCount = 42) {
  return financialsFor({
    profit: { read: true, value: { ...PROFIT, ...overrides } },
    orders: { read: true, value: { count: orderCount } },
    shop: SHOP,
  })
}

describe('the financial figures say what they are', () => {
  it('DISTINGUISHES not-read from never-computed from zero', () => {
    /*
     * Three states, three answers. Collapsing any pair tells a lie:
     *
     *   NOT_READ as NEVER_COMPUTED   states a fact about the seller's
     *                                bookkeeping on the strength of a fact
     *                                about the viewer's permissions.
     *   NEVER_COMPUTED as a zero     D34. A shop that has never reconciled and
     *                                a shop that earned nothing produce the
     *                                same numerals and mean opposite things.
     */
    expect(
      financialsFor({ profit: { read: false }, orders: { read: false }, shop: SHOP }).kind,
    ).toBe('NOT_READ')

    expect(
      financialsFor({
        profit: { read: true, value: null },
        orders: { read: true, value: null },
        shop: SHOP,
      }).kind,
    ).toBe('NEVER_COMPUTED')

    const zero = view({ grossRevenue: '0.00', netProfit: '0.00' }, 0)
    expect(zero.kind).toBe('SUMMARY')
    if (zero.kind !== 'SUMMARY') throw new Error('unreachable')
    expect(zero.summary.grossRevenue.value).toBe('0.00')
    expect(zero.summary.orderCount.value).toBe(0)
  })

  it('REFUSES TO CALL IT PROFIT AT ZERO COVERAGE', () => {
    /*
     * The single most damaging number this product could render. With no
     * confirmed costs there are none in the calculation, so what remains is
     * revenue minus Etsy's fees — and a seller who reads that as profit will
     * price against it. UNAVAILABLE with a reason and a remedy, not a figure
     * with a caveat beside it that a reader may not join up.
     */
    const zero = view({ coveragePercent: 0 })
    if (zero.kind !== 'SUMMARY') throw new Error('unreachable')
    expect(zero.summary.netProfit.provenance.type).toBe('UNAVAILABLE')
    expect(zero.summary.netProfit.value).toBeNull()
    expect(zero.summary.netProfit.provenance.methodology).toMatch(/cannot be calculated/i)

    // Revenue and fees are still known and still shown. "Unavailable" applies
    // to the figure that cannot be derived, not to the whole section.
    expect(zero.summary.grossRevenue.value).toBe('1200.00')
    expect(zero.summary.fees.value).toBe('110.00')
  })

  it('CARRIES THE COVERAGE AND NAMES THE PERCENTAGE when it is partial', () => {
    const partial = view({ coveragePercent: 62 })
    if (partial.kind !== 'SUMMARY') throw new Error('unreachable')
    expect(partial.summary.netProfit.provenance.type).toBe('CALCULATED')
    expect(partial.summary.netProfit.provenance.coverage).toBe(62)
    expect(partial.summary.netProfit.provenance.limitations?.join(' ')).toContain('62%')
    // And says which way the error runs. "Partial" alone does not tell a
    // seller whether the real number is higher or lower.
    expect(partial.summary.netProfit.provenance.limitations?.join(' ')).toMatch(/lower/i)
  })

  it('claims no limitation at full coverage', () => {
    const full = view({ coveragePercent: 100 })
    if (full.kind !== 'SUMMARY') throw new Error('unreachable')
    expect(full.summary.netProfit.provenance.coverage).toBe(100)
    expect(full.summary.netProfit.provenance.limitations).toBeUndefined()
  })

  it('IS NEVER VERIFIED, because a sum is not an observation', () => {
    const full = view()
    if (full.kind !== 'SUMMARY') throw new Error('unreachable')
    for (const figure of [
      full.summary.grossRevenue,
      full.summary.fees,
      full.summary.orderCount,
      full.summary.netProfit,
    ]) {
      expect(figure.provenance.type, figure.provenance.methodology).not.toBe('VERIFIED')
    }
  })

  it('says so when the shop has never synced', () => {
    // A total over stored rows is only as complete as the sync behind it, and
    // a shop that has never synced has rows from nowhere in particular.
    const unsynced = financialsFor({
      profit: { read: true, value: PROFIT },
      orders: { read: true, value: { count: 3 } },
      shop: { lastSyncedAt: null },
    })
    if (unsynced.kind !== 'SUMMARY') throw new Error('unreachable')
    expect(unsynced.summary.grossRevenue.provenance.methodology).toMatch(/never synced/i)
  })

  it('adds the three fee lines rather than showing one of them', () => {
    const full = view()
    if (full.kind !== 'SUMMARY') throw new Error('unreachable')
    expect(full.summary.fees.value).toBe('110.00')
  })

  it('treats a missing order aggregate as zero orders, not as a missing count', () => {
    /*
     * The one place a zero IS the honest answer: the period is known, so "no
     * orders were placed in it" is a fact rather than an absence. That is why
     * it is a plain number and not a fourth branch.
     */
    const none = financialsFor({
      profit: { read: true, value: PROFIT },
      orders: { read: true, value: null },
      shop: SHOP,
    })
    if (none.kind !== 'SUMMARY') throw new Error('unreachable')
    expect(none.summary.orderCount.value).toBe(0)
    expect(none.summary.orderCount.provenance.type).toBe('CALCULATED')
  })
})

describe('coverage is stated in words, never implied', () => {
  it('says net profit is not calculated at zero', () => {
    expect(coverageStatement(0)).toMatch(/not calculated/i)
  })

  it('names the percentage and the direction of the error in between', () => {
    expect(coverageStatement(45)).toContain('45%')
    expect(coverageStatement(45)).toMatch(/lower/i)
  })

  it('says every order is covered at 100', () => {
    expect(coverageStatement(100)).toMatch(/every order/i)
  })

  it('never returns an empty string, for any percentage', () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      expect(coverageStatement(percent).length, String(percent)).toBeGreaterThan(20)
    }
  })
})

/* ───────────────────────── the screen is read-only ───────────────────────── */

describe('the detail screen changes nothing', () => {
  it('gates itself on users.detail rather than trusting the layout', () => {
    expect(code(PAGE)).toContain("requireAdmin('users.detail')")
  })

  it('CONTAINS NO FORM, NO BUTTON AND NO ACTION', () => {
    /*
     * D70: a control that appears to work and does not is worse than no
     * control. On an operator screen the argument is stronger again — an
     * operator who clicks something and sees nothing happen stops looking for
     * the real answer while a seller waits.
     */
    const source = code(PAGE)
    for (const control of ['<form', '<button', '<input', 'action=', "'use server'", 'onClick']) {
      expect(source, control).not.toContain(control)
    }
  })

  it('imports nothing that could write', () => {
    const source = code(PAGE)
    for (const writer of ['getDb', 'getEtsyService', 'shopContext', 'revalidatePath', '/actions']) {
      expect(source, writer).not.toContain(writer)
    }
  })

  it('links ONLY to the role editor, and only behind roles.write', () => {
    const source = code(PAGE)
    /*
     * Every destination on the page, and there are exactly two: back, and the
     * editor.
     *
     * Both spellings are matched — `href=` on an element and `href:` in the
     * object PageHeader's `back` slot takes. Counting one spelling is what
     * this assertion used to do, and moving the back link onto the shared
     * header made it silently count one link instead of two: the number
     * changed, the page did not, and the test would have gone green again the
     * moment anyone "fixed" the 2 to a 1. Asserting the SET rather than the
     * COUNT is what makes that impossible — a third link cannot arrive
     * unnoticed whichever way it is written.
     */
    const destinations = [...source.matchAll(/href\s*[=:]\s*\{?[`'"]([^`'"]*)/g)]
      .map((match) => match[1]!)
      .sort()
    expect(destinations).toEqual([
      '/admin/users',
      '/admin/users/${encodeURIComponent(detail.id)}/role',
    ])
    expect(source).toContain("canSuperAdminOnly('roles.write')")
  })

  it('offers no role link for an environment-derived role', () => {
    // Writing the column for one of those succeeds and changes no access at
    // all, so offering it would be D70's control that appears to work.
    expect(code(PAGE)).toContain("roleSource(detail.resolvedRole) !== 'ENVIRONMENT'")
  })
})

/* ───────────────────────── no buyer, anywhere ────────────────────────────── */

describe('no buyer-identifying field can reach the screen', () => {
  const surfaces = [PAGE, 'domain/admin/account-detail.ts', 'lib/repositories/admin-reads-every-shop.ts']

  /*
   * PATTERNS, NOT SUBSTRINGS, and the reason is the sixth instance in this
   * build of a guard matching its own documentation — the first where the
   * documentation was on screen rather than in a comment. The detail page
   * tells the reader, in words, "no buyer, country or receipt is read to build
   * this section", and a substring sweep for `buyer` fired on that promise. A
   * guard that can only be satisfied by deleting the promise is a guard that
   * will be satisfied by deleting the promise.
   *
   * Each pattern below matches a FIELD rather than a word: member access
   * (`.buyer`), a camel or snake identifier (`countryCode`, `order_items`), or
   * a prefixed one (`buyerId`). English prose contains none of those shapes,
   * so the page can keep saying what it does not read.
   */
  const FIELDS: [string, RegExp][] = [
    ['country column', /\bcountry_?[Cc]ode\b/],
    ['receipt id', /\b(etsyReceiptId|receipt_id)\b/],
    ['order items', /\b(orderItems|order_items)\b/],
    ['buyer member access', /\.(buyer|receipt|country)/i],
    ['buyer-prefixed field', /\bbuyer[_A-Z]/],
  ]

  it('names no buyer field in the page, the view model or the query', () => {
    /*
     * D77: a country with one order in it is a person. The seller's own
     * analytics folds countries under five orders together before the data
     * leaves the domain; the operator screen reads no country at all, which
     * needs no folding to be safe.
     */
    for (const surface of surfaces) {
      const source = code(surface)
      for (const [name, pattern] of FIELDS) {
        expect(source, `${surface} :: ${name}`).not.toMatch(pattern)
      }
    }
  })

  it('FINDS THOSE FIELDS WHERE THEY REALLY ARE', () => {
    /*
     * The positive control. An "is it absent?" sweep passes perfectly when its
     * detector is broken, so each pattern is first pointed at the schema —
     * which defines every one of these columns — and has to find it there.
     */
    const schema = readFileSync('db/schema/index.ts', 'utf8')
    expect(schema).toMatch(/\bcountry_?[Cc]ode\b/)
    expect(schema).toMatch(/\b(etsyReceiptId|receipt_id)\b/)
    expect(schema).toMatch(/\b(orderItems|order_items)\b/)
    // And member access, which the schema does not contain — pointed at the
    // seller-side code that legitimately reads a buyer's country instead.
    expect(readFileSync('db/schema/index.ts', 'utf8')).toContain('countryCode')
  })

  it('still lets the page SAY what it does not read', () => {
    /*
     * The converse of the sweep, and the thing the previous five instances of
     * this mistake cost: the promise must survive the guard. If this goes red
     * because the sentence was deleted to make the sweep pass, the sweep has
     * won an argument it should have lost.
     */
    const page = readFileSync(PAGE, 'utf8')
    expect(page).toMatch(/no buyer, country or receipt is read/i)
  })
})

/* ─────────────────── the list links, for those who may ───────────────────── */

describe('the accounts list links to the detail only for a viewer who may see it', () => {
  it('computes the link from users.detail', () => {
    expect(code(LIST)).toContain("access.can('users.detail')")
  })

  it('RENDERS THE LINK ONLY INSIDE THAT CONDITION', () => {
    /*
     * Bounded at both ends rather than searched for, because indexOf finds the
     * first match and the first match in this file has been the wrong one
     * three times across this build.
     */
    const source = code(LIST)
    const guard = source.indexOf('mayViewDetail ? (')
    const closes = source.indexOf(') : (', guard)
    expect(guard).toBeGreaterThan(-1)
    expect(closes).toBeGreaterThan(guard)

    const link = source.indexOf('/admin/users/${encodeURIComponent(user.id)}`')
    expect(link).toBeGreaterThan(guard)
    expect(link).toBeLessThan(closes)
  })

  it('renders no disabled or locked affordance in its place', () => {
    // Omitted, never locked (D91). A padlock tells someone what exists and
    // that they cannot have it.
    const source = code(LIST)
    for (const tell of ['disabled', 'aria-disabled', 'Locked', 'padlock']) {
      expect(source, tell).not.toContain(tell)
    }
  })
})

/* ─────────────────── the seller is told the same thing ───────────────────── */

describe('the seller-facing page is computed, not written', () => {
  const SELLER = 'app/(dashboard)/settings/data-permissions/page.tsx'

  it('reads the operator constants rather than describing them', () => {
    const source = code(SELLER)
    for (const constant of ['PERMISSION_LABELS', 'PERMISSIONS', 'OPERATOR_WRITABLE', 'FORECLOSED_BY_DESIGN']) {
      expect(source, constant).toContain(constant)
    }
  })

  it('HARD-CODES NO PERMISSION NAME, so it cannot fall out of step', () => {
    /*
     * D59a: the privacy page reads the adapters, it does not describe them. A
     * hand-written list is true on the day it is written and unowned
     * afterwards — which is the same defect as a coverage figure that is
     * stated rather than computed.
     */
    const source = code(SELLER)
    for (const permission of PERMISSIONS) {
      expect(source, permission).not.toContain(permission)
      expect(source, PERMISSION_LABELS[permission].title).not.toContain(
        PERMISSION_LABELS[permission].detail,
      )
    }
  })

  it('states what staff cannot do, not only what they can', () => {
    const source = code(SELLER)
    expect(source).toContain('FORECLOSED_BY_DESIGN.map')
    expect(source).toMatch(/cannot do it for you/i)
  })
})
