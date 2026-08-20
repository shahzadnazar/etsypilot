# Claude Design Brief — RankKW Etsy Seller Platform

> Copy this entire Markdown file into Claude. Treat it as the authoritative product and UI/UX design specification.

## 1. Your role

Act as a senior SaaS product designer, UX architect, design-systems specialist, and frontend design lead. Design a polished, production-ready web application called **RankKW**, an Etsy seller intelligence and operations platform.

The experience must feel credible enough for a seller to connect a revenue-generating shop, simple enough for a beginner to understand, and powerful enough for an agency managing multiple shops.

Do not make a generic analytics dashboard. Build a coherent operating system with clear information hierarchy, task-based workflows, reliable data states, and consistent interaction patterns.

If you are working in a code-capable environment, implement the design as responsive frontend screens using **Next.js, TypeScript, Tailwind CSS, and shadcn/ui**. Use realistic mock data and reusable components. Do not build a production backend, payment processor, scraper, or live Etsy integration unless separately requested.

---

## 2. Product context

### Product name

**RankKW**

### Product category

Etsy seller intelligence, listing optimization, shop analytics, and operations.

### Core positioning

**Make smarter Etsy decisions with data you can trust.**

RankKW should distinguish four kinds of information throughout the interface:

- **Verified:** supplied by Etsy for the authenticated seller's own shop.
- **Calculated:** produced by a transparent formula using visible inputs.
- **Estimated:** modeled from observable or third-party signals; never presented as exact.
- **Unavailable:** Etsy does not expose sufficient data, so RankKW does not fabricate a number.

Data provenance is a core design feature, not a footnote. Users should be able to understand where any important metric came from by hovering, clicking, or opening a details panel.

### Primary users

1. New Etsy seller researching keywords and improving initial listings.
2. Established seller with 100–5,000 listings who needs profit, bulk editing, and operational alerts.
3. Digital-product or print-on-demand seller managing a large catalog.
4. Consultant, virtual assistant, or agency managing multiple Etsy shops.

### Core user problems

- Seller tools show conflicting keyword, sales, and revenue estimates.
- Research tools identify opportunities but do not help users implement changes safely.
- Large shops need bulk editing, version history, approvals, scheduling, and rollback.
- Sellers struggle to reconcile gross revenue, Etsy fees, refunds, COGS, shipping, and advertising costs.
- Multi-shop users lack granular team permissions and client approval workflows.
- Existing dashboards often overwhelm beginners and hide the next recommended action.

### Product promise

RankKW helps sellers move through one continuous loop:

**Discover → Understand → Optimize → Publish → Measure → Improve**

---

## 3. Important legal and trust requirements

These requirements must influence the interface.

1. Always display the required disclaimer in the footer and Etsy-connection surfaces:

   **“The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy.”**

2. Never describe estimated competitor sales, revenue, conversion, or keyword demand as exact Etsy data.
3. Use visible badges for **Verified**, **Calculated**, **Estimated**, and **Seller input**.
4. Every estimated metric needs a tooltip or methodology drawer with:

   - source category;
   - last updated time;
   - confidence level;
   - plain-language explanation;
   - important exclusions.

5. Do not design functionality for automated Etsy Messages, hidden Etsy-page scraping, or unauthorized browser automation.
6. The OAuth connection screen must say RankKW never requests the seller's Etsy password.
7. Design a permission center showing granted scopes, why each permission is needed, last synchronization, disconnect, export, and delete-data controls.
8. Customer location data must be aggregated. Never design buyer dossiers or expose unnecessary personal information.
9. Bulk edits and destructive actions require confirmation, preview, and an audit trail.
10. All AI-generated content must remain a draft until a human approves it.

---

## 4. Design objective

Create a premium SaaS interface that combines the analytical clarity of Stripe, the approachable usability of Shopify, and the operational confidence of Linear—without visually copying any of them.

The product should communicate:

- trustworthy;
- precise;
- calm;
- modern;
- efficient;
- seller-friendly;
- data-rich without being visually noisy.

