import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { OPERATOR_WRITABLE } from '@/domain/admin/operator-writes'
import { PUBLIC_DEMO_COOKIE } from '@/lib/auth/public-demo-actor'
import { PRODUCT_NAME, PRODUCT_NAME_ARTICLE } from '@/lib/brand'
import {
  EXPORTABLE_DATASETS,
  EXPORT_DATASET_IDS,
  NOT_EXPORTABLE,
} from '@/domain/export/datasets'
import { LISTING_CONTENT_MAX_AGE_MS, OTHER_CONTENT_MAX_AGE_MS } from '@/lib/etsy/freshness'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PRIVACY POLICY AND THE TERMS MAKE FACTUAL CLAIMS ABOUT THIS CODE.
 *   THIS FILE FAILS WHEN ONE STOPS BEING TRUE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Both drafts open with the same sentence: "Every factual claim below was
 * written to match what the software actually does — if the software changes,
 * this document must change with it." And the lawyer's note on the Privacy
 * Policy is explicit about the strongest one:
 *
 *     "§8's claim that staff cannot write to seller data ... must be
 *      re-verified before each release, and removed from this document the
 *      moment it stops being true."
 *
 * Nobody re-verifies a document before a release. A test does, on every
 * commit, which is the only version of that instruction that survives contact
 * with a deadline.
 *
 * ── WHAT THIS CAN AND CANNOT CHECK ────────────────────────────────────────
 *
 * It checks claims that are properties of the CODE. It cannot check a claim
 * about an operational process — that a deletion request is actioned within 30
 * days, that a sub-processor sits in a named region, that a breach would be
 * reported. Those are the lawyer's and the operator's to verify, and they are
 * listed in the verification table in docs/legal/VERIFICATION.md rather than
 * silently omitted here, so the gap between "tested" and "true" is visible.
 *
 * ── THE SHAPE THAT MATTERS: IT READS THE DOCUMENT ─────────────────────────
 *
 * Several assertions below parse the markdown and compare it against the
 * code, rather than restating the claim in TypeScript. A test that hardcodes
 * "the operator may write four things" goes green while the document says
 * five. Reading both is what makes this a guard rather than a second copy.
 */

const PRIVACY = 'docs/legal/PRIVACY-POLICY-DRAFT.md'
const TERMS = 'docs/legal/TERMS-OF-SERVICE-DRAFT.md'
const VERIFICATION = 'docs/legal/VERIFICATION.md'

const privacy = readFileSync(PRIVACY, 'utf8')
const terms = readFileSync(TERMS, 'utf8')
const verification = readFileSync(VERIFICATION, 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('the documents exist and are still drafts', () => {
  it('are version-controlled beside the code they describe', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(privacy.length).toBeGreaterThan(4000)
    expect(terms.length).toBeGreaterThan(4000)
  })

  it('and still say so, because placeholders remain unfilled', () => {
    /*
     * Both carry "DRAFT FOR LEGAL REVIEW. NOT READY TO PUBLISH." The banner
     * may only come off when the placeholders do. This fails in BOTH
     * directions: a document published with `[[LEGAL_ENTITY]]` still in it,
     * and a document still labelled draft after everything is filled in — the
     * second being how a finished policy stays unpublished for a year.
     */
    const unfilled = (text: string) => [...text.matchAll(/\[\[([A-Z_]+)\]\]/g)].length

    for (const [name, text] of [['privacy', privacy], ['terms', terms]] as const) {
      const remaining = unfilled(text)
      const labelled = text.includes('NOT READY TO PUBLISH')
      expect(
        labelled,
        remaining > 0
          ? `${name} has ${remaining} unfilled placeholders and must stay labelled a draft`
          : `${name} has no placeholders left — fill in the date and remove the draft banner`,
      ).toBe(remaining > 0)
    }
  })

  it('are accompanied by the verification table, which records what this file cannot check', () => {
    /*
     * The comment at the top of this file says the untestable claims are
     * listed in VERIFICATION.md "rather than silently omitted". That is a
     * promise about a file, so it is checked like any other claim — including
     * the open gap, which is the one thing a reader of a green suite would
     * otherwise never learn.
     */
    expect(verification.length, 'the verification table is a stub').toBeGreaterThan(4000)
    expect(verification, 'the verification table no longer records the refusal-logging gap')
      .toMatch(/OPEN GAP/)
    expect(
      verification.includes('Refused write attempts are recorded in your audit log'),
      'the verification table no longer quotes the claim that is narrower than it reads',
    ).toBe(true)
  })

  it('and read as English after the rename, article and all', () => {
    /*
     * ── THE DEFECT A FIND-AND-REPLACE LEAVES BEHIND ───────────────────────
     *
     * The drafts arrived naming the product "CobaltRank" and were corrected
     * to "CobaltRank" throughout. The article in front of the word changes
     * with it, and one sentence was left reading:
     *
     *     "on the basis of a CobaltRank figure"
     *
     * Found by a reader, not by the suite — a substitution that is correct at
     * every one of its 22 sites can still break the words either side of it.
     *
     * The check is narrow on purpose. A general "a before a vowel" sweep is
     * wrong English ("a one-time fee", "an hour") and would be turned off
     * within a week; this asks only about the product names, which is exactly
     * the class of error a rename introduces. Whitespace is flattened first,
     * because the documents are hard-wrapped and the article is regularly the
     * last word on a line.
     */
    const expected: Record<string, string> = {
      [PRODUCT_NAME]: PRODUCT_NAME_ARTICLE,
      // "an Etsy shop" — Etsy opens with a vowel sound and always has.
      Etsy: 'an',
    }

    for (const [label, text] of [['privacy', privacy], ['terms', terms]] as const) {
      const flat = text.replace(/\s+/g, ' ')
      const pattern = new RegExp(`\\b(a|an) (${PRODUCT_NAME}|Etsy)\\b`, 'g')
      for (const match of flat.matchAll(pattern)) {
        expect(
          match[1],
          `${label} reads "${flat.slice(Math.max(0, match.index - 45), match.index + 30)}" — "${match[2]}" takes "${expected[match[2]!]}"`,
        ).toBe(expected[match[2]!])
      }
    }
  })

  it('name the product the code is, not the one the draft was written for', () => {
    /*
     * ── THE FIRST FACTUAL CLAIM IN EITHER DOCUMENT IS THE TITLE ───────────
     *
     * Both drafts arrived naming the product "CobaltRank", a name that
     * appears in no source file, no manifest, no CSV filename and no support
     * address. A policy that names the wrong product is not a cosmetic
     * problem: it is the document a seller is asked to accept at connection
     * under Etsy's API Terms §4, and a mismatched party name is the first
     * thing a regulator or a disputing customer reads.
     *
     * The check reads the H1 and compares it to package.json, which is the
     * one place the product's own name is not prose. It deliberately does NOT
     * sweep the whole document for the old name: the drafts keep a
     * `[[CONFIRM]]` note that quotes "CobaltRank" to record the substitution,
     * and a guard that failed on its own documentation would be deleted
     * within the week.
     */
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { name: string }

    for (const [label, text] of [['privacy', privacy], ['terms', terms]] as const) {
      const titled = /^#\s+(.+?)\s+—/.exec(text)?.[1]
      expect(titled, `${label} has no "<product> — <document>" heading to check`).toBeTruthy()
      expect(
        titled!.toLowerCase().replace(/\s+/g, ''),
        `${label} is headed "${titled}" and the product is "${pkg.name}"`,
      ).toBe(pkg.name)
    }
  })
})

