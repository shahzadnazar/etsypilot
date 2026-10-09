/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   A MARKDOWN SUBSET, RENDERED TO REACT NODES. NO HTML PASS-THROUGH.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Three reasons this is forty lines of parser rather than a dependency:
 *
 *   1. The input is not arbitrary. It is two files in this repository, written
 *      by us, reviewed by a lawyer, and changed by a commit. A general
 *      markdown engine is built for untrusted input from anywhere; the risk it
 *      manages is not the risk here.
 *
 *   2. Every markdown library's selling point is raw-HTML pass-through, which
 *      here is a liability. `dangerouslySetInnerHTML` on a legal page under a
 *      'strict-dynamic' CSP is the one injection surface this product does not
 *      have, and adding it to render a document we wrote ourselves would be a
 *      poor trade. THIS RENDERER CANNOT EMIT HTML: it builds React elements,
 *      so every character of the document is escaped by construction, and an
 *      `<img onerror=…>` typed into the markdown renders as that text.
 *
 *   3. The subset is the subset the documents use — headings, paragraphs,
 *      bullets, tables, blockquotes, rules, bold, code spans, links. Anything
 *      else renders as its own source text rather than disappearing, which is
 *      the right failure for a legal page: a reader sees something odd and
 *      says so, instead of silently reading a document with a clause missing.
 *      `tests/unit/legal-markdown.test.ts` renders both real documents and
 *      asserts nothing is dropped.
 *
 * ── PLACEHOLDERS ARE RENDERED, LOUDLY ────────────────────────────────────
 *
 * `[[LEGAL_ENTITY]]` is not a formatting artefact to be hidden. It is a blank
 * in an agreement, and the page's whole honesty depends on the reader seeing
 * exactly where the blanks are. Each one renders as a marked chip.
 */

import type { ReactNode } from 'react'

/* ─────────────────────────────────────────────────────────────── inline */

const INLINE =
  /(`\[\[[^\]]+\]\]`)|(\[\[[^\]]+\]\])|(\*\*[^*]+\*\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g

function placeholderChip(text: string, key: string): ReactNode {
  const name = text.replace(/^`|`$/g, '').replace(/^\[\[|\]\]$/g, '')
  const isConfirm = name.startsWith('CONFIRM:')
  return (
    <span
      key={key}
      className="legal-placeholder"
      data-kind={isConfirm ? 'confirm' : 'blank'}
      /*
       * Announced, not just coloured. Somebody reading this with a screen
       * reader needs to know a clause has a hole in it as much as anyone.
       */
      role="note"
      aria-label={isConfirm ? `Unresolved note: ${name.slice('CONFIRM:'.length).trim()}` : `Unfilled placeholder: ${name}`}
    >
      {isConfirm ? `Not yet settled — ${name.slice('CONFIRM:'.length).trim()}` : name}
    </span>
  )
}

export function inline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0

  for (const match of text.matchAll(INLINE)) {
    const at = match.index
    if (at > last) out.push(text.slice(last, at))
    const token = match[0]
    const key = `${keyPrefix}-${n++}`

    if (token.startsWith('`[[') || token.startsWith('[[')) {
      out.push(placeholderChip(token, key))
    } else if (token.startsWith('**')) {
      /*
       * Recursive, because the documents bold a placeholder: the Terms open
       * with **`[[LEGAL_ENTITY]]`**, and a non-recursive strong rendered that
       * as the literal characters — backticks, brackets and all — inside bold
       * text, which is the one place a reader most needs to see a marked
       * blank. `[^*]+` cannot contain another `**`, so this terminates.
       */
      out.push(<strong key={key}>{inline(token.slice(2, -2), key)}</strong>)
    } else if (token.startsWith('`')) {
      out.push(<code key={key}>{token.slice(1, -1)}</code>)
    } else {
      const label = token.slice(1, token.indexOf(']'))
      const href = token.slice(token.indexOf('](') + 2, -1)
      /*
       * An off-site link in a legal document gets rel="noopener noreferrer":
       * the referrer would tell a third party which clause the reader was on.
       */
      const external = /^https?:\/\//.test(href)
      out.push(
        <a key={key} href={href} {...(external ? { rel: 'noopener noreferrer' } : {})}>
          {label}
        </a>,
      )
    }
    last = at + token.length
  }

  if (last < text.length) out.push(text.slice(last))
  return out
}

