import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { win32 } from 'node:path'
import { posix, posixJoin, posixRelative } from '../support/paths'

/*
 * THE SUITE MUST PROVE THE SAME THINGS ON WINDOWS.
 *
 * Eighteen tests failed on a Windows machine and not one was a real defect:
 * every one was the suite assuming a Unix environment. That is worse than
 * having no local tests, because it trains the person who runs them daily to
 * read a red run as normal — and then to stop reading it.
 *
 * This file is in two halves, and the second is the one that keeps it fixed.
 *
 *   MEASURED    the normaliser is fed real `path.win32` output, ON LINUX, and
 *               has to recover the posix form. With a positive control: the
 *               un-normalised value must FAIL the same classification, or the
 *               measurement is of nothing.
 *
 *   ENFORCED    a sweep over tests/ that fails on the ways a platform
 *               separator can still reach a comparison. Also with positive
 *               controls, for the same reason: a static check that flags
 *               nothing passes beautifully on a suite full of the bug.
 */

/* ───────────────────────────── half one: measured ────────────────────────── */

describe('the normaliser handles what Windows actually produces', () => {
  it('turns a win32 path into a posix one', () => {
    /*
     * `path.win32` is available on every platform, so this runs the REAL
     * Windows transformation on Linux rather than describing it. That is why
     * posix() splits on either separator instead of on `path.sep`: with
     * `path.sep` it would be the identity here and this test could not exist.
     */
    expect(win32.join('app', '(admin)', 'layout.tsx')).toBe('app\\(admin)\\layout.tsx')
    expect(posix(win32.join('app', '(admin)', 'layout.tsx'))).toBe('app/(admin)/layout.tsx')
  })

  it('handles a MIXED path, which Windows accepts and produces', () => {
    /*
     * Windows takes either separator, so a mixed path is legal there and turns
     * up whenever a posix-shaped string meets a platform-shaped one — a
     * template literal, a config value, an argument someone typed.
     *
     * Checked as a property of posix() rather than of win32.join(): join
     * normalises its whole result to backslashes, so it is not itself a source
     * of mixed paths. Written the other way round first, and measured —
     * `win32.join('lib/etsy', 'live.ts')` is `lib\\etsy\\live.ts`, not the
     * half-converted string the first draft asserted.
     *
     * `split(path.sep)` would leave the forward slash here alone and only look
     * correct because it already was. Splitting on either handles it.
     */
    expect(posix('lib/etsy\\live.ts')).toBe('lib/etsy/live.ts')
    expect(posix('lib\\etsy/live.ts')).toBe('lib/etsy/live.ts')
    expect(win32.join('lib/etsy', 'live.ts')).toBe('lib\\etsy\\live.ts')
  })

  it('is idempotent, so a caller need not track whether it has been applied', () => {
    expect(posix(posix('a\\b\\c'))).toBe('a/b/c')
    expect(posix('a/b/c')).toBe('a/b/c')
  })

  it('leaves a path with no separator alone', () => {
    expect(posix('page.tsx')).toBe('page.tsx')
    expect(posix('')).toBe('')
  })

  it('normalises at birth through posixJoin and posixRelative', () => {
    expect(posixJoin('domain', 'admin', 'access.ts')).toBe('domain/admin/access.ts')
    expect(posixRelative(process.cwd(), `${process.cwd()}/lib/etsy/index.ts`)).toBe(
      'lib/etsy/index.ts',
    )
  })
})

describe('the classification the suite depends on, under Windows spellings', () => {
  /*
   * The rules every path-driven test applies, lifted out so they can be run
   * against Windows-shaped input. These are the exact predicates that failed:
   * `startsWith('app/(admin)')` matched nothing, and `/^lib\/repositories\//`
   * matched nothing, so the operator-write boundary guard inspected an empty
   * set and passed while proving nothing.
   */
  const OPERATOR_ROOTS = ['app/(admin)', 'domain/admin']
  const OPERATOR_FILE = /^lib\/repositories\/admin-/
  const isOperatorFile = (file: string) =>
    OPERATOR_ROOTS.some((root) => file.startsWith(root)) || OPERATOR_FILE.test(file)

  /** What a Windows walk would have produced for these repo paths. */
  const windowsSpellings = [
    'app/(admin)/admin/users/page.tsx',
    'domain/admin/access.ts',
    'lib/repositories/admin-reads-every-shop.ts',
  ].map((p) => p.split('/').join('\\'))

  it('FAILS on the raw Windows spelling — the positive control', () => {
    /*
     * Without this the test below proves nothing: a classifier that returned
     * true for everything would satisfy it. This is the bug, reproduced on
     * Linux, and it has to be visible before the fix means anything.
     */
    for (const file of windowsSpellings) {
      expect(isOperatorFile(file), file).toBe(false)
    }
  })

  it('SUCCEEDS once the path is normalised', () => {
    for (const file of windowsSpellings) {
      expect(isOperatorFile(posix(file)), file).toBe(true)
    }
  })

  it('keeps a Set from holding one path under two spellings', () => {
    /*
     * Why normalisation belongs at birth and not at the assertion. By the time
     * two spellings are in a Set the Set has already answered wrongly, and no
     * amount of normalising the expected value afterwards recovers it.
     */
    const unnormalised = new Set(['lib/etsy/index.ts', 'lib\\etsy\\index.ts'])
    expect(unnormalised.size).toBe(2)

    const normalised = new Set(['lib/etsy/index.ts', 'lib\\etsy\\index.ts'].map(posix))
    expect(normalised.size).toBe(1)
    expect(normalised.has('lib/etsy/index.ts')).toBe(true)
  })

  it('keeps a route derived by slicing a path recoverable', () => {
    // links.test.ts derives every route by slicing the walked path. On Windows
    // the slice produced `\(dashboard)\profit`, the group-stripping regex
    // never matched, and ROUTES came back empty.
    const routeOf = (pagePath: string) =>
      pagePath.slice('app'.length).replace(/\/page\.tsx$/, '').replace(/\/\([^)]*\)/g, '') || '/'

    const windowsPage = 'app\\(dashboard)\\profit\\page.tsx'
    expect(routeOf(windowsPage)).not.toBe('/profit')
    expect(routeOf(posix(windowsPage))).toBe('/profit')
  })
})

