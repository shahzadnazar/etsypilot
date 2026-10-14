import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   EVERY NETWORK CALL IN THIS PRODUCT IS ON A LIST, WITH WHERE IT GOES AND
 *   WHAT IT CARRIES. SHOP CONTENT LEAVES FOR NOBODY BUT ETSY.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── WHY THIS FILE IS NOT CALLED no-training ANY MORE ──────────────────────
 *
 * It was. The AI Copilot was the one feature that sent a seller's listing text
 * to a third party, and this rule was built to hold the sentence in Terms §6
 * and Privacy §3: "We do not use your shop data or your content to train
 * artificial intelligence models."
 *
 * The Copilot is gone — D95, archived on `with-ai-and-extension`. The half of
 * this file that was about a model went with it: there is no provider, no SDK,
 * no prompt, and nothing that could send a listing to one, so assertions about
 * which SDK the adapter imports and how many third-party egresses carry shop
 * content had nothing left to check.
 *
 * THE REST IS NOT ABOUT AI AND NEVER WAS. "Every network call is named, and
 * none of them outside Etsy carries shop content" is a statement about the
 * whole product. It is the mechanism docs/ETSY-COMPLIANCE.md leans on for
 * Section 5 item 18 — transferring member data to third parties — and it is
 * what will stop the keyword data adapter, when somebody writes it, from
 * posting listing text to a provider. A rule named after a feature that no
 * longer exists is a rule somebody deletes along with the feature, so it is
 * named after what it does.
 *
 * ── THE TWO HALVES, AND WHY BOTH SURVIVED ─────────────────────────────────
 *
 *   EGRESS. Four network calls in app/, components/, domain/ and lib/, each on
 *   the allowlist below with its destination and payload. It was five; the AI
 *   provider was the fifth. No egress outside Etsy may reference a
 *   shop-content type, which is a stronger statement than the one it replaced
 *   ("exactly one does") and is checkable the same way.
 *
 *   POOLING. Eight tables hold listing or order content; each is named with
 *   why it is not a corpus, and each carries a shop_id. This was worth
 *   re-asking with the Copilot gone, and the answer is that it matters MORE.
 *   The no-training commitment in Terms §6 and Privacy §3 did not go with the
 *   feature — it is the owner's commitment to Etsy and to sellers, it is true,
 *   and it stays true with or without an AI feature. With no egress, an
 *   unscoped pool of listing text is the only remaining shape that could make
 *   it false: by us, or by anybody who ends up holding the database. And
 *   `ai_generations` is still in the schema, because an applied migration is
 *   never edited — a prompt-and-completion table with no writer is now MORE
 *   likely to mislead a future reader into thinking a feature exists, not
 *   less, so the assertion that nothing writes it stays.
 */

const ROOTS = ['app', 'components', 'domain', 'lib']

/** This file names the things it bans in order to ban them. */
const SELF = 'tests/unit/egress-boundary.test.ts'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((root) => walk(root)).sort()

/**
 * `code()`, read once per file.
 *
 * ── A GUARD THAT CAN TIME OUT IS A GUARD THAT GETS DELETED ───────────────
 *
 * Seven of the assertions below sweep the whole tree, and each called `code()`
 * again — about 1,250 reads of some 250 files per run. That is fine on a warm
 * cache and it is not fine on a cold one: one full-suite run took 6.4 seconds
 * on the first sweep and tripped vitest's 5-second default, which reports as a
 * failing test rather than as a slow one. It passed alone and on three
 * re-runs, so nothing was wrong with the rule — but a rule that goes red for
 * reasons unrelated to what it checks is a rule somebody switches off, which
 * is a lesson this repository has already recorded about Windows path
 * failures.
 *
 * One read per file, memoised for the run. The sweeps are unchanged.
 */
const sources = new Map<string, string>()

function source(file: string): string {
  let text = sources.get(file)
  if (text === undefined) {
    text = code(file)
    sources.set(file, text)
  }
  return text
}

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
type Destination = 'ETSY' | 'AUTH_PROVIDER'

