/*
 * Listing detection.
 *
 * The entire content script. It reads the URL of the page it is already on and
 * answers one question when the popup asks: which listing is this?
 *
 * What it deliberately does NOT do:
 *
 *   - It does not scrape the page. Prices, titles and stock read off Etsy's
 *     DOM would be data we present as ours, from markup that changes without
 *     notice. Everything shown comes from the server.
 *   - It does not read cookies, storage or headers. The seller's Etsy session
 *     is theirs; this extension has no business touching it and no permission
 *     that would let it.
 *   - It does not modify the page. No injected banners, no rewritten prices.
 *
 * So the whole surface is: a URL in, a listing id out.
 */

import { listingIdFromUrl } from '../../lib/extension/contract.js'

declare const chrome: {
  runtime: {
    onMessage: {
      addListener(
        fn: (
          message: { type?: string },
          sender: unknown,
          respond: (response: { listingId: string | null; url: string }) => void,
        ) => boolean | void,
      ): void
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type !== 'WHICH_LISTING') return
  respond({ listingId: listingIdFromUrl(location.href), url: location.href })
  return true
})