/* ──────────────────────────── half two: enforced ─────────────────────────── */

/**
 * The ways a platform separator can still reach a comparison.
 *
 * Each rule is a SHAPE rather than a word, and each is paired with a sample
 * below that must trip it. A rule nobody has seen fire is a rule that may not
 * fire.
 */
interface Rule {
  name: string
  /** Why this is a Windows failure, in the message a reader will see. */
  why: string
  find: RegExp
  /** Occurrences that are legitimate and must not be reported. */
  allow?: (line: string) => boolean
}

const RULES: Rule[] = [
  {
    name: 'unnormalised join',
    why:
      'path.join returns a backslash path on Windows. Use posixJoin from ' +
      'tests/support/paths, or write the expected value as a forward-slash literal.',
    find: /(?<![.\w])(?:path\.)?join\(/g,
    // The one legitimate use: already wrapped by the normaliser.
    allow: (line) => /posix\(\s*(?:normalize\()?\s*join\(/.test(line) || /posixJoin\(/.test(line),
  },
  {
    name: 'unnormalised relative',
    why:
      'path.relative returns a backslash path on Windows, and its result is ' +
      'almost always compared against a forward-slash literal. Use posixRelative.',
    find: /(?<![.\w])(?:path\.)?relative\(/g,
    allow: (line) => /posix\(\s*(?:path\.)?relative\(/.test(line) || /posixRelative\(/.test(line),
  },
  {
    name: 'a second normaliser',
    why:
      'there is one normaliser, in tests/support/paths.ts. A hand-rolled ' +
      'split(path.sep) is a second one, and on Linux it is the identity — so ' +
      'it cannot be tested on the machine CI runs on.',
    find: /path\.sep|\\\\sep\b/g,
  },
  {
    name: 'a backslash path literal',
    why:
      'expected values are written with forward slashes. The literal in the ' +
      'test is the contract; the platform is the thing that adapts.',
    // A quoted string of path segments joined by backslashes.
    find: /'[\w().-]+\\\\[\w().\\-]+\.(?:tsx?|json|sql|py)'/g,
  },
]

/** Source with comments stripped: a guard must not fire on its own prose. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function walkTests(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = posixJoin(dir, name)
    if (statSync(full).isDirectory()) walkTests(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

interface Finding {
  file: string
  rule: string
  line: string
}

function scan(file: string, source: string): Finding[] {
  const found: Finding[] = []
  for (const line of source.split('\n')) {
    for (const rule of RULES) {
      rule.find.lastIndex = 0
      if (!rule.find.test(line)) continue
      if (rule.allow?.(line)) continue
      found.push({ file, rule: rule.name, line: line.trim().slice(0, 100) })
    }
  }
  return found
}

/**
 * The file that defines the normaliser is the one place `join` and `relative`
 * are called bare — it is what wraps them.
 *
 * A narrow exemption, paired with an assertion below that the file does
 * nothing else: a policy module has to be able to name what it forbids, and
 * must not be able to do it. The same shape as the POLICY_MODULE exemption in
 * the operator-write boundary guard.
 */
const NORMALISER = 'tests/support/paths.ts'

/**
 * And this file, which holds Windows-shaped strings BECAUSE it is the thing
 * that tests them.
 *
 * The sweep flagged its own fixtures — `'app\\(admin)\\layout.tsx'`, the
 * two-spelling Set, the rule table quoting `path.sep` in an error message. The
 * sixteenth time in this build that a guard has matched its own documentation,
 * and the second time one has matched its own DATA.
 *
 * Exempting it is not a hole, because the exemption is PAID FOR by the
 * assertions below: this file may name the forbidden shapes and must not be
 * able to perform them — every path call in it is `win32.`-prefixed (a
 * deliberate simulation, never used to touch a disk) or already normalised.
 * The same shape as the POLICY_MODULE exemption in the operator-write boundary
 * guard, for the same reason: a policy file has to be able to name what it
 * forbids.
 */
const SELF = 'tests/unit/cross-platform-paths.test.ts'

describe('no test can compare a path that Windows spells differently', () => {
  const files = walkTests('tests').filter((file) => file !== NORMALISER && file !== SELF)

  it('finds the test files it is meant to be checking', () => {
    // A sweep over an empty list passes perfectly.
    expect(files.length).toBeGreaterThan(20)
    expect(files).toContain('tests/unit/operator-write-boundary.test.ts')
    expect(files).toContain('tests/unit/links.test.ts')
  })

  it('REPORTS NOTHING, across every test in the suite', () => {
    const findings = files.flatMap((file) => scan(file, code(file)))
    expect(
      findings.map((f) => `${f.file}: [${f.rule}] ${f.line}`),
      findings.length
        ? `\n${findings.map((f) => `${f.file}\n  ${RULES.find((r) => r.name === f.rule)!.why}\n  ${f.line}`).join('\n\n')}`
        : undefined,
    ).toEqual([])
  })

  it('EVERY RULE FIRES on a sample that violates it', () => {
    /*
     * The positive control, and the reason this check is worth having. A rule
     * whose regex is wrong reports nothing on a suite riddled with the bug,
     * and the assertion above passes beautifully. Each rule is pointed at a
     * line that must trip it.
     */
    const samples: Record<string, string> = {
      'unnormalised join': "expect(SEEDS).toContain(join('domain', 'admin', 'access.ts'))",
      'unnormalised relative': 'expect(files.map((f) => relative(ROOT, f))).toEqual([])',
      'a second normaliser': "const norm = (p) => p.split(path.sep).join('/')",
      'a backslash path literal': "expect(file).toBe('app\\\\(admin)\\\\layout.tsx')",
    }
    expect(Object.keys(samples).sort()).toEqual(RULES.map((r) => r.name).sort())

    for (const [name, line] of Object.entries(samples)) {
      const hits = scan('sample.ts', line).map((f) => f.rule)
      expect(hits, `${name} did not fire on: ${line}`).toContain(name)
    }
  })

  it('DOES NOT FIRE on the legitimate spellings', () => {
    /*
     * The other half of a usable check. One that flags `array.join(', ')` or a
     * normalised call is one people route around by deleting it.
     */
    const innocent = [
      "expect(FORECLOSED_BY_DESIGN.join(' ')).toContain('impersonation')",
      "const path = posixJoin(dir, entry)",
      "expect(importers.map((f) => posixRelative(ROOT, f))).toEqual(['lib/etsy/index.ts'])",
      "const PAGE = 'app/(admin)/admin/etsy/page.tsx'",
      "expect(source).toContain('lib/repositories/admin-reads-every-shop.ts')",
      "base = posix(normalize(join(dirname(from), specifier)))",
      "const relativeShare = total === 0 ? null : count / total",
    ]
    for (const line of innocent) {
      expect(scan('sample.ts', line), line).toEqual([])
    }
  })
})

describe('the two exempt files name what they forbid, and cannot do it', () => {
  it('lets THIS file simulate Windows without touching a disk with it', () => {
    /*
     * What pays for the exemption above. Every bare path call here is
     * `win32.`-prefixed — a string produced to be fed to the normaliser and
     * asserted on, never handed to the filesystem. The only real path work in
     * this file goes through posixJoin, in walkTests.
     */
    /*
     * String CONTENTS are blanked first, because the positive-control samples
     * below are lines like `expect(SEEDS).toContain(join('domain', …))` — text
     * this file quotes in order to prove the detector fires on it. Scanning
     * the raw source flags them as calls, which is the same mistake one level
     * up: match the code, not the prose about the code.
     */
    const source = code(SELF).replace(/(['"])(?:\\.|(?!\1).)*\1/g, '""')
    for (const match of source.matchAll(/(?<![.\w])(?:path\.)?(join|relative)\(/g)) {
      const before = source.slice(Math.max(0, match.index - 16), match.index)
      expect(
        /win32\.$|posix$/.test(before) || /posix(Join|Relative)\($/.test(before + match[0]),
        `a bare ${match[1]} that is neither win32-prefixed nor normalised: …${before}${match[0]}`,
      ).toBe(true)
    }
    // And it reads the filesystem only through the normalised walker.
    expect(source).toContain('posixJoin(dir, name)')
    expect(source).not.toMatch(/readFileSync\((?!file)/)
  })

  it('lets the NORMALISER be the one file calling join and relative bare', () => {
    // The exemption above is narrow, and this is what pays for it.
    const source = code(NORMALISER)
    expect(source).toMatch(/(?<![.\w])join\(/)
    expect(source).toMatch(/(?<![.\w])relative\(/)
  })

  it('reads no filesystem and holds no state', () => {
    /*
     * A module that only transforms strings cannot be the place a path goes
     * wrong. If it grew a readdir it would become a walker, and walkers are
     * what this whole file is about.
     */
    const source = code(NORMALISER)
    for (const reach of ['readFileSync', 'readdirSync', 'statSync', 'existsSync', 'process.']) {
      expect(source, reach).not.toContain(reach)
    }
  })
})