describe('what the documents say about writes', () => {
  it('§8: staff cannot write to seller data, and the allowlist still proves it', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE STRONGEST SENTENCE IN EITHER DOCUMENT.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Privacy §8 and Terms §4 both assert it. It is true because
     * OPERATOR_WRITABLE is an allowlist of four things, none of which is
     * seller data, and tests/unit/operator-write-boundary.test.ts walks the
     * operator closure transitively to enforce it.
     *
     * Checked here against the LIST rather than against the other test, so
     * that adding a fifth entry — even a legitimate one — fails this and
     * forces somebody to look at the sentence in the policy.
     */
    expect(privacy).toContain('Our staff cannot write to your shop')
    expect(terms).toContain('Our staff cannot write to your shop at all')

    const tables = OPERATOR_WRITABLE.map((w) => w.table).sort()
    expect(tables).toEqual([
      'admin_audit_events',
      'admin_permission_audit_events',
      'admin_role_permissions',
      'users',
    ])

    // `users` is the only seller-adjacent table, and only one column of it.
    const usersEntry = OPERATOR_WRITABLE.find((w) => w.table === 'users')
    expect(usersEntry?.column).toBe('platform_role')

    // No seller table may ever appear on it.
    const SELLER_TABLES = [
      'listings',
      'orders',
      'order_items',
      'cost_rules',
      'events',
      'change_jobs',
      'audit_records',
      'shops',
      'etsy_connections',
      'bulk_operations',
    ]
    for (const table of SELLER_TABLES) {
      expect(tables, `the operator area may now write ${table}`).not.toContain(table)
    }
  })

  it('§8: refused write attempts are recorded, and something records them', () => {
    expect(privacy).toContain('Refused write attempts are recorded in your audit log')

    /*
     * The audit log is "built around REFUSALS, not successes" — its own type
     * module says so. The claim holds only while a refusal path actually
     * appends one, so this asserts a writer exists rather than trusting the
     * design note.
     *
     * NOTE FOR THE READER: the verification pass behind this file found that
     * only domain/change-history/rollback.ts does. Demo-mode and public-demo
     * refusals on the cost, notification, profile and billing paths are
     * refused correctly and recorded nowhere, which makes the claim narrower
     * than it reads. That is recorded in docs/legal/VERIFICATION.md as an open
     * gap rather than papered over here.
     */
    const writers = walk('domain')
      .concat(walk('app'))
      .filter((f) => /appendAuditRecord\s*\(/.test(code(f)))
    expect(writers.length, 'nothing writes an audit record at all').toBeGreaterThan(0)

    const refusalWriters = writers.filter((f) => /refusal|refused|Refused/.test(code(f)))
    expect(refusalWriters, 'no refusal is recorded anywhere').not.toEqual([])
  })

  it('§4 (Terms): nothing is written to Etsy without confirmation', () => {
    expect(terms).toContain('We do not write anything to your Etsy shop without your confirmation')

    /*
     * There is exactly one write method on the Etsy interface, and the bulk
     * service accepts only a ConfirmedOperation. A second write method would
     * be a second path that might not pass through the diff.
     */
    const iface = code('lib/etsy/interface.ts')
    const writeMethods = [...iface.matchAll(/^\s{2}(\w+)\(shopId: string[^)]*\): Promise</gm)]
      .map((m) => m[1]!)
      .filter((name) => /^(apply|update|create|delete|publish|write)/i.test(name))
    expect(writeMethods).toEqual(['applyListingChanges'])
  })
})

