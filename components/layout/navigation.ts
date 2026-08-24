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
      { label: 'Opportunities', href: '/research/opportunities', unbuilt: true },
      { label: 'Niche Research', href: '/research/niche', unbuilt: true },
      { label: 'Competitors', href: '/research/competitors', unbuilt: true },
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
    label: 'Analytics',
    items: [
      { label: 'Shop Analytics', href: '/analytics', unbuilt: true },
      { label: 'Sales Map', href: '/analytics/sales-map', unbuilt: true },
      { label: 'Experiments', href: '/analytics/experiments', unbuilt: true },
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
      { label: 'Seasonal Calendar', href: '/tools/seasonal-calendar', unbuilt: true },
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
      { label: 'Notifications', href: '/settings/notifications', unbuilt: true },
      { label: 'Billing & plan', href: '/billing' },
    ],
  },
  {
    label: 'Shops & data',
    items: [
      { label: 'Shop connections', href: '/settings/shops' },
      { label: 'Data permissions', href: '/settings/data-permissions', unbuilt: true },
      { label: 'Audit log', href: '/settings/audit-log' },
      { label: 'Costs & fees', href: '/settings/costs' },
      /*
       * Integrations has no design anywhere, so it is listed and not linked.
       * It is on the artboard's settings rail (109), which is why it appears at
       * all; D21 is what stops it becoming a destination before it is one.
       */
      { label: 'Integrations', href: '/settings/integrations', unbuilt: true },
      { label: 'Browser extension', href: '/settings/extension' },
      { label: 'Data export & deletion', href: '/settings/export' },
    ],
  },
]
