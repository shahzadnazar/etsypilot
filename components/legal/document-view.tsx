import { Markdown } from '@/lib/markdown/render'
import type { LegalDocument } from '@/lib/legal/documents'

/*
 * One document, rendered from its markdown.
 *
 * The date comes from the document, not from a constant here and not from the
 * file's mtime: "Last updated" in a legal document is a statement about the
 * text, and a git checkout's mtimes are the date of the checkout. While the
 * date is still `[[DATE]]`, that is what the page says — a made-up date on an
 * unfinished agreement would be the worst kind of small lie.
 */
export function DocumentView({ document }: { document: LegalDocument }) {
  const dated = document.lastUpdated && !document.lastUpdated.startsWith('DATE')

  return (
    <article className="doc">
      <header className="mb-7 border-b pb-4" style={{ borderColor: 'var(--border)' }}>
        <h1 className="display text-[30px] leading-[1.12]" style={{ color: 'var(--ink-1)' }}>
          {document.title}
        </h1>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--muted-1)' }}>
          {dated ? (
            <>
              Last updated <span className="mono">{document.lastUpdated}</span>
            </>
          ) : (
            <>Last updated: not yet dated — this document has not been finished or published.</>
          )}
          {' · '}
          {/*
           * The content hash, shown. It is what an acceptance record stores, so
           * a seller who accepted these terms can compare the version they
           * accepted against the version on screen without taking our word
           * for it. Twelve characters is enough to tell two versions apart by
           * eye and short enough to read aloud.
           */}
          <span className="mono">version {document.contentHash.slice(0, 12)}</span>
        </p>
      </header>

      <Markdown source={document.body} />
    </article>
  )
}