Avoid the common Etsy-tool appearance of crowded tables, excessive gradients, neon charts, oversized KPI cards, and ambiguous “winning product” promises.

---

## 5. Visual design system

### 5.1 Brand direction

Use a clean light interface as the default. Include a complete dark-mode token set, but prioritize the light version in initial screens.

Suggested palette:

| Token | Color | Use |
|---|---|---|
| Brand 600 | `#2563EB` | Primary buttons, active navigation, links |
| Brand 700 | `#1D4ED8` | Hover and pressed states |
| Brand 50 | `#EFF6FF` | Selected rows, soft callouts |
| Ink 950 | `#0F172A` | Primary headings |
| Ink 700 | `#334155` | Body copy |
| Ink 500 | `#64748B` | Secondary labels |
| Surface | `#FFFFFF` | Cards, modals, table surfaces |
| Canvas | `#F8FAFC` | Application background |
| Border | `#E2E8F0` | Dividers and inputs |
| Success | `#16A34A` | Verified, connected, positive results |
| Warning | `#D97706` | Estimated data, attention required |
| Danger | `#DC2626` | Errors, destructive changes, negative margin |
| Purple | `#7C3AED` | AI-generated or assisted content |
| Cyan | `#0891B2` | Calculated metrics and formula states |

Do not use Etsy's orange as RankKW's main brand color. Etsy may appear only as a clearly labeled connected platform.

### 5.2 Typography

Use **Inter**, **Geist**, or a similarly neutral modern sans-serif.

- Display heading: 32–40 px, semibold, tight line height.
- Page heading: 24–30 px, semibold.
- Section heading: 18–20 px, semibold.
- Body: 14–16 px.
- Data/table labels: 12–14 px.
- Numeric metrics: tabular numbers.

Use sentence case. Avoid all-caps except tiny status labels.

### 5.3 Spacing and shape

- 4 px base spacing scale.
- 12 px input/card corner radius.
- 16 px radius for prominent panels and modals.
- 1 px neutral borders.
- Restrained shadows; borders and spacing should do most structural work.
- Standard desktop content width can expand to 1,600 px for tables.

### 5.4 Icons

Use Lucide icons or a consistent outline family. Icons must support labels, not replace unfamiliar labels. Use 16–20 px icons in navigation and controls.

### 5.5 Data-provenance badges

Create a reusable badge system:

| Badge | Color | Icon | Example tooltip |
|---|---|---|---|
| Verified | Green | Shield check | “Received from your connected Etsy shop.” |
| Calculated | Cyan | Calculator | “Calculated from verified orders and your cost inputs.” |
| Estimated | Amber | Sparkline | “Modeled estimate—not official Etsy sales data.” |
| Seller input | Slate | Pencil | “Entered or imported by a shop team member.” |
| AI draft | Purple | Wand | “AI-generated draft requiring review.” |
| Unavailable | Gray | Circle slash | “Etsy does not provide sufficient data through the public API.” |

---

## 6. Global application layout

### 6.1 Desktop shell

Use a three-part shell:

1. **Collapsible left navigation:** 264 px expanded and 72 px collapsed.
2. **Top utility bar:** 64 px high, containing shop switcher, date range, search/command menu, notifications, help, and user menu.
3. **Main content:** responsive, with contextual page header and optional right-side details drawer.

### 6.2 Mobile shell

- Use a compact top bar with logo, current shop, notifications, and menu.
- Convert sidebar navigation into a full-height drawer.
- Use a bottom navigation only for the five most important areas: Home, Research, Listings, Analytics, More.
- Tables must become responsive cards or horizontally scrollable tables with frozen primary columns.
- Drawers become full-screen sheets.

### 6.3 Persistent shop context

The selected shop must remain visible in the top bar. The switcher shows:

- shop avatar and name;
- connection status;
- plan;
- active listing count;
- last synchronization;
- quick link to “Manage shops.”

Agency users can search shops and group them by client.

### 6.4 Command palette

