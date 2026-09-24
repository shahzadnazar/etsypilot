import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import {
  can,
  canSuperAdminOnly,
  hasAnyAdminAccess,
  PERMISSIONS,
  resolvePlatformRole,
  DEFAULT_ROLE_PERMISSIONS,
  SUPER_ADMIN_ONLY,
} from '@/domain/admin/roles'

const ENV = {
  superAdmin: process.env.SUPER_ADMIN_EMAILS,
  admin: process.env.ADMIN_EMAILS,
}

function setEnv(superAdmin?: string, admin?: string): void {
  if (superAdmin === undefined) delete process.env.SUPER_ADMIN_EMAILS
  else process.env.SUPER_ADMIN_EMAILS = superAdmin
  if (admin === undefined) delete process.env.ADMIN_EMAILS
  else process.env.ADMIN_EMAILS = admin
}

afterEach(() => setEnv(ENV.superAdmin, ENV.admin))

describe('each role resolves from the right place', () => {
  it('reads SUPER_ADMIN and ADMIN from the environment', () => {
    setEnv('boss@etsypilot.app', 'ops@etsypilot.app')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('SUPER_ADMIN')
    expect(resolvePlatformRole({ email: 'ops@etsypilot.app' })).toBe('ADMIN')
  })

  it('reads MANAGER from the column', () => {
    setEnv()
    expect(resolvePlatformRole({ email: 'a@x.com', storedRole: 'MANAGER' })).toBe('MANAGER')
  })

  it('gives everyone else USER', () => {
    setEnv('boss@etsypilot.app')
    expect(resolvePlatformRole({ email: 'seller@x.com', storedRole: 'USER' })).toBe('USER')
    expect(resolvePlatformRole({ email: 'seller@x.com' })).toBe('USER')
  })
})

describe('the environment outranks the database', () => {
  it('lets SUPER_ADMIN_EMAILS win over any stored role', () => {
    setEnv('boss@etsypilot.app')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app', storedRole: 'USER' })).toBe(
      'SUPER_ADMIN',
    )
  })

  it('lets SUPER_ADMIN_EMAILS win over ADMIN_EMAILS', () => {
    setEnv('both@x.com', 'both@x.com')
    expect(resolvePlatformRole({ email: 'both@x.com' })).toBe('SUPER_ADMIN')
  })

  it('REFUSES to read SUPER_ADMIN or ADMIN out of the column', () => {
    /*
     * The property the whole design rests on: a database compromise must not be
     * able to mint an administrator. Writing a row is a far lower bar than
     * editing a deployment's environment.
     */
    setEnv()
    expect(resolvePlatformRole({ email: 'attacker@x.com', storedRole: 'SUPER_ADMIN' })).toBe('USER')
    expect(resolvePlatformRole({ email: 'attacker@x.com', storedRole: 'ADMIN' })).toBe('USER')
  })
})

describe('unset and malformed environments deny', () => {
  it('denies when both are unset', () => {
    setEnv()
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('USER')
  })

  it('denies on an empty or whitespace value', () => {
    setEnv('', '   ')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('USER')
  })

  it('denies on garbage rather than matching something', () => {
    setEnv('{"emails":["boss@etsypilot.app"]}')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('USER')
  })

  it('never lets an account with no email match an empty entry', () => {
    /*
     * The dangerous shape. "a@x.com,,b@x.com" contains an empty entry; if it
     * were kept, a session with no email would match it and absence would
     * grant access.
     */
    setEnv('a@x.com,,b@x.com')
    expect(resolvePlatformRole({ email: '' })).toBe('USER')
    expect(resolvePlatformRole({ email: null })).toBe('USER')
    expect(resolvePlatformRole({ email: undefined })).toBe('USER')
    expect(resolvePlatformRole({ email: '   ' })).toBe('USER')
  })

  it('treats an unknown stored value as USER', () => {
    setEnv()
    for (const stored of ['OWNER', 'root', 'admin', '', '   ', 'MANAGER_']) {
      expect(resolvePlatformRole({ email: 'a@x.com', storedRole: stored }), stored).toBe('USER')
    }
  })
})

