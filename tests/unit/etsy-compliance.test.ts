import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { PLANS } from '@/domain/billing/plans'
import { ETSY_SCOPES as REQUESTED_SCOPES } from '@/lib/etsy/oauth'
import { ETSY_SCOPES as EXPLAINED_SCOPES } from '@/domain/connect/types'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   docs/ETSY-COMPLIANCE.md IS CHECKED, NOT JUST WRITTEN.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A compliance document naming a deleted test is worse than no document: it
 * reads as evidence, it is the thing somebody would quote in an application,
 * and nothing about it changes when the thing it names goes away.
 *
 * So every token in the Evidence column has to resolve. A path must exist on
 * disk; an identifier must be exported somewhere in the tree. The one escape
 * hatch is the literal phrase "No mechanism", which a row may use when there
 * genuinely is nothing enforcing the position — and the rule for that is that
 * it must say so in those words rather than implying a mechanism it does not
 * have.
 *
 * ── AND TWO CLAUSES WHOSE POSITION IS EXPRESSIBLE AS A RULE ───────────────
 *
 * Item 22 — "charging sellers for Application features that Etsy provides free
 * of charge" — is the one that just went wrong, so it gets a guard rather than
 * a paragraph. Etsy shipped Marketplace Insights in September 2025 (keyword
 * research, free in Shop Manager) and free AI listing *title* suggestions.
 * Both moved across the line, and the Free tier was advertising the first of
 * them under a $0 price while the screens behind it were unbuilt.
 *
 * Item 17 — scope minimality — is checked as consistency: the scope strings the
 * OAuth request sends must be exactly the ones the consent screen shows and the
 * ones this document explains. A sixth scope added to the request without a
 * sentence on the connect screen is the shape of an over-request.
 */

const DOC = 'docs/ETSY-COMPLIANCE.md'
const doc = readFileSync(DOC, 'utf8')

const ROOTS = ['app', 'components', 'domain', 'lib', 'tests', 'db', 'docs']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const tree = ROOTS.flatMap((root) => walk(root))

/**
 * Every name the document could legitimately be pointing at: exported
 * constants, functions, classes and types, plus declared members of an
 * interface.
 *
 * The members matter. `applyListingChanges` is the whole of the Etsy write
 * surface and the single most load-bearing identifier in this document, and it
 * is a METHOD on EtsyService rather than an export — so a rule that accepted
 * only exports rejected it. Found by running this.
 */
const exportedNames = new Set<string>()
for (const file of tree) {
  if (!/\.tsx?$/.test(file)) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(
    /export\s+(?:const|function|class|interface|type|async function)\s+(\w+)/g,
  )) {
    exportedNames.add(match[1] ?? '')
  }
  // A declared member: `name(args):` or `name:` at the start of a line.
  for (const match of text.matchAll(/^\s{2,}(?:readonly\s+)?(\w+)\s*[(:]/gm)) {
    exportedNames.add(match[1] ?? '')
  }
}

interface Row {
  clause: string
  position: string
  evidence: string
}

/**
 * Every row of every table whose third column is headed "Evidence".
 *
 * Keyed on the HEADER, not on the row shape. The first draft took every
 * three-column row in the document, which swept in the scope table — whose
 * third column is a sentence about why a scope is the minimum, not a file —
 * and demanded evidence tokens from it. The rule belongs to the evidence
 * tables, so the parser finds them by their heading and ignores the rest.
 */
function rows(): Row[] {
  const out: Row[] = []
  let inEvidenceTable = false
  for (const line of doc.split('\n')) {
    if (!line.trim().startsWith('|')) {
      if (line.trim() !== '') inEvidenceTable = false
      continue
    }
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
    if (cells.length !== 3) {
      inEvidenceTable = false
      continue
    }
    const [clause = '', position = '', evidence = ''] = cells
    if (/^[-:\s]+$/.test(clause)) continue
    if (/^evidence$/i.test(evidence)) {
      inEvidenceTable = true
      continue
    }
    if (!inEvidenceTable) continue
    out.push({ clause, position, evidence })
  }
  return out
}

/** Backticked tokens in a cell. */
function tokens(cell: string): string[] {
  return [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '')
}

const NO_MECHANISM = 'No mechanism'