Open with `Cmd/Ctrl + K`. Support navigation and actions such as:

- Search keywords
- Open listing
- Connect shop
- Create bulk edit
- Calculate fees
- View low-margin alerts
- Switch shop
- Invite team member

---

## 7. Information architecture

Use the following navigation. Keep advanced groups collapsible to prevent cognitive overload.

### Home

- Overview
- Getting Started

### Research

- Find Hot Products
- Keywords
- Listings Explorer
- Competitors
- Trends
- Trend Buzz
- Monthly Trends
- Top Sellers
- Category Report
- Competitor Estimates
- Keyword Gap
- Bulk Keywords
- Rank Checker

### My Shop

- Shop Dashboard
- Listings
- Bulk Editor
- Change History
- Orders
- Profit & Fees
- Inventory
- Sales Map
- Delivery Status
- Reviews

### Optimize

- Shop Analytics
- Listing Audit
- Tag Optimizer
- Title Generator
- Tag Generator
- Description Generator
- Etsy Listing Pro
- AI Listing Helper
- Competitor Tags
- Compare Listings
- Spell Checker
- Experiments

### Tools

- Fee Calculator
- Ads ROI Calculator
- Profit Calculator
- Category Finder
- Seasonal Calendar
- Keyword Lists
- Trademark Screening

### Automations

- Alerts
- Scheduled Changes
- Rules

### Team

- Members
- Roles & Approvals
- Clients
- Activity Log

### Settings

- Shops & Connections
- Data Permissions
- Integrations
- Notifications
- Billing
- Profile
- Privacy & Data

Show locked plan indicators only where useful. Do not fill the sidebar with upgrade labels.

---

## 8. Primary user flows

### 8.1 New user onboarding

Design a five-step onboarding sequence with a visible progress indicator:

1. Welcome and role selection: seller, POD seller, digital seller, consultant/agency.
2. Primary goal: research, improve listings, understand profit, manage catalog, manage clients.
3. Connect Etsy shop or continue in research-only mode.
4. Select permission modules with plain-language explanations.
5. First-value setup: enter COGS rule, run listing audit, or search first keyword.

The user must be able to skip nonessential steps. Show an onboarding checklist on the dashboard until complete.

### 8.2 Connect Etsy shop

Screen structure:

- calm centered card;
- Etsy connection illustration or simple storefront icon;
- explanation of what RankKW can and cannot access;
- permissions grouped by Read, Manage listings, and Orders/financials;
- security text: “RankKW never receives your Etsy password”;
- primary button: **Continue to Etsy**;
- secondary link: **Explore without connecting**;
- required Etsy trademark disclaimer.

After connection, show a synchronization screen with stages rather than an indefinite spinner:

- Confirming shop
- Importing listings
- Syncing inventory
- Loading orders
- Calculating metrics

Allow users to enter the product while nonessential history continues syncing.

### 8.3 Research to optimization

1. Search a keyword.
2. Review keyword summary, trend, competition, related terms, and provenance.
3. Save keywords to a list.
4. Select an existing listing.
5. Compare current title/tags with selected terms.
6. Generate a proposed change.
7. Review an exact diff.
8. Save as draft, schedule, or publish.
9. Record the change as an experiment.

### 8.4 Bulk listing change

1. Filter listings.
2. Select rows.
3. Choose action.
4. Configure change.
5. Validate affected listings.
6. Review before/after samples and issue count.
7. Confirm immediately or schedule.
8. Show progress with per-item status.
9. Provide downloadable error report and rollback action.

### 8.5 Profit reconciliation

1. Sync Etsy orders and payment records.
2. Add default or product-specific COGS.
3. Import POD, shipping, and optional advertising costs.
4. Show matched, partially matched, and unmatched transactions.
5. Resolve exceptions.
6. Display gross sales → discounts/refunds → Etsy fees → production/shipping → ads → net profit.

### 8.6 Agency approval

