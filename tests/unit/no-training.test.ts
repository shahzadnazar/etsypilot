import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import { AI_PROVIDER_SDK, AI_PROVIDER_TERMS, providerClauseWasRead, providerTermsNote } from '@/lib/ai/provider-terms'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   SHOP CONTENT HAS EXACTLY ONE EGRESS, AND NOTHING STORES IT WHERE IT
 *   COULD ACCUMULATE AS A CORPUS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Terms §6 and Privacy §3:
 *
 *     "We do not use your shop data or your content to train artificial
 *      intelligence models."
 *
 * Both true. Until this file, neither was enforced — and it was the only
 * load-bearing claim in the product without a guard behind it. The freshness
 * windows, the research honesty rules, the source claims, the fixture
 * containment, the selector cache and the operator write boundary all hold
 * theirs.
 *
 * ── WHAT "COULD ACCUMULATE AS A CORPUS" MEANS, AND WHY THAT DEFINITION ────
 *
 * A guard cannot check USE. Nothing in a repository can prove what somebody
 * does with a database they already have. So the rule is about the two
 * conditions that make training possible in the first place, because each is
 * a property of the code:
 *
 *   EGRESS. Shop content leaves this machine at exactly one place. Not "we
 *   promise not to send it anywhere else" — one place, and a second one is a
 *   test failure. That bounds who could ever train on it to one named party
 *   whose terms are recorded in lib/ai/provider-terms.ts.
 *
 *   POOLING. You cannot train on per-shop rows without first pooling them. So
 *   no store of shop content may exist that is not scoped to one shop: every
 *   table that holds a listing, an order or their text carries a shop_id, RLS
 *   is on it, and the repositories take a ShopContext rather than reading an
 *   ambient one. An unscoped table of listing text is the shape a corpus has,
 *   and it is the shape this rule refuses.
 *
 * `ai_generations` is the specific candidate and it gets its own assertion: a
 * table of prompt inputs and model outputs is exactly what a fine-tune
 * consumes, it exists in the schema, and NOTHING INSERTS INTO IT. The day
 * something does, the Privacy Policy has to change in two places and this
 * fails until it does.
 *
 * Three things are deliberately NOT treated as a corpus, each for a stated
 * reason:
 *
 *   change_jobs    holds the before and after of every listing field a bulk
 *                  edit touched. It is the seller's own change history: they
 *                  read it on /listings/change-history, rollback needs it, and
 *                  it is shop-scoped under RLS. A record the seller can see
 *                  and act on is not a corpus.
 *   listings        the mirror of their own shop. Etsy's own §5 retention
 *                  clause governs it and docs/legal §5 states the position.
 *   the logs        not a store of content at all, and ASSERTED so below —
 *                  the quietest corpus available is a log line carrying a
 *                  listing title, because logs accumulate, outlive the row
 *                  and travel to wherever logs are shipped. The redactor
 *                  strips credentials, not prose.
 *
 * ── AND THE HALF THAT CANNOT BE ENFORCED ─────────────────────────────────
 *
 * Privacy §3 also says the AI provider "does not train on it either". That is
 * a claim about somebody else's terms and no code can check it. It is made
 * VISIBLE instead: lib/ai/provider-terms.ts records which provider, which
 * document, and whether a person has read the clause, /data/sources renders
 * it, and the assertions at the bottom bind the record to the SDK the adapter
 * actually imports — so changing provider fails here until somebody reads the
 * new one's terms.
 */

const ROOTS = ['app', 'components', 'domain', 'lib']

/** This file names the things it bans in order to ban them. */
const SELF = 'tests/unit/no-training.test.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((root) => walk(root)).sort()

/* ────────────────────────────── the egress ─────────────────────────────── */

/**
 * Every way a module can put bytes on the network.
 *
 * Primitives, not call graphs. A module that passes a request object to
 * another module is not an egress; the module that hands it to a socket is.
 * Comments are stripped before matching (`code()`), which is what keeps the
 * prose above from being an offence.
 */