/* ──────────────────────────────────────────────────────────────── blocks */

type Block =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }

function cells(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

/** A `|---|---|` alignment row, which carries no content. */
function isAlignmentRow(line: string): boolean {
  return /^\|[\s:|-]+\|?$/.test(line.trim()) && line.includes('-')
}

export function blocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim() === '') {
      i += 1
      continue
    }

    if (/^---+$/.test(line.trim())) {
      out.push({ kind: 'rule' })
      i += 1
      continue
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line)
    if (heading) {
      out.push({
        kind: 'heading',
        level: heading[1]!.length as 2 | 3 | 4,
        text: heading[2]!.trim(),
      })
      i += 1
      continue
    }

    if (line.startsWith('|')) {
      const table: string[] = []
      while (i < lines.length && (lines[i] ?? '').startsWith('|')) {
        table.push(lines[i]!)
        i += 1
      }
      const header = cells(table[0]!)
      const rows = table.slice(1).filter((row) => !isAlignmentRow(row)).map(cells)
      out.push({ kind: 'table', header, rows })
      continue
    }

    if (line.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && (lines[i] ?? '').startsWith('>')) {
        quote.push((lines[i] ?? '').replace(/^>\s?/, ''))
        i += 1
      }
      out.push({ kind: 'quote', text: quote.join(' ').trim() })
      continue
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const current = lines[i] ?? ''
        if (/^[-*]\s/.test(current)) {
          items.push(current.replace(/^[-*]\s+/, ''))
          i += 1
        } else if (/^\s+\S/.test(current) && items.length > 0) {
          // A wrapped bullet. The documents are hard-wrapped at 100 columns, so
          // most bullets are two or three lines; joining them is not optional.
          items[items.length - 1] = `${items[items.length - 1]} ${current.trim()}`
          i += 1
        } else break
      }
      out.push({ kind: 'bullets', items })
      continue
    }

    const paragraph: string[] = []
    while (i < lines.length) {
      const current = lines[i] ?? ''
      if (
        current.trim() === '' ||
        current.startsWith('|') ||
        current.startsWith('>') ||
        /^[-*]\s/.test(current) ||
        /^#{2,4}\s/.test(current) ||
        /^---+$/.test(current.trim())
      )
        break
      paragraph.push(current.trim())
      i += 1
    }
    out.push({ kind: 'paragraph', text: paragraph.join(' ') })
  }

  return out
}

/** A stable id for a heading, so a clause can be linked to. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function Markdown({ source }: { source: string }): ReactNode {
  return (
    <>
      {blocks(source).map((block, index) => {
        const key = `b-${index}`
        switch (block.kind) {
          case 'rule':
            return <hr key={key} />
          case 'heading': {
            const id = slugify(block.text)
            const Tag = (`h${block.level}` as const) satisfies 'h2' | 'h3' | 'h4'
            return (
              <Tag key={key} id={id}>
                {inline(block.text, key)}
              </Tag>
            )
          }
          case 'paragraph':
            return <p key={key}>{inline(block.text, key)}</p>
          case 'quote':
            return (
              <blockquote key={key}>
                <p>{inline(block.text, key)}</p>
              </blockquote>
            )
          case 'bullets':
            return (
              <ul key={key}>
                {block.items.map((item, n) => (
                  <li key={`${key}-${n}`}>{inline(item, `${key}-${n}`)}</li>
                ))}
              </ul>
            )
          case 'table':
            return (
              <div key={key} className="legal-table-scroll">
                <table>
                  <thead>
                    <tr>
                      {block.header.map((cell, n) => (
                        <th key={`${key}-h-${n}`} scope="col">
                          {inline(cell, `${key}-h-${n}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={`${key}-r-${r}`}>
                        {row.map((cell, c) => (
                          <td key={`${key}-r-${r}-${c}`}>{inline(cell, `${key}-r-${r}-${c}`)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
        }
      })}
    </>
  )
}
