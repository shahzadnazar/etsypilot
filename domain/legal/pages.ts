/*
 * The four legal pages, in one list.
 *
 * Shared by the legal sub-navigation, the public footer and
 * tests/unit/legal-claims.test.ts, so a page that is added without a link —
 * or a link that outlives its page — is a test failure rather than a 404
 * somebody finds by loading a URL. That is how `/legal/terms` came to be a
 * 404 in the first place: the documents existed, the routes did not, and
 * nothing connected the two.
 *
 * No 'server-only': the footer that reads this is a server component today,
 * but this is a list of hrefs and labels with nothing in it to leak.
 */

export interface LegalPage {
  href: string
  label: string
  /** The <title>, and what a link to it should promise. */
  title: string
}

export const LEGAL_PAGES: readonly LegalPage[] = [
  { href: '/legal/terms', label: 'Terms', title: 'Terms of Service' },
  { href: '/legal/privacy', label: 'Privacy', title: 'Privacy Policy' },
  { href: '/legal/subprocessors', label: 'Sub-processors', title: 'Sub-processors' },
  { href: '/legal/etsy', label: 'Etsy', title: 'Etsy, and what this app is' },
] as const