1. Team member drafts listing changes.
2. Client/reviewer receives approval request.
3. Reviewer sees summary, exact diff, affected listings, schedule, and risk checks.
4. Reviewer approves, requests changes, or rejects with comment.
5. Approved job executes and produces an immutable audit event.

---

## 9. Screen specifications

## 9.1 Login and registration

Design clean authentication screens with:

- RankKW logo;
- email/password and Google sign-in;
- clear create-account/sign-in switch;
- terms and privacy links;
- no fake social proof;
- password visibility toggle and accessible error states.

Use a subtle right-side product preview on desktop and a single-column layout on mobile.

## 9.2 Home overview

The dashboard must answer:

1. What changed?
2. What needs attention?
3. What should I do next?

Page header:

- “Good morning, Salman” or current user;
- selected shop and date range;
- last sync status;
- primary action: **Optimize listings**;
- secondary action: **View profit**.

Top summary cards:

- Gross sales — Verified
- Orders — Verified
- Net profit — Calculated
- Active listings — Verified

Each card shows change versus the previous comparable period, a compact sparkline, and provenance badge. Never show more than four large cards in one row.

Main content:

- **Action Center:** prioritized alerts with severity, impact, and direct CTA.
- **Sales and profit chart:** switch Gross sales / Net profit / Orders.
- **Catalog health:** optimized, needs attention, errors, drafts.
- **Recent changes:** listing edits and measured outcomes.
- **Seasonal opportunities:** three concise recommendations with confidence and source.
- **Getting started checklist:** only for incomplete accounts.

Empty state for unconnected users: explain the value of connection, show research access, and present one clear button.

## 9.3 Research — Find Hot Products

Use a powerful but approachable data explorer.

Filters:

- keyword;
- category;
- price range;
- estimated monthly sales range;
- listing age;
- reviews;
- favorites;
- shop country;
- digital/physical;
- personalization;
- estimated competition;
- trend direction.

Table columns:

- image and title;
- shop;
- price;
- reviews;
- favorites;
- estimated monthly sales;
- estimated monthly revenue;
- listing age;
- trend;
- opportunity score;
- save/action menu.

Estimated columns must use amber labels and ranges such as **40–65**, not a falsely precise value such as 53. Hover explains the model and exclusions.

Add card/table view toggle, saved filter views, column customization, export, and compare selection. Use skeleton rows during loading.

## 9.4 Keywords

Header contains a large keyword search input, country/locale selector, and Search button.

Summary row:

- Demand — Estimated or seller-supplied
- Competition — Estimated
- Opportunity — Calculated
- 30-day trend — Estimated

Main panels:

- 12-month trend chart with seasonal annotations;
- related keyword table;
- search-intent grouping;
- category distribution;
- top listings preview;
- keyword suggestions tree;
- “How this data works” methodology panel.

Related-keyword table columns:

- keyword;
- demand range;
- competition;
- opportunity;
- trend;
- word count;
- relevance;
- add to list.

Support multi-select, bulk save, export, and “Optimize a listing with selected keywords.”

## 9.5 Competitor shop profile

The top header shows shop name, public profile details, total public sales counter where legitimately available, active listings, location, and last observed time.

Use three tabs:

- Overview
- Listings
- Changes

Overview includes:

- publicly observable metrics;
- estimated range metrics in a separate amber-tinted section;
- top categories;
- price distribution;
- review trend;
- new/removed listings timeline;
- top tags;
- clear warning that estimated sales/revenue are not official Etsy figures.

Never use aggressive “Spy” language. Use **Analyze**, **Compare**, or **Track**.

## 9.6 Trends and Trend Buzz

Create visual trend cards by category with:

- trend name;
- thumbnail collage;
- growth direction;
- confidence;
- seasonality;
- competition;
- related keywords;
- save button.

Trend detail uses a line chart, seasonal timeline, keyword clusters, product-style distribution, and category movement. Annotate any gaps in data.

## 9.7 Listings manager

This is a core operations screen and must feel more robust than a research table.

Toolbar:

