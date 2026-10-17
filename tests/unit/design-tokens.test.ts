/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   DESIGN.md AND THE STYLESHEETS, HELD TO EACH OTHER IN BOTH DIRECTIONS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file exists because the drift it prevents had already happened, in the
 * design export this work started from. That file's YAML front-matter named
 * `#2A14B4` as the primary colour and `#FFF8F7` as the surface; its own prose,
 * two screens further down, named `#4338CA` and `#F8FAFC`; and its HTML used
 * the second pair. One document, two palettes, and nothing to say which was
 * current.
 *
 * A design document is only worth reading if it is the same as the code. So:
 *
 *   FORWARD   Every token DESIGN.md gives a hex for must carry that hex in the
 *             stylesheet the document says it lives in. A value edited in CSS
 *             and not in the document fails here.
 *   BACKWARD  Every token the document names must actually exist in that
 *             stylesheet, and the two obsolete values must appear nowhere in
 *             the tree outside the document's own note about them. A token
 *             renamed or deleted in CSS fails here too.
 *
 * It is deliberately NOT a check that every CSS token is documented. The
 * marketing layer defines several that are implementation detail — the radii,
 * `--rule`, the `-strong` and `-surface` and `-border` variants of each
 * semantic pair — and a document listing all of them is a document nobody
 * reads. The rule is that what IS documented is true.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { posixJoin } from '../support/paths'

const DESIGN = readFileSync('DESIGN.md', 'utf8')
const MARKETING = readFileSync('styles/marketing.css', 'utf8')
const GLOBALS = readFileSync('styles/globals.css', 'utf8')

/**
 * The declaration block a selector opens, with no nested blocks inside it.
 *
 * Deliberately not a CSS parser. Every block this file reads is a flat list of
 * custom properties, so "to the next closing brace" is exact — and a block
 * that stops being flat will fail the lookup loudly rather than silently
 * matching half of itself.
 */
function block(css: string, selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `${selector} not found`).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  return css.slice(open, css.indexOf('}', open))
}

/** Every `--token: value` pair in a block, lowercased for comparison. */
function tokens(css: string, selector: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const match of block(css, selector).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    found.set(match[1]!, match[2]!.trim().toLowerCase())
  }
  return found
}

/**
 * The token/hex pairs DESIGN.md states, read from its own tables.
 *
 * A row is `| \`--token\` | \`#HEX\` | purpose |`, and one row names two
 * tokens at once — "`--success` / `--success-ink`" — because they are the same
 * value with two names. Both are returned, so the document cannot claim a
 * pairing the stylesheet does not have.
 */
function documented(markdown: string): Map<string, string> {
  const found = new Map<string, string>()
  const row = /^\|\s*(`--[a-z0-9-]+`(?:\s*\/\s*`--[a-z0-9-]+`)*)\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/gm
  for (const match of markdown.matchAll(row)) {
    const hex = match[2]!.toLowerCase()
    for (const name of match[1]!.matchAll(/--[a-z0-9-]+/g)) {
      found.set(name[0]!, hex)
    }
  }
  return found
}

/*
 * The document's two colour sections, read separately.
 *
 * `--brand`, `--ink-1` and `--page-bg` appear in BOTH tables with DIFFERENT
 * values, because both palettes define them — that is the whole mechanism this
 * document opens by explaining. Parsing the file as one list would make the
 * product's terracotta look like a contradiction of the public indigo, so the
 * split is by heading and the two halves are checked against their own
 * stylesheets.
 */
function section(heading: string): string {
  const start = DESIGN.indexOf(heading)
  expect(start, `${heading} not found in DESIGN.md`).toBeGreaterThan(-1)
  const after = DESIGN.indexOf('\n## ', start + heading.length)
  return DESIGN.slice(start, after === -1 ? DESIGN.length : after)
}

/* The two values the export carried and the final design replaced. */
const OBSOLETE = ['#2a14b4', '#fff8f7']