/**
 * Every egress in the product, with its destination and why it is allowed.
 *
 * The sweep below must find exactly these files. A new one is a new place shop
 * content could leave from, and the author has to come here and say where it
 * goes — which is the whole mechanism.
 *
 * FOUR. It was five until D95 removed the AI Copilot and with it
 * `lib/ai/claude.ts`, which was the only egress that carried a seller's
 * listing text to anybody but Etsy. Nothing replaced it: there is no
 * third-party destination in this product at all now, which is why the
 * assertion below reads "none" rather than "one".
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
  const text = source(file)
  if (!TRANSMITS.some((pattern) => pattern.test(text))) return false
  return !onlyCallsOwnApi(text)
}

function carriesShopContent(file: string): boolean {
  const text = source(file)
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

  it('and NONE of them sends shop content to a third party', () => {
    /*
     * The sentence this guard exists for, and it got stronger rather than
     * weaker. It read `toEqual(['lib/ai/claude.ts'])` — exactly one — because
     * the AI Copilot sent listing text to a model. With the Copilot gone there
     * is no third-party destination left: Etsy is not one for this purpose (it
     * is where the content came from and the party the seller authorised), and
     * the two auth egresses carry a credential.
     *
     * This is the assertion a future keyword data adapter will meet. A
     * clickstream provider may receive the term the seller typed; the moment
     * its module also references a listing, an order or a cost, it becomes a
     * third-party egress for shop content and fails here.
     */
    const thirdParty = Object.entries(EGRESS)
      .filter(([, entry]) => entry.to !== 'ETSY')
      .filter(([file]) => carriesShopContent(file))
      .map(([file]) => file)
    expect(
      thirdParty,
      'a network call outside Etsy references a shop-content type. Shop content has no ' +
        'third-party destination in this product — Section 5, item 18.',
    ).toEqual([])
  })

  /*
   * ── TWO ASSERTIONS WENT WITH THE FEATURE ───────────────────────────────
   *
   * There was a rule that `renderRequest()` — the only function that rendered
   * a seller's listing text into a string for somebody else to read — had
   * exactly one caller, and a rule that no module outside lib/ai imported the
   * provider SDK. Both described lib/ai, which no longer exists, so both would
   * now pass by sweeping nothing. The assertion below replaces them with the
   * stronger fact: there is no AI provider SDK in this product at all.
   */
  it('and no AI provider SDK is a dependency of this product', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const installed = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]
    for (const sdk of ['@anthropic-ai/sdk', 'openai', '@google/generative-ai', 'cohere-ai']) {
      expect(installed, `${sdk} is installed and there is no AI feature to use it`).not.toContain(sdk)
    }
    // And nothing in the tree imports one under any name.
    const importers = files.filter((f) => /@anthropic-ai\/sdk|from 'openai'/.test(source(f)))
    expect(importers, 'a module imports an AI provider SDK').toEqual([])
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
    const writers = files.filter((f) => /insert\(schema\.aiGenerations\b/.test(source(f)))
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
      const text = source(file)
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
      const text = source(file)
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

/* ─────────── the commitment that outlived the feature ─────────────────── */

describe('the no-training commitment, with no AI in the product', () => {
  it('is still made in both documents', () => {
    /*
     * Terms §6 and Privacy §3 both say "We do not use your shop data or your
     * content to train artificial intelligence models." That sentence did NOT
     * go with the Copilot and must not: it is the owner's commitment to Etsy
     * and to sellers, it was true when there was a model and it is true now,
     * and Section 5 item 25 of Etsy's API Terms names AI training explicitly.
     *
     * What did go is the sentence beside it that described the feature —
     * "the listing text is sent to our AI provider to produce it; that
     * provider does not train on it either". With no AI feature the first half
     * describes something that cannot happen and the second vouches for a
     * provider that is not there.
     */
    const privacy = readFileSync('docs/legal/PRIVACY-POLICY-DRAFT.md', 'utf8')
    const terms = readFileSync('docs/legal/TERMS-OF-SERVICE-DRAFT.md', 'utf8')
    const commitment = 'to train artificial intelligence models'
    expect(privacy, 'Privacy §3 no longer makes the no-training commitment').toContain(commitment)
    expect(terms, 'Terms §6 no longer makes the no-training commitment').toContain(commitment)

    /*
     * ── SCOPED TO §3, AND IT HAS TO BE ────────────────────────────────────
     *
     * Read against the whole document this went red on §2, which says in as
     * many words that listing text "was sent to our AI provider when you
     * asked for a draft" — past tense, recording what the section used to
     * disclose. That is the document doing its job: a privacy policy that
     * drops a disclosure silently leaves a reader unable to tell whether the
     * practice stopped or the sentence did.
     *
     * A guard satisfiable only by deleting that record would eventually be
     * satisfied by deleting it. So the assertion is about the CLAIM, which
     * lives in §3, and `[[CONFIRM]]` notes are stripped for the same reason.
     */
    const section3 = privacy
      .slice(privacy.indexOf('## 3.'), privacy.indexOf('## 4.'))
      .replace(/`\[\[CONFIRM:[\s\S]*?\]\]`/g, '')
    expect(section3.length, 'the Privacy Policy no longer has a section 3').toBeGreaterThan(400)
    expect(
      section3,
      'Privacy §3 still vouches for an AI provider, and there is no AI provider',
    ).not.toContain('does not train on it either')
    expect(
      section3,
      'Privacy §3 still says listing text is sent to an AI provider',
    ).not.toMatch(/sent to our AI provider/)
    /*
     * ── AND IT STANDS ON ITS OWN, WHICH IS A THIRD POSITION ───────────────
     *
     * This line first required §3 to name the provider that received listing
     * text (true while the Copilot existed), then to say there was none.
     * Neither document mentions the feature at all now — the owner's
     * decision, recorded in D95 — so what is checked is that the commitment
     * is framed as a standing rule rather than left bare: a promise with no
     * scope reads as being about whatever the reader last heard of, and this
     * one is about every piece of data held for the seller.
     *
     * tests/unit/legal-claims.test.ts owns the rest of this rule, including
     * the sweep that fails if either document mentions the feature again.
     */
    expect(
      section3.replace(/\s+/g, ' '),
      'Privacy §3 makes the no-training promise without saying what it covers',
    ).toMatch(/standing limit on what we may do with your data/i)
  })

  it('and there is nothing in the product that could break it', () => {
    /*
     * The two halves above, in one sentence: no egress carries shop content to
     * a third party, and no store of shop content exists that is not scoped to
     * one shop. Asserted here as a single statement so a reader of
     * docs/ETSY-COMPLIANCE.md items 18 and 25 has one place to look.
     */
    const thirdPartyEgress = Object.entries(EGRESS)
      .filter(([, entry]) => entry.to !== 'ETSY')
      .filter(([file]) => carriesShopContent(file))
    expect(thirdPartyEgress).toEqual([])

    const unscoped = tables().filter((t) => t.columns.length > 0 && !t.shopScoped)
    expect(unscoped).toEqual([])

    const generationWriters = files.filter((f) =>
      /insert\(schema\.aiGenerations\b/.test(source(f)),
    )
    expect(generationWriters).toEqual([])
  })
})
