# Handoff: EtsyPilot — Etsy seller intelligence & operations platform

## Overview

EtsyPilot is an Etsy seller intelligence and operations platform. Positioning: **"Make smarter Etsy decisions with data you can trust."** It carries a seller through one continuous loop — Discover → Understand → Optimize → Publish → Measure → Improve — covering keyword and product research, listing management and bulk editing, profit reconciliation, listing audits, AI-assisted drafting, and multi-shop/agency administration.

The design in this bundle is a complete, high-fidelity design system plus ~60 numbered screens and states across 14 files, in light and dark themes.

Target users: new Etsy sellers; established sellers with 100–5,000 listings; print-on-demand and digital-product sellers; consultants, VAs and agencies managing multiple shops.

## About the design files

The `.dc.html` files in this bundle are **design references created in HTML** — prototypes that show intended look, structure, copy and behavior. They are **not production code to copy**. They use a single-file streaming component format with all styling inline, which is deliberate for design review and wrong for an application codebase.

Your task is to **recreate these designs in the target codebase**, using its established framework, component library and patterns. If no codebase exists yet, the original product brief (`Claude_Design_Brief_EtsyPilot_Etsy_Seller_Platform.md`, included) specifies:

- Next.js (App Router) + TypeScript
- Tailwind CSS + shadcn/ui primitives
- Lucide icons
- Recharts (or a comparable accessible chart library)
- Mock data in a clearly separated module; no live Etsy API calls, no credential storage, no scraping

A suggested route structure is in §18 of that brief. Read the brief in full before implementing — it is the authoritative product spec and contains requirements (legal, accessibility, state coverage) that the screens illustrate but do not exhaustively label.

**Naming:** the product is **EtsyPilot**. The filenames say `RankKW` and the brief text says `RankKW` — both are legacy from an earlier working name. Use EtsyPilot in all UI copy, and in any place the brief quotes UI strings ("RankKW never receives your Etsy password" → "EtsyPilot never receives your Etsy password").

## Fidelity

**High-fidelity.** Colors, typography, spacing, radii, borders, iconography, copy and layout dimensions are final and should be reproduced faithfully. Screens are drawn as fixed desktop frames (mostly 1440 px wide) with explicit heights; treat the width as the wide-desktop target and the heights as content extent, not viewport locks. Mobile frames and a four-width responsive comparison are included.

Charts in the prototypes are hand-drawn inline SVG paths with placeholder shapes. Reproduce their **visual language** (stroke weights, solid vs dashed, fills, amber estimate bands, gap-not-zero for missing data) with a real chart library rather than porting the paths.

---

## Design tokens

Theming is runtime CSS custom properties set on `documentElement`, with a Light / Dark / System toggle persisted in `localStorage`. In a real codebase, express these as CSS variables in your Tailwind theme layer with a `dark` class or `data-theme` attribute.

### Light (default)

| Token | Value | Use |
|---|---|---|
| `--brand` | `#B4472A` | Primary buttons, active nav, links |
| `--brand-strong` | `#8C371F` | Hover / pressed, text on brand tint |
| `--brand-tint` | `#FBEEE7` | Selected rows, active nav background, soft callouts |
| `--ink-1` | `#241B12` | Headings, metric values |
| `--ink-2` | `#4A4234` | Body copy |
| `--muted-1` | `#6B6152` | Secondary labels, table headers |
| `--muted-2` | `#8C7F6C` | Tertiary / unavailable |
| `--border` | `#E9E2D6` | Dividers, inputs, card borders |
| `--surface` | `#FFFFFF` | Cards, tables, top bar, sidebar |
| `--canvas-soft` / `--page-bg` | `#FBF8F3` | Application background |
| `--success` | `#15803D` | Verified, connected, positive delta |
| `--warning` | `#B45309` | Estimated data, attention |
| `--danger` | `#B91C1C` | Errors, destructive, negative margin |
| `--accent-ai` | `#7C3AED` | AI-generated / assisted content |
| `--accent-calc` | `#0891B2` | Calculated metrics, formula states |

### Dark