describe('DESIGN.md is the same document as the stylesheets', () => {
  const marketingTokens = tokens(MARKETING, '.marketing {')
  const stated = documented(section('## 1. Brand colours — the public pages'))

  it('finds the tables it is meant to be checking', () => {
    /*
     * A regex that matched nothing would make every assertion below pass
     * perfectly. Section 1 states thirteen brand tokens and six semantic
     * names at the time of writing; the floor is set below that so adding a
     * row is not a failure.
     */
    expect(stated.size).toBeGreaterThanOrEqual(17)
    expect(stated.get('--brand')).toBe('#4338ca')
    expect(marketingTokens.size).toBeGreaterThan(20)
  })

  it('gives the public pages every token the document states, at the stated value', () => {
    const wrong: string[] = []

    for (const [name, hex] of stated) {
      const actual = marketingTokens.get(name)
      if (actual === undefined) {
        wrong.push(`${name}: missing from styles/marketing.css`)
        continue
      }
      if (actual !== hex) {
        wrong.push(`${name}: DESIGN.md says ${hex}, marketing.css says ${actual}`)
      }
    }

    expect(wrong, 'DESIGN.md and styles/marketing.css disagree').toEqual([])
  })

  it('gives the product the values the document states for IT, from the other sheet', () => {
    const product = tokens(GLOBALS, ':root {')
    const statedProduct = documented(section('## 2. Brand colours — the product'))
    const wrong: string[] = []

    // Three rows at the time of writing, and the anti-vacuity floor says so.
    expect(statedProduct.size).toBeGreaterThanOrEqual(3)

    for (const [name, hex] of statedProduct) {
      const actual = product.get(name)
      if (actual !== hex) {
        wrong.push(`${name}: DESIGN.md says ${hex}, globals.css says ${actual ?? 'nothing'}`)
      }
    }

    expect(wrong, 'DESIGN.md and styles/globals.css disagree').toEqual([])

    /*
     * And the two palettes really are different for these names, which is the
     * claim the document opens with. If they ever converge, one of the two
     * tables has been edited to match the other and the mechanism is gone.
     */
    for (const name of ['--brand', '--ink-1', '--page-bg']) {
      expect(marketingTokens.get(name), name).not.toBe(product.get(name))
    }
  })

  it('separates the semantic text colours from the chart marks', () => {
    /*
     * The one place this document is read carefully, in its own words. If
     * `--success` and `--success-mark` ever resolve to the same hex, the
     * reason for the split has been lost and profit and loss are being
     * printed at 2.5:1 and 3.8:1 again.
     */
    expect(marketingTokens.get('--success')).toBe('#047857')
    expect(marketingTokens.get('--success-mark')).toBe('#10b981')
    expect(marketingTokens.get('--success')).not.toBe(marketingTokens.get('--success-mark'))

    expect(marketingTokens.get('--danger')).toBe('#b91c1c')
    expect(marketingTokens.get('--danger-mark')).toBe('#ef4444')
    expect(marketingTokens.get('--danger')).not.toBe(marketingTokens.get('--danger-mark'))

    // `--success-ink` and `--success` are documented as one row, two names.
    expect(marketingTokens.get('--success-ink')).toBe(marketingTokens.get('--success'))
    expect(marketingTokens.get('--danger-ink')).toBe(marketingTokens.get('--danger'))
  })

  it('declares the two dark blocks identically', () => {
    /*
     * The same assertion tests/unit/tokens.test.ts makes about globals.css,
     * for the same reason: CSS cannot share a block between the explicit
     * choice and the system preference, so the duplication is unavoidable and
     * "did you update both?" is a question worth asking automatically.
     *
     * A token in one and not the other produces no build error — just a page
     * that reads correctly in whichever one you were looking at.
     */
    const attr = tokens(MARKETING, ":root[data-theme='dark'] .marketing {")
    const media = tokens(MARKETING, ":root:not([data-theme='light']) .marketing {")

    expect(attr.size).toBeGreaterThan(20)
    expect([...media.keys()].sort()).toEqual([...attr.keys()].sort())
    expect(Object.fromEntries(media)).toEqual(Object.fromEntries(attr))
  })

  it('defines in dark every token it defines in light', () => {
    const dark = tokens(MARKETING, ":root[data-theme='dark'] .marketing {")
    const missing = [...marketingTokens.keys()].filter(
      (name) =>
        !dark.has(name) &&
        // The radii and the rule are geometry, not colour. They do not change.
        !['--rule', '--paper-radius', '--card-radius'].includes(name),
    )
    expect(missing, 'tokens with no dark value fall through to the terracotta palette').toEqual([])
  })
})

describe('the obsolete palette does not come back', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next' || name === '.git') continue
      const path = posixJoin(dir, name)
      if (statSync(path).isDirectory()) walk(path, out)
      else if (/\.(ts|tsx|css|md|json|html)$/.test(path)) out.push(path)
    }
    return out
  }

  const files = walk('.').map((f) => f.replace(/^\.\//, ''))

  it('finds the files it is meant to be sweeping', () => {
    expect(files.length).toBeGreaterThan(200)
    expect(files).toContain('styles/marketing.css')
    expect(files).toContain('DESIGN.md')
  })

  it('carries neither obsolete value anywhere but the note that retires it', () => {
    const offenders: string[] = []

    for (const file of files) {
      /*
       * DESIGN.md is allowed to name them — it is the document that says they
       * are obsolete, and a note that cannot quote the value it retires is
       * not much of a note. This test file is allowed for the same reason.
       */
      if (file === 'DESIGN.md' || file === 'tests/unit/design-tokens.test.ts') continue
      const text = readFileSync(file, 'utf8').toLowerCase()
      for (const hex of OBSOLETE) {
        if (text.includes(hex)) offenders.push(`${file}: ${hex}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('still says in DESIGN.md that they are retired', () => {
    // A negative control for the sweep above: if this stops being true, the
    // exemption is covering a document that no longer explains itself.
    for (const hex of ['#2A14B4', '#FFF8F7']) {
      expect(DESIGN).toContain(hex)
    }
    expect(DESIGN).toMatch(/obsolete and must not come\s+back/)
  })
})