describe('what the documents say about data', () => {
  it('§2: no buyer-identifying column exists, and a test enforces it', () => {
    expect(privacy).toContain('This is enforced by an automated test')

    /*
     * The claim names a test, so the test has to exist. It sweeps
     * information_schema for forbidden column names AND poisons the adapter
     * with real PII strings, which is why the claim is safe to make.
     */
    const suite = code('tests/integration/orders-sync.int.ts')
    expect(suite).toContain('no buyer identity reaches the database')
    for (const forbidden of ['email', 'address', 'buyer', 'phone']) {
      expect(suite, `the buyer sweep no longer checks for ${forbidden}`).toContain(`'${forbidden}'`)
    }

    // And the schema itself still carries only the country code.
    const schema = code('db/schema/index.ts')
    const ordersBlock = schema.slice(
      schema.indexOf("pgTable(\n  'orders'"),
      schema.indexOf("pgTable(\n  'order_items'"),
    )
    expect(ordersBlock).toContain('country_code')
    for (const forbidden of ['buyer', 'recipient', 'postal', 'email']) {
      expect(ordersBlock, `orders now has a ${forbidden} column`).not.toContain(forbidden)
    }
  })

  it('§2 and §5: nothing writes a draft, and no document mentions one', () => {
    /*
     * ── A TABLE IS NOT A WRITE, AND THIS GUARD GOT THAT WRONG ─────────────
     *
     * The first version read the SCHEMA: if `ai_generations` exists with an
     * `input` and an `output` column, §2 must say drafts are stored. It does
     * exist with exactly those columns, and NOTHING EVER INSERTED INTO IT.
     * The guard verified one property and took its neighbour on trust —
     * the twelfth recorded instance of that shape in this repo — and the
     * result was a Privacy Policy that over-disclosed: it told sellers we
     * keep a record of every AI suggestion and what they did with it, and no
     * such record existed.
     *
     * ── AND NOW THE DISCLOSURE DIRECTION HAS FLIPPED ──────────────────────
     *
     * The feature is gone and the documents say nothing about it, so the
     * question is no longer "does §5 account for drafts" — it is "could
     * anything produce one that the documents would then have to account
     * for". The INSERT is still the thing to ask about, because the table is
     * still in the schema (an applied migration is never edited) and a future
     * writer would make the documents incomplete the day it lands.
     *
     * Both directions fail: start writing drafts while the documents are
     * silent, or describe drafts while nothing writes one.
     */
    const writes = walk('lib').concat(walk('domain'), walk('app')).map(code).join('\n')
    const storesGenerations = /insert\(schema\.aiGenerations\b/.test(writes)

    expect(
      storesGenerations,
      'something inserts into ai_generations, so §2 and §5 have a disclosure to make',
    ).toBe(false)

    /*
     * And the documents are silent about drafts in every form of the word.
     * `[[CONFIRM]]` notes are included rather than stripped this time: the one
     * that explained the empty table to the reviewing lawyer was removed with
     * the rest, because an empty table nothing writes to is not something a
     * seller needs told about.
     */
    for (const [name, text] of [['privacy', privacy], ['terms', terms]] as const) {
      expect(text, `${name} mentions a draft`).not.toMatch(/\bdrafts?\b/)
    }
    /*
     * "DRAFT FOR LEGAL REVIEW" is a different word in the same spelling, and
     * it is why the assertion above reads the documents rather than their
     * banners: both carry that heading in capitals, and the matcher is
     * case-sensitive on purpose... which is a trap for the next reader, so it
     * is asserted rather than left implicit.
     */
    expect(privacy, 'the draft banner has gone from the Privacy Policy').toContain(
      'DRAFT FOR LEGAL REVIEW',
    )
  })

  it('§2 and §9: the Etsy token is encrypted and no plaintext column holds one', () => {
    expect(privacy).toContain('An OAuth access token, stored encrypted')
    expect(privacy).toContain('Etsy tokens are encrypted at rest')

    const tokens = code('lib/etsy/tokens.ts')
    expect(tokens).toContain('aes-256-gcm')

    // The column holds a sealed reference, never a token.
    const schema = code('db/schema/index.ts')
    expect(schema).toContain('token_ref')
    expect(schema, 'a column named for a raw token exists').not.toMatch(
      /text\('(access_token|refresh_token)'\)/,
    )
  })

  it('§9: row-level security is enabled on every table', () => {
    expect(privacy).toContain('row-level security is enabled on every table')
    /*
     * Delegated to the guard that actually proves it — it reads every
     * migration and every declared table and fails if one arrived without an
     * ENABLE line. Asserting the guard EXISTS is the honest thing this file
     * can do; re-implementing it here would be a second copy to drift.
     */
    const rls = code('tests/unit/rls.test.ts')
    expect(rls).toContain('ENABLE ROW LEVEL SECURITY')
    expect(rls).toContain('declaredTables')
  })

  it('§9: audit records are append-only — the repository has no editor', () => {
    expect(privacy).toContain('there is no code path that edits or deletes one')

    const repo = code('lib/repositories/change-jobs.ts')
    const auditHalf = repo.slice(repo.indexOf('audit records'))
    expect(auditHalf, 'the audit repository can update a record').not.toMatch(
      /\.update\(\s*schema\.auditRecords/,
    )
    expect(auditHalf, 'the audit repository can delete a record').not.toMatch(
      /\.delete\(\s*schema\.auditRecords/,
    )

    /*
     * And nothing outside the test harness deletes one either. Test cleanup
     * does, which is why the sweep is over domain/, app/ and lib/ rather than
     * the whole tree — a fixture tearing down its own rows is not a code path
     * a seller's record travels.
     */
    const deleters = [...walk('domain'), ...walk('app'), ...walk('lib')].filter((f) =>
      /delete\(\s*schema\.auditRecords/.test(code(f)),
    )
    expect(deleters, 'something in the product deletes audit records').toEqual([])
  })

  it('§6: the document does not promise an export that does not exist', () => {
    /*
     * ── THE CLAIM THAT WAS TOO BROAD, AND IS NOW CHECKED ──────────────────
     *
     * "Export your data yourself from Settings" reads as everything. Three
     * datasets exist: transactions, audit (listing-audit findings) and
     * audit-log. Listings, cost rules and change jobs are NOT exportable.
     *
     * The guard pins the set, so widening or narrowing it forces a look at
     * the sentence — and at the landing page, which made the same claim and
     * got two of its four nouns wrong.
     */
    expect([...EXPORT_DATASET_IDS].sort()).toEqual(['audit', 'audit-log', 'transactions'])

    /*
     * And the route serves exactly that list rather than a second copy of it.
     * A literal set of names here was how the route and the copy came to
     * disagree in the first place.
     */
    const route = code('app/api/export/[dataset]/route.ts')
    expect(route, 'the export route declares its own dataset list again').not.toMatch(
      /const DATASETS = \[/,
    )
    expect(route, 'the export route no longer reads the shared dataset list').toMatch(
      /from '@\/domain\/export\/datasets'/,
    )

    /*
     * ── AND THE LANDING PAGE, WHICH IS WHERE THIS WENT WRONG ──────────────
     *
     * The trust section and the FAQ both described the export in prose. The
     * first version named four datasets, two of which have no exporter —
     * "your cost setup" and "your synced shop". Prose cannot be type-checked,
     * so the copy now renders the nouns from the same list, and this guard
     * fails if somebody types them back in by hand.
     */
    const marketing = code('components/marketing/sections.tsx')
    expect(marketing, 'the landing page stopped rendering export nouns from the dataset list')
      .toMatch(/exportableNouns\(\)/)
    for (const phrase of ['your cost setup', 'your synced shop', 'Export everything']) {
      expect(
        marketing.includes(phrase),
        `the landing page claims "${phrase}" is exportable, and no exporter produces it`,
      ).toBe(false)
    }

    /*
     * NOT_EXPORTABLE is a list of absences, which is the kind of claim that
     * rots silently: an exporter gets written and the sentence keeps saying
     * you cannot have the file. So each absence must still have no exporter.
     */
    for (const absent of NOT_EXPORTABLE) {
      const noun = absent.replace(/^your /, '')
      expect(
        EXPORTABLE_DATASETS.some((d) => d.noun.includes(noun)),
        `"${absent}" is on the not-exportable list and also has an exporter`,
      ).toBe(false)
    }
  })

  it('§5: the Etsy freshness windows are the ones the code enforces, and something enforces them', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *  THE CLAIM A REGULATOR COULD ACT ON, AND IT WAS UNGUARDED.
     * ══════════════════════════════════════════════════════════════════════
     *
     * §5 told sellers that "Etsy's API Terms require that listing content we
     * display is no more than 6 hours older than Etsy's own, and other Etsy
     * content no more than 24 hours older" — and, until this task, NOTHING
     * REFRESHED AT ALL. syncShopListings and syncShopOrders had no caller
     * outside tests/integration. The paragraph carried a `[[CONFIRM]]` note
     * that was itself wrong in both halves: it said "a sync runs when you
     * connect a shop and when it is triggered", and neither happened.
     *
     * Grepping this file for "6 hours", "24 hours" or "freshness" before that
     * returned nothing. The document existed, the claim existed, and the only
     * thing checking either was a reader.
     *
     * ── IT READS BOTH NUMBERS OUT OF THE DOCUMENT ─────────────────────────
     *
     * Not `expect(privacy).toContain('6 hours')`, which goes green while the
     * constant says 7. The document's numbers are parsed and compared against
     * the constants the code enforces, so editing either side alone fails.
     */
    const paragraph = privacy.slice(privacy.indexOf('**Etsy content**'))
    const section = paragraph.slice(0, paragraph.indexOf('**AI drafts**'))
    expect(section.length, '§5 no longer has an Etsy content paragraph').toBeGreaterThan(200)

    const hours = [...section.matchAll(/no more than (\d+) hours/g)].map((m) => Number(m[1]))
    expect(
      hours,
      '§5 should state the listing window and then the other-content window, in hours',
    ).toEqual([LISTING_CONTENT_MAX_AGE_MS / 3_600_000, OTHER_CONTENT_MAX_AGE_MS / 3_600_000])

    /*
     * ── AND THE CLAIM IS ABOUT ENFORCEMENT, NOT INTENT ────────────────────
     *
     * "We refresh within those windows" was removed by an earlier task
     * precisely because nothing did. The sentence that replaced it says the
     * windows are enforced when a screen is built, which is a claim about a
     * code path — so the code path is asserted here, not just the wording.
     */
    const source = code('domain/sync/source.ts')
    expect(source, 'nothing checks the window where the display decision is made').toMatch(
      /withinWindow\(/,
    )

    const refresh = code('domain/sync/refresh.ts')
    for (const sync of ['syncShopListings', 'syncShopOrders']) {
      expect(refresh, `${sync} has no caller outside the test suite again`).toMatch(
        new RegExp(`\\b${sync}\\s*\\(`),
      )
    }

    /*
     * The two reachable triggers. If both of these go, the sync layer is
     * unreachable again and §5 becomes false again in exactly the way it was.
     */
    expect(
      code('app/api/sync/refresh/route.ts'),
      'the refresh endpoint no longer refreshes',
    ).toMatch(/refreshStaleAggregates\(/)
    expect(
      code('app/api/etsy/callback/route.ts'),
      'connecting a shop no longer reads it, so a new seller sees an empty product',
    ).toMatch(/refreshStaleAggregates\(/)

    /*
     * ── THE RETENTION HALF, WHICH IS A DIFFERENT CLAIM ────────────────────
     *
     * §5 says the mirrored copy is kept while the account is open, and gives
     * as one of its reasons that the figures are not stored but recalculated.
     * That is a property of the code — five tables with no insert site — and
     * it is the reason the paragraph cannot promise a shorter retention for
     * the Etsy copy than for "your history". If an insert site appears, the
     * document is describing a product that no longer exists.
     */
    const writes = walk('lib').concat(walk('domain'), walk('app')).map(code).join('\n')
    for (const derived of [
      'profitRecords',
      'baselines',
      'profitScenarios',
      'events',
      'actions',
    ]) {
      expect(
        new RegExp(`insert\\(schema\\.${derived}\\b`).test(writes),
        `§5 says calculated figures are not kept, and something now inserts into ${derived}`,
      ).toBe(false)
    }
    expect(
      section,
      '§5 should say why the copy outlives the display window, not only that it does',
    ).toMatch(/calculated from that copy/)
  })
})

describe('what the documents say about third parties', () => {
  it('§4: every processor that receives shop data is in the sub-processor table', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE GAP THE VERIFICATION PASS FOUND, AND THE REASON THIS TEST READS
     *   THE DOCUMENT RATHER THAN THE CODE ALONE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * The AI copilot sent the seller's own listing title and tags to
     * Anthropic's API. That is shop content leaving the service to a named
     * third party, and the sub-processor table did not mention it — while the
     * section above it promises "we will tell you before adding a new one
     * that processes your data".
     *
     * ── AND NOW IT RUNS THE OTHER WAY TOO ─────────────────────────────────
     *
     * D95 removed the Copilot and the dependency, so the first direction is
     * satisfiable by doing nothing, which is how a guard becomes decoration.
     * The converse is the live claim: a sub-processor table that names a
     * provider nothing sends to is also false, and worse in a specific way —
     * §4 is the GDPR Article 28 notice, so a row in it is a statement that
     * this provider processes your data today.
     *
     * Add any AI SDK and this fails until somebody writes the row. Write a
     * row with no SDK behind it and it fails until somebody removes it.
     */
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const aiDeps = Object.keys(pkg.dependencies ?? {}).filter((d) =>
      /anthropic|openai|cohere|mistral|google.*generativeai/i.test(d),
    )
    const table = privacy.slice(privacy.indexOf('## 4.'), privacy.indexOf('## 5.'))
    const names = /AI_PROVIDER|Anthropic|OpenAI|AI provider|AI model provider|language model/i.test(
      table,
    )

    if (aiDeps.length > 0) {
      expect(
        names,
        `${aiDeps.join(', ')} receives listing content, and the sub-processor table does not name an AI provider`,
      ).toBe(true)
    } else {
      expect(
        names,
        'the sub-processor table names an AI provider, and no AI SDK is a dependency of this product',
      ).toBe(false)
      // The table is read by lib/legal/subprocessors.ts, which classifies each
      // unnamed role. A placeholder row would need a classifier, and an AI
      // role has nothing to classify: there is no adapter to ask.
      expect(existsSync('lib/ai'), 'lib/ai is back and §4 names no provider').toBe(false)
    }
  })

  it('§3 and §6: the no-training commitment stands on its own', () => {
    /*
     * ── THE ONE SENTENCE THAT IS NOT A FEATURE REFERENCE, AND ITS THIRD
     *    VERSION OF THIS GUARD ───────────────────────────────────────────
     *
     * "We do not use your shop data or your content to train artificial
     * intelligence models" is the owner's commitment under Etsy's Prohibited
     * Behavior item 25. It is a promise about CONDUCT, it is true whether or
     * not this product ever has an AI feature, and it stays.
     *
     * What this test has asked about it has changed twice:
     *
     *   1. While the Copilot existed, the promise read quickly as "no model
     *      sees your content at all", which was FALSE — a draft was generated
     *      by one. So both documents had to say who did receive listing text,
     *      or the promise was misleading by omission.
     *   2. With the feature removed but described, the test required that
     *      explanation to say there was no provider.
     *   3. Now both documents are silent about the feature, so the promise
     *      can no longer be explained by anything about it — and an
     *      explanation that referred to a deleted feature would read as a
     *      promise about that feature rather than a standing rule, which is
     *      weaker. So: the commitment is present, it is framed as a limit on
     *      what may be done with the data, and NOTHING around it describes a
     *      drafter, a provider or an egress.
     */
    /*
     * Whitespace-normalised. Both documents wrap at 100 columns, so a phrase a
     * reader sees on one line is two lines in the source and a literal match
     * against it silently fails — which it did, on the first run of this
     * version, for a sentence that was there.
     */
    const flat = (markdown: string) => markdown.replace(/\s+/g, ' ')
    const sections = [
      ['privacy §3', flat(privacy.slice(privacy.indexOf('## 3.'), privacy.indexOf('## 4.')))],
      ['terms §6', flat(terms.slice(terms.indexOf('## 6.'), terms.indexOf('## 7.')))],
    ] as const

    for (const [name, section] of sections) {
      expect(section.length, `${name} is empty — check the section numbering`).toBeGreaterThan(400)
      expect(section, `${name} no longer makes the no-training commitment`).toContain(
        'to train artificial intelligence models',
      )

      /*
       * A standing rule rather than a description. Both sections say so in
       * the same words — "a standing limit on what we may do with your data"
       * — and both say the two things that make it a rule: it covers
       * everything held for the seller, and it binds our processors too.
       */
      expect(
        section,
        `${name} states the commitment without saying it is a standing rule`,
      ).toMatch(/standing limit on what we may do with your data/i)
      expect(section, `${name} does not extend the commitment to our processors`).toMatch(
        /processes your data on our behalf/i,
      )

      // And nothing in either section explains it by a feature.
      const explained = /drafter|draft|AI provider|language model|AI feature|copilot|extension|\bsent to\b/i
      expect(
        explained.test(section),
        `${name} explains the commitment by referring to a feature that does not exist`,
      ).toBe(false)
    }

    /* The two sections point at each other, so neither can quietly drop it. */
    expect(sections[0][1]).toMatch(/Section 6 of the Terms of Service makes the same commitment/i)
  })
})

describe('the placeholder gate: an unfinished agreement is not presented as one', () => {
  /*
   * ██████████████████████████████████████████████████████████████████████
   *
   *   A PAGE CONTAINING AN UNFILLED PLACEHOLDER MUST NOT BE PUBLICLY
   *   LINKED, AND MUST NOT BE PRESENTED AS AN AGREEMENT A SELLER CAN
   *   ACCEPT.
   *
   * ██████████████████████████████████████████████████████████████████████
   *
   * `[[LEGAL_ENTITY]]` names no party. A footer link says "here are our
   * terms" and a visitor who follows it is entitled to assume what they find
   * is in force; a checkbox beside a document with a blank where the
   * counterparty should be is not consent to anything.
   *
   * This file is the home for the check because it already reads these
   * documents. What it checks is that ONE function decides — so the footer,
   * the signup form, the pages and the acceptance flow cannot disagree — and
   * that no surface links these pages unconditionally.
   */

  const unfilled = (text: string) => [...text.matchAll(/\[\[([A-Z][A-Z0-9_]*)\]\]/g)].length

  it('has placeholders to gate on, or this whole block is checking nothing', () => {
    /*
     * The anti-vacuity check, and it is load-bearing here in a way it rarely
     * is: on the day the placeholders are filled in, every assertion below
     * becomes trivially satisfiable, and this is what says so out loud rather
     * than going quietly green.
     */
    const remaining = unfilled(privacy) + unfilled(terms)
    expect(
      remaining,
      'both documents are filled in — re-read this block, because the gate it checks is now inactive and the footer SHOULD be linking these pages',
    ).toBeGreaterThan(0)
  })

  it('decides in one place, which every public surface reads', () => {
    const loader = code('lib/legal/documents.ts')
    expect(loader).toMatch(/export function legalDocumentsInForce/)
    expect(loader).toMatch(/export function draftState/)

    // The footer and the signup form go through the same component, which
    // goes through the same function.
    const links = code('components/legal/legal-links.tsx')
    expect(links).toMatch(/legalDocumentsInForce\(\)/)

    const footer = code('components/marketing/sections.tsx')
    expect(footer, 'the marketing footer does not use the gated component').toMatch(
      /<LegalLinks variant="footer" \/>/,
    )
    const signup = code('app/(public)/signup/page.tsx')
    expect(signup).toMatch(/<LegalLinks/)
  })

  it('links no legal page unconditionally from a public surface', () => {
    /*
     * The sweep that would have caught the opposite mistake: a bare
     * <Link href="/legal/terms"> on the landing page would present the
     * document as settled no matter what the gate says.
     *
     * The legal pages themselves are exempt — they cross-reference each other,
     * and a reader already there has the draft banner above them — as is the
     * gated component, which is the one place allowed to render these hrefs.
     */
    const exempt = (file: string) =>
      file.startsWith('app/(public)/legal/') ||
      file === 'components/legal/legal-links.tsx' ||
      file === 'components/legal/draft-notice.tsx' ||
      // The acceptance panel is shown to a signed-in seller at the moment the
      // gate asks them to accept, which only happens once the documents are in
      // force; it is reached through the gate rather than past it.
      file === 'components/legal/accept-terms.tsx'

    const publicSurfaces = [
      ...walk('app/(marketing)'),
      ...walk('app/(public)'),
      ...walk('components/marketing'),
      ...walk('components/legal'),
    ].filter((file) => !exempt(file))

    expect(publicSurfaces.length, 'the sweep found no public surfaces').toBeGreaterThan(3)

    const offenders = publicSurfaces.filter((file) => /href="\/legal\//.test(code(file)))
    expect(
      offenders,
      'a public surface links a legal page directly; route it through LegalLinks so the placeholder gate decides',
    ).toEqual([])
  })

  it('renders the draft state on the pages themselves, rather than 404ing', () => {
    /*
     * The decision, asserted so it cannot be quietly reversed into a 404: the
     * documents exist, so "not found" would be a false statement made by a
     * server to somebody who went looking for the terms.
     */
    const layout = code('app/(public)/legal/layout.tsx')
    expect(layout).toMatch(/<DraftNotice \/>/)

    const notice = code('components/legal/draft-notice.tsx')
    expect(notice).toMatch(/draftState\(\)/)
    expect(notice, 'the draft notice 404s instead of rendering').not.toMatch(/notFound\(\)/)

    // And the pages ask not to be indexed while in draft, so an unfinished
    // agreement is not the search result somebody finds.
    for (const slug of ['terms', 'privacy', 'subprocessors', 'etsy']) {
      const page = code(`app/(public)/legal/${slug}/page.tsx`)
      expect(page, `/legal/${slug} does not gate its robots metadata`).toMatch(
        /legalDocumentsInForce\(\) \? \{\} : \{ robots/,
      )
    }
  })

  it('refuses to let a seller accept, and refuses to connect a shop at all', () => {
    const acceptance = code('domain/legal/acceptance.ts')
    expect(acceptance).toMatch(/export function assertTermsOfferable/)
    expect(acceptance).toMatch(/draftState\(\)/)

    // The connect route refuses with its own outcome, distinct from "you have
    // not accepted" — the seller can act on one and not the other.
    const connect = code('app/api/etsy/connect/route.ts')
    expect(connect).toMatch(/terms_not_published/)
    expect(connect).toMatch(/terms_not_accepted/)
  })

  it('and the sub-processor page marks what is not wired up rather than stating it', () => {
    /*
     * Four of the six rows in §4 are placeholders. On a page headed "who else
     * processes your data" an unfilled row would read as a fact — "a payment
     * provider takes payment" — about something that does not happen.
     *
     * The first version of this page had two states and marked every
     * placeholder "not in use", which put the database and the authentication
     * provider under a heading saying nothing was sent to them. That was
     * worse than the over-claim it was avoiding, so there are three states and
     * the live ones are measured from the running configuration.
     */
    const parser = code('lib/legal/subprocessors.ts')
    expect(parser).toMatch(/IN_USE_UNNAMED/)
    expect(parser).toMatch(/NOT_IN_USE/)
    // Measured, through the same functions the product uses to decide whether
    // it may send email or take a payment.
    expect(parser).toMatch(/emailSenderConfigured\(\)/)
    expect(parser).toMatch(/paymentProviderConfigured\(\)/)

    // And it renders §4 of the Privacy Policy rather than a second copy of it,
    // so the guard above — an AI dependency requires an AI provider in the
    // table — still covers what the public page shows.
    expect(parser).toMatch(/legalDocument\('privacy'\)/)
    expect(parser).toMatch(/## 4\./)
  })
})

/* ─────────── silence, and the sweep that holds it ─────────────────────── */

/*
 * The vocabulary of two removed features, in the forms a surface could use.
 *
 * `\bextension\b` rather than "browser extension": "the extension" on its own
 * is how a page refers to one once the first sentence has named it, and that
 * is the sentence a later edit drops.
 */
const REMOVED_FEATURE_WORDS =
  /\bextensions?\b|copilot|\bAI\b|AI[- ]assisted|AI_ASSISTED|language model|artificial intelligence|drafter|listing draft/i

/** The sentence that is allowed to say "artificial intelligence models". */
const NO_TRAINING = 'We do not use your shop data or your content to train artificial intelligence models.'

/**
 * The document text with the two places the commitment is allowed to live
 * removed: section 6 of the Terms, whose entire subject is the commitment, and
 * the sentence itself wherever else it appears.
 *
 * Normalised first — the sentence is wrapped in `**` and wraps across two
 * lines in both documents, so a literal split against raw markdown exempts
 * nothing and the sweep then fires on the one sentence that is allowed.
 */
function withoutTheCommitment(text: string): string {
  const flat = text.replace(/\*\*/g, '').replace(/\s+/g, ' ')
  const start = flat.indexOf('## 6. Training artificial intelligence models')
  const section =
    start === -1 ? '' : flat.slice(start, flat.indexOf('## 7.', start === -1 ? 0 : start))
  return (section ? flat.split(section).join(' … ') : flat).split(NO_TRAINING).join(' … ')
}

describe('no surface a seller can reach mentions the extension or an AI feature', () => {
  /*
   * ██████████████████████████████████████████████████████████████████████
   *
   *   THE RULE IS NOW SILENCE, AND SILENCE IS THE STRONGER CLAIM.
   *
   * ██████████████████████████████████████████████████████████████████████
   *
   * ── WHAT WAS HERE, AND WHY IT IS INVERTED ─────────────────────────────
   *
   * Three generations of this block:
   *
   *   1. Six tests read extension/manifest.chrome.json and extension/src/*.ts
   *      at request time, because /legal/etsy made five negative claims about
   *      the extension — no page content, no cookies, no storage, changes
   *      nothing, never calls etsy.com — and each stopped being true the
   *      moment somebody added a line to a content script. Reading the
   *      manifest was the fix for a sentence written from memory, which is
   *      how a false denial got into the Terms in the first place.
   *
   *   2. Three tests asserted that the documents and /legal/etsy SAID there
   *      was no extension and said it had been removed rather than switched
   *      off, checked against the absence of the five paths it occupied.
   *
   *   3. This. The owner's decision is that no seller-facing surface and no
   *      legal document mentions either removed feature at all — not a
   *      historical note, not a positive statement of absence. The documents
   *      must be ACCURATE, not complete: with no extension and no AI feature,
   *      silence about both is accurate, and Etsy's API Terms Section 4 duty
   *      is about what the product does rather than what it does not.
   *
   * Generation 2 was satisfiable by one sentence in one file. This one is
   * satisfiable only by every seller-facing file at once, which is why it is
   * the stronger rule: a sentence re-added anywhere — a page, a component, a
   * button's reason, either document — fails it, and so does a feature that
   * comes back without its disclosure.
   */

  /*
   * EVERY module that can put words on a screen, not only app/ and
   * components/. The first version of this swept those two, and the sentence
   * that mattered most was in neither: `domain/data-sources/service.ts` held
   * the /data/sources catalogue row that stated the absence, and
   * `domain/billing/webhooks.ts` held an email body promising the feature
   * would keep working. A sweep that stops at the view layer stops short of
   * where this product keeps its copy.
   */
  const surfaces = () =>
    walk('app').concat(walk('components'), walk('domain'), walk('lib'))

  /*
   * The one exemption, and it is a KEY rather than a sentence.
   *
   * `ai.view` is an operator permission that grants access to nothing. It
   * stays because removing it would rewrite stored role records, the audit
   * entries that name it and the permission matrix — all to delete a string —
   * and because a key that has stopped granting anything is a different thing
   * from a page telling a seller about a feature.
   *
   * Written as the repo's KNOWN_REMAINING shape: each entry has to still
   * match, so a reader finds a decision rather than an omission, and deleting
   * the key means deleting the entry.
   */
  const EXEMPT: { file: string; matcher: RegExp; why: string }[] = [
    {
      file: 'domain/admin/permissions.ts',
      matcher: /'ai\.view'|title: 'AI'/,
      why:
        'The permission key and its label in the operator matrix. It grants nothing, and its own ' +
        'detail says so without naming anything; the key is kept so stored role records stay readable.',
    },
    {
      file: 'domain/admin/roles.ts',
      matcher: /'ai\.view'/,
      why:
        'The same key in a role\u2019s default permission set. A key in a list, not a sentence a ' +
        'reader could mistake for a description of the product.',
    },
  ]

  it('finds the surfaces it is sweeping, and can see the words when they are there', () => {
    /*
     * Anti-vacuity, in both halves. A sweep over an empty file list passes
     * every assertion below perfectly, and a matcher that matches nothing
     * passes them twice as fast.
     */
    expect(surfaces().length, 'the sweep found no seller-facing surfaces').toBeGreaterThan(350)

    // Every exemption is still real. One that stopped matching would be a
    // decision recorded about something that is no longer there.
    for (const exempt of EXEMPT) {
      expect(
        exempt.matcher.test(code(exempt.file)),
        `${exempt.file} no longer matches its exemption; delete the EXEMPT entry`,
      ).toBe(true)
      expect(exempt.why.length, `${exempt.file} has no reason recorded`).toBeGreaterThan(60)
    }

    for (const sentence of [
      'CobaltRank does not offer a browser extension.',
      'There is no AI feature in this product.',
      'the listing text is sent to our AI provider',
      'A listing drafter was built and has been removed.',
      'AI-assisted',
    ]) {
      expect(REMOVED_FEATURE_WORDS.test(sentence), `the matcher misses: ${sentence}`).toBe(true)
    }

    // And it does not fire on the ordinary vocabulary of this product.
    for (const innocent of [
      'Every figure on this screen is modelled sample data.',
      'Your Etsy password is never asked for, received or stored.',
      'Bulk edits, scheduled jobs and manual edits land in the same trail.',
    ]) {
      expect(REMOVED_FEATURE_WORDS.test(innocent), innocent).toBe(false)
    }
  })

  it('says nothing about either feature anywhere in the product', () => {
    /*
     * Comments are stripped. The history is kept where it belongs — D95 in
     * docs/DECISIONS.md, the headers in components/layout/navigation.ts and
     * components/ui/where-to-start.tsx, this test's own preamble — and a guard
     * that could only be satisfied by deleting those explanations would
     * eventually be satisfied by deleting them. What a seller reads is the
     * code with the comments taken out.
     */
    const offenders: string[] = []
    for (const file of surfaces()) {
      const exempt = EXEMPT.filter((e) => e.file === file)
      for (const line of code(file).split('\n')) {
        if (!REMOVED_FEATURE_WORDS.test(line)) continue
        if (exempt.some((e) => e.matcher.test(line))) continue
        offenders.push(`${file}: ${line.trim().slice(0, 90)}`)
      }
    }
    expect(offenders, 'a seller-facing surface names a feature this product does not have').toEqual(
      [],
    )
  })

  it('says nothing about either feature in either document, bar the one commitment', () => {
    /*
     * The no-training sentence is the exception and the only one: it is a
     * promise about conduct, not a description of a feature, it is the
     * owner's commitment under Etsy's Prohibited Behavior item 25, and it is
     * true whether or not this product ever has an AI feature. It is removed
     * from the text here so that the rest of the document is swept, and
     * asserted separately below.
     */
    const finder = new RegExp(REMOVED_FEATURE_WORDS.source, 'gi')
    for (const [name, text] of [['privacy', privacy], ['terms', terms]] as const) {
      const flat = text.replace(/\*\*/g, '').replace(/\s+/g, ' ')
      expect(
        flat.split(NO_TRAINING).length - 1,
        `${name} does not carry the no-training commitment exactly once`,
      ).toBe(1)

      const rest = withoutTheCommitment(text)
      expect(rest.length, `${name} is empty`).toBeGreaterThan(4000)
      const hits = [...rest.matchAll(finder)].map((m) =>
        rest.slice(Math.max(0, m.index - 50), m.index + 50),
      )
      expect(hits, `${name} still mentions a feature this product does not have`).toEqual([])
    }
  })

  it('is silent because the features are gone, not because a flag hides them', () => {
    /*
     * Silence is only accurate while there is nothing to disclose. A
     * deployment that could switch either feature on would make every
     * document false on that deployment alone, and nothing in them would say
     * so — which is the state this block existed to prevent in generation 1.
     *
     * So: the paths stay absent, and no module may read an environment
     * variable that would bring one back.
     */
    for (const path of [
      'extension',
      'app/(dashboard)/settings/extension',
      'app/api/extension',
      'lib/extension',
      'domain/extension',
      'lib/ai',
      'domain/ai',
      'app/(dashboard)/listings/ai-copilot',
    ]) {
      expect(existsSync(path), `${path} exists, and no document discloses it`).toBe(false)
    }

    expect(readFileSync('.env.example', 'utf8')).not.toMatch(
      /^\s*(BROWSER_EXTENSION_ENABLED|EXTENSION_IDS|EXTENSION_APP_URL|AI_MODE|ANTHROPIC_API_KEY)\s*=/m,
    )
    const readers = ['app', 'components', 'domain', 'lib']
      .flatMap((root) => walk(root))
      .concat('middleware.ts')
      .filter((file) =>
        /process\.env\.(BROWSER_EXTENSION_ENABLED|EXTENSION_IDS|EXTENSION_APP_URL|AI_MODE|ANTHROPIC_API_KEY)/.test(
          code(file),
        ),
      )
    expect(readers).toEqual([])
  })

  it('and /legal/etsy still claims no authorisation it has not been given', () => {
    /*
     * The half of the old assertion that survives the silence. The page says
     * what CobaltRank does — every piece of Etsy data through the official
     * API, nothing read from an Etsy page — and it may not go on to assert a
     * conclusion about whether that satisfies Etsy's rules. That is Etsy's
     * call, and a page claiming compliance would be making a representation
     * nobody here is in a position to make.
     */
    const page = code('app/(public)/legal/etsy/page.tsx').replace(/\s+/g, ' ')
    expect(page).toMatch(/every piece of Etsy data through Etsy&rsquo;s official API/)
    expect(page).toMatch(/Nothing in this product reads a page on etsy\.com/)
    expect(
      /compliant with|complies with Etsy|approved by Etsy|authorised by Etsy|certified by Etsy/i.test(
        page,
      ),
      '/legal/etsy claims Etsy approval',
    ).toBe(false)
  })

  it('carries the warranty disclaimer from the Terms rather than a second copy', () => {
    const page = code('app/(public)/legal/etsy/page.tsx')
    const facts = code('lib/legal/etsy.ts')
    expect(facts).toMatch(/legalDocument\('terms'\)/)
    expect(facts).toMatch(/## 12\./)
    expect(page).toMatch(/warrantyDisclaimer\(\)/)

    // And the Terms still carry it, naming the developer as sole provider.
    expect(terms).toMatch(/THIS APPLICATION IS SOLELY PROVIDED BY/)
  })
})

describe('what the documents say about cookies', () => {
  it('§11: every cookie the product sets is disclosed, and no disclosed one is fictional', () => {
    const section = privacy.slice(privacy.indexOf('## 11.'), privacy.indexOf('## 12.'))

    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE SWEEP, BECAUSE A COOKIE LIST IS A CLOSED SET AND THIS ONE WAS
     *   TWO SHORT.
     * ══════════════════════════════════════════════════════════════════════
     *
     * The draft listed a session cookie, a theme cookie and a demo cookie.
     * The theme is not a cookie at all (below), and TWO real cookies were
     * missing — one of which, `ep-reset-email`, holds an email address for
     * fifteen minutes. Naming what is set is the entire job of this section,
     * so it cannot be a list somebody remembered.
     *
     * Every cookie this product sets is set through a named constant, so the
     * sweep is exact: find the constants, require the names in the prose.
     * Supabase's own session cookies (`sb-*`) are not ours to name and are
     * covered by the session-cookie bullet.
     */
    const cookieNames = new Map<string, string>()
    for (const file of [...walk('lib'), ...walk('domain'), ...walk('app')]) {
      for (const match of code(file).matchAll(
        /export const ([A-Z0-9_]*COOKIE[A-Z0-9_]*)\s*=\s*'([^']+)'/g,
      )) {
        cookieNames.set(match[2]!, `${file} (${match[1]!})`)
      }
    }

    // A sweep that found nothing would pass the loop below perfectly.
    expect(cookieNames.size, 'the cookie sweep found no cookie constants at all').toBeGreaterThan(2)

    for (const [name, where] of cookieNames) {
      expect(
        section.includes(name),
        `${where} sets a cookie named ${name} and §11 does not disclose it`,
      ).toBe(true)
    }

    // The demo cookie, and the claim that its value is never read.
    expect(section).toContain('demo cookie')
    expect(section).toContain('value is never read')
    const auth = code('lib/auth/index.ts')
    expect(auth).toMatch(/jar\.get\(PUBLIC_DEMO_COOKIE\)/)
    expect(auth, 'the demo cookie value is parsed after all').not.toMatch(
      /jar\.get\(PUBLIC_DEMO_COOKIE\)[?!]?\.value/,
    )
    expect(PUBLIC_DEMO_COOKIE).toBe('ep_public_demo')

    /*
     * The theme is localStorage, not a cookie. The draft said "a theme
     * cookie", which is the kind of small factual error a regulator reads
     * literally — a cookie banner's whole job is naming what is set.
     */
    const themeScript = code('components/layout/theme-script.tsx')
    const themeIsCookie = /document\.cookie/.test(themeScript)
    const themeIsStorage = /localStorage/.test(themeScript)
    expect(themeIsStorage || themeIsCookie, 'the theme is persisted somehow').toBe(true)
    if (themeIsStorage && !themeIsCookie) {
      expect(
        /theme cookie/i.test(section),
        'the policy calls the theme a cookie; it is localStorage',
      ).toBe(false)
      expect(
        /local storage|localStorage/i.test(section),
        'the theme is in localStorage and the policy does not say so',
      ).toBe(true)
    }
  })
})
