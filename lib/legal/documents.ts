import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE LEGAL PAGES READ THE MARKDOWN IN docs/legal/. THERE IS NO SECOND
 *   COPY OF THE TEXT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The documents were corrected against the code before they were published —
 * nine factual errors, found by reading the code rather than the prose. If the
 * page carried its own copy of that text in JSX, the next correction would fix
 * the document and leave the page lying, which is the exact failure the
 * documents' own opening sentence warns about:
 *
 *     "Every factual claim below was written to match what the software
 *      actually does — if the software changes, this document must change
 *      with it."
 *
 * So: one source, read at request time. Correcting docs/legal/ corrects the
 * page, and `tests/unit/legal-claims.test.ts` fails if the page stops reading
 * from there.
 *
 * ── WHY fs AND NOT AN IMPORT ──────────────────────────────────────────────
 *
 * Importing markdown as a string needs a bundler loader, which would make the
 * text a build-time snapshot and put a webpack rule between a lawyer's
 * correction and the page. `readFileSync` keeps the file the file. The cost is
 * that a deployment must ship docs/legal/ — handled by
 * `outputFileTracingIncludes` in next.config.ts, which names these files so
 * Next's tracer includes them in the server bundle.
 *
 * Read once per process and cached, because these files change on deploy, not
 * on request, and a policy page should not do disk I/O per visitor.
 */

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type LegalSlug = 'terms' | 'privacy'

interface LegalDocumentSource {
  /** Path under the repository root. */
  file: string
  /** The <h1> the page shows, and the <title>. */
  title: string
  /** Where the page lives. */
  href: string
}

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocumentSource> = {
  terms: {
    file: 'docs/legal/TERMS-OF-SERVICE-DRAFT.md',
    title: 'Terms of Service',
    href: '/legal/terms',
  },
  privacy: {
    file: 'docs/legal/PRIVACY-POLICY-DRAFT.md',
    title: 'Privacy Policy',
    href: '/legal/privacy',
  },
}

export interface LegalDocument {
  slug: LegalSlug
  title: string
  href: string
  /** The whole file, including its draft banner and its notes to the lawyer. */
  raw: string
  /** The body, with the H1, the draft banner and the lawyer's notes removed. */
  body: string
  /** What the document says about itself, verbatim: "[[DATE]]" while unfilled. */
  lastUpdated: string
  /** Distinct `[[PLACEHOLDER]]` names still unfilled, in order of appearance. */
  placeholders: string[]
  /** sha256 of the file, so a version is a fact about content, not a number. */
  contentHash: string
}

/*
 * The notes to the reviewing lawyer are part of the FILE and must not be part
 * of the PAGE. They are working notes — "confirm there is an operational
 * process behind it", "the liability cap should be checked" — addressed to
 * somebody who is not the reader, and publishing them would both confuse a
 * seller and hand a counterparty a list of the document's own soft spots.
 *
 * They are kept in the markdown deliberately: the verification trail belongs
 * with the document, not in a separate file somebody forgets to open.
 */
const LAWYER_NOTES_HEADING = '## Notes for the lawyer reviewing this'