| Token | Value |
|---|---|
| `--brand` | `#E07A4A` |
| `--brand-strong` | `#F3B08C` |
| `--brand-tint` | `rgba(224,122,74,.16)` |
| `--ink-1` | `#F1F5F9` |
| `--ink-2` | `#CBD5E1` |
| `--muted-1` | `#94A3B8` |
| `--muted-2` | `#64748B` |
| `--border` | `#2B3444` |
| `--surface` / `--canvas-soft` | `#1E293B` |
| `--page-bg` | `#0F172A` |
| `--success` | `#34D399` |
| `--warning` | `#FBBF24` |
| `--danger` | `#F87171` |
| `--accent-ai` | `#C4B5FD` |
| `--accent-calc` | `#67E8F9` |

Badge pill fills are literal, not tokenized (they must stay readable in both themes): Verified `#F0FDF4` bg / `#BBF7D0` border / `#166534` text · Calculated `#ECFEFF` / `#A5F3FC` / `#0E7490` · Estimated `#FFFBEB` / `#FDE68A` / `#B45309`.

**Note on palette history:** the brief proposes a blue palette (Brand 600 `#2563EB`, Ink 950 `#0F172A`, Canvas `#F8FAFC`, Border `#E2E8F0`). The shipped screens use the terracotta set above. Some Foundations swatch *captions* still print the old blue hex values under the new terracotta chips — the chips are correct, the captions are stale. `RankKW Color Themes.dc.html` holds five alternative palettes (Light Professional/slate, Dark Professional `#0B1220`/`#111C31`/`#60A5FA`, Blue SaaS `#2563EB`, plus two more) if the palette is reopened. **Implement terracotta unless told otherwise.**

### Typography

Font: **Inter**, weights 400/500/600/700, `-webkit-font-smoothing: antialiased`. All numerals in metrics, tables and formulas use `font-variant-numeric: tabular-nums` (the `.tnum` class in the prototypes).

| Role | Size / line-height / weight | Tracking |
|---|---|---|
| Display | 36 / 1.1 / 600 | −0.02em |
| Page heading | 26 / 1.2 / 600 | −0.015em |
| Section heading | 18 / 1.3 / 600 | — |
| Body | 14 / 1.55 / 400 | — |
| Table / field label | 12 / 1.2 / 600 | +0.02em |
| Metric | 30 / 1 / 600 tabular | — |
| Eyebrow / group label | 10.5–12 / 1 / 600 uppercase | +0.07em |

Sentence case throughout. All-caps only for tiny status and group labels.

### Spacing, shape, elevation

- 4 px base scale: 4 / 8 / 12 / 16 / 24 / 32. Page padding 40–48 px; card padding 18–28 px; grid gaps 9–24 px.
- Radius: **8** controls · **10–12** inputs and cards · **16** panels, frames and modals · **999** pills.
- Borders are always **1 px**.
- **Elevation is reserved for overlays only** — dialogs, menus, popovers, the screens-nav: `0 12px 32px rgba(15,23,42,.12)`. Cards and tables never carry a shadow. Borders and spacing do all structural work; no gradients.

### Icons

Inline Lucide-style outline SVG at 13–20 px, `stroke-width: 2.2`, round caps and joins. Icons accompany labels; they never replace an unfamiliar label.

---

## The rule that governs the whole product: data provenance

Every meaningful number in the UI carries a provenance badge. This is the product's core differentiator, not decoration — build it as one reusable component early and use it everywhere.

| Badge | Icon | Color role | Tooltip copy | Applies to |
|---|---|---|---|---|
| Verified | Shield-check | success / green | "Received from your connected Etsy shop." | Orders, gross sales, active listings |
| Calculated | Calculator | `--accent-calc` / cyan | "Calculated from verified orders and your cost inputs." | Net profit, margin, opportunity |
| Estimated | Sparkline | `--warning` / amber | "Modeled estimate — not official Etsy sales data." | Competitor sales, keyword demand |
| Seller input | Pencil | slate / muted | "Entered or imported by a shop team member." | COGS, ad spend, imported stats |
| AI draft | Wand | `--accent-ai` / purple | "AI-generated draft requiring review." | Any generated title/tag/description |
| Unavailable | Circle-slash | gray | "Etsy does not provide sufficient data through the public API." | Views, conversion, search queries |

Pill geometry: `display:inline-flex; gap:6px; padding:4px 9px; border-radius:999px; border:1px solid;` with a 13 px icon and a 600/11 px label.

Every **estimated** metric needs a tooltip or methodology drawer carrying five things: source category, last updated, confidence level, plain-language explanation, important exclusions.

### Non-negotiable behavioral rules