const FETCH_CALL = /\bfetch\s*\(/

const TRANSMITS = [
  FETCH_CALL,
  /\bfetchImpl\s*\(/,
  /\?\?\s*fetch\b/,
  /\bnew Anthropic\s*\(/,
  /\bmessages\.create\s*\(/,
  /\bcreateClient\s*\(/,
  /\bcreateServerClient\s*\(/,
  /\bcreateBrowserClient\s*\(/,
] as const

/** What a module reaching the network is talking to. */
type Destination = 'ETSY' | 'AUTH_PROVIDER' | 'AI_PROVIDER'

/**
 * Every egress in the product, with its destination and why it is allowed.
 *
 * The sweep below must find exactly these files. A new one is a new place
 * shop content could leave from, and the author has to come here and say
 * where it goes — which is the whole mechanism.
 */
const EGRESS: Record<string, { to: Destination; why: string }> = {
  'lib/etsy/http.ts': {
    to: 'ETSY',
    why:
      'The Etsy API client. Carries shop content in ONE direction that matters — a ' +
      'confirmed listing change going back to Etsy, which is where the content came ' +
      'from and who already has it. lib/etsy/interface.ts exposes exactly one write ' +
      'method and tests/unit/operator-write-boundary.test.ts pins its callers.',
  },
  'lib/etsy/oauth.ts': {
    to: 'ETSY',
    why:
      'The token exchange. Carries a code, a verifier and a client id. No listing, no ' +
      'order, no shop text — tokens only, and never into a log or a response.',
  },
  'lib/auth/supabase.ts': {
    to: 'AUTH_PROVIDER',
    why:
      'The auth client. Carries an email, a password and a session cookie. It has no ' +
      'access to shop content: it predates the ShopContext a repository needs.',
  },
  'lib/auth/step-up.ts': {
    to: 'AUTH_PROVIDER',
    why:
      'A second, isolated auth client for re-authentication before a sensitive action. ' +
      'Same payload as above: a credential, never shop content.',
  },
  'lib/ai/claude.ts': {
    to: 'AI_PROVIDER',
    why:
      'THE ONE EGRESS FOR SHOP CONTENT TO A THIRD PARTY. The seller asks for a draft; ' +
      'the listing title, tags and description go to the provider named in ' +
      'lib/ai/provider-terms.ts and nowhere else. Privacy §3 discloses exactly this, ' +
      'and the no-training promise about the provider rests on that record.',
  },
}

/** The types and functions that carry a seller's shop content. */
const SHOP_CONTENT = [
  'EtsyListing',
  'EtsyOrder',
  'StoredOrder',
  'DraftListingRequest',
  'AiRequest',
  'renderRequest',
] as const

/**
 * A `fetch` whose URL is a relative path — the browser calling this product's
 * own API.
 *
 * FOUND BY RUNNING THIS: components/sync/refresh-trigger.tsx posts to
 * /api/sync/refresh and the first draft of the sweep called it an egress. It
 * is the opposite of one. The bytes go from the seller's own browser to our
 * own server, carry no shop content at all (an aggregate name), and reach no
 * third party.
 *
 * Checked mechanically rather than allowlisted, because the property that
 * makes it safe is the relative URL. `fetch('https://…')` in the same file
 * would be an egress and is caught.
 */
function onlyCallsOwnApi(text: string): boolean {
  const calls = [...text.matchAll(/\bfetch\s*\(\s*(['"`])([^'"`]*)\1/g)]
  if (calls.length === 0) return false
  const otherPrimitives = TRANSMITS.filter((p) => p !== FETCH_CALL).some((p) => p.test(text))
  if (otherPrimitives) return false
  // Every fetch in the file must name a path on this origin.
  const allRelative = calls.every((m) => (m[2] ?? '').startsWith('/'))
  const bareFetches = [...text.matchAll(/\bfetch\s*\(/g)].length
  return allRelative && bareFetches === calls.length
}

function transmits(file: string): boolean {
  const text = code(file)
  if (!TRANSMITS.some((pattern) => pattern.test(text))) return false
  return !onlyCallsOwnApi(text)
}

function carriesShopContent(file: string): boolean {
  const text = code(file)
  return SHOP_CONTENT.some((name) => new RegExp(`\\b${name}\\b`).test(text))
}

describe('shop content has exactly one egress', () => {
  it('finds the product it is sweeping, and the egress it is reasoning about', () => {
    /*
     * Anti-vacuity, and the assertion that matters most: every rule below is
     * satisfied perfectly by a tree with no network calls and no shop content
     * in it. This states what the product is known to contain.
     */
    expect(files.length).toBeGreaterThan(200)
    expect(files).not.toContain(SELF)
    expect(files.filter(carriesShopContent).length).toBeGreaterThanOrEqual(10)
    expect(Object.keys(EGRESS).length).toBeGreaterThanOrEqual(4)
    for (const egress of Object.keys(EGRESS)) {
      expect(files, `${egress} is gone; the allowlist describes a file that no longer exists`)
        .toContain(egress)
      expect(transmits(egress), `${egress} no longer reaches the network`).toBe(true)
    }
  })

  it('and the sweep finds no egress the allowlist does not name', () => {
    const found = files.filter(transmits).sort()
    expect(
      found,
      'a module reaches the network and is not on the egress allowlist in this file. ' +
        'Add it there with where it sends and what it sends, or route it through an ' +
        'existing client.',
    ).toEqual(Object.keys(EGRESS).sort())
  })

  it('and exactly one of them sends shop content to a third party', () => {
    /*
     * The sentence this guard exists for. Etsy is not a third party for this
     * purpose — it is where the content came from and the party the seller
     * authorised — so the question is how many OTHER destinations can ever
     * receive it.
     */
    const thirdParty = Object.entries(EGRESS)
      .filter(([, entry]) => entry.to !== 'ETSY')
      .filter(([file]) => carriesShopContent(file))
      .map(([file]) => file)
    expect(thirdParty).toEqual(['lib/ai/claude.ts'])
  })

  it('and the serialiser that turns shop content into a payload has one caller', () => {
    /*
     * renderRequest() is the only function in the product that renders a
     * seller's listing text into a string for somebody else to read. A second
     * caller is a second destination even if it shares a transport, so this is
     * the tighter half of the rule above.
     */
    const callers = files.filter(
      (f) => f !== 'lib/ai/prompt.ts' && /\brenderRequest\s*\(/.test(code(f)),
    )
    expect(callers).toEqual(['lib/ai/claude.ts'])
  })

  it('and the keyword data seam carries no shop content and no network call', () => {
    /*
     * ── THE ROW ITEM 18 POINTS AT, MADE EXPLICIT ─────────────────────────
     *
     * Section 5, item 18 forbids transferring member data to third parties.
     * The next third party this product will have is a bought keyword data
     * provider, and the place its adapter goes is lib/signals/live.ts — empty
     * today, holding a null constructor.
     *
     * The sweep above already covers it structurally: a `fetch` in that file
     * makes it an egress the allowlist does not name, and a shop-content type
     * in it makes it a second third-party egress. Both fail. This assertion
     * states the contract AT the file, because emergent coverage is coverage
     * nobody reads — and docs/ETSY-COMPLIANCE.md cites this test for item 18,
     * so the citation should point at something a reader can find.
     *
     * A keyword lookup may send the term the seller typed. That is the
     * seller's own query, not member data, and not shop content.
     */
    const seam = 'lib/signals/live.ts'
    expect(files, 'the keyword data seam is gone').toContain(seam)
    expect(
      transmits(seam),
      'the keyword data seam now reaches the network. Put it on the egress allowlist ' +
        'with what it sends, and check it is not sending shop content.',
    ).toBe(false)
    expect(
      carriesShopContent(seam),
      'the keyword data seam now references a shop-content type. A keyword lookup sends ' +
        'the term the seller typed — never a listing, an order, a cost or a title. ' +
        'Section 5, item 18.',
    ).toBe(false)
  })

  it('and no module outside lib/ai imports the provider SDK', () => {
    const importers = files.filter((f) =>
      new RegExp(`from '${AI_PROVIDER_SDK.replace('/', '\\/')}'`).test(code(f)),
    )
    expect(importers).toEqual(['lib/ai/claude.ts'])
  })
})

/* ──────────────────────────── the accumulation ─────────────────────────── */

const SCHEMA = 'db/schema/index.ts'

/** Columns that mean a table holds a seller's own shop content. */
const CONTENT_COLUMNS = [
  'title',
  'description',
  'tags',
  'items',
  'input',
  'output',
  'summary',
  'sku',
  'record',
  'etsyListingId',
  'etsyReceiptId',
]

interface Table {
  name: string
  columns: string[]
  shopScoped: boolean
}

function tables(): Table[] {
  const source = code(SCHEMA)
  const out: Table[] = []
  const pattern = /export const \w+ = pgTable\(\s*\n?\s*'([a-z_]+)'/g
  for (const match of source.matchAll(pattern)) {
    const start = match.index + match[0].length
    const next = source.indexOf('export const ', start)
    const body = source.slice(start, next === -1 ? source.length : next)
    out.push({
      name: match[1] ?? '',
      columns: CONTENT_COLUMNS.filter((c) =>
        new RegExp(`\\b${c}:\\s*(text|jsonb|varchar|integer|numeric)\\(`).test(body),
      ),
      shopScoped: /shopId:\s*text\('shop_id'\)/.test(body),
    })
  }
  return out
}

/**
 * Every table that holds shop content, and why it is not a corpus.
 *
 * Same contract as the egress list: the sweep must find exactly these, so a
 * new store of listing or order content forces somebody to write the sentence.
 */
const CONTENT_STORES: Record<string, string> = {
  listings: 'The mirror of the seller’s own catalogue. Etsy §5 governs how long it is kept and docs/legal §5 states the position.',
  listing_variations:
    'Variations of the same mirrored listings — a variation name, price, quantity and SKU, all of it the seller’s own.',
  orders: 'The seller’s own receipts. No buyer identity is stored — tests/integration/orders-sync.int.ts sweeps information_schema for it.',
  order_items: 'Line items of those receipts.',
  actions:
    'Action Center findings. Carries a generated title about the seller’s own shop, has no insert site at all, and is recalculated on every read.',
  change_jobs:
    'The seller’s own change history: before and after for every field a bulk edit touched. They read it on /listings/change-history and rollback needs it. A record the seller can see and reverse is not a corpus.',
  ai_generations:
    'A prompt-and-completion store — the canonical corpus shape — which is why it has its own assertion below. It exists in the schema and nothing writes it.',
  audit_records:
    'The append-only action log. `record` is a jsonb of what was attempted, so it can carry field values — which is why it is listed here rather than assumed harmless. Shop-scoped, no editor (lib/repositories has no update path for it), and the seller exports it from Settings.',
}

describe('nothing stores shop content where it could accumulate', () => {
  it('finds the schema it is reasoning about', () => {
    const all = tables()
    expect(all.length).toBeGreaterThan(20)
    expect(all.filter((t) => t.columns.length > 0).length).toBeGreaterThanOrEqual(6)
  })

  it('and every store of shop content is named, with a reason', () => {
    const holders = tables()
      .filter((t) => t.columns.length > 0)
      .map((t) => t.name)
      .sort()
    expect(
      holders,
      'a table holds listing or order content and is not described in CONTENT_STORES. ' +
        'Say what it is for and why it is not a corpus.',
    ).toEqual(Object.keys(CONTENT_STORES).sort())
  })

  it('and every one of them is scoped to a single shop', () => {
    /*
     * The pooling half. You cannot train on per-shop rows without pooling
     * them first, and a table with no shop_id is already pooled. RLS and the
     * ShopContext argument carry this at runtime; this is the structural
     * precondition both of them rest on.
     */
    const unscoped = tables()
      .filter((t) => t.columns.length > 0 && !t.shopScoped)
      .map((t) => `${t.name} (${t.columns.join(', ')})`)
    expect(
      unscoped,
      'a table holds shop content with no shop_id. An unscoped store of listing text ' +
        'is the shape a training corpus has.',
    ).toEqual([])
  })

  it('and nothing writes the prompt-and-completion table', () => {
    /*
     * The specific candidate. input + output pairs are what a fine-tune
     * consumes, and this table has had the right columns and no writer since
     * it was created. Privacy §2 and §5 were corrected to say drafts are not
     * kept; tests/unit/legal-claims.test.ts holds the document side.
     */
    const writers = files.filter((f) => /insert\(schema\.aiGenerations\b/.test(code(f)))
    expect(
      writers,
      'something now inserts into ai_generations. That is a store of prompts and model ' +
        'outputs: Privacy §2 and §5 must stop saying drafts are not kept, and the ' +
        'no-training sentence in Terms §6 has to be re-read against it.',
    ).toEqual([])
  })

  it('and no log line carries shop content', () => {
    /*
     * The quietest corpus available. Logs accumulate, outlive the row, and go
     * wherever logs are shipped; lib/observability/redact.ts strips
     * credentials, not prose. So the FIELDS object of every log call is swept.
     *
     * ── TWO THINGS THE FIRST DRAFT GOT WRONG, BOTH FOUND BY RUNNING IT ───
     *
     * It matched `log.` with a word boundary, so a module that imported the
     * logger under any other name — `import { log as auditLog }` — was
     * invisible to it. The negative control for this assertion was written
     * that way by accident and passed, which is how it was found. It now
     * matches any identifier ending in `log` or `logger`, case-insensitively.
     *
     * And it ended the call at the first `\n})`, which is a guess about
     * formatting rather than about syntax. The argument list is now found by
     * matching parentheses, so a one-line call and a nested object are both
     * read correctly and nothing after the call is scanned.
     */
    const CONTENT_FIELDS = [
      'title',
      'description',
      'tags',
      'listingText',
      'prompt',
      'completion',
      'draft',
    ]

    /** The text between a call's opening paren and its matching close. */
    function argumentsAt(text: string, openParen: number): string {
      let depth = 0
      for (let i = openParen; i < text.length; i += 1) {
        const ch = text[i]
        if (ch === '(') depth += 1
        else if (ch === ')') {
          depth -= 1
          if (depth === 0) return text.slice(openParen + 1, i)
        }
      }
      return text.slice(openParen + 1)
    }

    const offenders: string[] = []
    for (const file of files) {
      const text = code(file)
      for (const match of text.matchAll(/\b\w*(?:log|logger)\.(?:debug|info|warn|error)\(/gi)) {
        const call = argumentsAt(text, match.index + match[0].length - 1)
        for (const field of CONTENT_FIELDS) {
          if (new RegExp(`\\b${field}\\s*:`).test(call)) {
            offenders.push(`${file}: a log call carries \`${field}\``)
          }
        }
      }
    }
    expect(
      offenders,
      'shop content in a log line is a store of shop content. Log an identifier instead.',
    ).toEqual([])
  })

  it('and no telemetry call carries shop content', () => {
    /*
     * The other quiet one. Every telemetry adapter is a Noop today
     * (lib/telemetry/noop.ts, tests/unit/telemetry.test.ts), so the risk is
     * not what is sent now but what a call site would start sending the day
     * one is configured.
     */
    const offenders: string[] = []
    for (const file of files) {
      const text = code(file)
      for (const match of text.matchAll(/\b(?:track|capture|identify)\(([\s\S]{0,300}?)\)/g)) {
        const call = match[1] ?? ''
        for (const field of ['title', 'description', 'tags', 'prompt', 'completion']) {
          if (new RegExp(`\\b${field}\\s*[,:]`).test(call)) {
            offenders.push(`${file}: a telemetry call carries \`${field}\``)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })
})

/* ──────────────────── the half that cannot be enforced ─────────────────── */

describe('the provider half is recorded rather than checked', () => {
  it('records the provider the adapter actually talks to', () => {
    /*
     * The one thing worth guarding about somebody else's terms: that the
     * record describes the provider in use. A swap to a different SDK fails
     * here, which is exactly when "that provider does not train on it either"
     * would otherwise go stale with nobody noticing.
     */
    const adapter = code('lib/ai/claude.ts')
    expect(adapter).toContain(`from '${AI_PROVIDER_TERMS.sdk}'`)
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(
      Object.keys(pkg.dependencies ?? {}),
      'the recorded SDK is not a dependency of this product',
    ).toContain(AI_PROVIDER_TERMS.sdk)
  })

  it('and the Privacy Policy names the same provider in its sub-processor table', () => {
    const privacy = readFileSync('docs/legal/PRIVACY-POLICY-DRAFT.md', 'utf8')
    const section = privacy.slice(privacy.indexOf('## 4.'), privacy.indexOf('## 5.'))
    expect(
      section,
      'the sub-processor table does not name the provider shop content is sent to',
    ).toContain(AI_PROVIDER_TERMS.provider)
  })

  it('and both halves of the §3 promise are still in the document', () => {
    const privacy = readFileSync('docs/legal/PRIVACY-POLICY-DRAFT.md', 'utf8')
    const terms = readFileSync('docs/legal/TERMS-OF-SERVICE-DRAFT.md', 'utf8')
    const ours = 'to train artificial intelligence models'
    expect(privacy, 'Privacy §3 no longer makes the no-training promise').toContain(ours)
    expect(terms, 'Terms §6 no longer makes the no-training promise').toContain(ours)
    // The provider half, which this guard cannot enforce and therefore names.
    expect(privacy).toContain('does not train on it either')
  })

  it('and says plainly whether a person has read the clause', () => {
    /*
     * Not an assertion that it HAS been read — that is the owner's to do, and
     * a test that demanded it would be red on a true statement. What is
     * asserted is that the record distinguishes the two and that the surface
     * renders the distinction, so "relied upon" is never displayed as
     * "checked".
     */
    expect(typeof providerClauseWasRead()).toBe('boolean')
    const note = providerTermsNote()
    expect(note).toContain(AI_PROVIDER_TERMS.provider)
    expect(note).toContain(AI_PROVIDER_TERMS.document)
    expect(note).toContain(AI_PROVIDER_TERMS.recordedOn)
    if (!providerClauseWasRead()) {
      expect(
        note,
        'the record says nobody has read the clause and the note does not say so',
      ).toMatch(/relied upon rather than checked/)
    }
    expect(AI_PROVIDER_TERMS.recordedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Number.isNaN(Date.parse(AI_PROVIDER_TERMS.recordedOn))).toBe(false)
  })
})
