/*
 * What the extension is allowed to be.
 *
 * Deliberately NOT in lib/extension/contract.ts and NOT in the extension's
 * tsconfig include list, so none of it is compiled into the bundle.
 *
 * That separation was not planning ahead — the audit caught it. The deny-list
 * lived in the contract, the contract ships to the popup, and so the build
 * failed on its own list of forbidden APIs appearing verbatim in a shipped
 * file. Which was the right answer for the wrong reason: a list of the exact
 * strings a reviewer greps for has no business being inside the artefact under
 * review, where it defeats that grep for everyone downstream.
 *
 * Read by the packaging script and by the tests. Never by the extension.
 */

/** The only hosts the extension may touch, in the manifest or in code. */
export const ALLOWED_HOSTS = ['https://www.etsy.com/*', 'https://etsy.com/*'] as const

/** The only permission it may request. activeTab is scoped to a click. */
export const ALLOWED_PERMISSIONS = ['activeTab'] as const

/**
 * Browser APIs that must never appear in the bundle.
 *
 * `cookies` and `webRequest` would let it read the seller's Etsy session
 * directly, which is the exact thing this extension promises it cannot do.
 */
export const FORBIDDEN_APIS = [
  'chrome.cookies',
  'browser.cookies',
  'chrome.webRequest',
  'browser.webRequest',
  'chrome.debugger',
  'declarativeNetRequest',
] as const