1. Estimates render as **ranges** ("40–65"), never a falsely precise integer ("53").
2. Never present estimated competitor or keyword data as official Etsy data.
3. The disclaimer **"The term 'Etsy' is a trademark of Etsy, Inc. This Application uses Etsy's API, but is not endorsed or certified by Etsy."** appears in the footer and on every Etsy-connection surface.
4. Etsy orange is never a brand color. Etsy appears only as a clearly labeled connected platform.
5. The OAuth screen states EtsyPilot never receives the seller's Etsy password.
6. AI output is always a draft with source chips and an explicit human approval step. No one-click invisible publish.
7. Bulk and destructive work is always the full stepper: select → fields → configure → validate (Ready / Warnings / Blocked) → preview exact diffs → confirm → per-item progress → rollback + audit trail.
8. Customer data is aggregated only. No buyer dossiers, no names or addresses; suppress granular results for low-volume regions.
9. One obvious primary action per screen; secondary actions stay quiet.
10. Unavailable data explains *why* and offers a supported next action instead of a number.
11. Forbidden language: "spy", "guaranteed winner", "exact competitor revenue", "AI will grow your shop automatically". Use Analyze / Compare / Track.
12. Mobile is re-composed around actions and summaries, never a shrunken desktop dashboard.

---

## Application shell

- **Sidebar:** 264 px expanded, 72 px collapsed (icon rail). `--surface` background, 1 px right border. Nav items 9–10 px padding, 13 px/500 labels, radius 9; active item uses `--brand-tint` background with `--brand-strong` 600 text. Uppercase 10.5 px group labels (Home · Research · My shop · Tools) with 14 px top padding.
- **Top bar:** 64 px, `--surface`, 1 px bottom border, 26 px horizontal padding, 14 px gaps. Contains shop switcher, sync-freshness chip ("Willow & Fern · synced 6m ago"), date range, Cmd/Ctrl+K command palette entry, notifications, help, user avatar (22–28 px, radius 7).
- **Main content:** `--canvas-soft` background, optional right details drawer.
- **Shop switcher popover:** shop avatar and name, connection status, plan, active listing count, last sync, "Manage shops" link; agency users can search and group shops by client.
- **Command palette (Cmd/Ctrl+K):** navigation plus actions — Search keywords, Open listing, Connect shop, Create bulk edit, Calculate fees, View low-margin alerts, Switch shop, Invite team member.
- **Mobile shell:** compact top bar (logo, current shop, notifications, menu); sidebar becomes a full-height drawer; bottom nav limited to five destinations — Home, Research, Listings, Analytics, More; tables become cards or horizontally scrollable tables with a frozen primary column; drawers become full-screen sheets.

### As-built navigation

The prototypes show a reduced nav: **Home** (Overview) · **Research** (Find hot products, Keywords) · **My shop** (Listings, Profit & fees) · **Tools** (Simple Calculator, Fee Calculator). The full intended IA is in §7 of the brief — implement the reduced set first and keep advanced groups collapsible.

### Settings sub-navigation (240 px)

**Account:** Profile, Security, Notifications · **Shops & data:** Shop connections, Data permissions, Integrations, Browser Extension · **Workspace:** Team & roles, Billing & plan.

---

## Screens

Screens are numbered continuously across files; the number and frame size appear as an uppercase label above each frame in the prototype. Use those labels to locate any screen.

### Foundations — `RankKW Foundations.dc.html` (read first)
The canonical reference. **01** color tokens (light + dark set) · **02** typography and metric style, spacing and shape · **03** the six provenance badges with tooltips and example metrics · **04** controls: buttons (primary, secondary, ghost, destructive, disabled, loading), inputs, selects, checkboxes, radios, toggles, search, segmented control · **05** surfaces: KPI card, alert card, data table, dialog, drawer, tabs, chart styling · **06** desktop shell at 1440 × 900 · **07** collapsed sidebar, shop switcher, command palette, mobile shell.

