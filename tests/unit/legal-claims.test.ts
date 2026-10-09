import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { OPERATOR_WRITABLE } from '@/domain/admin/operator-writes'
import { PUBLIC_DEMO_COOKIE } from '@/lib/auth/public-demo-actor'
import {
  EXPORTABLE_DATASETS,
  EXPORT_DATASET_IDS,
  NOT_EXPORTABLE,
} from '@/domain/export/datasets'

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

  it('§2: a table that stores shop content is disclosed as something we store', () => {
    /*
     * ── SENDING IT AND KEEPING IT ARE TWO DIFFERENT DISCLOSURES ───────────
     *
     * §2 already said the AI helper SENDS a listing's title and tags to a
     * provider. It did not say that the request and the reply are then kept:
     * `ai_generations` stores `input`, `output`, the listing, the actor and
     * whether the draft was accepted or rejected. A seller reading "sent to
     * our AI provider" would reasonably conclude nothing stayed behind.
     *
     * So the guard is on the table, not on the SDK: if a table exists whose
     * columns are an AI request and its reply, the document must say drafts
     * are stored. Drop the table and this relaxes.
     */
    const schema = code('db/schema/index.ts')
    const storesGenerations =
      /pgTable\('ai_generations'/.test(schema) &&
      /input: jsonb\('input'\)/.test(schema) &&
      /output: text\('output'\)/.test(schema)

    if (!storesGenerations) return

    expect(
      /store each draft/i.test(privacy),
      'ai_generations keeps every AI request and reply, and §2 does not say drafts are stored',
    ).toBe(true)
    // And the retention section has to account for them rather than stopping
    // at "shop data".
    expect(privacy).toMatch(/draft/i)
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
})

describe('what the documents say about third parties', () => {
  it('§4: every processor that receives shop data is in the sub-processor table', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE GAP THE VERIFICATION PASS FOUND, AND THE REASON THIS TEST READS
     *   THE DOCUMENT RATHER THAN THE CODE ALONE.
     * ══════════════════════════════════════════════════════════════════════
     *
     * The AI copilot sends the seller's own listing title and tags to
     * Anthropic's API (lib/ai/claude.ts, lib/ai/prompt.ts). That is shop
     * content leaving the service to a named third party, and the
     * sub-processor table did not mention it — while the section above it
     * promises "we will tell you before adding a new one that processes your
     * data".
     *
     * So: if an AI SDK is a dependency, the table must name an AI provider.
     * Remove the dependency and this relaxes; add a different one and it
     * fails until somebody writes the row.
     */
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>
    }
    const aiDeps = Object.keys(pkg.dependencies ?? {}).filter((d) =>
      /anthropic|openai|cohere|mistral|google.*generativeai/i.test(d),
    )

    if (aiDeps.length > 0) {
      const table = privacy.slice(privacy.indexOf('## 4.'), privacy.indexOf('## 5.'))
      expect(
        /AI_PROVIDER|Anthropic|AI provider|AI model provider/i.test(table),
        `${aiDeps.join(', ')} receives listing content, and the sub-processor table does not name an AI provider`,
      ).toBe(true)
    }
  })

  it('§3 and §6: the no-training promise is about us, and says who does see it', () => {
    /*
     * "We do not use your shop data or your content to train artificial
     * intelligence models" is true of us. Read quickly it suggests no model
     * sees the content at all, which is not true — a draft is generated by
     * one. The documents have to carry both halves or the first is misleading
     * by omission.
     */
    for (const [name, text] of [['privacy', privacy], ['terms', terms]] as const) {
      expect(text).toContain('to train artificial intelligence models')
      expect(
        /sent to|processed by|our AI provider|model provider/i.test(text),
        `${name} promises no AI training without saying that an AI provider receives listing text`,
      ).toBe(true)
    }
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