describe('the compliance document names things that exist', () => {
  it('finds the document and its rows', () => {
    /*
     * Anti-vacuity. Every rule below passes against an empty document, and
     * an empty compliance document is the worst version of this file.
     */
    expect(existsSync(DOC)).toBe(true)
    expect(doc.length).toBeGreaterThan(5000)
    const all = rows()
    // Fourteen prohibited-behavior rows and five on Sections 3 to 5.
    expect(all.length).toBeGreaterThanOrEqual(18)
    expect(tree.length).toBeGreaterThan(300)
    expect(exportedNames.size).toBeGreaterThan(300)
  })

  it('covers every clause the owner asked it to cover', () => {
    for (const item of [2, 5, 10, 11, 13, 14, 15, 16, 17, 19, 21, 22, 24, 25]) {
      expect(doc, `item ${item} is not covered`).toContain(`**Item ${item}**`)
    }
    for (const section of ['Section 3', 'Section 4', 'Section 5']) {
      expect(doc, `${section} is not covered`).toContain(`**${section}**`)
    }
  })

  it('and every row carries evidence or says plainly that there is none', () => {
    const bare: string[] = []
    for (const row of rows()) {
      if (row.evidence.includes(NO_MECHANISM)) continue
      if (tokens(row.evidence).length === 0) bare.push(`${row.clause.slice(0, 60)}…`)
    }
    expect(
      bare,
      'a row has no evidence token and does not say "No mechanism". A row whose ' +
        'evidence is prose is a row that will be wrong one day and nobody will know.',
    ).toEqual([])
  })

  it('and every path it names exists', () => {
    const missing: string[] = []
    for (const row of rows()) {
      for (const token of tokens(row.evidence)) {
        if (!token.includes('/')) continue
        if (!existsSync(token)) missing.push(`${token} (named by: ${row.clause.slice(0, 50)}…)`)
      }
    }
    expect(missing, 'the compliance document names a file or test that does not exist').toEqual([])
  })

  it('and every test it names really is a test', () => {
    /*
     * The assertion the brief asked for by name. A path that exists is not
     * enough: `tests/unit/thing.test.ts` has to be a file vitest will run, or
     * a browser check that can be run by hand, so that "named in the document"
     * and "executed by somebody" are the same set.
     */
    const named = new Set<string>()
    for (const row of rows()) {
      for (const token of tokens(row.evidence)) {
        if (/^tests\//.test(token)) named.add(token)
      }
    }
    expect(named.size, 'the document names no tests at all').toBeGreaterThanOrEqual(15)
    for (const test of named) {
      expect(existsSync(test), `${test} does not exist`).toBe(true)
      expect(test, `${test} is not a test file`).toMatch(/\.(test\.ts|int\.ts|py)$/)
      const text = readFileSync(test, 'utf8')
      if (test.endsWith('.py')) {
        expect(text, `${test} asserts nothing`).toMatch(/\bcheck\(/)
      } else {
        expect(text, `${test} asserts nothing`).toMatch(/\bit\(/)
      }
    }
  })

  it('and every identifier it names is exported somewhere', () => {
    const missing: string[] = []
    for (const row of rows()) {
      for (const token of tokens(row.evidence)) {
        if (token.includes('/') || token.includes(' ')) continue
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(token)) continue
        if (!exportedNames.has(token)) missing.push(token)
      }
    }
    expect(
      missing,
      'the compliance document names a constant or function nothing exports',
    ).toEqual([])
  })

  it('and a row with no mechanism says so in those words', () => {
    /*
     * The honest half. There is one such row — nothing deletes an expired
     * record and there is no account-closure flow — and the rule is that it
     * reads "No mechanism" rather than describing a process. Asserted both
     * ways: the phrase must appear, and a row using it must not also claim a
     * test proves the thing it says is absent.
     */
    const gaps = rows().filter((r) => r.evidence.includes(NO_MECHANISM))
    expect(gaps.length, 'no row admits a gap; that is unlikely to be true').toBeGreaterThanOrEqual(1)
    for (const gap of gaps) {
      expect(
        gap.position,
        'a No-mechanism row should say what is missing, not only that something is',
      ).toMatch(/nothing|no |not built|no account-closure/i)
    }
  })

  it('and the numbering is marked as unverified where it is', () => {
    /*
     * This repository cannot reach etsy.com, and Etsy renumbers the prohibited
     * behavior list between revisions. A document that stated numbers it had
     * not checked would be the same defect it exists to prevent, so the rows
     * whose clause text is not held here are marked and the marker is
     * explained at the top.
     */
    expect(doc).toContain('Subject unconfirmed')
    expect(doc).toContain('must be checked against the current revision')
    expect(doc).toContain('**Verbatim**')
  })
})

describe('item 22: nothing is charged for what Etsy gives away', () => {
  /**
   * Features Etsy itself now provides free, as of the owner's brief of
   * 13 October 2026. Each entry is the words a plan card would reach for.
   *
   * Marketplace Insights (September 2025): keyword search and listing counts
   * over 30 days, related terms, trending searches. 15 searches a week free,
   * unlimited on Etsy Plus. And free AI listing TITLE suggestions — not
   * descriptions and not tags, which is why the drafter is still a feature.
   */
  const ETSY_PROVIDES_FREE: { what: string; pattern: RegExp }[] = [
    { what: 'keyword research (Marketplace Insights)', pattern: /\bkeyword\b/i },
    { what: 'niche and product research (Marketplace Insights)', pattern: /\bniche\b/i },
    { what: 'trending searches (Marketplace Insights)', pattern: /\btrending\b/i },
    { what: 'AI title suggestions', pattern: /\bai\b[^.]*\btitles?\b|\btitle\b[^.]*\bsuggest/i },
  ]

  it('finds the plans it is reasoning about', () => {
    expect(PLANS.map((p) => p.key)).toEqual(['FREE', 'SOLO', 'GROWTH'])
    expect(PLANS.flatMap((p) => [...p.includes, ...p.excludes]).length).toBeGreaterThan(12)
  })

  it('and no tier advertises one of them', () => {
    const offenders: string[] = []
    for (const plan of PLANS) {
      for (const line of [...plan.includes, ...plan.excludes, plan.positioning]) {
        for (const free of ETSY_PROVIDES_FREE) {
          if (free.pattern.test(line)) {
            offenders.push(`${plan.key}: "${line}" — Etsy provides ${free.what} free`)
          }
        }
      }
    }
    expect(
      offenders,
      'a plan advertises a feature Etsy provides free of charge. Prohibited Behavior ' +
        'item 22 forbids charging for it, and a $0 tier advertising it is still a ' +
        'claim on the pricing page Etsy reviews.',
    ).toEqual([])
  })

  it('and the pricing surface renders the plan list rather than its own copy', () => {
    /*
     * The removal only holds if the card reads PLANS. A second copy of the
     * feature list in a component is how the line comes back.
     */
    const cards = code('components/billing/plan-cards.tsx')
    expect(cards).toMatch(/plan\.includes\.map/)
    expect(cards).toMatch(/plan\.excludes\.map/)
    expect(cards, 'the plan card writes its own feature line').not.toMatch(/Keyword|calculators/i)
  })
})

describe('item 17: the scopes requested are the scopes explained', () => {
  const requestedScopes = [
    ...REQUESTED_SCOPES.required,
    ...REQUESTED_SCOPES.write,
    ...REQUESTED_SCOPES.finance,
  ]

  it('asks for exactly what the connect screen describes', () => {
    const requested = [...requestedScopes].sort()
    const explained = [...new Set(EXPLAINED_SCOPES.flatMap((group) => group.scopes))].sort()

    expect(
      requested,
      'the OAuth request and the consent screen describe different scopes',
    ).toEqual(explained)
    // Five strings, four groups: `listings_w` serves two features.
    expect(requested).toEqual(['billing_r', 'listings_r', 'listings_w', 'shops_r', 'transactions_r'])
  })

  it('and the document explains every one of them', () => {
    for (const scope of requestedScopes) {
      expect(doc, `the compliance document does not explain \`${scope}\``).toContain(`\`${scope}\``)
    }
  })

  it('and every group states what breaks without it', () => {
    expect(EXPLAINED_SCOPES.length).toBeGreaterThanOrEqual(4)
    for (const group of EXPLAINED_SCOPES) {
      expect(group.scopes.length, `${group.label} asks for nothing`).toBeGreaterThan(0)
      expect(group.enables.length, `${group.label} says nothing about what it enables`).toBeGreaterThan(20)
      expect(group.withoutIt.length, `${group.label} does not say what breaks without it`).toBeGreaterThan(20)
    }
  })
})