describe('ambiguous env values fail in the direction chosen', () => {
  it('TRIMS whitespace, so a stray space grants rather than locking out', () => {
    // Failing closed here would mean an invisible character silently denying
    // the only administrator, with nothing to diagnose from the outside.
    setEnv('  boss@etsypilot.app  ,  ', '  ops@x.com ')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('SUPER_ADMIN')
    expect(resolvePlatformRole({ email: 'ops@x.com' })).toBe('ADMIN')
    // Trimming grants; it must not also widen. Nobody else gets in.
    expect(resolvePlatformRole({ email: 'boss@x.com' })).toBe('USER')
  })

  it('lower-cases BOTH sides, so case never decides the outcome either way', () => {
    setEnv('Boss@EtsyPilot.App')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('SUPER_ADMIN')
    expect(resolvePlatformRole({ email: 'BOSS@ETSYPILOT.APP' })).toBe('SUPER_ADMIN')
    // And a different address still does not match, capitalised or not.
    expect(resolvePlatformRole({ email: 'Boss@other.app' })).toBe('USER')
  })

  it('trims the session email too', () => {
    setEnv('boss@etsypilot.app')
    expect(resolvePlatformRole({ email: ' boss@etsypilot.app ' })).toBe('SUPER_ADMIN')
  })

  it('matches the whole address, never a prefix', () => {
    setEnv('boss@etsypilot.app')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app.evil.com' })).toBe('USER')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.ap' })).toBe('USER')
  })
})

describe('a SHOP role grants no PLATFORM access', () => {
  it('gives an OWNER of their own shop nothing', () => {
    /*
     * The conflation this whole model exists to prevent. EVERY seller is OWNER
     * of their own shop — provisioning creates exactly that membership — so if
     * the axes were joined, every seller would be an operator.
     *
     * resolvePlatformRole takes no membership and has no parameter one could be
     * passed through, which is the structural half of the guarantee. This is
     * the behavioural half.
     */
    expect(resolvePlatformRole({ email: 'seller@x.com', storedRole: 'OWNER' })).toBe('USER')
    expect(hasAnyAdminAccess(resolvePlatformRole({ email: 'seller@x.com' }))).toBe(false)
  })

  it('reads no membership anywhere in the role model', () => {
    const source = readFileSync('domain/admin/roles.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(source).not.toContain('membership')
    expect(source).not.toContain('memberships')
  })
})

describe('permissions', () => {
  it('COUNTS NINE PERMISSIONS, and adding a tenth is a decision', () => {
    /*
     * The one place the number is written down. Every other test derives from
     * PERMISSIONS.length, so adding a key goes red HERE — in the test whose
     * whole subject is how many there are — rather than in four unrelated
     * tests that happened to mention a literal. A6 added the eighth,
     * `financials.view`, and the four it went red in are the reason this
     * test exists. Part 6 added the ninth, `metrics.view`, and this was the
     * only place that needed touching — which is the test doing its job.
     */
    expect(PERMISSIONS).toHaveLength(9)
    expect(PERMISSIONS).toContain('financials.view')
    expect(PERMISSIONS).toContain('metrics.view')
  })

  it('gives SUPER_ADMIN and ADMIN every permission there is', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN).toHaveLength(PERMISSIONS.length)
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).toHaveLength(PERMISSIONS.length)
    for (const permission of PERMISSIONS) {
      expect(can('SUPER_ADMIN', permission), permission).toBe(true)
      expect(can('ADMIN', permission), permission).toBe(true)
    }
  })

  it('gives MANAGER users.view and nothing else', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).toEqual(['users.view'])
    expect(can('MANAGER', 'users.view')).toBe(true)
    expect(can('MANAGER', 'subscriptions.view')).toBe(false)
    expect(can('MANAGER', 'users.detail')).toBe(false)
    /*
     * A manager is a promoted seller. Seeing WHO exists is a different thing
     * from seeing what everyone earns, so the most sensitive permission in the
     * product is not one they get by being promoted. A super admin can tick it
     * from the matrix — that is the matrix's purpose — but it takes a person.
     */
    expect(can('MANAGER', 'financials.view')).toBe(false)
  })

  it('gives USER none, and no admin access at all', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.USER).toEqual([])
    expect(hasAnyAdminAccess('USER')).toBe(false)
    for (const permission of PERMISSIONS) {
      expect(can('USER', permission), permission).toBe(false)
    }
  })
})