### Auth & onboarding — `RankKW Auth & Onboarding.dc.html`
- **07 · Login · 1440 × 900** (+ error state, + mobile). Left form column, subtle right-side product preview. Email/password, Google sign-in, password visibility toggle, create-account switch, terms and privacy links, accessible field errors. No fake social proof.
- **09 · Onboarding steps 1–2 · role and goal · 1440 × 900.** Five-step sequence with visible progress: role (seller / POD / digital / consultant-agency) → primary goal → connect shop or research-only → permission modules in plain language → first-value setup (COGS rule, run audit, or first keyword search). Nonessential steps are skippable; an incomplete account keeps a dashboard checklist.
- **10–11 · Connect Etsy shop & permissions · 1440 × 900.** Calm centered card, storefront icon, what EtsyPilot can and cannot access, permissions grouped Read / Manage listings / Orders & financials, security line, primary **Continue to Etsy**, secondary **Explore without connecting**, trademark disclaimer.
- **12–13 · Sync progress & setup checklist.** Named stages, not an indefinite spinner: Confirming shop → Importing listings → Syncing inventory → Loading orders → Calculating metrics. The user may enter the product while nonessential history continues syncing.

### Home & Action Center — `RankKW Home & Action Center.dc.html`
- **14–15 · Home overview, connected shop · 1440 × 1180.** Answers three questions: what changed, what needs attention, what next. Header: "Good morning, Salman", shop and date range, last sync, primary **Optimize listings**, secondary **View profit**. Four KPI cards max per row — Gross sales (Verified), Orders (Verified), Net profit (Calculated), Active listings (Verified) — each with period-over-period delta, compact sparkline and provenance badge. Below: Action Center (prioritized alerts with severity stripe, impact, evidence and one CTA), sales/profit chart with Gross sales / Net profit / Orders toggle, catalog health, recent changes with measured outcomes, seasonal opportunities with confidence and source, getting-started checklist.
- **16 · Unconnected shop · syncing · stale-data states.**

### Research — `RankKW Research.dc.html`
- **21 · Find hot products · 1440 × 1000.** Data explorer with the collapsed 72 px rail. Filters: keyword, category, price, estimated monthly sales, listing age, reviews, favorites, shop country, digital/physical, personalization, estimated competition, trend direction. Columns: image+title, shop, price, reviews, favorites, est. monthly sales, est. monthly revenue, listing age, trend, opportunity score, save/actions. Estimated columns are amber and show ranges. Card/table toggle, saved views, column manager, export, compare selection, skeleton loading rows.
- **23–24 · Keyword research and keyword detail · 1440 × 1040.** Large search input with country/locale selector. Summary row: Demand (Estimated), Competition (Estimated), Opportunity (Calculated), 30-day trend (Estimated). Panels: 12-month trend with seasonal annotations, related-keyword table (demand range, competition, opportunity, trend, word count, relevance, add-to-list), intent grouping, category distribution, top listings, suggestion tree, "How this data works" methodology panel. Multi-select → bulk save, export, "Optimize a listing with selected keywords".
- **34 · Competitor shop profile** · **25 · keyword lists** · no-results and mobile. Competitor profile has Overview / Listings / Changes tabs; publicly observable metrics are separated from an amber-tinted estimated-range section with an explicit warning that estimates are not official Etsy figures.

### Shop management — `RankKW Shop Management.dc.html`
- **36 · Listings manager · 1440 × 980 — selection active.** The core operations table. Toolbar: search, filters, saved views, columns, import/export, create listing, bulk edit. Columns: checkbox, thumbnail+title, status, price, quantity, variations, section, renewal date, SEO health, margin, views (if imported), last changed, actions. Sticky checkbox and title columns; inline edit for low-risk fields; larger edits open a side drawer; unsaved changes are explicit; a bulk-action bar appears with selection.
- **38 · Listing editor · 1440 × 940.** Two columns — main editor (title, description, media, category, attributes, price, inventory, variations, shipping, tags) and right rail (listing health, validation, AI assistant, marketplace preview, publish controls). Character counters, repeated-keyword warnings, brand-term lock, category-property validation, autosave indicator, compare with published version, save draft / schedule / publish. AI suggestions insert only on approval.
- **40–43 · Bulk editor — configure, validate, review diff, progress** (940 px panels). Validation groups results into Ready / Warnings / Blocked; review shows exact diffs on sampled listings; final confirmation summarizes affected count and rollback availability; progress reports queued / running / succeeded / warning / failed in real time with a downloadable error report.
- **44–45 · Change history and rollback · mobile listings.** Audit timeline: timestamp, user, shop, listing count, change type, source (manual / AI-assisted / scheduled / automation), status, rollback availability. Selecting an event opens before/after diffs, validation results, failures, comments and linked experiment. Rollback requires a current-state recheck.

