import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, normalize } from 'node:path'
import { posix, posixJoin } from '../support/paths'
import { AppError } from '@/lib/errors/types'
import { shopContext } from '@/lib/permissions'
import {
  ETSY_SERVICE_FACTORY,
  ETSY_WRITE_CALLERS,
  ETSY_WRITE_CALL_SITES,
  ETSY_WRITE_IMPLEMENTATIONS,
  ETSY_WRITE_METHOD,
  FORECLOSED_BY_DESIGN,
  OPERATOR_DB_MODULES,
  OPERATOR_ETSY_MODULES,
  OPERATOR_READ_ONLY_MODULES,
  OPERATOR_SHOP_CONTEXT_MODULES,
  OPERATOR_WRITABLE,
  SHOP_CONTEXT_FACTORY,
} from '@/domain/admin/operator-writes'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE OPERATOR AREA CANNOT WRITE SELLER DATA — OURS OR ETSY'S.
 *
 *   Not "does not today". This walks the import graph from every operator
 *   file and fails if a write outside the allowlist is reachable — directly,
 *   or through any module imported at any depth.
 *
 *   ONE GUARD, TWO HALVES, deliberately not two files. A second sweep would
 *   duplicate the closure walk, and the day someone widened one they would
 *   have no reason to look at the other. The database half and the Etsy half
 *   share a closure, a comment-stripper and an import resolver, so a change
 *   to how reachability is decided applies to both at once.
 *
 *   The Etsy half is the sharper of the two. A bad database write corrupts
 *   our records and the audit trail can repair them. A bad Etsy write changes
 *   a real seller's live listings on etsy.com, under their name, in front of
 *   their buyers: no transaction to roll back, no version to restore.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── HOW IT DECIDES WHAT A WRITE IS ────────────────────────────────────────
 *
 * Carefully, because the obvious version does not work. `.delete(` and
 * `.update(` are Map methods as well as drizzle ones, and the operator closure
 * genuinely contains both: lib/security/rate-limit.ts calls `store.delete(k)`
 * on a Map, and it is in the closure because the step-up limiter is. A sweep
 * that flagged those would be noise, and a sweep that special-cased them by
 * filename would be a denylist wearing an allowlist's clothes.
 *
 * So the test works from the CHOKEPOINT instead. You cannot write to Postgres
 * without `getDb()`. Two questions, both answerable from the text:
 *
 *   1. Which modules in the closure import getDb? Must be exactly the four in
 *      OPERATOR_DB_MODULES. A Map in some other module is then irrelevant: it
 *      has no database handle and cannot acquire one.
 *   2. Inside those four, what does every insert/update/delete target? Must be
 *      a table on the allowlist — and for `users`, the only column set must be
 *      platformRole.
 *
 * ── COMMENTS ARE STRIPPED FIRST ───────────────────────────────────────────
 *
 * Four separate guards in this codebase have now matched their own
 * documentation rather than the code: a "no secrets" sweep matched the banner
 * forbidding secrets, a page-gating sweep matched a comment saying
 * requireAdmin(), a cross-shop import sweep matched files explaining that they
 * cross the same boundary, and a non-delegatable sweep matched the very gate
 * that enforces it. Every read here goes through code().
 */

const OPERATOR_ROOTS = ['app/(admin)', 'domain/admin']
const OPERATOR_FILE = /^lib\/repositories\/admin-/

/** Source with comments removed. See the note above. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    /*
     * posixJoin, not join: on Windows this is where `app\(admin)\layout.tsx`
     * would be born, and every rule below is expressed in forward slashes —
     * OPERATOR_ROOTS, OPERATOR_FILE, the allowlists in operator-writes.ts.
     * Normalised here, at birth, because a path that reaches a Set under two
     * spellings has already given the wrong answer.
     */
    const path = posixJoin(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(path)) out.push(path)
  }
  return out
}