describe('the two non-delegatable capabilities', () => {
  it('are not permissions, so no role can be granted them', () => {
    // If either ever appeared in PERMISSIONS, a future checkbox editor would
    // render it and an ADMIN could be given the power to promote themselves.
    for (const capability of SUPER_ADMIN_ONLY) {
      expect(PERMISSIONS as readonly string[]).not.toContain(capability)
      for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'] as const) {
        expect(DEFAULT_ROLE_PERMISSIONS[role] as readonly string[], role).not.toContain(capability)
      }
    }
  })

  it('answer only to SUPER_ADMIN', () => {
    for (const capability of SUPER_ADMIN_ONLY) {
      expect(canSuperAdminOnly('SUPER_ADMIN', capability)).toBe(true)
      expect(canSuperAdminOnly('ADMIN', capability)).toBe(false)
      expect(canSuperAdminOnly('MANAGER', capability)).toBe(false)
      expect(canSuperAdminOnly('USER', capability)).toBe(false)
    }
  })
})

/*
 * The cross-shop repository is the single most dangerous file in the codebase.
 * Its NAME is the first guard; this is the one that actually holds.
 */
describe('only admin code may read across shops', () => {
  const MODULE = 'admin-reads-every-shop'

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue
      const path = posixJoin(dir, entry)
      if (statSync(path).isDirectory()) walk(path, out)
      else if (/\.tsx?$/.test(path)) out.push(path)
    }
    return out
  }

  /*
   * COMMENTS STRIPPED, and this is the THIRD time that has turned out to
   * matter in this file. The sweep matched the module's NAME anywhere in a
   * file, so admin-audit-log.ts and admin-writes-platform-role.ts — which
   * mention it in their banners to explain that they cross the same boundary
   * for the same reason — were reported as illegal importers. A guard that
   * fires on prose about the rule is a guard people learn to route around by
   * deleting the prose.
   */
  const code = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  const importers = ['app', 'components', 'domain', 'lib']
    .flatMap((root) => walk(root))
    .filter((file) => !file.endsWith(`${MODULE}.ts`))
    .filter((file) => code(file).includes(MODULE))

  it('finds the importers it is meant to be checking', () => {
    // A sweep that matches nothing passes perfectly.
    expect(importers.length).toBeGreaterThan(0)
  })

  it('is imported only from app/(admin) and domain/admin', () => {
    const stray = importers.filter(
      (file) => !file.startsWith('app/(admin)') && !file.startsWith('domain/admin'),
    )
    expect(stray).toEqual([])
  })

  it('contains no write of any kind', () => {
    const source = readFileSync(`lib/repositories/${MODULE}.ts`, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const write of ['.insert(', '.update(', '.delete(', 'withAccountStore']) {
      expect(source, write).not.toContain(write)
    }
  })

  it('selects no secret, no listing and no buyer', () => {
    /*
     * Comments stripped, and the reason is not cosmetic: the banner at the top
     * of that file NAMES these things in order to forbid them. Matching the
     * prose would mean the rule could only be obeyed by deleting the rule.
     *
     * `schema.orders` LEFT THIS LIST IN A6 and the replacement is the test
     * below, which is stricter about the thing that was actually at stake.
     * A1 banned the table outright because the account LIST had no business
     * reading revenue; the detail screen's financials.view section does, and
     * banning the table would have been protecting the wrong noun. What stays
     * banned is every way an individual purchase or buyer could arrive:
     * `order_items` is what somebody bought, `country_code` is where they
     * were, and D77 exists because a country with one order in it is a person.
     */
    const source = code(`lib/repositories/${MODULE}.ts`)
    const forbidden = [
      'tokenRef',
      'SERVICE_ROLE',
      'schema.listingVariations',
      'schema.orderItems',
      'countryCode',
      'etsyReceiptId',
      /*
       * `schema.listings` LEFT THIS LIST in the usage step, and the
       * replacement is the aggregate guard below — the same move the orders
       * ban made in A6, for the same reason. A plan's listing meter is a
       * COUNT of listings, and banning the table would have been protecting
       * the wrong noun.
       *
       * What is banned instead is every column that carries a seller's own
       * WORDS. A count of listings tells an operator whether a shop is over
       * its plan; a title tells them what somebody sells, which is none of
       * their business and not what the meter is for.
       */
      'listings.title',
      'listings.description',
      'listings.tags',
      'aiGenerations.input',
      'aiGenerations.output',
    ]
    for (const name of forbidden) {
      expect(source, name).not.toContain(name)
    }
  })

  /*
   * The three tables that hold a seller's own content or purchases, and may
   * be COUNTED but never listed.
   *
   * `orders` joined this list in A6 and `listings`/`ai_generations` in the
   * usage step, each time replacing a blanket ban on the table name. The
   * blanket ban was the weaker rule: deleting a string from a forbidden list
   * leaves NOTHING checking how the table is read, whereas this reads the
   * SELECT and fails on a single bare column.
   *
   * A grouping key is allowed — you cannot group a count per shop without
   * naming the shop id — and nothing else is. A seller's words and a buyer's
   * purchases never enter the process; the totals do.
   */
  const AGGREGATE_ONLY = [
    { table: 'schema.orders', groupKeys: ['schema.orders.shopId'] },
    { table: 'schema.listings', groupKeys: ['schema.listings.shopId'] },
    {
      table: 'schema.aiGenerations',
      /*
       * `kind` and `status` are grouping keys, not content: they are the two
       * enumerations the AI screen counts BY, and neither carries a word the
       * seller wrote. An ALLOWLIST rather than "any column that is not
       * content", because the failure mode of getting this wrong should be a
       * red test naming the column, not a quiet permission.
       *
       * Deliberately absent: `listingId`, which would make a count per
       * listing — a list of listings wearing a count's clothes — and
       * `actorId`, which would make a record of which teammate used the
       * feature. Neither is what "what is the AI costing" asks.
       */
      groupKeys: [
        'schema.aiGenerations.shopId',
        'schema.aiGenerations.kind',
        'schema.aiGenerations.status',
      ],
    },
  ]

  it('READS ORDERS, LISTINGS AND AI GENERATIONS ONLY AS AGGREGATES', () => {
    const source = code(`lib/repositories/${MODULE}.ts`)

    for (const { table, groupKeys } of AGGREGATE_ONLY) {
      const queries = source.split(`.from(${table})`).slice(0, -1)

      // A sweep that matches nothing passes perfectly. Each table must
      // actually be read somewhere, or this is asserting about an empty set.
      expect(queries.length, table).toBeGreaterThan(0)

      for (const before of queries) {
        const select = before.slice(before.lastIndexOf('.select({'))
        const fields = select.match(/^\s*\w+:\s*.*$/gm) ?? []
        expect(fields.length, `${table} :: ${select}`).toBeGreaterThan(0)
        for (const field of fields) {
          const trimmed = field.trim()
          const aggregate = /^\w+:\s*(count\(\)|sql<[^>]*>`[^`]*\b(sum|count)\()/.test(trimmed)
          const grouping = groupKeys.some(
            (key) => trimmed.endsWith(`${key},`) || trimmed.endsWith(key),
          )
          expect(aggregate || grouping, `${table} :: ${trimmed}`).toBe(true)
        }
      }
    }
  })

  /*
   * Grouping keys that do not identify anybody.
   *
   * The three content tables above must ALSO group by shop — a count of a
   * seller's listings that is not per shop is not answering an operator's
   * question. These do not: they are platform aggregates over `users` and
   * `subscriptions`, and grouping them by shop would be meaningless. What they
   * share with the others is that every key is an ENUMERATION or a date
   * bucket, never something that names a person.
   *
   * An allowlist rather than "anything that is not an email", so the failure
   * mode of adding a key is a red test naming it. `users.email` and
   * `users.name` are deliberately absent: a metrics screen that grouped by
   * either would have a name in its result set, and the guarantee that it
   * cannot name an account is that nothing reaches it that could.
   */
  const AGGREGATE_GROUP_KEYS = [
    'schema.users.onboardingState',
    'schema.subscriptions.plan',
  ]

  /**
   * The argument list of every `.groupBy(...)`, with parentheses balanced.
   *
   * A plain `/\.groupBy\(([^)]*)\)/` stops at the FIRST closing paren, which
   * is inside `date_trunc(...)` — so the shape check never saw the whole
   * expression and reported a date bucket as an unknown key. Balanced from the
   * opening paren instead.
   */
  function groupByArguments(source: string): string[] {
    const found: string[] = []
    for (const match of source.matchAll(/\.groupBy\(/g)) {
      let depth = 1
      let index = match.index! + match[0].length
      const start = index
      while (index < source.length && depth > 0) {
        if (source[index] === '(') depth += 1
        else if (source[index] === ')') depth -= 1
        index += 1
      }
      found.push(source.slice(start, index - 1))
    }
    return found
  }

  it('GROUPS ONLY BY AN ALLOWLISTED KEY, and by shop on the content tables', () => {
    const source = code(`lib/repositories/${MODULE}.ts`)
    const perShop = new Set(AGGREGATE_ONLY.flatMap((entry) => entry.groupKeys))
    const allowed = new Set([...perShop, ...AGGREGATE_GROUP_KEYS])

    const groups = groupByArguments(source)
    expect(groups.length, 'no groupBy found to check').toBeGreaterThan(0)

    let sawPerShop = false
    for (const group of groups) {
      const raw = group.trim()

      /*
       * A date bucket, which is an expression rather than a column. Allowed by
       * SHAPE — date_trunc over a timestamp cannot carry an identity — and
       * pinned to that shape so a `sql` template cannot become a way to group
       * by anything at all.
       */
      if (/^sql`date_trunc\('\w+', \$\{schema\.\w+\.\w+\}\)`$/.test(raw)) continue

      const keys = raw.split(',').map((key) => key.trim()).filter(Boolean)
      for (const key of keys) {
        expect(allowed.has(key), `groupBy(${raw}) :: ${key}`).toBe(true)
      }

      // A group that touches a content table must be per shop.
      if (keys.some((key) => perShop.has(key))) {
        expect(keys.some((key) => key.endsWith('.shopId')), raw).toBe(true)
        sawPerShop = true
      }
    }

    // Positive control: at least one per-shop grouping must exist, or the
    // clause above is asserting about nothing.
    expect(sawPerShop, 'no per-shop grouping found').toBe(true)
  })

  it('GROUPS BY NO COLUMN THAT NAMES A PERSON', () => {
    /*
     * The converse, stated separately because the allowlist above could be
     * widened without anybody noticing what it had been widened to.
     */
    const source = code(`lib/repositories/${MODULE}.ts`)
    for (const group of groupByArguments(source)) {
      for (const naming of ['.email', '.name', '.displayName', '.ownerId', '.actorId']) {
        expect(group, `groupBy(${group}) :: ${naming}`).not.toContain(naming)
      }
    }
  })
})

