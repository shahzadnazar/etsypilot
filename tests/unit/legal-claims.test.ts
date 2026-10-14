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

  it('§2 and §5: the document says what happens to drafts, and nothing writes one', () => {
    /*
     * ── A TABLE IS NOT A WRITE, AND THIS GUARD GOT THAT WRONG ─────────────
     *
     * The first version of this assertion read the SCHEMA: if `ai_generations`
     * exists with an `input` and an `output` column, §2 must say drafts are
     * stored. It does exist with exactly those columns, so the document was
     * made to say so — and NOTHING EVER INSERTED INTO IT. The guard verified
     * one property and took its neighbour on trust, which is the twelfth
     * recorded instance of that shape in this repo, and the result was a
     * Privacy Policy that over-disclosed: it told sellers we keep a record of
     * every AI suggestion and what they did with it, and no such record
     * existed.
     *
     * D95 removed the Copilot, so there is no draft to keep either. The table
     * is still in the schema and stays there — an applied migration is never
     * edited — which is exactly why this guard still asks about the INSERT
     * rather than the table. Both directions still fail: start writing drafts
     * while the document says there are none, or say they are stored while
     * nothing stores them.
     */
    const writes = walk('lib').concat(walk('domain'), walk('app')).map(code).join('\n')
    const storesGenerations = /insert\(schema\.aiGenerations\b/.test(writes)

    /*
     * `[[CONFIRM]]` notes are stripped first. The withdrawn claim is recorded
     * in one — "it told sellers we kept a record of every suggestion" — which
     * is close to the phrase being searched for, so leaving them in would let
     * the document satisfy this assertion with the note that says the
     * opposite. A guard matched by its own correction note is the same failure
     * as one matched by its own documentation, and this file has met that
     * eight times.
     */
    const claims = privacy.replace(/`\[\[CONFIRM:[\s\S]*?\]\]`/g, '')

    if (storesGenerations) {
      expect(
        /store each draft/i.test(claims),
        'something inserts into ai_generations and §2 does not say drafts are stored',
      ).toBe(true)
    } else {
      expect(
        /store each draft/i.test(claims),
        '§2 says drafts are stored and nothing inserts into ai_generations',
      ).toBe(false)
    }

    /*
     * And §5 accounts for drafts rather than stopping at "shop data". The
     * answer it has to give changed with D95 — not "they are not kept" but
     * "there are none" — and the retention section has to say which, because
     * a seller asking how long a draft is kept is entitled to be told that
     * the question no longer arises.
     */
    const retention = claims.slice(claims.indexOf('## 5.'), claims.indexOf('## 6.'))
    expect(retention, '§5 no longer accounts for AI drafts at all').toMatch(/draft/i)
    expect(
      retention,
      '§5 should say there are no drafts, since there is no AI feature to produce one',
    ).toMatch(/there are none|no AI feature/i)
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

  it('§3 and §6: the no-training promise is about us, and says who does see it', () => {
    /*
     * ── THE SECOND HALF REVERSED, AND THAT IS WHY IT IS STILL HERE ────────
     *
     * "We do not use your shop data or your content to train artificial
     * intelligence models" is true of us, and read quickly it suggests no
     * model sees the content at all. While the Copilot existed that reading
     * was FALSE — a draft was generated by one — so this required both
     * documents to say who did receive listing text, or the promise was
     * misleading by omission.
     *
     * With no AI in the product the quick reading is the true one, and the
     * omission runs the other way: a document that still says a provider
     * receives listing text describes something that cannot happen. So the
     * same test now requires the commitment plus an explicit statement that
     * nothing is sent anywhere — not silence, which would leave a seller to
     * infer it.
     *
     * Scoped to the sections that make the claim, because §2 of the Privacy
     * Policy records in the past tense what it used to disclose, and a guard
     * that could only be satisfied by deleting that record would eventually
     * be satisfied by deleting it.
     */
    const sections = [
      ['privacy §3', privacy.slice(privacy.indexOf('## 3.'), privacy.indexOf('## 4.'))],
      ['terms §6', terms.slice(terms.indexOf('## 6.'), terms.indexOf('## 7.'))],
    ] as const

    for (const [name, section] of sections) {
      expect(section.length, `${name} is empty — check the section numbering`).toBeGreaterThan(400)
      expect(section, `${name} no longer makes the no-training commitment`).toContain(
        'to train artificial intelligence models',
      )
      expect(
        /no AI (feature|provider)|nothing in CobaltRank sends|none to send it to/i.test(section),
        `${name} promises no AI training without saying whether anything receives shop content`,
      ).toBe(true)
      expect(
        /is sent to our AI provider|does not train on it either/i.test(section),
        `${name} still describes an AI provider receiving listing text, and there is none`,
      ).toBe(false)
    }
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

describe('what /legal/etsy says about the browser extension', () => {
  /*
   * ██████████████████████████████████████████████████████████████████████
   *
   *   THE TERMS ONCE DENIED THAT A BROWSER EXTENSION EXISTED. ONE SHIPPED
   *   IN THIS REPOSITORY. ETSY'S PROHIBITED BEHAVIOR LIST NAMES EXTENSIONS
   *   EXPLICITLY, SO THIS IS THE CLAIM WITH THE MOST AT STAKE: GETTING IT
   *   WRONG RISKS THE API ACCESS THE WHOLE PRODUCT DEPENDS ON.
   *
   * ██████████████████████████████████████████████████████████████████████
   *
   * ── THE SAME CLAIM, MEASURED THE OTHER WAY ROUND ──────────────────────
   *
   * Six tests here used to read extension/manifest.chrome.json and
   * extension/src/*.ts at request time, because /legal/etsy made five
   * negative claims about the extension — it read no page content, no
   * cookies, no storage, changed nothing, never called etsy.com — and each
   * one stopped being true the moment somebody added a line to a content
   * script. Reading the manifest was the fix for a sentence written from
   * memory, which is how the false denial got into the Terms.
   *
   * D95 removed the extension, and the page now makes ONE claim: there is no
   * browser extension in this product. That claim is not checked against a
   * manifest — it is checked against the absence of one, which is the only
   * evidence that can support it. A guard that only read the page's words
   * would go green on the day an extension came back without the page being
   * touched, which is exactly the original defect with the sentences swapped.
   */

  const page = code('app/(public)/legal/etsy/page.tsx').replace(/\s+/g, ' ')

  it('says there is no extension, and the tree agrees', () => {
    expect(page).toMatch(/does not offer a browser extension/)

    /*
     * The five paths the extension occupied. Any one of them returning makes
     * the sentence above false, and this is the only place that would notice:
     * nothing else in the repository reads /legal/etsy against the build.
     */
    for (const path of [
      'extension',
      'app/(dashboard)/settings/extension',
      'app/api/extension',
      'lib/extension',
      'domain/extension',
    ]) {
      expect(existsSync(path), `${path} exists, and /legal/etsy says it does not`).toBe(false)
    }
  })

  it('says removed rather than switched off, because there is no flag left', () => {
    /*
     * The distinction a reader of a legal page is entitled to: a feature
     * behind an environment variable is a feature this deployment could turn
     * on, and the page would then be false on that deployment only. The page
     * claims something stronger — the code is gone — so no flag may remain.
     */
    expect(page).toMatch(/taken out of the application entirely/)
    expect(page).toMatch(/no download route, no settings page, no link to one/)

    /*
     * The FLAG, not the word. .env.example explains at length why the
     * variable is gone and names it four times doing so, and a guard that
     * could only be satisfied by deleting that explanation would eventually
     * be satisfied by deleting it. So: no assignment line in the template,
     * and nothing in the product that reads it.
     */
    expect(readFileSync('.env.example', 'utf8')).not.toMatch(
      /^\s*(BROWSER_EXTENSION_ENABLED|EXTENSION_IDS|EXTENSION_APP_URL)\s*=/m,
    )
    for (const file of ['middleware.ts', 'next.config.ts', 'package.json']) {
      expect(
        code(file).includes('BROWSER_EXTENSION_ENABLED'),
        `${file} still reads BROWSER_EXTENSION_ENABLED`,
      ).toBe(false)
    }
    // And no module anywhere asks the environment about an extension.
    const readers = ['app', 'components', 'domain', 'lib']
      .flatMap((root) => walk(root))
      .concat('middleware.ts')
      .filter((file) =>
        /process\.env\.(BROWSER_EXTENSION_ENABLED|EXTENSION_IDS|EXTENSION_APP_URL)/.test(
          code(file),
        ),
      )
    expect(readers).toEqual([])
  })

  it('claims no authorisation from Etsy, because none has been given', () => {
    /*
     * The page describes behaviour and does not assert a conclusion about
     * whether that behaviour satisfies item 24 of Etsy's Prohibited Behavior
     * list. That is Etsy's call. A page that claimed compliance would be
     * making a representation nobody here is in a position to make — and the
     * last time this product described the extension from memory, the
     * description was false.
     */
    expect(page).toMatch(/No written authorisation has been asked for or given/)
    expect(
      /compliant with|complies with Etsy|approved by Etsy|authorised by Etsy/i.test(page),
      '/legal/etsy claims Etsy approval',
    ).toBe(false)
  })

  it('carries the warranty disclaimer from the Terms rather than a second copy', () => {
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