- search;
- filters;
- saved views;
- columns;
- import/export;
- create listing;
- bulk edit.

Table columns:

- checkbox;
- listing thumbnail/title;
- status;
- price;
- quantity;
- variations;
- section;
- renewal date;
- SEO health;
- margin;
- views if seller-supplied/available;
- last changed;
- actions.

Use sticky checkbox/title columns. Inline editing is allowed for low-risk fields. Larger changes open a side drawer. Show unsaved changes clearly.

## 9.8 Listing editor

Use a two-column desktop layout:

- Main editor: title, description, media, category, attributes, price, inventory, variations, shipping, tags.
- Right rail: listing health, validation, AI assistant, preview, and publish controls.

Features:

- character counters;
- duplicate/repeated keyword warnings;
- brand-term lock;
- category-property validation;
- marketplace preview;
- autosaved draft indicator;
- compare with current published version;
- save draft, schedule, publish;
- AI suggestions inserted only after user approval.

For digital items, display file-management requirements. For physical items, display shipping and inventory requirements.

## 9.9 Bulk editor

Use a wizard or stepper:

1. Select listings
2. Choose fields
3. Configure changes
4. Validate
5. Review and publish

Supported actions:

- add/remove/replace tags;
- find-and-replace titles/descriptions;
- change price by fixed amount or percentage;
- assign shop section;
- update quantity;
- apply shipping profile;
- activate/deactivate where allowed;
- schedule changes.

Validation screen groups results into:

- Ready
- Warnings
- Blocked

Review screen shows exact diffs and randomly sampled listings, with an option to inspect all changes. Final confirmation must summarize affected count and rollback availability.

## 9.10 Change history

Design an audit timeline/table with:

- timestamp;
- user;
- shop;
- listing count;
- change type;
- source: manual, AI-assisted, scheduled, automation;
- status;
- rollback availability.

Selecting an event opens before/after diffs, validation results, failures, comments, and linked experiment. Destructive rollback requires a current-state recheck.

## 9.11 Shop analytics

Tabs:

- Performance
- Listings
- Customers
- Traffic imports
- Experiments

Performance page:

- verified sales/order trend;
- average order value;
- calculated profit/margin;
- best-performing listings by verified order revenue;
- category/section contribution;
- refund/cancellation rate;
- repeat-customer rate where authorized;
- insights/action panel.

Do not show views, conversion, search queries, or Etsy Ads metrics as live API data when unavailable. Design import cards that explicitly say **Connect or import this data**.

## 9.12 Profit & fees

Top cards:

- Gross sales
- Etsy fees
- Product/production cost
- Net profit
- Net margin

Main chart is a waterfall from gross sales to net profit. Include a transaction table and reconciliation status.

Cost setup:

- default percentage or fixed COGS;
- listing-specific cost;
- variation-specific cost;
- POD integration cost;
- shipping cost;
- ad-cost manual import;
- overhead allocation.

Use warning states when cost coverage is incomplete: “62% of order value has a confirmed product cost.” Avoid pretending incomplete profit is exact.

## 9.13 Sales map

Use an interactive choropleth world map and adjacent country table.

Metrics:

- orders;
- gross sales;
- average order value;
- repeat-customer rate;
- estimated delivery time where available.

All data is aggregated from the connected shop's own authorized order receipts. Include:

> “Your sales map comes from your own Etsy order receipts, which only Etsy can release to you. Connect your shop to enable it.”

Never show individual buyer names or addresses. For low-volume regions, suppress granular results.

## 9.14 Delivery status

Use a fulfillment pipeline:

- New
- Paid
- Ready to ship
- Shipped
- Delivered
- Exception

Include filters for date, carrier, destination, and overdue status. Show order count, not private buyer details in summary cards. Shipment/tracking actions require confirmation.

## 9.15 Reviews

Display own-shop reviews with:

- rating distribution;
- trend;
- recurring themes;
- product/listing association;
- response-needed queue only if supported by an approved workflow;
- AI-generated theme summaries labeled as AI analysis.