/*
 * The layout no longer refuses on its own, so this is not a style rule.
 *
 * app/(admin)/layout.tsx passes `children` straight through when access is
 * refused, because a notFound() thrown from a LAYOUT renders Next's bare error
 * document instead of the ordinary 404 page — a visibly different response
 * that let a signed-in seller tell /admin apart from a URL nobody wrote. The
 * cost of that fix is that the PAGE is now what refuses. If one ever forgets,
 * the layout hands it a non-operator and the page renders for them.
 */
describe('every operator page gates itself', () => {
  function pages(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = posixJoin(dir, entry)
      if (statSync(path).isDirectory()) pages(path, out)
      else if (entry === 'page.tsx') out.push(path)
    }
    return out
  }

  const found = pages('app/(admin)')

  /*
   * COMMENTS STRIPPED, and this is not tidiness — it is the fix for a sweep
   * that did not work. The first version tested `source.includes('requireAdmin(')`
   * against the raw file, and deleting the actual call from the users page left
   * it green: the page's own comment says "requireAdmin() rather than a boolean
   * from the layout", which contains the pattern. The check was reading the
   * prose ABOUT the guard instead of the guard.
   */
  const code = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('finds the pages it is meant to be checking', () => {
    // 0 == 0 passes perfectly. This is what stops that.
    expect(found.length).toBeGreaterThan(0)
  })

  it('calls requireAdmin() in every one of them', () => {
    const ungated = found.filter((file) => !code(file).includes('requireAdmin('))
    expect(ungated).toEqual([])
  })

  it('calls it before anything that answers the request', () => {
    /*
     * Ordering, not just presence. /admin redirect()s to /admin/users, and a
     * redirect issued before the check would tell a non-operator that /admin
     * exists and where it leads — the same disclosure, by a different verb.
     */
    for (const file of found) {
      const source = code(file)
      const gate = source.indexOf('requireAdmin(')
      for (const answer of [
        'redirect(',
        'adminListUsers(',
        'adminReadAccount(',
        'adminListManagers(',
        'readAdminAuditLog(',
      ]) {
        const at = source.indexOf(answer)
        if (at === -1) continue
        expect(gate, `${file} ${answer}`).toBeLessThan(at)
      }
    }
  })

  it('exposes no static metadata from an operator route', () => {
    /*
     * Next resolves a route's static metadata whether or not the component
     * renders, so `export const metadata` survives notFound() and lands in the
     * flight payload. Measured: a refused seller's 404 carried
     * "Accounts · Operations · EtsyPilot". A <title> inside the component
     * cannot leak, because a refused request never reaches it.
     */
    for (const file of [...found, 'app/(admin)/layout.tsx']) {
      const source = code(file)
      expect(source, file).not.toContain('export const metadata')
      expect(source, file).not.toContain('generateMetadata')
    }
  })
})

