/*
 * The service worker.
 *
 * Almost empty on purpose. A background worker is the part of an extension with
 * the longest life and the least supervision, so the less it holds the better:
 * it keeps no session, caches no shop data, and makes no requests of its own.
 *
 * Its one job is to keep the popup honest about which tab it is describing.
 */

export {}

declare const chrome: {
  runtime: { onInstalled: { addListener(fn: () => void): void } }
}

chrome.runtime.onInstalled.addListener(() => {
  // No storage to seed, no token to mint, no permissions to request later.
  // Everything the popup needs is fetched per open, with the seller's own
  // session cookie, and discarded when it closes.
})