### Analytics & profit — `RankKW Analytics & Profit.dc.html`
- **51 · Shop analytics · performance tab · 1440 × 1000.** Tabs: Performance, Listings, Customers, Traffic imports, Experiments. Verified sales/order trend, AOV, calculated profit and margin, best listings by verified revenue, category contribution, refund/cancellation rate, repeat-customer rate, insight/action panel. Views, conversion, search queries and Etsy Ads never appear as live API data — they appear as **Connect or import this data** cards.
- **53–56 · Profit & fees · waterfall, reconciliation, COGS setup · 1440 × 1020.** Top cards: Gross sales, Etsy fees, Product cost, Net profit, Net margin. Waterfall from gross sales → discounts/refunds → Etsy fees → production/shipping → ads → net profit. Transaction table with matched / partially matched / unmatched reconciliation status and exception resolution. Cost setup: default %/fixed COGS, listing-specific, variation-specific, POD integration, shipping, manual ad import, overhead allocation. Incomplete coverage shows the warning state "62% of order value has a confirmed product cost."
- **57–60 · Sales map, unconnected map state, experiment tracker.** Choropleth plus country table (orders, gross sales, AOV, repeat rate, estimated delivery time), aggregated from the shop's own authorized receipts, with the connect-to-enable explanation and low-volume suppression.

### Optimization & AI — `RankKW Optimization & AI.dc.html`
- **61–62 · Listing audit overview and detail · 1440 × 980.** A prioritized issue list, not an arbitrary single score. Categories: critical setup errors, search clarity, category and attributes, title and tags, description clarity, media completeness, pricing and margin, shipping/inventory. Each issue card: impact level, explanation, affected listing count, recommended action, source/rule date, fix individually or in bulk.
- **65–68 · AI listing helper · split view with draft approval · 1440 × 940.** Left: conversation and instructions with context selectors (shop/listing, target keywords, tone, locked required words, product facts, locale). Right: structured draft — title, tags, description, attributes, warnings — with source chips under every generated section and Accept / Edit / Regenerate / Compare / Save as draft.
- **63–64, 69–70 · Tag optimizer, compare listings, AI error and limit states** (640 px panels).

### Settings & compliance — `RankKW Settings & Compliance.dc.html`
- **72–73 · Shop connections & data permissions · 1440 × 980.** Granted scopes with plain-language reasons, last synchronization, disconnect, export and delete-data controls.
- **76–77 · Billing and plan comparison · 1440 × 820.** Free $0 (1 shop, 50 listings) · Solo $12/mo (1 shop, 500 listings) · Growth $29/mo (3 shops) · Agency $79/mo (10 shops, 5 seats). Show amount, period, next renewal and tax; no preselected annual upgrade; self-serve one-click cancellation with confirmation and downloadable receipt; explain post-downgrade data handling; usage meters for shops, seats, listings and AI.
- **74–75, 78–80 · Team & roles, notifications, data export & deletion, privacy.** Roles: Owner, Admin, Analyst, Listing editor, Finance viewer, Client approver, Read only, as a permission matrix by shop and module. Never expose one client's data to another.
- Also present as `RankKW Settings & Compliance (standalone).html`, a self-contained copy.

### Browser extension — `RankKW Browser Extension.dc.html`
340 px popups inside Chrome and Firefox browser chrome: listing detected (populated), loading, unavailable, estimated and error states, plus a security note, the extension settings section, and a marketing page.

### Tools — `RankKW Simple Calculator.dc.html`
Tools navigation and the Simple Calculator page at 1440 × 900 with the full 264 px sidebar; worked examples, mobile, and a public free-tool variant. The formula always prints under the result: `$29 × (1 − 20%) = $23.20`. Apply the same treatment to the Fee Calculator (inputs and outputs in §9.19 of the brief) — always show the formula, the fee-rule effective date, and the "actual charges can vary" disclaimer.

### States & responsive — `RankKW States & Responsive.dc.html`
- **89 · Accessibility annotations.**
- **90 · Responsive breakpoints — the same screen at four widths** (mobile 360–767, tablet 768–1023, desktop 1024–1439, wide 1440+).

### Palette exploration — `RankKW Color Themes.dc.html`
Five 900 × 640 dashboard variants for palette comparison only. Not a shipping screen.

---

## Interactions & behavior