describe('the seller app never links to /admin', () => {
  it('has no /admin href in the navigation or the seller shell', () => {
    const files = ['components/layout/navigation.ts', 'components/layout/top-bar.tsx',
      'components/layout/sidebar.tsx', 'components/layout/user-menu.tsx']
    for (const file of files) {
      /*
       * The quote is part of the pattern. A bare '/admin' also matches the
       * path `repositories/admin-reads-every-shop`, which would make this
       * test fire for a reason it does not describe — and a guard you cannot
       * read the failure of is a guard you start ignoring. The import is
       * already covered, by name, one describe block up.
       */
      const source = readFileSync(file, 'utf8')
      for (const href of ["'/admin", '"/admin', '`/admin']) {
        expect(source, `${file} ${href}`).not.toContain(href)
      }
    }
  })
})

/* ─────────── the gate that decides before the response streams ───────────── */

describe('every operator route is gated ABOVE its Suspense boundary', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   A PAGE'S notFound() CANNOT SET A STATUS THAT HAS ALREADY BEEN SENT,
   *   AND A loading.tsx IS WHAT SENDS IT.
   * ══════════════════════════════════════════════════════════════════════
   *
   * `loading.tsx` wraps a segment's page in Suspense. Next flushes everything
   * ABOVE that boundary as soon as it resolves — 200, with the fallback — so
   * the page body runs into a response whose status line is already on the
   * wire.
   *
   * MEASURED against `next start` as a real MANAGER holding only users.view:
   * eight of nine gated routes answered 200 carrying the operator 404 page,
   * and /admin/permissions — the one segment with no loading.tsx — answered
   * 404. The BODY was right on all of them, which is exactly why it survived
   * a round of verification: only the status line was wrong, and nothing that
   * reads a page notices. Everything that reads a status does.
   *
   * So each route carries a layout.tsx, which is part of the shell and decides
   * before the flush. This asserts the structure rather than the behaviour —
   * the behaviour is measured against a running server in
   * tests/browser/admin-refusal-status.py, because a status line is not a
   * thing a unit test can see, and believing otherwise is what produced the
   * defect.
   */

  function under(dir: string, name: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = posixJoin(dir, entry)
      if (statSync(path).isDirectory()) under(path, name, out)
      else if (entry === name) out.push(path)
    }
    return out
  }

  const strip = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  const PAGES = under('app/(admin)', 'page.tsx')
  const LAYOUTS = under('app/(admin)', 'layout.tsx')
  const LOADINGS = under('app/(admin)', 'loading.tsx')

  /**
   * The keys a file REFUSES on — not the keys it merely consults.
   *
   * The distinction is load-bearing and the first version of this test did not
   * make it. The accounts list calls
   *
   *     const mayChangeRoles = access.canSuperAdminOnly('roles.write')
   *
   * to decide whether to render a column. That is a question, not a gate: a
   * viewer without roles.write still sees the list, minus one column. Counting
   * it as a requirement made this test demand that /admin/users refuse anyone
   * without roles.write — which would have locked every manager out of the one
   * screen they are meant to have.
   *
   * A refusal is `requireAdmin(...)`, which throws by itself, or a
   * canSuperAdminOnly() whose negation is followed by notFound().
   */
  function keysIn(file: string): string[] {
    const source = strip(file)
    return [
      ...[...source.matchAll(/requireAdmin\('([\w.]+)'\)/g)].map((m) => m[1]!),
      ...[...source.matchAll(/permission: '([\w.]+)'/g)].map((m) => m[1]!),
      ...[...source.matchAll(/superAdminOnly: '([\w.]+)'/g)].map((m) => m[1]!),
      ...[...source.matchAll(/!\s*access\.canSuperAdminOnly\('([\w.]+)'\)\)\s*notFound\(\)/g)].map(
        (m) => m[1]!,
      ),
    ].sort()
  }

  it('tells a REFUSAL apart from a question, which is where this test started wrong', () => {
    // The positive control for keysIn. Without it the rule below passes on an
    // extractor that treats every mention of a capability as a requirement.
    const list = posixJoin('app/(admin)', 'admin/users/(list)/page.tsx')
    expect(strip(list)).toContain("canSuperAdminOnly('roles.write')")
    expect(keysIn(list)).toEqual(['users.view'])

    const editor = posixJoin('app/(admin)', 'admin/permissions/page.tsx')
    expect(keysIn(editor)).toEqual(['roles.write', 'users.view'])
  })

  /** Every layout from the (admin) root down to this file's own segment. */
  function chainFor(file: string): string[] {
    const parts = file.split('/')
    const chain: string[] = []
    for (let depth = parts.length - 1; depth > 0; depth -= 1) {
      const candidate = `${parts.slice(0, depth).join('/')}/layout.tsx`
      if (LAYOUTS.includes(candidate)) chain.push(candidate)
    }
    return chain
  }

  it('finds the pages, the layouts and the skeletons it is checking', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(13)
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(12)
    expect(LOADINGS.length).toBeGreaterThanOrEqual(8)
  })

  it('COVERS BOTH GROUPS: routes with a skeleton and routes without', () => {
    /*
     * The difference between those two groups WAS the original clue, and a
     * check that happened to cover only one of them would have missed this the
     * first time too. This asserts the sample is mixed, so the rules below
     * cannot quietly become a statement about one group.
     */
    const segments = PAGES.map((page) => page.slice(0, page.lastIndexOf('/')))
    const withSkeleton = segments.filter((segment) =>
      LOADINGS.some((loading) => loading.startsWith(`${segment}/`)),
    )
    expect(withSkeleton.length).toBeGreaterThan(0)
    expect(segments.length - withSkeleton.length).toBeGreaterThan(0)
  })

  it('GIVES EVERY PAGE A LAYOUT GATE ABOVE IT', () => {
    for (const page of PAGES) {
      const gated = chainFor(page).filter((layout) =>
        strip(layout).includes('requireOperatorRoute('),
      )
      // /admin is the redirect stub: it has no Suspense above it and the group
      // layout already refuses a non-operator before it runs.
      if (page === posixJoin('app/(admin)', 'admin/page.tsx')) continue
      expect(gated, page).not.toEqual([])
    }
  })

  it('DECLARES THE SAME KEYS IN THE LAYOUT AS IN THE PAGE', () => {
    /*
     * Two places enforce each route now, so they can disagree — and a layout
     * that gated on a WEAKER permission than its page would restore exactly
     * the bug this describe block exists for, with the page's stricter check
     * refusing at 200 all over again.
     */
    for (const page of PAGES) {
      if (page === posixJoin('app/(admin)', 'admin/page.tsx')) continue
      const fromLayouts = [...new Set(chainFor(page).flatMap(keysIn))].sort()
      const fromPage = [...new Set(keysIn(page))].sort()
      expect(fromLayouts, page).toEqual(fromPage)
    }
  })

  it('keeps the page gating itself as well, so a deleted layout is not an opening', () => {
    for (const page of PAGES) {
      expect(strip(page), page).toContain('requireAdmin(')
    }
  })

  it('puts a gate above every skeleton, so adding one cannot cost a status', () => {
    /*
     * Stated from the SKELETON's side rather than the page's. A loading.tsx
     * added to a segment tomorrow is the exact edit that caused this, and this
     * is the assertion that would have gone red on it.
     */
    for (const loading of LOADINGS) {
      const gated = chainFor(loading).filter((layout) =>
        strip(layout).includes('requireOperatorRoute('),
      )
      expect(gated, loading).not.toEqual([])
    }
  })
})

