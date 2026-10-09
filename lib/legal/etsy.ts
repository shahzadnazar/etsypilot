import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT /legal/etsy IS ALLOWED TO SAY ABOUT THE EXTENSION IS READ OUT OF
 *   THE EXTENSION.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The Terms of Service used to contain this sentence:
 *
 *     "We do not scrape Etsy, and we do not use browser extensions or
 *      automated systems to collect Etsy data outside the API."
 *
 * It was false. A browser extension ships in extension/ and is downloadable
 * from Settings. The sentence was not written dishonestly — it was written
 * from memory of what the product was, by somebody who was not looking at the
 * manifest.
 *
 * So this page does not describe the extension from memory either. The
 * permission list it prints is read out of extension/manifest.chrome.json at
 * request time: if somebody adds `cookies`, `storage`, `scripting` or
 * `<all_urls>` to that manifest, the permission appears on the public legal
 * page describing the extension, in the same deploy, with no author involved.
 *
 * `tests/unit/legal-claims.test.ts` holds the other half: the page's claims
 * about what the content script READS are asserted against the content
 * script's source, so a scraper added to it turns the suite red rather than
 * leaving a legal page making a promise the code broke.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { legalDocument } from './documents'

export interface ExtensionFacts {
  /** `permissions` from the manifest, verbatim. */
  permissions: string[]
  /** `host_permissions` from the manifest, verbatim. */
  hostPermissions: string[]
  /** Where the content script is allowed to run, verbatim. */
  contentScriptMatches: string[]
  /** The one endpoint on the EtsyPilot origin the extension calls. */
  appEndpoint: string
}

interface ChromeManifest {
  permissions?: string[]
  host_permissions?: string[]
  content_scripts?: { matches?: string[] }[]
}

export function extensionFacts(): ExtensionFacts {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'extension/manifest.chrome.json'), 'utf8'),
  ) as ChromeManifest

  return {
    permissions: manifest.permissions ?? [],
    hostPermissions: manifest.host_permissions ?? [],
    contentScriptMatches: manifest.content_scripts?.flatMap((entry) => entry.matches ?? []) ?? [],
    appEndpoint: '/api/extension/listing',
  }
}

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
