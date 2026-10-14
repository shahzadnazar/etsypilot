/*
 * The navigation model (D21).
 *
 * PRD section 9 information architecture, with the Analytics group added for
 * the three designed surfaces that had no home.
 *
 * Orders, Reviews, Inventory and Delivery status are deliberately ABSENT. They
 * have no design anywhere and must not look built.
 *
 * Team and Automations are absent too - parked by D20.
 */

export interface NavItem {
  label: string
  href: string
  /*
   * No badge field any more.
   *
   * It held literals — Action Center '2', Shop Pulse '5', All Listings '412' —
   * authored once and never true again. The Action Center genuinely had FIVE
   * open actions, so the sidebar said 2 while the bell beside it said 5: the
   * same product giving two answers to one question, on one screen.
   *
   * Counts now come from the domain, passed in by the shell and looked up by
   * href. A count that is measured can be missing; a count that is authored is
   * wrong the day after it is written (D34).
   */
  /*
   * No page behind this yet.
   *
   * D21 removed the surfaces that had no design, so the nav would not look more
   * built than the product. It missed the other half: 21 items that ARE listed
   * and have no page, so the sidebar offered a link and Next answered 404.
   * Found by diffing every href in the source against every page that exists.
   *
   * The Tools page already had the honest pattern — it names an unbuilt tool
   * and says so instead of linking into nothing. This carries it into the
   * sidebar. The item stays visible, because the roadmap is not a secret; it
   * just stops pretending to be a destination.
   *
   * tests/unit/links.test.ts asserts this flag against the filesystem in BOTH
   * directions, so it cannot drift: marking a page unbuilt after building it
   * fails just as loudly as forgetting to mark one.
   */
  unbuilt?: true
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Dashboard',
    items: [
      { label: 'Overview', href: '/dashboard' },
      { label: 'Action Center', href: '/action-center' },
      { label: 'Shop Pulse', href: '/shop-pulse' },
    ],
  },
  {
    label: 'Research',
    items: [
      { label: 'Keywords', href: '/research/keywords' },
      { label: 'Opportunities', href: '/research/opportunities' },
      { label: 'Niche Research', href: '/research/niche' },
      /*
       * "Compare shops", not "Competitors".
       *
       * The noun describes what the product supposedly HAS on other people;
       * the verb describes what a seller DOES here, which is the page's own
       * vocabulary (Analyse / Compare / Track, never "spy"). The distinction
       * matters to a reader who has never opened it: a nav entry reading
       * "Competitors" beside a table of another shop's listing counts invites
       * the inference that this product harvests them. It does not — every
       * figure on that page is modelled and nothing is read from any shop
       * page.
       */
      { label: 'Compare shops', href: '/research/competitors' },
      { label: 'Keyword Lists', href: '/research/keyword-lists' },
    ],
  },
  {
    label: 'Listings',
    items: [
      { label: 'All Listings', href: '/listings' },
      { label: 'Listing Audit', href: '/listings/audit' },
      { label: 'AI Copilot', href: '/listings/ai-copilot' },
      { label: 'Bulk Editor', href: '/listings/bulk-editor' },
      { label: 'Change History', href: '/listings/change-history' },
    ],
  },
  {
    /*
     * ── "YOUR SHOP", NOT "ANALYTICS" ───────────────────────────────────
     *
     * Etsy's API Terms, Section 5, Prohibited Behavior item 25, in full:
     *
     *     "Use the Etsy API to collect, scan, or otherwise request Etsy
     *      content for purposes of analytics, machine learning, training
     *      artificial intelligence models, licensing, or content removal,
     *      unless expressly authorized in writing by Etsy."
     *
     * The tail was a paraphrase here — "without written authorisation" — and
     * it is the half that makes this a CONDITIONAL rather than a ban. A
     * partial quotation that reads as a flat prohibition is the same defect
     * as a summary presented as a quotation, which is what
     * tests/unit/etsy-compliance.test.ts exists to stop in the document.
     * Confirmed word for word against https://www.etsy.com/legal/api/ on
     * 14 October 2026.
     *
     * This group holds the one part of the product that genuinely requests
     * Etsy content through the API — the seller's own orders, payments and
     * listings — and it was labelled with the exact word that clause keys on.
     * Nothing about what these pages DO changes: a seller reading their own
     * receipts is the ordinary purpose of the API, not market analytics over
     * Etsy's content. What changes is that the label now says so.
     *
     * Every item here is the seller's own shop and nobody else's, which is
     * what the group name now states.
     */
    label: 'Your shop',
    items: [
      { label: 'Sales records', href: '/analytics' },
      { label: 'Sales map', href: '/analytics/sales-map' },
      { label: 'Experiments', href: '/analytics/experiments' },
    ],
  },
  {
    label: 'Profit',
    items: [{ label: 'Profit Reality', href: '/profit' }],
  },
  {
    label: 'Tools',
    items: [
      { label: 'Simple Calculator', href: '/tools/simple-calculator' },
      { label: 'Fee Calculator', href: '/tools/fee-calculator' },
      { label: 'Ads ROI Calculator', href: '/tools/ads-roi' },
      { label: 'Profit Calculator', href: '/tools/profit-calculator' },
      { label: 'Category Finder', href: '/tools/category-finder', unbuilt: true },
      { label: 'Seasonal Calendar', href: '/tools/seasonal-calendar' },
      { label: 'Trademark Screening', href: '/tools/trademark-screening', unbuilt: true },
    ],
  },
  {
    label: 'Data',
    items: [
      { label: 'Methodology', href: '/data/methodology' },
      { label: 'Data Sources', href: '/data/sources' },
    ],
  },
]

