/*
 * The shared API client.
 *
 * The extension's ONLY way to reach a network, and it reaches exactly one host:
 * the EtsyPilot app. It never calls etsy.com — the content script reads the
 * page it is already on, and every figure comes from the server, which holds
 * the Etsy credentials.
 *
 * `credentials: 'include'` is the whole authentication bridge. The browser
 * sends the seller's existing EtsyPilot session cookie; the extension neither
 * sees it nor stores anything. There is no token in this file because there is
 * no token anywhere in this extension.
 */

import type { ExtensionResponse } from '../../lib/extension/contract.js'

/** Replaced at build time from EXTENSION_APP_URL. */
export const APP_ORIGIN = '__APP_ORIGIN__'

export async function fetchListing(listingId: string | null): Promise<ExtensionResponse> {
  const url = new URL('/api/extension/listing', APP_ORIGIN)
  if (listingId) url.searchParams.set('listingId', listingId)

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      // The session cookie, sent by the browser. Nothing is read from it here.
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })

    if (response.status === 401 || response.status === 403) {
      return {
        state: 'SIGNED_OUT',
        message:
          'Sign in once — the extension shares your existing EtsyPilot session, never a separate Etsy login.',
        signInUrl: new URL('/login', APP_ORIGIN).toString(),
      }
    }

    return (await response.json()) as ExtensionResponse
  } catch {
    /*
     * A network failure says so, and says what it did NOT do. A popup that
     * shows a bare "error" invites the reader to wonder whether it half-applied
     * something — this extension cannot apply anything, and says so.
     */
    return {
      state: 'ERROR',
      message: 'We couldn’t reach EtsyPilot.',
      recovery: 'Nothing on your shop was read or changed. Check your connection and try again.',
    }
  }
}
