import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE WARRANTY DISCLAIMER /legal/etsy SHOWS IS QUOTED OUT OF THE TERMS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Etsy's API Terms require an application to carry a disclaimer naming its
 * developer as the sole provider. It is in §12 of the Terms of Service, and
 * /legal/etsy shows it by reading that section rather than keeping a second
 * copy of the words.
 *
 * ── THE RULE THIS FILE EXISTS FOR ────────────────────────────────────────
 *
 * A public legal page may not describe the product, or quote an agreement,
 * from memory. Two copies of a required disclaimer is how one of them ends up
 * out of date, and a sentence somebody retyped is a sentence nobody will
 * re-read when the thing it describes changes. So anything on that page that
 * is a fact about this repository is READ from its source at request time, and
 * `tests/unit/legal-claims.test.ts` fails if a surface starts restating one
 * instead.
 *
 * That rule was learned the expensive way: a paragraph in the Terms once
 * described this product's own behaviour, accurately as the author remembered
 * it and falsely as the code was, and nothing in the repository could tell.
 */

import { legalDocument } from './documents'

/**
 * The warranty disclaimer, quoted out of the Terms rather than retyped.
 *
 * Etsy's API Terms require a disclaimer naming the developer as the sole
 * provider of the application. The Terms carry it as a blockquote in §12;
 * this returns that blockquote's text so the page shows the same words the
 * agreement does. Two copies of a required disclaimer is how one of them ends
 * up out of date.
 */
export function warrantyDisclaimer(): string {
  const { raw } = legalDocument('terms')
  const section = raw.slice(raw.indexOf('## 12.'), raw.indexOf('## 13.'))
  const quoted = section
    .split('\n')
    .filter((line) => line.trim().startsWith('>'))
    .map((line) => line.replace(/^>\s?/, '').trim())
    .join(' ')
    .trim()

  if (!quoted) {
    throw new Error('the Terms no longer carry a quoted warranty disclaimer in section 12')
  }
  return quoted
}