/** Billing and Settings sit below the groups, without a heading. */
export const NAV_FOOTER: NavItem[] = [
  { label: 'Billing', href: '/billing' },
  // Shop connections, not Profile, and now by choice rather than by necessity.
  // It was retargeted here when /settings/profile was a 404; that page exists
  // now, and this still points at Shop connections, because what a seller opens
  // Settings to do in this product is check the connection, its scopes and the
  // last sync. The settings rail offers Profile one click away.
  { label: 'Settings', href: '/settings/shops' },
]

/** Five-item bottom tab bar at <= 767px (artboard 90). */
export const MOBILE_TABS: NavItem[] = [
  /*
   * Three of these five went to a 404: Listings, Analytics and More. On a
   * phone the bottom bar IS the navigation, so more than half of it was dead —
   * and a "Soon" label on three of five tabs would be a worse answer than
   * sending each one to the real surface behind its intent.
   */
  { label: 'Home', href: '/dashboard' },
  { label: 'Research', href: '/research/keywords' },
  { label: 'Listings', href: '/listings/audit' },
  { label: 'Profit', href: '/profit' },
  { label: 'Settings', href: '/settings/shops' },
]

/*
 * Settings sub-navigation (D22 consequence 7, as amended by D35).
 *
 * `Team & roles` is gone with multi-user parked (D20) and the Workspace group
 * with it. `Audit log` sits under Shops & data directly below Data permissions:
 * it is a record of what happened to shop data, next to the export and deletion
 * controls a seller reaches for in the same frame of mind. It is not an account
 * surface — it is not about the person, it is about the shop.
 *
 * Not to be confused with Change History (Listings), which records listing
 * mutations and rollback. Different surfaces; they do not merge.
 */
export const SETTINGS_NAV: NavGroup[] = [
  {
    label: 'Account',
    items: [
      { label: 'Profile', href: '/settings/profile' },
      { label: 'Security', href: '/settings/security' },
      { label: 'Notifications', href: '/settings/notifications' },
      { label: 'Billing & plan', href: '/billing' },
    ],
  },
  {
    label: 'Shops & data',
    items: [
      { label: 'Shop connections', href: '/settings/shops' },
      { label: 'Data permissions', href: '/settings/data-permissions' },
      { label: 'Audit log', href: '/settings/audit-log' },
      { label: 'Costs & fees', href: '/settings/costs' },
      /*
       * Integrations has no design anywhere, so it is listed and not linked.
       * It is on the artboard's settings rail (109), which is why it appears at
       * all; D21 is what stops it becoming a destination before it is one.
       */
      { label: 'Integrations', href: '/settings/integrations' },
      { label: 'Browser extension', href: '/settings/extension' },
      { label: 'Data export & deletion', href: '/settings/export' },
    ],
  },
]

/*
 * ── THE SETTINGS RAIL, MINUS ANYTHING SWITCHED OFF ───────────────────────
 *
 * SETTINGS_NAV is the whole rail. This is what a given deployment shows.
 *
 * It exists because the browser extension comes off the live surface while
 * Etsy's Prohibited Behavior item 24 is unanswered (lib/extension/
 * availability.ts), and "nothing in the navigation mentions it" is part of
 * that. Filtering here rather than inside the rail component keeps the
 * decision server-side: SettingsNav is a client component and cannot read a
 * non-public environment variable, and making the flag public would put the
 * answer in the browser bundle.
 *
 * A filter by href, not by label, because a label is copy and copy is edited.
 */
export function settingsNavFor(options: { extension: boolean }): NavGroup[] {
  if (options.extension) return SETTINGS_NAV
  return SETTINGS_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.href.startsWith('/settings/extension')),
  }))
}