/* ──────────── the same shape on the seller side, which is clean ──────────── */

describe('a seller route redirects before it does any work', () => {
  /*
   * THE SAME SHAPE, CHECKED BECAUSE THE OPERATOR SIDE HAD THE DEFECT.
   *
   * Eleven seller routes have a loading.tsx, and every one of their pages
   * calls redirect('/login') for a signed-out visitor — a redirect issued
   * from inside a Suspense boundary, which is exactly the arrangement that
   * cost the operator routes their 404.
   *
   * MEASURED against `next start`, signed out: all eleven answer 307 with
   * Location: /login. No seller page calls notFound() at all. So the seller
   * side does not have the defect today, and the reason it does not is
   * structural rather than lucky: the session check is the FIRST thing every
   * one of those pages does, so nothing has suspended by the time the redirect
   * throws. Middleware sends nobody anywhere — it says so — so the 307 is the
   * page's own.
   *
   * That property is what this asserts, because it is the property that keeps
   * the measurement true. A page that fetched first and redirected second
   * would return 200 and then bounce the browser with client-side JavaScript,
   * which is slower, invisible to anything following redirects server-side,
   * and the same class of bug wearing different clothes.
   */

  function sellerPages(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = posixJoin(dir, entry)
      if (statSync(path).isDirectory()) sellerPages(path, out)
      else if (entry === 'page.tsx') out.push(path)
    }
    return out
  }

  const strip = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  const GUARDED = sellerPages('app/(dashboard)').filter((page) =>
    strip(page).includes("redirect('/login')"),
  )

  it('finds the seller pages it is meant to be checking', () => {
    expect(GUARDED.length).toBeGreaterThanOrEqual(20)
  })

  it('CHECKS THE SESSION BEFORE IT AWAITS ANYTHING ELSE', () => {
    for (const page of GUARDED) {
      const source = strip(page)
      const guard = source.indexOf("redirect('/login')")
      const body = source.slice(0, guard)
      /*
       * Exactly one await before the guard, and it is the session read itself.
       * A second one is something that ran for a visitor who is not signed in,
       * and — the point of this test — something that may have suspended and
       * committed a 200 before the redirect could set a status.
       */
      const awaits = body.match(/\bawait\b/g) ?? []
      expect(awaits.length, `${page} awaits ${awaits.length} things before its session guard`).toBe(
        1,
      )
      expect(body, page).toMatch(/await (getSession|requireSession)\(\)/)
    }
  })

  it('calls notFound() from no seller page at all', () => {
    // If one ever does, it needs the operator treatment: the status has to be
    // decided above the boundary, not inside it.
    for (const page of sellerPages('app/(dashboard)')) {
      expect(strip(page), page).not.toContain('notFound()')
    }
  })
})
