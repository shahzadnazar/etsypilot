import type { LegalDocument } from '@/lib/legal/documents'

/*
 * "Last updated", from the document itself.
 *
 * Every one of these four pages has to carry it, including the two that are
 * not a whole document: /legal/subprocessors renders section 4 of the Privacy
 * Policy and /legal/etsy quotes section 12 of the Terms, and a reader of
 * either is entitled to know how old the text they are reading is. Shipped
 * without it on those two pages at first — the gap was in the report before
 * it was in the code.
 *
 * The date is whatever the document says, never a build date and never the
 * file's mtime: "Last updated" is a statement about the text, and a git
 * checkout's mtimes are the date of the checkout. While the document is
 * undated, the page says so rather than inventing one.
 */
export function DocumentDate({
  documents,
  prefix,
}: {
  documents: LegalDocument[]
  prefix?: string
}) {
  const dated = documents.filter((d) => d.lastUpdated && !d.lastUpdated.startsWith('DATE'))

  return (
    <>
      {prefix ? `${prefix} ` : ''}
      {dated.length === documents.length && documents.length > 0 ? (
        <>
          Last updated{' '}
          {dated.map((document, index) => (
            <span key={document.slug}>
              {index > 0 ? ' · ' : ''}
              <span className="mono">{document.lastUpdated}</span>
              {documents.length > 1 ? ` (${document.title})` : ''}
            </span>
          ))}
        </>
      ) : (
        <>Last updated: not yet dated — this text has not been finished or published.</>
      )}
    </>
  )
}
