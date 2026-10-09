import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

import { code } from '../support/shop-scoping'
import { LEGAL_PAGES } from '@/domain/legal/pages'
import { blocks, inline, slugify } from '@/lib/markdown/render'

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

  it('gives every clause heading a stable id, so a clause can be linked to', () => {
    expect(slugify('8. What we write to your shop')).toBe('8-what-we-write-to-your-shop')
  })
})
