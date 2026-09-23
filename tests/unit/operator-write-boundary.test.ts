import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import {
  FORECLOSED_BY_DESIGN,
  OPERATOR_DB_MODULES,
  OPERATOR_READ_ONLY_MODULES,
  OPERATOR_WRITABLE,
} from '@/domain/admin/operator-writes'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE OPERATOR AREA CANNOT WRITE SELLER DATA.
 *
 *   Not "does not today". This walks the import graph from every operator
 *   file and fails if a write outside the allowlist is reachable — directly,
 *   or through any module imported at any depth.
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
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(path)) out.push(path)
  }
  return out
}

/** Resolve one import specifier to a file in this repo, or null if external. */
function resolveImport(specifier: string, from: string): string | null {
  let base: string
  if (specifier.startsWith('@/')) base = specifier.slice(2)
  else if (specifier.startsWith('.')) base = normalize(join(dirname(from), specifier))
  else return null // a package; it has no getDb of ours to reach
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
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

const DB_MODULE = join('lib', 'db', 'index.ts')

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
    expect(SEEDS).toContain(join('domain', 'admin', 'access.ts'))
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
    expect(CLOSURE).not.toContain(join('lib', 'repositories', 'accounts.ts'))
    expect(CLOSURE).not.toContain(join('domain', 'auth', 'provision.ts'))
  })

  it('does not reach getSession, which can provision', () => {
    // Named separately from accounts.ts so a failure says WHICH edge came
    // back, rather than just "something reaches a write".
    expect(CLOSURE).not.toContain(join('lib', 'auth', 'index.ts'))
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
    expect([...seen]).toContain(join('lib', 'repositories', 'accounts.ts'))
    expect([...seen]).toContain(join('domain', 'auth', 'provision.ts'))
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