Do not design automatic response posting through Etsy Messages. Link users back to Etsy when an action is unsupported.

## 9.16 Listing audit

Present a prioritized issue list rather than an arbitrary single score.

Issue categories:

- Critical setup errors
- Search clarity
- Category and attributes
- Title and tags
- Description clarity
- Media completeness
- Pricing and margin
- Shipping/inventory

Each issue card needs:

- impact level;
- explanation;
- affected listing count;
- recommended action;
- source/rule date;
- fix individually or in bulk.

If a score is used, show the scoring methodology and avoid implying Etsy endorsement.

## 9.17 AI Listing Helper

Use a split interface:

- Left: conversation and instruction area.
- Right: structured listing draft with title, tags, description, attributes, and warnings.

Context selectors:

- choose shop/listing;
- choose target keywords;
- choose tone;
- lock required words;
- add product facts;
- choose locale.

Show source chips beneath every generated section. Include actions: Accept, Edit, Regenerate, Compare, Save as draft. Do not allow one-click invisible publishing.

## 9.18 Experiment tracker

Design a list and detail view for listing changes.

Experiment fields:

- hypothesis;
- affected listing;
- change type;
- before version;
- after version;
- start/end date;
- primary metric;
- seller-imported performance data;
- result: positive, neutral, negative, inconclusive;
- notes.

Do not imply statistical significance with tiny sample sizes. Show confidence and minimum-data warnings.

## 9.19 Fee calculator

Inputs:

- item price;
- quantity;
- shipping charged;
- item cost;
- shipping cost;
- country/currency;
- optional ad fee percentage;
- tax treatment where relevant;
- desired margin.

Outputs:

- revenue;
- listing fee;
- transaction fee;
- payment-processing estimate;
- advertising fee if entered;
- total fees;
- profit;
- margin;
- break-even price.

Show the formula, fee-rule effective date, and disclaimer that actual charges can vary. Make the output shareable/exportable.

## 9.20 Ads ROI calculator

Inputs: ad spend, clicks, orders, attributed revenue, COGS, Etsy fees, returns.

Outputs:

- ROAS;
- conversion rate;
- cost per order;
- profit after ads;
- break-even ROAS;
- maximum affordable CPA.

Use a scenario slider for spend and conversion changes. Data is seller-entered/imported, not live Etsy Ads API data.

## 9.21 Seasonal calendar

Create a 12-month planning calendar with events, recommended preparation windows, and listing deadlines. Users can filter by market/country, product type, and category. Each opportunity shows source, confidence, and actions: Save, Add task, Research keywords, Prepare listings.

## 9.22 Alerts and automations

Alerts center groups:

- Profit risks
- Inventory
- Listing errors
- Scheduled changes
- Synchronization
- Reviews
- Seasonal preparation

Every alert must include impact, evidence, recommended action, and dismiss/snooze controls.

Automation-rule builder uses:

**When condition → optional approval → action → notification**

Start with safe rule templates. Require approval for bulk or financially meaningful actions.

## 9.23 Team and agency workspace

Roles:

- Owner
- Admin
- Analyst
- Listing editor
- Finance viewer
- Client approver
- Read only

Create a permission matrix by shop and module. Include pending invitations, recent activity, client workspaces, approval queues, and branded report export. Never expose one client's data to another.

## 9.24 Billing

Plans:

| Plan | Price | Core allowance |
|---|---:|---|
| Free | $0 | 1 shop, up to 50 listings, calculators, limited research |
| Solo | $12/month | 1 shop, up to 500 listings, profit and bulk workflows |
| Growth | $29/month | 3 shops, advanced automation and integrations |
| Agency | $79/month | 10 shops, 5 seats, approvals and client reporting |

Billing UX requirements:

- clearly display amount, billing period, next renewal date, and tax;
- no preselected annual upgrade without disclosure;
- self-serve one-click cancellation;
- cancellation confirmation and downloadable receipt;
- explain what happens to data after downgrade/cancellation;
- usage meters for shops, seats, listings, and AI—not ordinary page views.

