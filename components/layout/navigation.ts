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
  /** Rendered as a count chip beside the label. */
  badge?: string
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
      { label: 'Action Center', href: '/action-center', badge: '2' },
      { label: 'Shop Pulse', href: '/shop-pulse', badge: '5' },
    ],
  },
  {
    label: 'Research',
    items: [
      { label: 'Keywords', href: '/research/keywords' },
      { label: 'Opportunities', href: '/research/opportunities' },
      { label: 'Niche Research', href: '/research/niche' },
      { label: 'Competitors', href: '/research/competitors' },
      { label: 'Keyword Lists', href: '/research/keyword-lists' },
    ],
  },
  {
    label: 'Listings',
    items: [
      { label: 'All Listings', href: '/listings', badge: '412' },
      { label: 'Listing Audit', href: '/listings/audit' },
      { label: 'AI Copilot', href: '/listings/ai-copilot' },
      { label: 'Bulk Editor', href: '/listings/bulk-editor' },
      { label: 'Change History', href: '/listings/change-history' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Shop Analytics', href: '/analytics' },
      { label: 'Sales Map', href: '/analytics/sales-map' },
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
      { label: 'Category Finder', href: '/tools/category-finder' },
      { label: 'Seasonal Calendar', href: '/tools/seasonal-calendar' },
      { label: 'Trademark Screening', href: '/tools/trademark-screening' },
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
  { label: 'Settings', href: '/settings/profile' },
]

/** Five-item bottom tab bar at <= 767px (artboard 90). */
export const MOBILE_TABS: NavItem[] = [
  { label: 'Home', href: '/dashboard' },
  { label: 'Research', href: '/research/keywords' },
  { label: 'Listings', href: '/listings' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'More', href: '/settings/profile' },
]