function parse(slug: LegalSlug): LegalDocument {
  const source = LEGAL_DOCUMENTS[slug]
  const raw = readFileSync(join(process.cwd(), source.file), 'utf8')

  const notesAt = raw.indexOf(LAWYER_NOTES_HEADING)
  let body = notesAt === -1 ? raw : raw.slice(0, notesAt)

  /*
   * Drop the H1 — the page renders its own, with the document's date beside
   * it — and the preamble above the first `---`, which is addressed to the
   * reviewer rather than the reader. The draft banner is NOT simply dropped:
   * the page renders it as a state, loudly, from `placeholders` below.
   */
  const firstRule = body.indexOf('\n---\n')
  if (firstRule !== -1) body = body.slice(firstRule + '\n---\n'.length)

  const lastUpdated = /Last updated:\s*`?\[?\[?([^`\n\]]+)\]?\]?`?/.exec(raw)?.[1]?.trim() ?? ''

  /*
   * `[[LEGAL_ENTITY]]` and friends. The `[[CONFIRM: …]]` notes are NOT counted
   * here and are counted separately below: a CONFIRM is a question for the
   * lawyer about a sentence that is already true, while a bare placeholder is a
   * blank in the agreement itself. Both block publication; only one of them
   * means "a seller would be accepting a blank".
   */
  const placeholders = [
    ...new Set([...raw.matchAll(/\[\[([A-Z][A-Z0-9_]*)\]\]/g)].map((m) => m[1]!)),
  ]

  return {
    slug,
    title: source.title,
    href: source.href,
    raw,
    body: body.trim(),
    lastUpdated,
    placeholders,
    contentHash: createHash('sha256').update(raw).digest('hex'),
  }
}

const cache = new Map<LegalSlug, LegalDocument>()

/*
 * ── TEST SEAM ─────────────────────────────────────────────────────────────
 *
 * Same shape and same reason as setEtsyService and setBillingProvider (D28):
 * a test needs to present a FINISHED pair of documents, because almost every
 * integration suite syncs a shop, and syncing refuses while the real documents
 * carry `[[LEGAL_ENTITY]]` — which is correct behaviour and would otherwise
 * make the whole suite untestable.
 *
 * Refuses outside the test environment, loudly. A function that can replace
 * the published legal documents is the last thing that should be callable
 * from a request, and `tests/unit/legal-acceptance.test.ts` additionally
 * asserts that no file under app/, domain/ or lib/ calls it.
 */
export function setLegalDocumentsForTests(raw: Partial<Record<LegalSlug, string>> | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('setLegalDocumentsForTests is a test seam and must not be called at runtime')
  }

  cache.clear()
  if (!raw) return

  for (const [slug, text] of Object.entries(raw) as [LegalSlug, string][]) {
    const source = LEGAL_DOCUMENTS[slug]
    cache.set(slug, {
      slug,
      title: source.title,
      href: source.href,
      raw: text,
      body: text,
      lastUpdated: /Last updated:\s*`?([^`\n]+)`?/.exec(text)?.[1]?.trim() ?? '',
      placeholders: [...new Set([...text.matchAll(/\[\[([A-Z][A-Z0-9_]*)\]\]/g)].map((m) => m[1]!))],
      contentHash: createHash('sha256').update(text).digest('hex'),
    })
  }
}

export function legalDocument(slug: LegalSlug): LegalDocument {
  const hit = cache.get(slug)
  if (hit) return hit
  const parsed = parse(slug)
  cache.set(slug, parsed)
  return parsed
}

export function legalDocuments(): LegalDocument[] {
  return (Object.keys(LEGAL_DOCUMENTS) as LegalSlug[]).map(legalDocument)
}

/** The `[[CONFIRM: …]]` notes, which are questions rather than blanks. */
export function confirmNotes(slug: LegalSlug): string[] {
  return [...legalDocument(slug).raw.matchAll(/\[\[CONFIRM:\s*([^\]]+)\]\]/g)].map((m) =>
    m[1]!.replace(/\s+/g, ' ').trim(),
  )
}

export interface DraftState {
  /** True when anything at all is still unfilled in either document. */
  isDraft: boolean
  /** Every distinct placeholder name across both documents. */
  placeholders: string[]
  /** How many `[[CONFIRM: …]]` notes remain, across both documents. */
  confirmCount: number
}

/*
 * ── THE ONE QUESTION EVERY SURFACE ASKS ───────────────────────────────────
 *
 * Three things depend on this answer and they must not answer it separately:
 *
 *   the footer           may it link to these pages at all
 *   the pages            do they render as a draft or as an agreement
 *   the acceptance flow  may a seller be asked to accept them
 *
 * A document carrying `[[LEGAL_ENTITY]]` names no party. Nobody can accept an
 * agreement with nobody, and a public link to one presents it as in force.
 */
export function draftState(): DraftState {
  const docs = legalDocuments()
  const placeholders = [...new Set(docs.flatMap((d) => d.placeholders))]
  const confirmCount = (Object.keys(LEGAL_DOCUMENTS) as LegalSlug[]).reduce(
    (total, slug) => total + confirmNotes(slug).length,
    0,
  )
  return { isDraft: placeholders.length > 0 || confirmCount > 0, placeholders, confirmCount }
}

/** May these pages be linked from a public surface, or offered for acceptance? */
export function legalDocumentsInForce(): boolean {
  return !draftState().isDraft
}
