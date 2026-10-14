import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE WARRANTY DISCLAIMER /legal/etsy SHOWS IS QUOTED OUT OF THE TERMS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── WHAT THIS FILE USED TO DO, AND WHY IT MATTERED ───────────────────────
 *
 * It also built the extension section of /legal/etsy, reading the permission
 * list out of extension/manifest.chrome.json at request time. That existed
 * because the Terms of Service had once contained this sentence:
 *
 *     "We do not scrape Etsy, and we do not use browser extensions or
 *      automated systems to collect Etsy data outside the API."
 *
 * which was false — an extension shipped in extension/ — and had been written
 * from memory by somebody who was not looking at the manifest. The fix was to
 * stop describing the extension from memory: add `cookies` or `<all_urls>` to
 * that manifest and the permission appeared on the public legal page in the
 * same deploy, with no author involved.
 *
 * D95 removed the extension, so there is no manifest to read and no section to
 * build. `extensionFacts()` is gone with it, and /legal/etsy now states the
 * simpler fact: there is no browser extension in this product.
 *
 * The lesson is kept rather than the code. If an extension ever returns from
 * `with-ai-and-extension`, its description on a public legal page must be read
 * out of its manifest again and not retyped.
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