- **Motion:** 150–200 ms for hover, drawers, tabs and menus; 200–300 ms for page and panel transitions; determinate progress animation for sync and bulk operations. Numbers must not roll excessively. No parallax or decorative background animation. Respect `prefers-reduced-motion`.
- **Interactive states:** every control needs default, hover, focus-visible, active, disabled, loading and error states — specimens are in Foundations §04. Focus rings are always visible.
- **Tables:** filters, sortable columns, saved views, column manager, sticky primary columns, skeleton rows while loading, row selection driving a bulk-action bar, and an empty state per table.
- **Bulk operations:** observable and reversible. Live queued / running / succeeded / warning / failed counts; downloadable error report; rollback with current-state recheck.
- **Provenance affordance:** badges are hoverable and clickable, opening a tooltip or a methodology drawer.
- **Theme:** Light / Dark / System toggle, persisted.

### Required states on every key screen

First-use empty · unconnected shop · syncing · populated · no results · partial data · stale data · permission missing · rate limited · recoverable error · permanently unsupported data · offline · upgrade required.

Exact copy patterns to reuse:

- "Profit is calculated for 62% of sales because 38 listings do not have a product cost."
- "Etsy does not provide listing views through the public API. Import your Etsy Stats file to add this metric."
- "Last successful sync: 9 hours ago. Some Etsy data may be outdated."
- "Etsy temporarily limited requests. Your sync will continue automatically at 2:40 PM."

### Voice

Short, direct, reassuring: "Connect your shop", "Review 12 changes", "3 listings need attention", "Estimated — not official Etsy sales data", "Your draft is saved", "We could not update 2 listings", "See how this is calculated". Never "Something went wrong" without cause and recovery.

## Accessibility

WCAG 2.2 AA. 4.5:1 minimum for normal text. Full keyboard navigation with visible focus. Correct labels, landmarks, headings, table semantics and form instructions. Status is never conveyed by color alone — badges pair color with icon and text. 44 × 44 px minimum touch targets. Charts carry text summaries and accessible underlying tables. Dialogs trap and restore focus. Toasts use live regions and do not vanish before they can be read.

## State management

State the screens imply, at minimum:

- **Session/user:** authenticated user, role, plan, entitlements.
- **Shop context:** selected shop (global, persisted, visible in the top bar), connection status, last sync timestamp, sync stage and progress, listing count, plan limits.
- **Global filters:** date range and comparison period.
- **Research:** query, locale, filter set, saved views, column configuration, selection, keyword lists.
- **Listings:** table filters/sort/pagination, row selection, per-row dirty state, drawer target, autosaved draft state per listing.
- **Bulk job:** stepper position, chosen fields and configuration, validation result buckets, per-item progress and outcome, rollback token, audit event id.
- **Profit:** cost rules, coverage percentage, reconciliation buckets, unresolved exceptions.
- **AI:** conversation, context selections, draft per section, source attributions, approval state per section, rate-limit/error state.
- **Preferences:** theme (light/dark/system), notification settings, saved views, column layouts.
- **Data envelope:** wrap every metric so provenance travels with the value — `{ value | range, provenance, source, lastUpdated, confidence, exclusions }`. Do this from the first data model; retrofitting it is painful.

## Assets

No binary assets. Everything is CSS and inline SVG. Icons are Lucide-style outlines drawn inline — replace them with the Lucide package. Product imagery in tables and cards is placeholder blocks; real listing thumbnails will come from the connected shop. The Inter font loads from Google Fonts; self-host it in production. No third-party brand assets are used, and Etsy's marks appear only as text under the required trademark disclaimer.

## Files in this bundle

| File | Contents |
|---|---|
| `Claude_Design_Brief_EtsyPilot_Etsy_Seller_Platform.md` | Authoritative product + UX spec. Read first, alongside Foundations. |
| `RankKW Foundations.dc.html` | Design system: tokens, type, badges, controls, surfaces, shells |
| `RankKW Auth & Onboarding.dc.html` | Login, OAuth connect, sync stages, onboarding |
| `RankKW Home & Action Center.dc.html` | Home overview + unconnected/syncing/stale states |
| `RankKW Research.dc.html` | Hot products, keywords, competitor profile, keyword lists |
| `RankKW Shop Management.dc.html` | Listings manager, listing editor, bulk editor, change history |
| `RankKW Analytics & Profit.dc.html` | Shop analytics, profit & fees, sales map, experiments |
| `RankKW Optimization & AI.dc.html` | Listing audit, AI listing helper, tag optimizer, AI states |
| `RankKW Settings & Compliance.dc.html` | Connections, permissions, billing, team, privacy |
| `RankKW Settings & Compliance (standalone).html` | Self-contained copy of the above |
| `RankKW Browser Extension.dc.html` | Extension popups, states, marketing page |
| `RankKW Simple Calculator.dc.html` | Tools nav + calculator, mobile, public variant |
| `RankKW States & Responsive.dc.html` | Accessibility annotations, four-width comparison |
| `RankKW Color Themes.dc.html` | Five palette variants (exploration only) |
| `support.js` | Runtime for the prototype format. Not part of the design; do not port. |