/** Resolve one import specifier to a file in this repo, or null if external. */
function resolveImport(specifier: string, from: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = specifier.slice(2)
  else if (specifier.startsWith('.')) base = posix(normalize(posixJoin(dirname(from), specifier)))
  else return null // a package; it has no getDb of ours to reach
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    posixJoin(base, 'index.ts'),
    posixJoin(base, 'index.tsx'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/**
 * Every local module this file pulls in.
 *
 * `import(` is matched as well as `from`, because a dynamic import is still an
 * edge — deferring a module to runtime does not make its writes unreachable,
 * and treating it as invisible would be the easiest way around this test.
 */
function importsOf(file: string): string[] {
  const source = code(file)
  const found: string[] = []
  for (const match of source.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const resolved = resolveImport(match[1]!, file)
    if (resolved) found.push(resolved)
  }
  return found
}

function operatorSeeds(): string[] {
  const all = [...walk('app'), ...walk('domain'), ...walk('lib'), ...walk('components')]
  return all.filter(
    (file) => OPERATOR_ROOTS.some((root) => file.startsWith(root)) || OPERATOR_FILE.test(file),
  )
}

/** Every module reachable from the operator area, at any depth. */
function operatorClosure(): string[] {
  const seeds = operatorSeeds()
  const seen = new Set(seeds)
  const queue = [...seeds]
  while (queue.length > 0) {
    for (const dependency of importsOf(queue.pop()!)) {
      if (!seen.has(dependency)) {
        seen.add(dependency)
        queue.push(dependency)
      }
    }
  }
  return [...seen].sort()
}

const CLOSURE = operatorClosure()
const SEEDS = operatorSeeds()

const DB_MODULE = 'lib/db/index.ts'

/**
 * Does this module obtain a database handle?
 *
 * Asked through importsOf(), NOT with a regex for `from '@/lib/db'`.
 *
 * FOUND BY MUTATION: the first version matched only the static form, so a new
 * operator module that reached the database with
 *
 *     const { getDb, schema } = await import('@/lib/db')
 *
 * was not classified as a database module at all, and its writes were
 * therefore never examined. It updated `shops` and the whole suite stayed
 * green. That is not an exotic evasion — it is what someone writes to avoid a
 * cycle or to defer a heavy import, and it would have opened the boundary by
 * accident. importsOf() already resolves both forms, so the chokepoint now
 * uses the same answer the closure walk does.
 */
function touchesDb(file: string): boolean {
  return importsOf(file).includes(DB_MODULE) && /\bgetDb\b/.test(code(file))
}

interface Write {
  file: string
  verb: string
  target: string
  raw: string
}

/** Every drizzle write in one module, with the table it names. */
function writesIn(file: string): Write[] {
  const source = code(file)
  const found: Write[] = []
  for (const match of source.matchAll(/\.(insert|update|delete)\(\s*([^)\s]*)/g)) {
    const [raw, verb, argument] = match
    found.push({ file, verb: verb!, target: (argument ?? '').replace(/^schema\./, ''), raw })
  }
  return found
}

/* ───────────────── the sweep is looking at something real ───────────────── */

describe('the guard has a subject', () => {
  it('finds the operator files it is meant to be checking', () => {
    // A closure of nothing passes every assertion below perfectly.
    expect(SEEDS.length).toBeGreaterThan(10)
    expect(SEEDS).toContain('domain/admin/access.ts')
    expect(SEEDS).toContain('lib/repositories/admin-writes-platform-role.ts')
  })

  it('follows imports beyond the seeds', () => {
    // If the closure were only the seeds, the "imported module" half of the
    // rule would be untested and this file would prove much less than it says.
    expect(CLOSURE.length).toBeGreaterThan(SEEDS.length)
    expect(CLOSURE).toContain('lib/security/rate-limit.ts')
  })

  it('names every allowlisted table in the schema it claims to describe', () => {
    // An allowlist naming a table that does not exist is an allowlist nobody
    // has checked against the schema.
    const schema = code('db/schema/index.ts')
    for (const entry of OPERATOR_WRITABLE) {
      expect(schema, entry.schemaKey).toContain(`export const ${entry.schemaKey} = pgTable(`)
      expect(schema, entry.table).toContain(`'${entry.table}'`)
    }
  })
})

/* ────────────────────────────── the chokepoint ──────────────────────────── */

describe('only the named repositories can reach the database', () => {
  it('is exactly the allowlisted modules, no more', () => {
    /*
     * THE LOAD-BEARING ASSERTION. Everything else follows from it: a module
     * with no database handle cannot write, whatever methods it calls.
     */
    const holders = CLOSURE.filter(touchesDb).sort()
    expect(holders).toEqual([...OPERATOR_DB_MODULES].sort())
  })

  it('does not reach lib/repositories/accounts.ts at all', () => {
    /*
     * THE SHARPEST CASE, and it is handled by being true rather than by an
     * exemption. accounts.ts writes users, shops and memberships for signup
     * provisioning, sits in the same folder as the operator repositories, and
     * was reachable from every operator page until this rule was written:
     * getAdminAccess() called getSession(), which resolves the caller's shop
     * and REPAIRS a missing one by provisioning it.
     *
     * The gate now calls getOperatorIdentity(), which reads the Supabase
     * identity and nothing else. No screen under /admin needed the shop.
     */
    expect(CLOSURE).not.toContain('lib/repositories/accounts.ts')
    expect(CLOSURE).not.toContain('domain/auth/provision.ts')
  })

  it('does not reach getSession, which can provision', () => {
    // Named separately from accounts.ts so a failure says WHICH edge came
    // back, rather than just "something reaches a write".
    expect(CLOSURE).not.toContain('lib/auth/index.ts')
  })

  it('keeps accounts.ts reachable from the AUTH path, which needs it', () => {
    /*
     * The other half, and it is not decoration: without it, deleting
     * provisioning entirely would make the test above pass. The rule is
     * "unreachable from the operator area", not "unreachable".
     */
    const authSeeds = ['lib/auth/actions.ts', 'lib/auth/index.ts']
    const seen = new Set(authSeeds)
    const queue = [...authSeeds]
    while (queue.length > 0) {
      for (const dependency of importsOf(queue.pop()!)) {
        if (!seen.has(dependency)) {
          seen.add(dependency)
          queue.push(dependency)
        }
      }
    }
    expect([...seen]).toContain('lib/repositories/accounts.ts')
    expect([...seen]).toContain('domain/auth/provision.ts')
  })

  it('still lets the operator area READ across every shop', () => {
    // The rule is about writes. An operator panel that could not read seller
    // data would not be an operator panel.
    expect(CLOSURE).toContain('lib/repositories/admin-reads-every-shop.ts')
    expect(code('lib/repositories/admin-reads-every-shop.ts')).toContain('.from(schema.users)')
  })
})

/* ─────────────────────────────── the allowlist ──────────────────────────── */

describe('every reachable write targets an allowlisted table', () => {
  const allowed = new Set(OPERATOR_WRITABLE.map((entry) => entry.schemaKey))

  it('writes nothing outside the allowlist', () => {
    const offenders: string[] = []
    for (const file of CLOSURE.filter(touchesDb)) {
      for (const write of writesIn(file)) {
        if (!allowed.has(write.target)) {
          offenders.push(`${file}: ${write.verb}(${write.target || '<unknown>'})`)
        }
      }
    }
    /*
     * The failure names the table, which is the point of an allowlist: adding
     * `listings` to the schema and writing it from an operator page produces
     * "app/…: insert(listings)" rather than silence.
     */
    expect(offenders).toEqual([])
  })

  it('identifies the target of every write, refusing to guess', () => {
    /*
     * FAILS CLOSED on a write whose table it cannot read — `tx.insert(table)`
     * where `table` is a variable, say. Such a write might be perfectly fine;
     * the point is that this test cannot tell, and a guard that shrugs at what
     * it cannot parse is a guard with a hole the shape of whatever it cannot
     * parse.
     */
    for (const file of CLOSURE.filter(touchesDb)) {
      for (const write of writesIn(file)) {
        expect(write.target, `${file}: ${write.raw}`).not.toBe('')
        expect(allowed.has(write.target) || write.target === '', `${file}: ${write.raw}`).toBe(true)
      }
    }
  })

  it('touches ONE column of users, and it is platform_role', () => {
    /*
     * `users` is on the allowlist but the row belongs to the seller — their
     * email, their name, their onboarding answers. Only platform_role is
     * EtsyPilot's own record rather than theirs, so the table entry alone is
     * not enough and the columns actually set are checked.
     */
    const entry = OPERATOR_WRITABLE.find((candidate) => candidate.schemaKey === 'users')
    expect(entry?.column).toBe('platform_role')

    for (const file of CLOSURE.filter(touchesDb)) {
      const source = code(file)
      for (const match of source.matchAll(/\.update\(\s*schema\.users\s*\)\s*\.set\(\{([^}]*)\}/g)) {
        const columns = (match[1] ?? '')
          .split(',')
          .map((part) => part.split(':')[0]!.trim())
          .filter((name) => name.length > 0)
        expect(columns, `${file} sets ${columns.join(', ')}`).toEqual(['platformRole'])
      }
      // And every update of users is one this test could read. An update whose
      // .set() it could not parse would otherwise pass unexamined.
      const updates = (source.match(/\.update\(\s*schema\.users\s*\)/g) ?? []).length
      const parsed = [...source.matchAll(/\.update\(\s*schema\.users\s*\)\s*\.set\(\{([^}]*)\}/g)]
      expect(parsed.length, `${file}: ${updates} update(users), ${parsed.length} parsed`).toBe(
        updates,
      )
    }
  })

  it('never deletes anything, anywhere in the operator area', () => {
    /*
     * Not on the allowlist as a verb at all. The audit tables are append-only
     * by construction, the permission matrix falls back to the DEFAULTS when a
     * row is missing — so deleting one silently restores permissions — and no
     * operator screen removes an account. A delete here would be all three
     * problems at once.
     */
    for (const file of CLOSURE.filter(touchesDb)) {
      for (const write of writesIn(file)) {
        expect(write.verb, `${file}: ${write.raw}`).not.toBe('delete')
      }
    }
  })
})

/* ──────────────────────── the reader stays a reader ──────────────────────── */

describe('the cross-shop reader holds a handle and writes nothing', () => {
  it('contains no write at all', () => {
    for (const file of OPERATOR_READ_ONLY_MODULES) {
      expect(writesIn(file), file).toEqual([])
    }
  })

  it('is listed as a database module, because it holds the handle', () => {
    // It has to be in OPERATOR_DB_MODULES for the chokepoint assertion to
    // pass, so the read-only list is what stops that from being a loophole.
    for (const file of OPERATOR_READ_ONLY_MODULES) {
      expect(OPERATOR_DB_MODULES).toContain(file)
    }
  })
})

/* ────────────────────── the allowlist describes reality ─────────────────── */

describe('the allowlist is complete and honest', () => {
  it('accounts for every write that actually exists', () => {
    /*
     * The reverse direction. The assertions above prove no write escapes the
     * list; this proves the list has no entries nobody uses — a stale
     * allowlist is a permission granted for a reason that has gone away.
     */
    const written = new Set<string>()
    for (const file of CLOSURE.filter(touchesDb)) {
      for (const write of writesIn(file)) written.add(write.target)
    }
    expect([...written].sort()).toEqual([...OPERATOR_WRITABLE.map((e) => e.schemaKey)].sort())
  })

  it('names what it forecloses, so the trade is visible', () => {
    // Impersonation especially: the one an operator panel grows towards.
    expect(FORECLOSED_BY_DESIGN.length).toBeGreaterThan(5)
    expect(FORECLOSED_BY_DESIGN.join(' ').toLowerCase()).toContain('impersonation')
  })

  it('is recorded as a decision, not only as a test', () => {
    /*
     * The rule is the kind that erodes under "just one small write" in six
     * months. A test says what; the decision record says why, and is what
     * someone reads before amending this file.
     */
    const decisions = readFileSync('docs/DECISIONS.md', 'utf8')
    expect(decisions).toContain('### D94')
    expect(decisions).toContain('operator-write-boundary')
  })
})

/* ═══════════════════ the second half: the seller's Etsy shop ═════════════ */

const ETSY_FACTORY_MODULE = 'lib/etsy/index.ts'

/**
 * The file that DECLARES the rule, and the one module allowed to name what
 * the rule forbids.
 *
 * FOUND BY RUNNING IT: domain/admin/operator-writes.ts is itself in the
 * operator closure, and it holds `ETSY_WRITE_METHOD = 'applyListingChanges'`
 * and `SHOP_CONTEXT_FACTORY = 'shopContext'` as string constants. So the name
 * sweeps flagged the allowlist for containing the allowlist — the fifth time
 * a guard in this codebase has matched its own documentation, and the first
 * time one has matched its own DATA.
 *
 * Exempting it is not a hole, because the exemption is paired with a check
 * that it contains no CALL to any of the four dangerous things, and no
 * imports at all. A policy file has to be able to name what it forbids; it
 * must not be able to do it.
 */
const POLICY_MODULE = 'domain/admin/operator-writes.ts'

/** Every closure module except the one that declares the rule. */
const SUBJECTS = CLOSURE.filter((file) => file !== POLICY_MODULE)

/**
 * Does this module obtain an EtsyService?
 *
 * The same chokepoint question as touchesDb(), and resolved the same way —
 * through importsOf(), so a dynamic `await import('@/lib/etsy')` counts. That
 * exact evasion already slipped past the database half once.
 */
function holdsEtsyService(file: string): boolean {
  return (
    importsOf(file).includes(ETSY_FACTORY_MODULE) &&
    new RegExp(`\\b${ETSY_SERVICE_FACTORY}\\b`).test(code(file))
  )
}

/** Does this module so much as NAME the one write method? */
function namesEtsyWrite(file: string): boolean {
  return new RegExp(`\\b${ETSY_WRITE_METHOD}\\b`).test(code(file))
}

function callSitesIn(file: string): number {
  return (code(file).match(new RegExp(`\\.${ETSY_WRITE_METHOD}\\(`, 'g')) ?? []).length
}

describe('the detectors find the Etsy write where it really is', () => {
  /*
   * THE POSITIVE CONTROL, and the reason it comes first.
   *
   * Every assertion in the next block is of the form "the operator area
   * contains none of this". A broken detector satisfies all of them
   * perfectly — it finds nothing everywhere. So the detector is pointed at
   * the places the write genuinely lives, and has to find it there before its
   * silence about /admin means anything.
   */
  it('finds the method on the interface and both adapters', () => {
    for (const file of ETSY_WRITE_IMPLEMENTATIONS) {
      expect(namesEtsyWrite(file), file).toBe(true)
    }
  })

  it('finds the caller, and it is the bulk editor', () => {
    for (const file of ETSY_WRITE_CALLERS) {
      expect(namesEtsyWrite(file), file).toBe(true)
      expect(callSitesIn(file), file).toBe(ETSY_WRITE_CALL_SITES)
    }
  })

  it('finds an EtsyService holder outside the operator area', () => {
    // Otherwise holdsEtsyService() could be returning false for everything.
    const holders = [...walk('app'), ...walk('domain'), ...walk('lib')].filter(holdsEtsyService)
    expect(holders.length).toBeGreaterThan(3)
  })

  it('confirms D50: the apply and rollback paths are the ONLY callers', () => {
    /*
     * D50 says nothing is auto-published and that applyListingChanges is
     * reachable only through the bulk editor's ConfirmedOperation gate. That
     * is a claim about the whole repository, so it is checked against the
     * whole repository rather than only against /admin.
     */
    const callers = [...walk('app'), ...walk('domain'), ...walk('lib')]
      .filter((file) => callSitesIn(file) > 0)
      .sort()
    expect(callers).toEqual([...ETSY_WRITE_CALLERS].sort())
  })
})

describe('the operator area cannot write to the seller’s Etsy shop', () => {
  it('holds no EtsyService anywhere in the closure', () => {
    /*
     * The chokepoint, and the allowlist it is checked against is EMPTY. Reads
     * are excluded as well as writes because the handle is the same object: a
     * screen that could fetch a listing could also push one, and the
     * `etsy.view` permission is served from our own etsy_connections table.
     */
    const holders = CLOSURE.filter(holdsEtsyService).sort()
    expect(holders).toEqual([...OPERATOR_ETSY_MODULES].sort())
    expect(OPERATOR_ETSY_MODULES).toEqual([])
  })

  it('never NAMES the write method, even on a service it was handed', () => {
    /*
     * The chokepoint alone is not enough here, and that is the difference
     * from the database half. A module can call a method on a service passed
     * in as a parameter — which is exactly how domain/bulk-editor/service.ts
     * does it — without ever importing the factory. So the method name is
     * swept for as well.
     */
    const namers = SUBJECTS.filter(namesEtsyWrite).sort()
    expect(namers).toEqual([])
  })

  it('reaches no Etsy adapter module at all', () => {
    // The third overlapping barrier: there is nowhere in the closure for a
    // service to come from, injected or otherwise.
    const etsy = CLOSURE.filter((file) => file.startsWith('lib/etsy')).sort()
    expect(etsy).toEqual([])
  })

  it('reaches no part of the bulk editor, which is what owns the write', () => {
    const bulk = CLOSURE.filter((file) => file.startsWith('domain/bulk-editor')).sort()
    expect(bulk).toEqual([])
  })

  it('lets the policy file NAME what it forbids, but not DO it', () => {
    /*
     * The price of the one exemption above. operator-writes.ts may hold the
     * strings, because a rule that cannot name what it forbids is unwritable.
     * It may not call any of them, and a call is what the syntax below looks
     * like. Without this, the exemption would be a hole exactly the shape of
     * the file that defines the boundary.
     */
    const policy = code(POLICY_MODULE)
    for (const call of [
      `.${ETSY_WRITE_METHOD}(`,
      `${ETSY_SERVICE_FACTORY}(`,
      `${SHOP_CONTEXT_FACTORY}(`,
      'getDb(',
    ]) {
      expect(policy, call).not.toContain(call)
    }
    // And it imports nothing at all, so it cannot acquire a handle either.
    expect(importsOf(POLICY_MODULE)).toEqual([])
  })

  it('leaves the bulk editor’s own path working', () => {
    /*
     * The converse, for the same reason accounts.ts has one: deleting the
     * bulk editor outright would satisfy every assertion above. The rule is
     * "unreachable from the operator area", not "unreachable".
     */
    for (const file of ETSY_WRITE_CALLERS) {
      expect(namesEtsyWrite(file), file).toBe(true)
      expect(existsSync(file), file).toBe(true)
    }
  })
})

/* ════════════════ no writable context for another seller's shop ═════════ */

describe('an operator cannot obtain a writable shop context', () => {
  /*
   * shopContext() is the seller isolation boundary and lib/permissions is not
   * touched by this rule. These assert the property the rule LEANS on, rather
   * than assuming it, and add the operator-shaped case that was not covered:
   * the cross-shop throw itself is already asserted in provisioning.test.ts,
   * for a seller.
   */
  const operator = {
    userId: 'u-operator',
    email: 'boss@etsypilot.app',
    name: 'Boss',
    shopId: 'shop_operator_own',
    isDemo: false,
  }

  it('throws when an operator asks for a shop they do not own', () => {
    expect(() => shopContext(operator, 'shop_some_seller')).toThrow(AppError)
    try {
      shopContext(operator, 'shop_some_seller')
    } catch (error) {
      expect((error as AppError).kind).toBe('AUTHORIZATION')
    }
  })

  it('throws for every seller shop an operator might be inspecting', () => {
    // The account list shows every shop on the platform. None of them is a
    // context this session can obtain.
    for (const shop of ['demo-willow-fern', 'shop_a', 'shop_b', '']) {
      expect(() => shopContext(operator, shop), shop).toThrow(AppError)
    }
  })

  it('is not reachable from the operator area in the first place', () => {
    /*
     * The structural half. The read paths a future operator screen will need
     * must not acquire a context on the way to a number — so lib/permissions
     * is absent from the closure, and no operator module names shopContext.
     */
    const users = SUBJECTS.filter((file) =>
      new RegExp(`\\b${SHOP_CONTEXT_FACTORY}\\b`).test(code(file)),
    ).sort()
    expect(users).toEqual([...OPERATOR_SHOP_CONTEXT_MODULES].sort())
    expect(CLOSURE).not.toContain('lib/permissions/index.ts')
  })

  it('could not build a session to pass, because the identity has no shop', () => {
    /*
     * Why the absence above is stable rather than a coincidence. shopContext
     * takes a Session, which carries shopId and isDemo. getOperatorIdentity()
     * returns neither, so an operator page cannot even construct the argument
     * — a future screen that wanted a context would have to go and find a
     * shop id from somewhere, which is a visible act rather than a slip.
     */
    const identity = code('lib/auth/operator-identity.ts')
    const shape = identity.slice(
      identity.indexOf('export interface OperatorIdentity'),
      identity.indexOf('}', identity.indexOf('export interface OperatorIdentity')),
    )
    expect(shape).toContain('userId')
    expect(shape).toContain('email')
    expect(shape).not.toContain('shopId')
    expect(shape).not.toContain('isDemo')
    // And shopContext really does require one, so the type refuses.
    expect(code('lib/permissions/index.ts')).toContain('session: Session')
  })
})

describe('the combined rule forecloses both kinds of write', () => {
  it('names the Etsy-side features it rules out', () => {
    const listed = FORECLOSED_BY_DESIGN.join(' ').toLowerCase()
    for (const foreclosed of ['sync', 'listing', 'publish', 'impersonation']) {
      expect(listed, foreclosed).toContain(foreclosed)
    }
  })

  it('is recorded in the same decision, not a second one', () => {
    // Same rule, two halves. A separate record would let one be amended
    // without the other being read.
    const decisions = readFileSync('docs/DECISIONS.md', 'utf8')
    const d94 = decisions.slice(decisions.indexOf('### D94'))
    expect(d94).toContain(ETSY_WRITE_METHOD)
    expect(d94).toContain('D50')
    expect(decisions).not.toContain('### D95')
  })
})
