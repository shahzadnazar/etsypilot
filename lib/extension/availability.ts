/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE BROWSER EXTENSION IS OFF, AND THIS IS THE ONE SWITCH THAT DECIDES.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Etsy's API Terms, Prohibited Behavior item 24:
 *
 *     "Use or promote the use of automated systems or browser extensions to
 *      access, analyze, or scrape the Etsy Site, the Etsy API or any Etsy
 *      data, including but not limited to Etsy listings, shops, or user
 *      profiles, unless expressly authorized in writing by Etsy"
 *
 * The clause names browser extensions, and it covers PROMOTING their use as
 * well as using them — so a settings page offering the download, a link in
 * the top bar and a paragraph on a public page are all inside the sentence,
 * not just the add-on itself.
 *
 * ── THE CASE FOR THE EXTENSION, WHICH IS NOT BEING ABANDONED ──────────────
 *
 * It reads one thing: `listingIdFromUrl(location.href)`, the address of a page
 * the seller already opened. There is no querySelector in it, no page text, no
 * cookie read, no write, and no request to etsy.com — it asks THIS product's
 * API about a listing the seller owns. That is a defensible reading of item
 * 24 and the plan is to put it to Etsy once the key is in hand.
 *
 * It is a bad thing to have decided FOR us by a reviewer reading one clause
 * with the product in front of them, because an API application cannot be
 * re-submitted cheaply. So the extension stays in the repository, finished,
 * and comes off the live surface until Etsy answers.
 *
 * ── WHY ONE SWITCH AND NOT SEVEN ──────────────────────────────────────────
 *
 * Seven places mention the extension: the settings page, the download route,
 * the listing API the popup calls, the nav entry, the top-bar link, the
 * integrations card, the security page's session note — plus the section on
 * /legal/etsy and the packaging step in predev/prebuild. Seven switches is
 * six opportunities to leave one on, and "half-on" is the worst state: a
 * reviewer who finds a working download behind a page that says the feature
 * is not offered has found something worse than the feature.
 *
 * So: one boolean, read everywhere, and `tests/unit/extension-gate.test.ts`
 * fails if a surface stops reading it. Turning it back on is one line in the
 * environment.
 *
 * ── WHY AN ENVIRONMENT VARIABLE AND NOT A CONSTANT ────────────────────────
 *
 * The answer differs per deployment and over time: off in production until
 * Etsy replies, on in a developer's checkout who is working on the add-on, on
 * everywhere the day the authorisation arrives. A constant would need a
 * commit and a deploy to flip, and would be flipped in a hurry.
 *
 * Deliberately NOT NEXT_PUBLIC_. Everything that renders the extension is a
 * server component or a route handler, so the browser never needs to know,
 * and a NEXT_PUBLIC_ flag would put the answer in the client bundle where it
 * reads as a feature somebody could turn on from the console.
 */

export const EXTENSION_FLAG = 'BROWSER_EXTENSION_ENABLED'

/**
 * Is the browser extension offered on this deployment?
 *
 * Default OFF. Absent, empty, 'false', '0' — all off. Only the exact string
 * 'true' turns it on, because a flag that is on for any non-empty value is a
 * flag that gets turned on by a typo.
 */
export function extensionEnabled(): boolean {
  return (process.env[EXTENSION_FLAG] ?? '').trim().toLowerCase() === 'true'
}
