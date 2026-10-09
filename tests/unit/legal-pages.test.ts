import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

import { code } from '../support/shop-scoping'
import { LEGAL_PAGES } from '@/domain/legal/pages'
import { Markdown, blocks, inline, slugify } from '@/lib/markdown/render'
import { documentBody, legalDocument } from '@/lib/legal/documents'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE DOCUMENTS WERE IN THE REPOSITORY AND NOBODY COULD READ THEM.
 *   /legal/terms WAS A 404, AND THE OWNER FOUND THAT BY LOADING A URL.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The previous pass corrected nine false claims in the two legal documents and
 * built a guard to keep them true. It did not build the pages, and it did not
 * say so — which is a worse failure than the nine errors, because a document
 * nobody can read protects nobody.
 *
 * So this file checks the thing that was missed: that the routes exist, that
 * they render FROM the markdown rather than from a copy of it, and that the
 * placeholder rule holds on every public surface.
 */

const PAGE_DIR = 'app/(public)/legal'

function pageFile(href: string): string {
  return `${PAGE_DIR}/${href.replace('/legal/', '')}/page.tsx`
}

describe('the four legal routes exist', () => {
  it('has a page for every entry in the registry, and a registry entry for every page', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(LEGAL_PAGES.length).toBe(4)

    for (const page of LEGAL_PAGES) {
      expect(
        existsSync(pageFile(page.href)),
        `${page.href} is in LEGAL_PAGES and ${pageFile(page.href)} does not exist — this is exactly the 404 that was shipped last time`,
      ).toBe(true)
    }

    /*
     * And the reverse: a page nobody links to is how /settings/export came to
     * be promised before it existed, in the other direction.
     */
    const hrefs = new Set(LEGAL_PAGES.map((p) => p.href))
    for (const slug of ['terms', 'privacy', 'subprocessors', 'etsy']) {
      expect(hrefs.has(`/legal/${slug}`), `${slug} has a page and no registry entry`).toBe(true)
    }
  })

  it('is in the (public) group, so a visitor with no account can read it', () => {
    /*
     * Not (dashboard), which reads a session and redirects to /login. A seller
     * reads the terms BEFORE signing up, and an Etsy reviewer checking an API
     * application has no account at all.
     */
    expect(PAGE_DIR.includes('(public)')).toBe(true)
    for (const page of LEGAL_PAGES) {
      const source = code(pageFile(page.href))
      expect(source, `${page.href} reads a session`).not.toMatch(/getSession\(/)
      expect(source, `${page.href} redirects`).not.toMatch(/redirect\(/)
    }
  })
})

describe('the pages render from the markdown, not from a copy of it', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════════
   *   THE WHOLE POINT. A PAGE WITH ITS OWN COPY OF THE TEXT IS A SECOND
   *   DOCUMENT THAT NOBODY WILL REMEMBER TO CORRECT.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Nine corrections were made to these documents in one sitting. If the pages
   * carried the prose in JSX, the tenth correction would fix the file and
   * leave the page stating the thing that was just found to be false.
   */
  it('reads docs/legal/ at request time', () => {
    const loader = code('lib/legal/documents.ts')
    expect(loader).toMatch(/docs\/legal\/TERMS-OF-SERVICE-DRAFT\.md/)
    expect(loader).toMatch(/docs\/legal\/PRIVACY-POLICY-DRAFT\.md/)
    expect(loader).toMatch(/readFileSync/)

    for (const slug of ['terms', 'privacy'] as const) {
      const source = code(pageFile(`/legal/${slug}`))
      expect(source, `${slug} does not read the document`).toMatch(/legalDocument\('/)
    }
  })

  it('carries no sentence of the documents in its own source', () => {
    /*
     * Sampled rather than exhaustive, and the samples are the sentences that
     * matter: the ones the last pass had to correct. If any of them appears in
     * a .tsx file, somebody has started a second copy.
     */
    const sentences = [
      'We never receive or store your Etsy password',
      'Our staff cannot write to your shop',
      'Refused write attempts are recorded in your audit log',
      'Database row-level security is enabled on every table',
    ]

    const pages = LEGAL_PAGES.map((p) => code(pageFile(p.href))).join('\n')
    for (const sentence of sentences) {
      expect(
        pages.includes(sentence),
        `a legal page contains the document's own words ("${sentence}") — render it from docs/legal/ instead`,
      ).toBe(false)
    }

    // And the sentences really are in the documents, so the check above is not
    // passing because it is looking for nothing.
    const privacy = readFileSync('docs/legal/PRIVACY-POLICY-DRAFT.md', 'utf8')
    const terms = readFileSync('docs/legal/TERMS-OF-SERVICE-DRAFT.md', 'utf8')
    for (const sentence of sentences) {
      expect(
        `${privacy}\n${terms}`.includes(sentence),
        `the sample sentence "${sentence}" is no longer in either document, so this guard checks nothing`,
      ).toBe(true)
    }
  })

  it('shows each document its own last-updated date, not a constant', () => {
    const view = code('components/legal/document-view.tsx')
    expect(view).toMatch(/document\.lastUpdated/)

    /*
     * All FOUR pages, including the two that are not a whole document:
     * /legal/subprocessors renders §4 of the Privacy Policy and /legal/etsy
     * draws on §12 of the Terms, and a reader of either is owed the age of
     * the text. Both shipped without it at first.
     */
    for (const page of LEGAL_PAGES) {
      const source = code(pageFile(page.href))
      /*
       * `<DocumentView` counts because the assertion above has already proved
       * that component renders `document.lastUpdated`; the two documents
       * delegate to it, and the two part-pages use <DocumentDate> directly.
       */
      expect(
        /lastUpdated|<DocumentDate|<DocumentView/.test(source),
        `${page.href} shows no last-updated date`,
      ).toBe(true)
    }
    // No hardcoded date anywhere in the legal surfaces.
    for (const file of [...LEGAL_PAGES.map((p) => pageFile(p.href)), 'components/legal/document-view.tsx']) {
      expect(code(file), `${file} hardcodes a date`).not.toMatch(/20\d\d-\d\d-\d\d/)
    }
  })

  it('and the deployed server will actually have the markdown', () => {
    /*
     * readFileSync on a path built from process.cwd() is exactly what Next's
     * tracer cannot follow: the build succeeds, every test passes, and the
     * page throws ENOENT the first time somebody loads it in production. The
     * config has to name the files.
     */
    /*
     * readFileSync and not code(): the comment-stripper in the shared helper
     * treats the `/*` inside the glob 'docs/legal/*.md' as the start of a
     * comment and eats the rest of the config. Found by this assertion
     * failing against a config that plainly contained the line.
     */
    const config = readFileSync('next.config.ts', 'utf8')
    expect(config, 'next.config.ts does not include docs/legal in the server trace').toMatch(
      /outputFileTracingIncludes/,
    )
    expect(config).toMatch(/docs\/legal\/\*\.md/)
    expect(config, 'the /legal/etsy page reads the extension manifest at request time').toMatch(
      /extension\/manifest\.chrome\.json/,
    )
  })
})

describe('the markdown subset renders the documents without dropping anything', () => {
  const privacy = readFileSync('docs/legal/PRIVACY-POLICY-DRAFT.md', 'utf8')

  it('parses every line of the real document into a block', () => {
    const parsed = blocks(privacy)
    expect(parsed.length).toBeGreaterThan(40)

    /*
     * The failure this guards against is a parser that silently swallows a
     * clause. Every non-blank line of the source has to end up somewhere, so
     * the total text length of the blocks is compared against the source's.
     * Not equal — markdown punctuation is consumed — but close.
     */
    const sourceChars = privacy.replace(/\s+/g, '').length
    const parsedChars = parsed
      .map((block) => {
        switch (block.kind) {
          case 'heading':
          case 'paragraph':
          case 'quote':
            return block.text
          case 'bullets':
            return block.items.join('')
          case 'table':
            return [...block.header, ...block.rows.flat()].join('')
          case 'rule':
            return ''
        }
      })
      .join('')
      .replace(/\s+/g, '').length

    // Allow for the H1, the markdown syntax characters and the table pipes.
    expect(parsedChars / sourceChars).toBeGreaterThan(0.9)
  })

  it('renders the sub-processor table as a table', () => {
    const table = blocks(privacy).find((block) => block.kind === 'table')
    expect(table, 'the sub-processor table did not parse as a table').toBeDefined()
    if (table?.kind !== 'table') throw new Error('unreachable')
    expect(table.header).toEqual(['What', 'Why', 'Lawful basis (UK/EU GDPR)'])
    // The |---|---| row carries no content and must not become a data row.
    expect(table.rows.every((row) => !row.join('').match(/^[-:\s|]+$/))).toBe(true)
  })

  it('emits no HTML, so a document can never inject into its own page', () => {
    /*
     * The renderer builds React elements; there is no dangerouslySetInnerHTML
     * anywhere in it. That is what makes an `<img onerror=...>` typed into the
     * markdown render as those characters rather than run.
     */
    const renderer = code('lib/markdown/render.tsx')
    expect(renderer).not.toMatch(/dangerouslySetInnerHTML/)
    expect(renderer).not.toMatch(/innerHTML/)
  })

  it('leaves no stray delimiter when a code span only STARTS with a placeholder', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE DEFECT, FOUND IN A BROWSER ON /legal/terms.
     * ══════════════════════════════════════════════════════════════════════
     *
     *     source   `[[DOMAIN]]/legal/privacy`
     *     rendered DOMAIN]]/legal/privacy
     *
     * The code-span alternative matched the whole span, and the handler asked
     * "does this token START with `[[" — which it does — then stripped the
     * opening delimiter and left the closing `]]` in the prose. The documents
     * use this shape for every URL they cannot yet spell, so it was on three
     * of the four pages.
     *
     * Checked at the renderer rather than through a page, because the bug was
     * in one branch of one tokeniser and this is where it can be cornered.
     */
    const rendered = JSON.stringify(inline('see `[[DOMAIN]]/legal/privacy` for more'))

    expect(rendered, 'a closing delimiter survived into the output').not.toContain(']]')
    expect(rendered, 'an opening delimiter survived into the output').not.toContain('[[')
    // The blank is still marked, and the path after it survives.
    expect(rendered).toMatch(/legal-placeholder/)
    expect(rendered).toContain('DOMAIN')
    expect(rendered).toContain('/legal/privacy')

    /*
     * And the shapes either side of it still behave: a code span that IS
     * entirely a placeholder, and one with no placeholder in it at all.
     */
    const whole = JSON.stringify(inline('dated `[[DATE]]`'))
    expect(whole).toMatch(/legal-placeholder/)
    expect(whole).not.toContain(']]')

    const plain = JSON.stringify(inline('the `ep-reset-email` cookie'))
    expect(plain).toMatch(/"code"/)
    expect(plain).toContain('ep-reset-email')
    expect(plain, 'a plain code span was mistaken for a placeholder').not.toMatch(
      /legal-placeholder/,
    )
  })

  it('renders every placeholder shape the real documents actually use', () => {
    /*
     * Taken from the documents rather than invented: each distinct shape of
     * `[[...]]` in either file is rendered, and none may leave a bracket
     * behind. This is the check that would have caught the URL shape without
     * anybody thinking of it, because it reads the corpus instead of a
     * list somebody remembered.
     */
    const corpus = [
      readFileSync('docs/legal/TERMS-OF-SERVICE-DRAFT.md', 'utf8'),
      readFileSync('docs/legal/PRIVACY-POLICY-DRAFT.md', 'utf8'),
    ].join('\n')

    // Every run of non-space text that contains a placeholder, de-duplicated.
    const shapes = [
      ...new Set(
        [...corpus.matchAll(/\S*`?\[\[[^\]]+\]\]`?\S*/g)].map((m) => m[0]),
      ),
    ]
    expect(shapes.length, 'the corpus sweep found no placeholders').toBeGreaterThan(8)

    for (const shape of shapes) {
      const rendered = JSON.stringify(inline(shape))
      expect(rendered, `rendering ${shape} left a delimiter behind`).not.toContain(']]')
      expect(rendered, `rendering ${shape} left a delimiter behind`).not.toContain('[[')
    }
  })

  it('shows a placeholder rather than hiding it', () => {
    const nodes = inline('between you and **`[[LEGAL_ENTITY]]`**, a `[[ENTITY_TYPE]]`')
    const json = JSON.stringify(nodes)
    expect(json).toMatch(/legal-placeholder/)
    expect(json).toMatch(/LEGAL_ENTITY/)
    // The bold-wrapped code span was rendered as literal backticks once. A
    // reader must not see "`[[LEGAL_ENTITY]]`" with its punctuation.
    expect(json).not.toMatch(/\\u0060\[\[/)
    expect(json).not.toContain('`[[')
  })

  it('strips the document\u2019s own H1, so the title is not printed twice', () => {
    /*
     * Seen in a browser: /legal/terms rendered its heading and then printed
     * `# EtsyPilot — Terms of Service` below it as body text.
     *
     * The loader strips it — lib/legal/documents.ts explains why that
     * decision belongs there and not in the renderer — so this reads the
     * loader's output for both documents and checks the two halves: the H1
     * is gone, and the first thing left is the first clause.
     */
    for (const slug of ['terms', 'privacy'] as const) {
      const document = legalDocument(slug)

      expect(
        document.body.startsWith('#') && !document.body.startsWith('##'),
        `the ${slug} body still begins with the document\u2019s own H1`,
      ).toBe(false)
      expect(document.body, `the ${slug} body contains a raw H1`).not.toMatch(/^#\s+[^#]/m)

      // The first block is the first clause, not front matter.
      const first = blocks(document.body)[0]
      expect(first?.kind).toBe('heading')
      if (first?.kind === 'heading') {
        expect(first.level, `the ${slug} body opens at the wrong heading level`).toBe(2)
        expect(first.text).toMatch(/^1\./)
      }

      // And the reviewer front matter did not survive either.
      expect(document.body, `the ${slug} body still carries the draft banner`).not.toContain(
        'DRAFT FOR LEGAL REVIEW',
      )
      expect(document.body).not.toContain('Last updated')
    }
  })

  it('strips a leading H1 even with no front-matter rule to hide behind', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE TEST ABOVE PASSED WITH THE H1 STRIP DELETED, AND THIS IS WHY
     *   THIS ONE EXISTS.
     * ══════════════════════════════════════════════════════════════════════
     *
     * Removing `lines.splice(first, 1)` from the loader left the suite green,
     * because the `---` slice above it removes the title as a side effect on
     * the real documents. A test that cannot tell which line did the work is
     * not testing that line — it is the same vacuity as a sweep over an empty
     * set, and it was found by running the negative control rather than by
     * reading the test.
     *
     * So: documents with no rule at all, where only the H1 strip can save the
     * output.
     */
    expect(documentBody('# A Title\n\n## 1. First clause\n\nProse.\n')).toBe(
      '## 1. First clause\n\nProse.',
    )

    // Leading blank lines do not hide it.
    expect(documentBody('\n\n# A Title\n\n## 1. First\n')).toBe('## 1. First')

    /*
     * And only a LEADING one. An `# ` line further down is a heading somebody
     * wrote, and removing it would be losing a clause rather than
     * de-duplicating a title.
     */
    const later = documentBody('## 1. First\n\n# Not the title\n\nProse.\n')
    expect(later, 'an H1 inside the document was removed as though it were the title').toContain(
      '# Not the title',
    )

    // The real shape still works: rule, then the first clause.
    expect(documentBody('# T\n\nbanner\n\n---\n\n## 1. First\n')).toBe('## 1. First')
  })

  it('and renders a stray H1 as a heading rather than as prose', () => {
    /*
     * The safety net under the loader. If any markdown ever reaches the
     * renderer with a leading `#`, it must not print as text — that is the
     * outcome a reader saw, and it is the one neither layer may allow. It
     * renders as <h2> because the page owns the single <h1>.
     */
    const parsed = blocks('# A title\n\nSome prose.\n')
    expect(parsed[0]).toEqual({ kind: 'heading', level: 1, text: 'A title' })

    const rendered = JSON.stringify(Markdown({ source: '# A title\n\nSome prose.\n' }))
    expect(rendered, 'a hash reached the output as text').not.toContain('# A title')
    expect(rendered).toContain('"h2"')
    expect(rendered, 'a second h1 was emitted onto a page that already has one').not.toContain(
      '"h1"',
    )
  })

  it('gives every clause heading a stable id, so a clause can be linked to', () => {
    expect(slugify('8. What we write to your shop')).toBe('8-what-we-write-to-your-shop')
  })
})