To view a prototype, open any `.dc.html` in a browser with `support.js` beside it. Each file has a fixed "Screens ▾" menu at top-left linking the others, and a Light/Dark/System toggle at top-right.

## Known issues in the prototypes

- `RankKW Analytics & Profit.dc.html`, around line 68: a `<div ...` is missing its closing `>`. Harmless for reading the design; note it if the frame renders oddly.
- Some Foundations color-swatch captions still print the earlier blue hex values under the current terracotta chips. The chips are authoritative.

## Suggested build order

1. Tokens, theme switching, typography, and the Foundations component set — including the provenance badge and the metric envelope.
2. Application shell: sidebar, top bar, shop switcher, command palette, mobile drawer and bottom nav.
3. Auth, OAuth connect, sync stages, onboarding.
4. Home overview and Action Center, with its unconnected / syncing / stale states.
5. Listings manager and listing editor.
6. Research: keywords, then hot products.
7. Profit & fees, then shop analytics.
8. Bulk editor and change history (the stepper, validation and rollback are the highest-risk work).
9. Listing audit and AI listing helper.
10. Settings, permissions, billing, team.
11. Tools, extension, remaining states and responsive passes.


---

# Addendum — PRD gap closure (August 2026)

`PRD.md` in this bundle is now the **authoritative spec**. It supersedes `Claude_Design_Brief_EtsyPilot_Etsy_Seller_Platform.md` wherever the two disagree; the brief stays because it carries screen-level detail the PRD does not restate. The original fourteen screens were designed against the brief, so they lag the PRD in the places noted below.

## Settled decisions

- **Product name:** EtsyPilot, one word, everywhere. The `RankKW *` filenames are legacy.
- **Palette:** terracotta ("Warm Editorial") exactly as tokenised — light and dark both shipped, three-way Light/Dark/System toggle persisted in localStorage. The blue in Foundations captions and any teal elsewhere are stale.
- **Dark theme stays cool** (`#0F172A` / `#1E293B` / `#CBD5E1` with the warm `#E07A4A` accent). Do not warm it.
- **Navigation:** PRD §9, plus an **Analytics** group (Shop Analytics · Sales Map · Experiments) between Listings and Profit for the designed screens the PRD has no home for, and **Change History** under Listings. Orders, Reviews, Inventory and Delivery status are named in the brief but have no design — leave them out of the nav or show an explicit empty state.
- **MVP scope:** single owner, single shop. Agency, team, multi-shop and automations are parked; carry `shop_id` and `actor_id` on every row, create the single-owner Membership row, leave `approval_state` nullable on BulkOperation so they are purely additive. Note that the billing screen currently advertises team seats on Growth and client workspaces on Agency — plan copy needs rewriting if those tiers ship without them.
- **Pricing:** the billing screen is canonical, not the brief. Free $0 (research only) · Solo $15/mo, 1 shop, 200 listings, 60 AI generations · Growth $29/mo, 3 shops, 500 listings, 5 seats, 500 AI generations · Agency $79/mo, 10 shops, unlimited listings. Two open items: the Free tier has no stated listing cap, and seats sit on Growth here but on Agency in the brief.

## New design files

- `EtsyPilot Shop Pulse & Profit Reality.dc.html` — Shop Pulse (91) · Profit Reality (92) · diagnosis badge family (03b)
- `EtsyPilot Data & Methodology.dc.html` — Methodology (93) · Data Sources (94)
- `EtsyPilot Tools.dc.html` — Fee (95) · Ads ROI (96) · Profit (97) · Category Finder (98) · Seasonal Calendar (99) · Trademark Screening (100) · Free Tool Hub (101)
- `EtsyPilot Niche Research, Demo Mode & Digest.dc.html` — Niche Research (102) · demo mode entry/banner/exit (103) · Weekly Shop Pulse Digest + settings (104)
- `EtsyPilot PRD Gap Fixes.dc.html` — Simple Calculator 8 modes (105) · extension logged-out/no-shop/non-Etsy states (106) · billing history, trial, refunds (107) · Action Center full field set (108)