---

## 10. Reusable component inventory

Create and document these components:

- App shell
- Expandable sidebar group
- Shop switcher
- Command palette
- Page header
- Date-range picker
- KPI card
- Provenance badge
- Confidence indicator
- Methodology tooltip/drawer
- Alert card
- Empty state
- Error state
- Connection status
- Data freshness label
- Filter bar
- Saved view selector
- Responsive data table
- Column manager
- Listing/product cell
- Trend sparkline
- Comparison chart
- Waterfall chart
- World map
- Diff viewer
- Stepper
- Bulk-action bar
- Validation summary
- Activity timeline
- Approval card
- AI draft panel
- Source chips
- Upgrade modal
- Confirmation dialog
- Toast/notification
- Skeleton loader
- Sync progress state

For each component define default, hover, focus, active, disabled, loading, error, and mobile behavior.

---

## 11. Charts and data visualization

Use charts only when they make comparison or trend easier.

Approved chart types:

- line/area for time series;
- bar for category/listing comparisons;
- waterfall for profit reconciliation;
- stacked bar for status composition;
- heat map for calendar/seasonality;
- choropleth map for aggregated geography;
- scatter plot for price versus demand/competition;
- small sparklines in KPI cards and tables.

Chart requirements:

- accessible palette and text alternative;
- clear unit, period, time zone, and currency;
- tooltips with provenance;
- comparison-period toggle;
- missing data shown as gaps, not zero;
- estimated areas use dashed lines or a light amber band;
- verified values use solid lines;
- mobile charts simplify labels and preserve tooltips.

---

## 12. UX writing style

Use short, direct, reassuring language.

Preferred examples:

- “Connect your shop”
- “Review 12 changes”
- “3 listings need attention”
- “Estimated—not official Etsy sales data”
- “Your draft is saved”
- “We could not update 2 listings”
- “See how this is calculated”

Avoid:

- “Crush the competition”
- “Guaranteed winning product”
- “Spy on any shop”
- “Exact competitor revenue”
- “AI will grow your shop automatically”

Use precise error messages with a recovery action. Never use “Something went wrong” without further context.

---

## 13. Required system states

Every key screen must include:

- first-use empty state;
- unconnected-shop state;
- syncing state;
- populated state;
- no-results state;
- partial-data state;
- stale-data state;
- permission-missing state;
- rate-limit state;
- recoverable error;
- permanent unsupported-data state;
- offline/network interruption state;
- upgrade-required state.

Examples:

- **Partial profit data:** “Profit is calculated for 62% of sales because 38 listings do not have a product cost.”
- **Unavailable metric:** “Etsy does not provide listing views through the public API. Import your Etsy Stats file to add this metric.”
- **Stale sync:** “Last successful sync: 9 hours ago. Some Etsy data may be outdated.”
- **Rate limit:** “Etsy temporarily limited requests. Your sync will continue automatically at 2:40 PM.”

---

## 14. Accessibility requirements

- Target WCAG 2.2 AA.
- Minimum 4.5:1 contrast for normal text.
- Full keyboard navigation and visible focus rings.
- Correct labels, landmarks, headings, table semantics, and form instructions.
- Never communicate status with color alone.
- Touch targets at least 44 × 44 px on mobile.
- Respect reduced-motion preferences.
- Charts need summaries and accessible underlying tables.
- Dialogs trap focus and restore it when closed.
- Toasts use appropriate live regions and do not disappear before they can be read.

---

## 15. Responsive breakpoints

- Mobile: 360–767 px
- Tablet: 768–1023 px
- Desktop: 1024–1439 px
- Wide desktop: 1440 px+

At desktop width, prioritize efficient tables and split panes. At tablet width, collapse secondary panels into drawers. At mobile width, prioritize actions and summaries; do not simply shrink a desktop dashboard.

---

## 16. Motion and interaction

Use subtle motion only:

