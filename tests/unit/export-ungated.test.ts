import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { PLANS } from '@/domain/billing/plans'
import { EXPORTABLE_DATASETS, EXPORT_DATASET_IDS } from '@/domain/export/datasets'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   EXPORT IS A RIGHT, NOT A TIER FEATURE. NO PLAN MAY ADVERTISE IT AND NO
 *   CODE MAY GATE IT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `PLANS` listed "Full data export (CSV and JSON)" under Growth. Two of our
 * own documents made that wrong, and neither of them is Etsy:
 *
 *   Privacy §6 exercises access and portability by "export from Settings, any
 *   time, with no request", with no tier attached. It then says in as many
 *   words: "We will not charge you, and we will not make the service worse for
 *   you because you exercised a right."
 *
 *   GDPR Article 20 gives every data subject their own data in a structured,
 *   commonly used, machine-readable format; Article 12(5) says the controller
 *   provides it free of charge.
 *
 * So a tier may not sell it. Putting it in Growth's list also implied the other
 * tiers did not have it, which was the advertisement being wrong rather than
 * the code — nothing gated it, because no plan is in force at all.
 *
 * ── BOTH DIRECTIONS, BECAUSE ONLY ONE OF THEM IS TRUE TODAY ───────────────
 *
 * Removing the line fixes the claim. It does nothing about the gate, because
 * there is no gate to fix. The failure this guard is really for is the future
 * one: somebody wires plans up, reads Growth's old feature list in a commit
 * message or a design doc, and adds a plan check to the export route. By then
 * the sentence in §6 is two years old and nobody re-reads it.
 *
 * So the rule has two halves. The advertisement may not claim it, and the code
 * may not gate it — and the second half is asserted against the route, the
 * dataset module and the export page rather than against a plan object, since
 * that is where a gate would be written.
 */

const ROOTS = ['app', 'components', 'domain', 'lib']

/** This file quotes the phrases it bans in order to ban them. */
const SELF = 'tests/unit/export-ungated.test.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((root) => walk(root)).sort()

/** The surfaces and modules that decide whether an export happens. */
const EXPORT_PATH = [
  'app/api/export/[dataset]/route.ts',
  'domain/export/datasets.ts',
  'domain/export/csv.ts',
  'app/(dashboard)/settings/export/page.tsx',
]

/** Names a plan gate would have to use. */
const PLAN_GATES = [
  'PlanKey',
  'currentPlan',
  'planFor',
  'requirePlan',
  'GROWTH',
  'planLimits',
  'overLimit',
]

describe('no plan advertises the export', () => {
  it('finds the plans and the datasets it is reasoning about', () => {
    // Anti-vacuity: every rule below passes against no plans and no datasets.
    expect(PLANS.length).toBe(3)
    expect(PLANS.flatMap((p) => p.includes).length).toBeGreaterThan(10)
    expect(EXPORT_DATASET_IDS.length).toBe(3)
    expect(files).not.toContain(SELF)
  })

  it('and no tier lists export among what it includes or excludes', () => {
    /*
     * Matched on the word rather than on the old sentence. "Full data export
     * (CSV and JSON)" is the line that was there; the next version of the
     * mistake will be worded differently, and "CSV download on Growth" is the
     * same claim.
     */
    const offenders: string[] = []
    for (const plan of PLANS) {
      for (const line of [...plan.includes, ...plan.excludes, plan.positioning]) {
        if (/\b(export|csv|json|download)\b/i.test(line)) {
          offenders.push(`${plan.key}: "${line}"`)
        }
      }
    }
    expect(
      offenders,
      'a plan advertises data export. Portability is a GDPR Article 20 right and ' +
        'Privacy §6 promises it with no tier attached, so no tier may sell it.',
    ).toEqual([])
  })

  it('and the Privacy Policy still promises it without a condition', () => {
    const privacy = readFileSync('docs/legal/PRIVACY-POLICY-DRAFT.md', 'utf8')
    const rights = privacy.slice(privacy.indexOf('## 6.'), privacy.indexOf('## 7.'))
    expect(rights, 'Privacy §6 no longer promises a self-service export').toContain(
      'export from Settings, any time, with no request',
    )
    expect(rights, 'Privacy §6 no longer says a right costs nothing').toContain(
      'We will not charge you',
    )
    /*
     * And the promise names no plan. A sentence like "on Growth and above"
     * inside §6 would be the document contradicting itself two lines apart.
     */
    for (const plan of PLANS) {
      if (plan.priceMonthly === 0) continue
      expect(rights, `Privacy §6 conditions a right on the ${plan.name} plan`).not.toContain(
        plan.name,
      )
    }
  })
})

describe('and no code gates it', () => {
  it('finds the export path it is checking', () => {
    for (const file of EXPORT_PATH) {
      expect(files, `${file} is gone; this rule is checking nothing`).toContain(file)
    }
    // The route really is the thing that decides: it validates the dataset.
    expect(code('app/api/export/[dataset]/route.ts')).toMatch(/isExportableDataset\(/)
  })

  it('and nothing on that path consults a plan', () => {
    const offenders: string[] = []
    for (const file of EXPORT_PATH) {
      const text = code(file)
      for (const gate of PLAN_GATES) {
        if (new RegExp(`\\b${gate}\\b`).test(text)) offenders.push(`${file}: reads ${gate}`)
      }
    }
    expect(
      offenders,
      'the export path consults a plan. Every dataset is reachable on every tier and ' +
        'on no plan at all — GDPR Article 12(5), and Privacy §6.',
    ).toEqual([])
  })

  it('and the only thing the route refuses on is the session and the dataset name', () => {
    /*
     * Stated positively, so that "no plan gate" cannot be satisfied by a route
     * that refuses for some other invented reason. Two refusals, both named.
     */
    const route = code('app/api/export/[dataset]/route.ts')
    expect(route).toMatch(/notAuthenticated\(\)/)
    expect(route).toMatch(/notFound\('export'\)/)
    expect(route).toMatch(/shopContext\(session, session\.shopId\)/)
    // And no other Errors.* refusal in it.
    const refusals = [...route.matchAll(/Errors\.(\w+)\(/g)].map((m) => m[1]).sort()
    expect([...new Set(refusals)]).toEqual(['notAuthenticated', 'notFound'])
  })

  it('and every dataset the route names is one the product advertises', () => {
    /*
     * The other direction of "check that it does, in both directions": the
     * copy must not promise a dataset the route cannot produce, and the route
     * must not branch on a name the list does not carry.
     *
     * Asserted as a SUBSET rather than as "the route mentions each id", which
     * was the first draft and was wrong about the route's shape: it branches
     * on two ids and lets the third fall through to the end, and TypeScript is
     * what makes that exhaustive — `EXPORTABLE_DATASETS` is
     * `as const satisfies`, so `ExportDatasetId` is a literal union and a new
     * dataset is a type error here until it is handled. Encoding the if/else
     * shape in a test would make a refactor of the route a test edit for no
     * gain.
     */
    const route = code('app/api/export/[dataset]/route.ts')
    const compared = [...route.matchAll(/dataset === '([a-z-]+)'/g)].map((m) => m[1])
    expect(compared.length).toBeGreaterThanOrEqual(2)
    for (const name of compared) {
      expect(
        EXPORT_DATASET_IDS as readonly string[],
        `the route branches on '${name}', which is not an advertised dataset`,
      ).toContain(name)
    }
    for (const dataset of EXPORTABLE_DATASETS) {
      expect(dataset.noun.length).toBeGreaterThan(5)
    }
  })
})