## The one new component

**Diagnosis badges** (Foundations 03b) — CORRELATED, RULED OUT, UNKNOWN. Deliberately *not* pills: 6px radius rectangles with a 3px leading rule, so a diagnosis can never be mistaken for a provenance badge. Each carries an icon and a word, never colour alone. A diagnosis is never rendered without the evidence panel that produced it.

## Screen-by-screen additions

**91 Shop Pulse** (1440 × 1250) — full shell. Four KPI cards (orders, revenue, changes detected, baseline coverage), a baseline-vs-actual daily orders chart with an expected-range band and five numbered event markers, a Detected changes table (rank, change, scope, orders after, diagnosis), and a 392px evidence panel: observation timeline, what was also tested and ruled out, confidence and coverage, limitations, and three destinations (review listings, open in Bulk Editor, see profit impact). The baseline is a rolling 90-day expected range from the shop's own history, by weekday. Every surface repeats that EtsyPilot has no access to Etsy's ranking algorithm.

**92 Profit Reality** (1440 × 1190) — replaces the old Profit & fees waterfall. Tabs: Waterfall · Scenarios · Costs · Transactions. Nine-step waterfall matching PRD 4.7 exactly (Gross revenue → Etsy fees → Payment processing → Offsite Ads → Shipping → COGS → Labour → Other costs → Net profit) with a provenance chip under every step. Five KPIs including cost coverage. A 372px editable-inputs panel with a Conservative/Base/Optimistic segmented control, verified lines locked read-only, a Missing data list, and three scenario summary cards. Discounts and Refunds move to the Transactions tab — the PRD's cost line does not include them. Sample net profit is $4,938.20 (not the old $5,138.20) because labour, payment processing and other costs are now counted.

**93 Methodology** (1440 × 1120) — the page every provenance tooltip links into. The five classes, then per-metric cards (keyword demand, net profit, Shop Pulse baseline) each carrying source, method, freshness, confidence, coverage, limitations and exclusions, plus a "what we never do" list and the trademark disclaimer.

**94 Data sources** (1440 × 1020) — seven sources in one table (Etsy Open API v3, your cost setup, public marketplace signals, Etsy Stats import, EtsyPilot event log, language model, demo dataset) with what each provides, its class, refresh cadence and limitations. Below it: what Etsy does not release and what to do instead, plus export and delete controls.

**95–101 Tools** — Fee calculator as a full page (1440 × 940) with a 352px input column, a large profit result with its formula, a fee breakdown, a three-price sensitivity strip and the fee-rule effective date; Ads ROI with six outputs and a spend-scenario slider; Profit calculator; Category finder with required-attribute chips; Seasonal calendar with a twelve-month heat strip and prep windows; Trademark screening with EXACT/PARTIAL match badges and a prominent not-legal-advice panel; and the public Free Tool Hub.

**102 Niche research** (1440 × 1000) — five estimated KPIs as bands, a twelve-month demand band chart (dashed where sampling was thin), a sub-niches table including a "too few samples / Unknown" row, and a "what would have to be true" panel that states conditions rather than making a recommendation.

**103 Demo mode** — entry card, the persistent banner (dark bar plus dashed-border Demo chips that *replace* provenance badges, so a demo screenshot can never pass as real data), and the leaving-demo dialog. PRD 4.8 makes demo mode the default development path; treat it as a first-class app state, not a flag.

**104 Weekly Shop Pulse digest** — a 640px email leading with the baseline breach, three KPIs, the three diagnosed changes and one destination button, plus notification settings. It does not send when nothing crossed the baseline.

**105–108 Gap fixes** — additions to existing screens, not replacements: Simple Calculator's full eight modes with per-mode formulas and validation rules; the extension's three missing states; billing history with a declined row and a refund row, trial terms and refund/cancellation terms; and the Action Center card carrying the complete PRD 4.1 field set across open, in-progress, completed and dismissed states.

## Still not designed

Named in the brief but demoted by the PRD, so build only if scope is reinstated: Trends / Trend Buzz, Orders, Reviews, Inventory, Delivery status, the Alerts centre and automation rule builder, the experiment tracker list view, and agency client workspaces with their approval queue.