- 150–200 ms for hover, drawers, tabs, and menus;
- 200–300 ms for page-panel transitions;
- progress animation for synchronization and bulk actions;
- number changes should not roll excessively;
- no decorative parallax or distracting background animation.

Bulk operations should feel safe and observable. Show queued, running, succeeded, warning, and failed counts in real time.

---

## 17. Design deliverables

Produce the work in this order:

1. Brief product interpretation and major UX decisions.
2. Sitemap/information architecture.
3. Design tokens and component foundations.
4. Desktop application shell.
5. Mobile application shell.
6. High-fidelity designs for these priority screens:

   - Login
   - Onboarding
   - Connect Etsy shop
   - Home overview
   - Keyword research
   - Hot products explorer
   - Competitor shop profile
   - Listings manager
   - Listing editor
   - Bulk editor and validation
   - Shop analytics
   - Profit & fees
   - Sales map
   - Listing audit
   - AI Listing Helper
   - Team/agency approvals
   - Billing and plan selection
   - Data permissions/settings

7. Responsive versions for the most important flows.
8. Empty, loading, error, partial-data, and upgrade states.
9. Reusable component inventory.
10. Clickable prototype flow or implemented frontend routes if the environment supports it.

---

## 18. Implementation guidance for Claude Code

If implementing the UI:

- Use Next.js App Router and TypeScript.
- Use Tailwind CSS and shadcn/ui primitives.
- Use Lucide icons.
- Use Recharts or a similarly accessible chart library.
- Create mock data in a clearly separated file.
- Build reusable tables, badges, filters, charts, drawers, dialogs, and form components.
- Keep routes and feature modules organized by domain.
- Do not place an entire prototype in one file.
- Use semantic HTML and accessible Radix/shadcn behaviors.
- Support light and dark theme tokens.
- Make all primary routes navigable from the sidebar.
- Use realistic Etsy seller data without copying real seller identities or listings.
- Do not make live external API calls.
- Do not store credentials.
- Do not implement scraping.
- Include a `README.md` explaining setup, routes, component structure, and design decisions.

Suggested route structure:

```text
/login
/onboarding
/dashboard
/research/products
/research/keywords
/research/competitors
/research/trends
/shop/listings
/shop/listings/[id]
/shop/bulk-editor
/shop/change-history
/shop/orders
/shop/profit
/shop/inventory
/shop/sales-map
/optimize/audit
/optimize/ai-helper
/optimize/experiments
/tools/fee-calculator
/tools/ads-roi
/automations
/team
/settings/connections
/settings/permissions
/settings/billing
```

---

## 19. Quality checklist

Before presenting the design, verify:

- [ ] The selected shop is always clear.
- [ ] Verified, calculated, estimated, and seller-input values look different.
- [ ] No unsupported metric appears as live official Etsy data.
- [ ] Every table has filters, empty states, and mobile behavior.
- [ ] Bulk actions include validation, preview, confirmation, progress, and recovery.
- [ ] AI output is visibly a draft and requires approval.
- [ ] Billing is transparent and cancellation is easy.
- [ ] Every important screen has one obvious primary action.
- [ ] Charts state period, unit, currency, and source.
- [ ] Customer data is aggregated and privacy-safe.
- [ ] Permission scopes are explained in plain language.
- [ ] Keyboard and screen-reader behavior is considered.
- [ ] The Etsy trademark disclaimer is included.
- [ ] The interface does not use “spy,” “guaranteed,” or false-precision language.
- [ ] Desktop, tablet, and mobile experiences are intentionally designed.
- [ ] The result feels like one coherent product rather than unrelated dashboard templates.

---

## 20. Final instruction

Begin by summarizing the design direction in no more than ten bullets. Then produce the information architecture and design system before designing individual screens. Maintain the same navigation, spacing, components, data-provenance language, and status behavior across the entire platform.

When a requirement conflicts with visual novelty, prioritize clarity, trust, accessibility, and operational safety. The final design should make RankKW look like the most credible Etsy seller platform in the market—not merely the tool with the most features.
