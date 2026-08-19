# Etsy Pilot — Phase 0: Discovery & Audit

**Status:** Complete — awaiting approval before Phase 1
**Date:** 2026-08-19
**Repository state at audit time:** empty (git repo only, no code)

---

## 0. Sources reviewed

| # | Source | Size | Notes |
|---|---|---|---|
| 1 | `RankKW-complete-documentation-with-calculator.md` | 405 lines | Original product MD |
| 2 | `PRD.md` | 405 lines | **Byte-identical to source 1** |
| 3 | `architecture.md` | 401 lines | Technical architecture |
| 4 | `rules.md` | 316 lines | Engineering boundaries |
| 5 | `phases.md` | 345 lines | Phase sequence 0–12 |
| 6 | `design.md` | 318 lines | Design system rules + fallback palette |
| 7 | `memory.md` | 142 lines | Empty working-memory template |
| 8 | `Claude_Design_Brief_RankKW_Etsy_Seller_Platform.md` | **1,191 lines** | **Found inside the screens ZIP** — the most detailed UI/UX spec in the whole set |
| 9 | 12 × `.dc.html` canvas files | ~90 artboards | The visual foundation |
| 10 | 2 × reference PNGs | — | External inspiration only (a purple "caltimes" dashboard, a dark-teal "KARCIZ" template). Neither is Etsy Pilot. |

`PRD.md` is a byte-for-byte duplicate of the original product MD. There is no separate PRD to reconcile — sources 1 and 2 are one document.

---

## 1. Product Understanding

### What Etsy Pilot is

Etsy Pilot is an **Etsy Seller Decision & Operations Intelligence platform**. It is deliberately *not* a keyword/SEO dashboard. The category distinction matters because it determines what the product owes the user: a research tool owes you numbers, whereas a decision-and-operations product owes you a defensible next action plus a safe way to execute it.

The product answers five questions in sequence:

1. What is happening in my Etsy shop?
2. What can I reasonably infer from the evidence?
3. What should I do next?
4. What happened after I acted?
5. What did it mean for my profit?

### Target users

**Primary (PRD §2):** solo Etsy sellers, growing Etsy businesses, sellers with many listings, sellers needing SEO/listing optimization, sellers needing operational automation, sellers who want to understand sales changes, sellers needing profit visibility.

**Refined by the design brief (§2):** four concrete personas —
1. New seller researching keywords, improving first listings.
2. Established seller, 100–5,000 listings, needs profit + bulk editing + operational alerts.
3. Digital-product / print-on-demand seller with a large catalog.
4. Consultant / VA / agency managing multiple shops.

Persona 4 drives a large amount of designed surface (team, roles, approvals, client workspaces) that the PRD does not list as MVP. See §12, Conflict C7.

### Main problem

Sellers cannot separate fact from estimate, cannot tell what deserves attention today, cannot safely change many listings at once, cannot tell whether a change worked, and cannot see real profit after fees and costs. Existing tools give conflicting estimates and stop at "here is an opportunity" without helping the seller act.

### Product promise

> **Make smarter Etsy decisions with data you can trust.**

(This exact line is the hero copy on the login screen and the Foundations direction statement — it is the established positioning line, not an invention.)

### Core workflow

```
DISCOVER → DIAGNOSE → DECIDE → FIX → VERIFY → MEASURE → LEARN
```

Concretely, as designed:
Shop Pulse detects a sales drop → evidence and diagnosis → review affected listings → Safe Bulk Editor applies the fix → Experiment tracker verifies → Profit Reality measures the money → the outcome informs the next action.

### Main differentiators

1. **Action Center** — the home surface is a prioritized work queue, not a metric wall.
2. **Shop Pulse** — monitoring against the shop's *own* historical baseline.
3. **Data Provenance** — every important number is labelled Verified / Calculated / Estimated / Seller input / AI draft / Unavailable.
4. **Safe Bulk Editor** — a mandatory validate → diff → confirm → apply → audit → rollback pipeline.
5. **Profit Reality** — a full revenue-to-net-profit waterfall with coverage and confidence.
6. **AI Rewrite Copilot** — drafts only, always reviewable, never auto-publishing.
7. **Listing Audit** — prioritized issues with the exact fix, not an arbitrary score.
8. **Keyword Research** — ranges with confidence, never false precision.
9. **Honest Billing** — no dark patterns.

The unifying discipline across all nine: **the product never claims more certainty than its evidence supports.** That is the actual differentiator; the nine features are how it shows up.

---

## 2. Screen Inventory

12 canvas files, ~90 numbered artboards. Files are named `RankKW …` but the in-canvas branding is already `EtsyPilot` / `EP` — the rename was started and left partial.

### 2.1 Foundations (`RankKW Foundations.dc.html`) — artboards 01–07

| Artboard | Contents |
|---|---|
| Direction | 10 design principles |
| 01 | Colour tokens + dark-mode set |
| 02 | Typography scale, spacing, shape, elevation rule |
| 03 | Data-provenance badge system, methodology tooltip, confidence + freshness indicators |
| 04 | Controls — buttons (primary/secondary/destructive/quiet × default/hover/focus/loading/disabled), inputs, validation, checkbox, toggle, segmented control, filter chips |
| 05 | Surfaces — KPI card, unavailable card, skeleton, responsive data table, alert cards, tabs, chart styles, confirmation dialog, right drawer, toast, empty state |
| 06 | Desktop application shell, 1440 × 900 |
| 07 | Collapsed sidebar, shop switcher, command palette, mobile shell |

- **Purpose:** the design system itself.
- **Main components:** every primitive the rest of the set reuses.
- **States:** this file *is* the state catalogue.

### 2.2 Auth & Onboarding — artboards 07–13

| Artboard | Screen | Purpose | Key components | Main actions | States |
|---|---|---|---|---|---|
| 07 | Login | Authenticate | Split layout, product preview rail, Google SSO, password toggle | Sign in, Forgot password, Create account | Default, **error** (attempts remaining), mobile |
| 08 | Registration | Create account | Password strength meter, terms consent | Create account | Default, mobile 390 |
| 09 | Onboarding 1–2 | Role + primary goal | 5-step stepper, 4 role cards, 5 goal cards | Continue, Skip, Save & exit | Default |
| 10–11 | Connect Etsy shop | OAuth consent | Scope groups (read/manage/orders/inventory), "never receives your Etsy password", "What Etsy Pilot can't do", trademark disclaimer | Continue to Etsy, Explore without connecting | Default, **connection cancelled**, agency delegation |
| 12 | Sync progress | Staged import | 5 named stages with per-stage counts, overall % + ETA | Start using now, View sync details | Syncing, **rate-limited mid-sync** |
| 13 | Setup checklist | First value | 5-item checklist, 2 of 5 done | Set up COGS, Run audit, Search | Partial, dismissible |

Navigation relationship: Login → Onboarding 1–5 → Sync → Dashboard, with the checklist persisting on the dashboard until complete.

### 2.3 Home & Action Center — artboards 14–20

| Artboard | Screen | Notes |
|---|---|---|
| 14–15 | Home overview (connected) | Full shell, breadcrumb, greeting, shop + date-range + currency subtitle, primary `Optimize listings` / secondary `View profit`, Quick Tools side rail, footer disclaimer |
| 16 | Home — degraded states | **Unconnected**, **stale data (9 h)**, **still syncing**, **permission revoked**, **upgrade required** — five distinct treatments |
| 18 | Notifications panel | Tabbed (All 9 / Profit / Sync / Approvals), 5 notification types with timestamps |
| 20 | Mobile home 390 | KPI stack, Action Center, catalog health, 5-item bottom tab bar |

- **Composition (visible in the Color Themes file):** 4 KPI cards max per row (Gross sales · Verified, Orders · Verified, Net profit · Calculated + coverage, Active listings · Verified) → **Action Center outranks the chart** → sales chart → catalog health → recent changes.
- **Main actions:** every alert carries a specific CTA (`Review pricing`, `Calculate New Price`, `Add a default rule to fix all at once`) — no dead ends.
- **Navigation relationship:** the hub. Every alert routes into Listings, Profit, Audit, or Bulk editor.

### 2.4 Research — artboards 21–25, 34

| Artboard | Screen | Purpose | Key detail |
|---|---|---|---|
| 21 | Find hot products | Opportunity discovery | 11 filters, 11 columns, saved views, table/cards toggle. **Estimated columns are ranges** (`40–65`, `$1,200–$1,850`), never false precision. `Not enough data` where sparse. |
| 23–24 | Keyword research + detail | Demand/competition | 4 summary tiles (Demand Estimated, Competition Estimated, Opportunity **Calculated**, 30-day trend Estimated), 12-month trend chart **dashed where sparse**, related-keyword table with multi-select, search-intent grouping, top listings, "How this data works" panel |
| 25 | Keyword lists | Research → action bridge | Named lists, shared-with, `Apply to listings`, Export |
| 34 | Competitor shop profile | Analyze (never "spy") | Tabs Overview/Listings/Changes. **Publicly observable metrics are visually separated from an amber-tinted estimated block.** Price distribution, most-used tags with "+12 you don't use" → keyword gap. |
| — | No-results state | Explains *why* the filter combination is empty and offers the specific filter to remove |
| — | Research mobile 390 | Table → cards, two decision columns kept |

### 2.5 Shop Management — artboards 36–45

| Artboard | Screen | Purpose | Key detail |
|---|---|---|---|
| 36 | Listings manager | The operations surface | Sticky selection + title columns, 10 columns, saved views, **bulk action bar appears on selection** (`24 listings selected` / `Select all 412`), inline edit for low-risk fields, `unsaved change` marker, footnote explaining margin coverage and that views are unavailable |
| 38 | Listing editor | Single-listing edit | Two-column: main editor + right rail (listing health 7 checks, AI assistant, marketplace preview). Character counters, repeated-keyword warning, **locked brand term**, **required attribute blocks publishing**, autosave, compare with published |
| 40–43 | **Bulk editor** | Safe mass change | 5-step stepper: Select → Choose fields → Configure → Validate → Review & publish. Validation groups **Ready 122 / Warnings 6 / Blocked 0**. Review shows exact diffs (sampled 3 of 122, `Inspect all`). Confirmation states rollback window. Progress shows **Succeeded / Running / Warnings / Failed** live, with a named failure reason and error report. `Pause` / `Stop and roll back`. |
| 44 | Change history | Immutable audit | Columns: When, User, Listings, Change, **Source** (Bulk edit / Scheduled / AI-assisted), Status, **Rollback availability with expiry** |
| 45 | Rollback dialog | Safe reversal | **Re-checks current state first** — "3 listings have changed on Etsy since this job and will be skipped rather than overwritten". Typed acknowledgement checkbox. |
| — | Listings mobile 390 | Cards + sticky bulk bar |

This is the most complete and most carefully specified area of the entire set.

### 2.6 Analytics & Profit — artboards 51–60

| Artboard | Screen | Purpose | Key detail |
|---|---|---|---|
| 51 | Shop analytics | Verified performance | 5 tabs (Performance/Listings/Customers/Traffic imports/Experiments), 5 KPIs each badged, solid=verified vs dotted=previous chart convention, best listings, section contribution, **"Traffic and ads — Unavailable"** import cards that explicitly refuse to estimate |
| 53–56 | **Profit & fees** | Financial truth | Coverage banner ("62% of order value… excludes those orders rather than assuming a cost"), 5 KPIs, **waterfall** Gross → Discounts → Refunds → Etsy fees → Production → Ads → Net profit, transaction reconciliation (**Matched 401 / Partial 29 / Unmatched 8**), cost setup (default rule, listing costs, POD/shipping CSV, manual ad spend), fee-rule effective date |
| 57–58 | Sales map | Aggregated geography | Choropleth + country table, **regions under 5 orders suppressed for privacy**, explicit "only Etsy can release this to you" copy, unconnected state |
| 59–60 | Experiment tracker | Verify that changes worked | Positive / Inconclusive / Negative results, **explicit small-sample and seasonality warnings**, links to the change that caused it |
| — | Profit mobile 390 | Waterfall as a stacked list |

### 2.7 Optimization & AI — artboards 61–70

| Artboard | Screen | Purpose | Key detail |
|---|---|---|---|
| 61–62 | Listing audit | Prioritized issues | Health score **with stated methodology** ("rule severity weighted by each listing's share of verified revenue"), 7 rule groups with counts, per-issue detail = Why this matters + The fix + affected listings + **revenue at risk** + pre-filled suggested values |
| 65–68 | AI listing helper | Draft generation | Split view: inputs (keyword source, tone, **locked terms**, guardrails) vs Current(Verified) │ AI draft(Needs approval). **Word-level diff**, "What changed and why", `Accept` / `Edit before accepting` / `Reject`. Bulk drafts approved **individually**. Generation quota visible. |
| 63 | Tag optimizer | Tag hygiene | Flags duplicate-with-title and too-broad tags, suggests from saved lists with demand ranges |
| 64 | Compare listings | Benchmarking | Explicit warning that your verified figure and competitors' estimates "are not directly comparable" |
| 69 | AI error + limit states | **"no generation was counted against your limit"** |
| 70 | AI mobile 390 | Draft review |
| — | AI transparency panel | Four plain-language commitments |

### 2.8 Settings & Compliance — artboards 71–80

| Artboard | Screen | Key detail |
|---|---|---|
| 72 | Shop connections | Multi-shop, per-shop status (connected / token expired / client read-only), sync timing |
| 73 | Data permissions | Each scope states what it enables **and what breaks if revoked** |
| — | Disconnect dialog | 4 consequences listed, **type-to-confirm** |
| 74 | Team & roles | 4-role capability matrix, pending invites |
| 75 | Notifications | Per-event in-app/email matrix, thresholds, quiet hours |
| 76–77 | Billing & plan | Usage meters (listings, AI generations, shops, seats), 4-plan comparison, **downgrade keeps data / pauses jobs rather than deleting** |
| 78 | Export & deletion | Export before delete, 30-day removal, 7-day grace, "your Etsy shop is not affected" |
| 79 | Legal & attribution | Trademark disclaimer, 5 policy documents |
| 80 | System status + audit log | Per-service status |
| — | Settings mobile 390 | |

### 2.9 States & Responsive — artboards 81–90

| Artboard | States |
|---|---|
| 81–84 | Rate limit (with resume time + queue), offline (with held drafts), sync failure (expired access), permission error (role-based, work saved as pending job) |
| 85–88 | Empty catalog, very large catalog (24,180 listings, optimized mode, batch checkpointing), 404, 500 (**with reference code**) |
| 89 | Accessibility annotations — contrast ratios, non-colour encoding, touch targets, keyboard map, screen-reader behaviour |
| 90 | Responsive breakpoints — the same screen at 1440 / 1024 / 768 / 390 |

### 2.10 Additions (3 files)

- **Simple Calculator** — Tools nav + calculator page + 8 calculation types + worked examples + mobile + **public logged-out free-tool variant**. Explicitly kept separate from Profit Reality, with a cross-link between them.
- **Browser Extension** — Chrome 380 × 600 and Firefox popups, plus logged-out / no-shop / loading / unavailable / estimated / error / non-listing states, a security "can never do" panel, settings section, and marketing page.
- **Color Themes** — 11 brand explorations. **Not a product screen.** It is the decision record for the palette. See §8.

---

## 3. Feature Inventory

### 3.1 Existing / Specified — documented *and* designed

| Feature | PRD | Screens |
|---|---|---|
| Login / registration / SSO | §4.11 | 07–08 |
| 5-step onboarding | §4.11 | 09 |
| Etsy OAuth + scoped permissions | §4.8 | 10–11 |
| Staged sync + setup checklist | §4.11 | 12–13 |
| Home overview + KPIs | §3 | 14–15 |
| **Action Center** | §4.1 | 14–15, mobile 20 |
| Notifications | §4.10 | 18 |
| **Data provenance badges + methodology drawer** | §4.3 | Foundations 03 |
| Confidence + freshness indicators | §4.3 | Foundations 03 |
| Keyword research + detail | §6 | 23–24 |
| Keyword lists | §6 | 25 |
| Find hot products / opportunity research | §6 | 21 |
| Competitor shop profile | brief §9.5 | 34 |
| Listings manager | §4.6 | 36 |
| Listing editor | §5 | 38 |
| **Safe Bulk Editor (full 5-step)** | §4.6 | 40–43 |
| **Change history + rollback** | §4.9 | 44–45 |
| Shop analytics | §6 | 51 |
| **Profit waterfall + reconciliation + COGS** | §4.7 | 53–56 |
| Sales map (aggregated) | brief §9.13 | 57–58 |
| Experiment tracker | brief §9.18 | 59–60 |
| **Listing audit** | §4.4 | 61–62 |
| Tag optimizer | brief §9.x | 63 |
| Compare listings | brief §9.x | 64 |
| **AI Rewrite Copilot + approval** | §4.5 | 65–68 |
| Shop connections + data permissions | §4.8 | 72–73 |
| Team & roles | brief §9.23 | 74 |
| Notification preferences | §4.10 | 75 |
| **Billing, usage, plan comparison** | §4.10 | 76–77 |
| Export & account deletion | brief §3 | 78 |
| Legal / trademark / status / audit log | brief §3 | 79–80 |
| **All 13 UI states** | §4.12 | 81–90 |
| **Simple Calculator (8 modes) + free variant** | §11 | Addition |
| **Browser extension (Chrome + Firefox)** | §10 | Addition |
| Command palette ⌘K | brief §6.4 | Foundations 07 |
| Accessibility spec | brief §14 | 89 |
| Responsive spec | brief §15 | 90 |

### 3.2 Missing — required by documentation, **not represented in any screen**

Verified by exhaustive search across all 12 canvas files.

| # | Missing item | Required by | Evidence of absence |
|---|---|---|---|
| **M1** | **Shop Pulse — the entire feature** | PRD §4.2, phases.md **Phase 3**, listed as differentiator #2 | `"Shop Pulse"` appears **only** as a sidebar label in the Color Themes exploration and as a button in the extension. **No artboard exists.** |
| **M2** | Diagnosis labels `CORRELATED` / `RULED_OUT` / `UNKNOWN` | PRD §4.2, rules.md §5 | **0 occurrences** anywhere |
| **M3** | Baseline-vs-actual chart with event markers | design.md §11 | 0 occurrences (`baseline` hits were CSS `vertical-align`) |
| **M4** | Profit scenarios Conservative / Base / Optimistic | PRD §4.7, phases.md Phase 5 | `Conservative` 0, `Optimistic` 0 |
| **M5** | Profit waterfall lines: **Payment processing**, **Offsite Ads** (as distinct from imported ads), **Labor**, **Other costs** | PRD §4.7 | 0 occurrences. Designed waterfall is Gross → Discounts → Refunds → Etsy fees → Production → Ads → Net. |
| **M6** | Weekly Shop Pulse Digest | PRD §6, phases.md Phase 3 | `Digest` 0 occurrences (a "Weekly summary" notification toggle exists in Settings 75, which is adjacent but not the digest) |
| **M7** | Event/change **taxonomy** surfaced (PRICE_CHANGED, STOCKOUT, AI_CHANGE_APPLIED, …) | PRD §4.9 | Change history shows human-readable changes but not the typed event model |
| **M8** | Action lifecycle fields: explicit **priority**, **dismissed** state, **completion time** | PRD §4.1 | Alerts show severity + snooze; priority/dismissal/completion are not modelled on screen |
| **M9** | Free Tool Hub (an index page) | PRD §5, §6 | 0 occurrences; individual tools exist in nav only |
| **M10** | CSV Export as a named capability | PRD §5 | Per-screen `Export` buttons exist; no unified export surface |
| **M11** | Niche Research, Rank Checker, Keyword Gap page, Bulk Keywords, Trends, Trend Buzz, Monthly Trends, Top Sellers, Category Report, Competitor Estimates | PRD §9 nav / brief §7 nav | Nav labels only; `Niche` 0, `Rank Checker` 0. Keyword Gap exists only as a link. |
| **M12** | Tools with no screen: Fee Calculator, Ads ROI Calculator, Profit Calculator, Category Finder, Seasonal Calendar, Trademark Screening | PRD §9, brief §9.19–9.21 | Nav entries + one Quick Tools card; no artboards |
| **M13** | Automations: alerts centre, scheduled changes, rule builder | brief §9.22 | Nav + notification references only; no rule-builder screen |
| **M14** | Orders / Inventory / Delivery status / Reviews | brief §7, §9.14–9.15 | Nav entries only; no artboards |
| **M15** | Agency approval flow screens | brief §8.6 | Referenced from notifications and permission-error state; no approval-queue artboard |
| **M16** | Data → Methodology / Data Sources pages | PRD §9 | A methodology *drawer* exists; the standalone pages do not |
| **M17** | Marketing / public site beyond the free calculator | Implied by billing + free plan | Only the public calculator variant exists |

### 3.3 Unclear — requires a decision before implementation

| # | Item | Why it is unclear |
|---|---|---|
| **U1** | **Brand colour** | The screens' live token set says terracotta `#B4472A`; the Foundations *caption text* in the same file says blue `#2563EB`; `design.md` says teal `#167C80`. Three answers. (Recommendation in §8.) |
| **U2** | **Product name rendering** | You specified "Etsy Pilot" (two words). Every screen renders `EtsyPilot` (one word) with an `EP` mark. Which is the wordmark? |
| **U3** | **MVP scope: is agency/team/multi-shop in or out?** | PRD §4 MVP does not mention them; brief and screens design them fully. This is the single largest scope question. |
| **U4** | **Profit Reality vs Profit & fees** | Are these one screen or two? PRD names "Profit Reality" with scenarios; screens designed "Profit & fees" without scenarios. |
| **U5** | **Pricing** | Brief §9.24: Solo **$12**. Billing screen 76–77: Solo **$15**. Free/Growth/Agency agree ($0/$29/$79). |
| **U6** | **Plan limits** | Brief: Free 50 listings, Solo 500. Screen: Solo **200** listings, Growth 500. |
| **U7** | **Navigation IA** | Three different navigation trees exist (PRD §9, brief §7, actual screens). Which is canonical? |
| **U8** | **Dark mode neutrals** | Light mode is warm (cream/brown); dark mode is cool slate. Deliberate or unfinished? |
| **U9** | **Domain** | The public calculator references `rankkw.com/tools/…`. What is the real domain? |
| **U10** | **Auth provider** | `architecture.md` mandates Supabase Auth; screens show email/password + Google. Compatible, but confirm Supabase specifically (vs Auth.js) since it implies the Supabase platform. |
| **U11** | **Database hosting** | Postgres + Drizzle is specified; host is not (Supabase Postgres / Neon / RDS). |
| **U12** | **Shop Pulse vs Experiments overlap** | Both answer "did it work?". Are they one feature or two? |
| **U13** | **AI generation quota by plan** | Screen shows 60 (Solo) / 500 (Growth). Free and Agency unspecified. |
| **U14** | **Seed/demo shop identity** | Screens use "Willow & Fern Studio" / "Salman". Keep as the canonical demo shop? |

I have not invented answers to any of these. Nothing in §3.2 or §3.3 will be built until you decide.

---

## 4. Application Architecture

Per `architecture.md`, with no additions beyond what it specifies.

| Layer | Choice | Notes |
|---|---|---|
| **Frontend** | Next.js App Router, React, TypeScript (strict) | Server Components by default; client components only where interaction demands |
| **Styling / UI** | Tailwind CSS + a local component system built on Radix primitives (shadcn/ui pattern), Lucide icons | The brief names shadcn/ui; `rules.md` §9 forbids gratuitous dependencies, so components are vendored into `components/ui/` rather than pulled as a runtime library |
| **Backend** | Next.js Server Actions + Route Handlers → **Domain Services** → **Repositories** → Postgres | UI never touches the DB or an external API directly |
| **Database** | PostgreSQL + Drizzle ORM, typed migrations | |
| **Authentication** | Supabase Auth, behind a local `lib/auth` abstraction | Abstraction so the provider is replaceable and so authorization stays ours |
| **Authorization** | Server-side, shop-scoped, on every request | A user must never reach another shop's data (`architecture.md` §9) |
| **API layer** | Typed contracts + Zod validation at every boundary | |
| **Etsy integration** | `EtsyService` interface with `MockEtsyService` (now) and `LiveEtsyService` (Phase 11) | Selected by env var. **This is the load-bearing abstraction of the whole project.** |
| **AI integration** | Anthropic Claude behind `lib/ai`, receiving structured *provenance-aware* payloads | AI is given facts and their status; it never fetches or invents them |
| **Background jobs** | Inngest — Etsy sync, baseline calculation, anomaly detection, bulk-edit queue, retries, weekly digest | |
| **Billing** | Stripe behind `lib/billing`, webhook-driven | |
| **Email** | Resend behind `lib/email` | |
| **Analytics** | PostHog | |
| **Monitoring** | Sentry, with structured errors carrying a correlation ID | The 500 screen's `Reference RK-8F42-…` code is this ID surfaced to the user |

### Request flow

```
Browser
  ↓
Next.js UI (RSC + client islands)
  ↓
Server Actions / Route Handlers   ← authz + Zod validation happen here
  ↓
Domain Services                   ← business rules, provenance attached here
  ↓
Repositories                      ← the only code that touches SQL
  ↓
PostgreSQL
```

### Adapters

```
Domain Services
  ├── EtsyService      (Mock | Live)
  ├── AIService        (Claude)
  ├── BillingService   (Stripe)
  ├── EmailService     (Resend)
  └── AnalyticsService (PostHog)
```

Every adapter is an interface with a mock implementation, so the entire app runs offline in demo mode — which is the Phase 1 acceptance criterion.

### Write-path safety

Every Etsy mutation flows through one gate:

```
Request → authz → validate → diff → explicit confirm → BulkOperation record
       → Inngest queue → per-item execute (rate-limit aware)
       → Event written per item → rollback point retained
```

No code path may write to Etsy without an `operation_id` and an audit record. This is enforced by making the write method private to the bulk-operation service rather than by convention.

---

## 5. Route Map

Reconciling PRD §9, brief §18, and the screens. **Nav grouping follows the screens** (they are the built artefact); PRD-only sections are added where the PRD requires them.

```
PUBLIC / MARKETING
  /                                  Landing
  /tools/etsy-seller-calculator      Public Simple Calculator (no login)
  /legal/terms
  /legal/privacy
  /legal/methodology                 Data methodology
  /legal/subprocessors
  /legal/ai-disclosure
  /status                            System status

AUTH
  /login
  /register
  /forgot-password
  /reset-password
  /auth/callback                     Supabase
  /auth/etsy/callback                Etsy OAuth return

ONBOARDING
  /onboarding                        5-step stepper
  /onboarding/connect
  /onboarding/syncing

APP  (dashboard shell)
  /dashboard                         Home / Action Center
  /dashboard/getting-started
  /action-center                     Full action queue
  /shop-pulse                        ← NEW, no design exists (M1)
  /shop-pulse/[alertId]              Diagnosis + evidence detail

  RESEARCH
  /research/products                 Find hot products
  /research/keywords
  /research/keywords/[term]
  /research/keyword-lists
  /research/keyword-lists/[id]
  /research/competitors
  /research/competitors/[shopId]
  /research/trends                   (M11 — nav only)

  MY SHOP
  /shop                              Shop dashboard
  /shop/listings
  /shop/listings/[id]                Listing editor
  /shop/bulk-editor
  /shop/bulk-editor/[operationId]    Progress / result
  /shop/change-history
  /shop/change-history/[eventId]     Diff + rollback
  /shop/orders                       (M14)
  /shop/inventory                    (M14)
  /shop/sales-map
  /shop/delivery-status              (M14)
  /shop/reviews                      (M14)

  ANALYTICS & PROFIT
  /analytics                         Performance
  /analytics/listings
  /analytics/customers
  /analytics/imports                 Traffic / ads import
  /profit                            Profit Reality (waterfall)
  /profit/scenarios                  (M4)
  /profit/costs                      COGS setup
  /profit/reconciliation
  /experiments
  /experiments/[id]

  OPTIMIZE
  /optimize/audit
  /optimize/audit/[ruleId]
  /optimize/ai-helper
  /optimize/ai-helper/[listingId]
  /optimize/tag-optimizer
  /optimize/compare

  TOOLS
  /tools                             Free Tool Hub (M9)
  /tools/simple-calculator
  /tools/fee-calculator              (M12)
  /tools/ads-roi                     (M12)
  /tools/profit-calculator           (M12)
  /tools/category-finder             (M12)
  /tools/seasonal-calendar           (M12)
  /tools/trademark-screening         (M12)

  AUTOMATIONS                        (M13 — pending U3)
  /automations/alerts
  /automations/scheduled
  /automations/rules

  TEAM                               (pending U3)
  /team/members
  /team/roles
  /team/approvals
  /team/activity

  DATA
  /data/methodology
  /data/sources

  BILLING
  /billing
  /billing/usage
  /billing/history

  SETTINGS
  /settings/profile
  /settings/security
  /settings/notifications
  /settings/shops
  /settings/permissions
  /settings/costs
  /settings/extension
  /settings/export
  /settings/audit-log

API
  /api/etsy/oauth/*
  /api/inngest
  /api/stripe/webhook
  /api/extension/*                   Extension-facing, session-authenticated
  /api/export/*

ERRORS
  not-found.tsx                      404
  error.tsx / global-error.tsx       500 with reference code
```

---

## 6. Component Architecture

### Global
`AppShell` · `Sidebar` · `SidebarGroup` · `TopBar` · `ShopSwitcher` · `DateRangePicker` · `CommandPalette (⌘K)` · `NotificationsPanel` · `UserMenu` · `Breadcrumbs` · `PageHeader` · `Footer (trademark disclaimer)` · `ThemeToggle` · `SkipLink`

### Layout
`PageContainer (max 1600)` · `ContentWithRail` · `Drawer (320–420 / full-screen sheet)` · `Sheet` · `Stepper` · `Tabs` · `MobileTabBar` · `StickyActionBar`

### Provenance — *the system's spine, used by every other group*
`ProvenanceBadge` (verified · calculated · estimated · seller-input · ai-draft · unavailable) · `MethodologyTooltip` · `MethodologyDrawer` · `ConfidenceIndicator` · `FreshnessLabel` · `EstimatedRange` · `UnavailableCard` · `SourceChip` · `CoverageMeter`

### Dashboard / Action Center
`KpiCard` · `KpiGrid (max 4)` · `Sparkline` · `ActionCard` · `ActionList` · `SeverityBadge` · `CatalogHealthCard` · `RecentChangesCard` · `GettingStartedChecklist` · `QuickToolsCard` · `SyncStatusBanner`

### Shop Pulse *(to design — M1)*
`PulseTimeline` · `BaselineChart` · `EventMarker` · `DeviationCard` · `DiagnosisBadge (CORRELATED / RULED_OUT / UNKNOWN)` · `EvidencePanel` · `PulseDigestPreview`

### Listings
`ListingsTable` · `ListingCell` · `StatusBadge` · `SeoHealthBadge` · `MarginCell` · `FilterBar` · `SavedViewSelector` · `ColumnManager` · `BulkActionBar` · `ListingEditorForm` · `CharacterCounter` · `TagEditor` · `LockedTermChip` · `ListingHealthPanel` · `MarketplacePreview` · `AttributeValidator`

### Bulk Editor
`BulkStepper` · `SelectionStep` · `FieldStep` · `ConfigureStep` · `ValidationSummary (Ready/Warnings/Blocked)` · `DiffViewer` · `DiffSample` · `ConfirmDialog (typed acknowledgement)` · `OperationProgress` · `OperationStatusCounts` · `ErrorReportDownload` · `RollbackDialog (with state recheck)` · `ChangeHistoryTable` · `AuditTimeline`

### Profit
`WaterfallChart` · `ProfitKpiRow` · `CoverageBanner` · `TransactionTable` · `ReconciliationStatus` · `CostSetupPanel` · `CostRuleForm` · `ScenarioTabs (M4)` · `ScenarioComparison (M4)` · `MissingDataExplainer`

### AI
`AiDraftPanel` · `DraftDiff` · `WhatChangedPanel` · `GenerationInputs` · `TonePicker` · `LockedTermsInput` · `GuardrailList` · `ApprovalBar (Accept / Edit / Reject)` · `BulkDraftQueue` · `GenerationQuotaMeter` · `AiDisclaimer`

### Billing
`PlanCard` · `PlanComparison` · `UsageMeter` · `InvoiceTable` · `PaymentMethodCard` · `CancelFlow` · `DowngradeExplainer` · `UpgradeModal`

### Calculator
`CalculatorShell` · `CalculationTypePicker (8)` · `AmountInput` · `FormulaDisplay` · `ResultCard` · `CopyResultButton` · `WorkedExample`

### Shared UI (`components/ui/`)
`Button (primary/secondary/destructive/quiet × 5 states)` · `Input` · `Select` · `Checkbox (+indeterminate)` · `Toggle` · `SegmentedControl` · `FilterChip` · `Card` · `Badge` · `Table` · `Pagination` · `Dialog` · `Drawer` · `Tabs` · `Tooltip` · `Toast` · `Skeleton` · `EmptyState` · `ErrorState` · `Alert` · `ProgressBar` · `Avatar` · `Breadcrumb`

Every component ships default / hover / focus / active / disabled / loading / error / mobile behaviour, per brief §10.

---

## 7. Data Architecture

### Core entities

| Entity | Key fields | Relationships |
|---|---|---|
| `User` | id, email, name, role, onboarding_state | → Memberships |
| `Membership` | user_id, shop_id, role (owner/admin/editor/viewer) | join User ↔ Shop |
| `Shop` | id, etsy_shop_id, name, currency, timezone, connection_status, last_synced_at, plan | → Listings, Orders, Events |
| `EtsyConnection` | shop_id, scopes[], token_ref, expires_at, revoked_at | tokens stored server-side only, never in a client bundle |
| `Listing` | id, shop_id, etsy_listing_id, title, description, tags[], price, quantity, state, section, sku, attributes, seo_health, last_changed_at | → Variations, Costs, Events, Audits |
| `ListingVariation` | listing_id, name, price, quantity, sku | |
| `Order` | id, shop_id, etsy_receipt_id, gross, discounts, refunds, fees, country, placed_at | → OrderItems |
| `OrderItem` | order_id, listing_id, qty, unit_price, cost_snapshot | links revenue to cost |
| `CostRule` | shop_id, scope (default/listing/variation), value_type (pct/fixed), value | drives coverage |
| `CostImport` | shop_id, source (POD/shipping/ads), period, matched_count, unmatched_count | |
| `Keyword` | term, locale, demand_min, demand_max, competition, opportunity, confidence, observed_at | ranges, never a point value |
| `KeywordList` / `KeywordListItem` | shop_id, name, shared_with | |
| `Audit` / `AuditIssue` | shop_id, rule_id, severity, listing_id, revenue_at_risk, suggested_value | |
| `Action` | id, shop_id, **priority**, severity, title, explanation, evidence_ref, destination_url, status (open/completed/dismissed/snoozed), created_at, completed_at, dismissed_at | powers Action Center (PRD §4.1) |
| **`Event`** | **event_id, shop_id, listing_id, user_id, timestamp, type, source, field, before_value, after_value, operation_id, reason** | **immutable; the spine of Shop Pulse, rollback, audit, history** |
| `BulkOperation` | id, shop_id, user_id, state (DRAFT→VALIDATING→READY→APPLYING→PARTIAL_SUCCESS/COMPLETED/FAILED→ROLLBACK_AVAILABLE→ROLLED_BACK), fields[], listing_count, rollback_expires_at | |
| `BulkOperationItem` | operation_id, listing_id, before, after, status, error, attempts | enables partial success + retry |
| `Baseline` | shop_id, metric, window, mean, stddev, computed_at | Shop Pulse |
| `PulseAlert` | shop_id, metric, deviation, **diagnosis (CORRELATED/RULED_OUT/UNKNOWN)**, evidence_event_ids[], detected_at | Shop Pulse |
| `Experiment` | shop_id, listing_id, hypothesis, change_event_id, started_at, ended_at, primary_metric, result, confidence_note | |
| `ProfitRecord` | shop_id, period, gross, discounts, refunds, etsy_fees, processing, ads, shipping, cogs, labor, other, net, coverage_pct, confidence | |
| `ProfitScenario` | profit_record_id, kind (conservative/base/optimistic), assumptions, net | (M4) |
| `BillingSubscription` | shop_id/user_id, stripe_ids, plan, status, renews_at, trial_ends_at | |
| `UsageRecord` | subscription_id, metric (listings/ai_generations/shops/seats), used, limit, period | |
| `AiGeneration` | shop_id, listing_id, user_id, kind, input_ref, output, status (draft/accepted/rejected), approved_by, approved_at | audit trail for AI |
| `ExtensionSession` | user_id, created_at, last_seen | never holds Etsy secrets |
| `Provenance` | *embedded value object*: type, source, methodology, confidence, freshness, limitations[], coverage | attached to metrics, not a table |

### Relationship shape

```
User ─┬─ Membership ─── Shop ─┬─ EtsyConnection
      │                       ├─ Listing ─┬─ ListingVariation
      │                       │           ├─ CostRule
      │                       │           └─ AuditIssue
      │                       ├─ Order ─── OrderItem ──→ Listing
      │                       ├─ Event ────────────────→ Listing  (immutable log)
      │                       ├─ BulkOperation ── BulkOperationItem ──→ Event
      │                       ├─ Baseline ── PulseAlert ──→ Event  (evidence)
      │                       ├─ Action ──────────────→ any destination
      │                       ├─ Experiment ──────────→ Event
      │                       ├─ ProfitRecord ── ProfitScenario
      │                       └─ KeywordList ── KeywordListItem ──→ Keyword
      └─ BillingSubscription ── UsageRecord
```

Two invariants worth stating up front:

1. **`Event` is append-only.** Rollback writes a *new* event; it never edits history.
2. **Every metric returned by a domain service carries a `Provenance` value object.** It is part of the return type, not a UI decoration — which makes "estimate shown as verified" a type error rather than a design slip.

---

## 8. Design System

**Extracted from the screens, not invented.** All 12 canvas files carry an identical token block, which is the strongest available signal of intent.

### 8.1 The palette question — resolved

The Color Themes file presents **11 brand explorations** and ends with:

> "Semantic colors stay green/amber/red in every variant — only brand primary, accents, backgrounds and borders change. **Pick one and I'll apply it across all 9 existing EtsyPilot screens.**"

**Option 9, "Warm Editorial", was picked and applied.** Its exact values — terracotta `#B4472A` on cream `#FBF8F3` — are the live `--brand` / `--page-bg` in **all 12 files**. The audit note attached to option 9 in the source reads:

> "cream paper surface (#FBF8F3), ink-brown text, and a single terracotta/rust brand accent (#B4472A) — editorial, human, and distinct from every blue/purple/teal/magenta variant, with no marketplace association."

The blue `#2563EB` in the Foundations *caption text* is **stale copy from the original brief** that was not rewritten when the theme was applied — it survives in only 6 places (swatch labels and 4 hardcoded focus rings), against 48 uses of the terracotta token in the same file.

**Recommendation: adopt Warm Editorial.** It is the applied decision, it is warm and human in a way that suits a handmade marketplace, and it is unlike every competitor. Two caveats for you in §12 (C1, C2).

### 8.2 Colour tokens

**Light (default)**

| Token | Value | Use |
|---|---|---|
| `--brand` | `#B4472A` | Primary buttons, active nav, links, chart primary |
| `--brand-strong` | `#8C371F` | Hover / pressed |
| `--brand-tint` | `#FBEEE7` | Selected rows, soft callouts, active nav fill |
| `--ink-1` | `#241B12` | Headings |
| `--ink-2` | `#4A4234` | Body |
| `--muted-1` | `#6B6152` | Secondary labels |
| `--muted-2` | `#8C7F6C` | Tertiary / placeholder |
| `--border` | `#E9E2D6` | Dividers, inputs, card edges |
| `--surface` | `#FFFFFF` | Cards, tables, modals |
| `--page-bg` / `--canvas-soft` | `#FBF8F3` | App background |
| `--success` | `#15803D` | Verified, connected, positive |
| `--warning` | `#B45309` | Estimated, attention |
| `--danger` | `#B91C1C` | Destructive, negative margin |
| `--accent-ai` | `#7C3AED` | AI-generated content |
| `--accent-calc` | `#0891B2` | Calculated metrics |

**Dark**

| Token | Value |
|---|---|
| `--brand` | `#E07A4A` |
| `--brand-strong` | `#F3B08C` |
| `--brand-tint` | `rgba(224,122,74,.16)` |
| `--ink-1` / `--ink-2` | `#F1F5F9` / `#CBD5E1` |
| `--muted-1` / `--muted-2` | `#94A3B8` / `#64748B` |
| `--border` | `#2B3444` |
| `--surface` / `--canvas-soft` | `#1E293B` |
| `--page-bg` | `#0F172A` |
| `--success` / `--warning` / `--danger` | `#34D399` / `#FBBF24` / `#F87171` |
| `--accent-ai` / `--accent-calc` | `#C4B5FD` / `#67E8F9` |

Theme modes: **light / dark / system**, persisted to `localStorage`, exactly as the screens implement.

### 8.3 Typography

**Inter** (weights 400/500/600/700), fallback `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.

| Role | Size / line-height / weight |
|---|---|
| Display | 36 / 1.1 / 600 |
| Page | 26 / 1.2 / 600 |
| Section | 18 / 1.3 / 600 |
| Body | 14 / 1.55 / 400 |
| Table label | 12 / 1.2 / 600 |
| Metric | 30 / 1 / 600, **tabular numerals** |

Sentence case throughout. All-caps only for tiny status labels. `font-variant-numeric: tabular-nums` on every numeric column and metric.

### 8.4 Spacing & shape

- Base **4px**; rhythm **8 / 12 / 16 / 24 / 32**.
- Radius: **8** controls · **12** inputs and cards · **16** prominent panels and modals · **999** pills and chips.
- Borders: **1px** `--border` — borders and spacing do the structural work.

### 8.5 Elevation

> "Elevation is reserved for overlays: dialogs and menus use `0 12px 32px rgba(15,23,42,.12)`. **Cards and tables never carry shadow.**"

This is a hard rule from Foundations 02 and is the main thing that keeps the UI from reading as generic SaaS.

### 8.6 Buttons

Four variants — **primary** (brand fill), **secondary** (border), **destructive** (danger), **quiet** (text) — each with default / hover / focus / loading / disabled.
Height **38px desktop**, **44px mobile**. Loading states use a verb ("Saving…", "Deleting…"), never a bare spinner.

### 8.7 Inputs

12px radius, 1px border, label above, helper text below, error text bound to the input via `aria-describedby`. Error copy is instructive: *"Cost must be zero or more. Enter the amount you pay per unit."* Checkbox supports indeterminate. Toggle, segmented control (Table/Cards), and removable filter chips complete the set.

### 8.8 Cards

1px border, 12px radius, white surface, **no shadow**. KPI card = label + provenance badge + metric (tabular) + delta with arrow *and* sign + comparison caption. Max **4 per row**. An unavailable KPI shows an explanation and an import action instead of a number.

### 8.9 Tables

Sticky checkbox + title columns. 44px rows with full-row click target and 40px padded checkbox hit area. Selection reveals a bulk action bar with a `Select all N` escape hatch. Column manager, saved views, export, pagination. **A footnote states the provenance of the columns.** Below 768px, tables become cards preserving the two decision columns.

### 8.10 Charts

Line/area (time series) · bar (comparison) · **waterfall** (profit) · stacked bar (status) · heat map (seasonality) · choropleth (geography) · scatter · sparkline.

Conventions, taken directly from the screens:
- **Solid = verified**, **dotted = previous period**, **dashed / amber band = estimated**.
- **Missing data renders as a gap, never as zero** — the sales chart is explicitly annotated `Aug 4 · gap in data` and `Aug 11 · projected`.
- Every chart states period, unit, currency, and time zone: *"Gross sales · USD · last 30 days · shop time zone (America/New_York)"*.
- Series differ by **pattern and line style as well as hue**.
- Each chart has a text alternative and an accessible underlying table.

### 8.11 Status & provenance colours

| Badge | Colour | Icon | Meaning |
|---|---|---|---|
| Verified | `--success` | shield-check | From your connected Etsy shop |
| Calculated | `--accent-calc` | calculator | Transparent formula over visible inputs |
| Estimated | `--warning` | sparkline | Modeled — not official Etsy data |
| Seller input | `--muted-1` | pencil | Entered or imported by your team |
| AI draft | `--accent-ai` | wand | Requires review |
| Unavailable | `--muted-2` | circle-slash | Etsy does not expose this |

**Never colour alone**: each badge carries an icon *and* a word; estimated values additionally use a dashed underline; deltas use an arrow *and* a sign.

### 8.12 Navigation

Sidebar **264px expanded / 72px collapsed**, grouped (Home · Research · My shop · Optimize · Tools · Automations · Team · Settings) with counts on items (`Listings 412`, `Orders 3`) and a plan-usage footer. Active state = left rail + tint + label weight — never colour alone.
Top bar **64px**: shop switcher (name, connection status, last sync), date range, ⌘K search, notifications, help, avatar.
Content max **1600px**, 24px gutters, optional 320–420px contextual drawer.

### 8.13 Responsive

| Breakpoint | Behaviour |
|---|---|
| ≥1280 | Full 264px sidebar, 4 KPI per row, optional drawer, content ≤1600px |
| 1024–1279 | Sidebar → 72px icons, 2 KPI per row, side rail moves below main column |
| 768–1023 | Nav → drawer, tables → cards keeping two decision columns, filters → sheet |
| ≤767 | 5-item bottom tab bar, single column, 44px targets, sticky bulk bar, drawers → full-screen sheets |

### 8.14 Motion

150–200ms hover/drawer/tab/menu · 200–300ms panel transitions · progress animation for sync and bulk work · no number roll-up theatrics · no parallax · `prefers-reduced-motion` respected.

---

## 9. Implementation Plan (mapped to `phases.md`)

**Phase 0 — Discovery & Audit — COMPLETE.** This document is the deliverable.

| Phase | Scope | Key deliverables | Acceptance gate |
|---|---|---|---|
| **1 — Foundation** | Next.js + TS strict, Tailwind with the extracted tokens, `components/ui/` primitives, app shell, sidebar/topbar/shop switcher/⌘K, Drizzle schema for all §7 entities, Supabase Auth abstraction, `.env.example`, `MockEtsyService` + realistic seed (Willow & Fern, 412 listings, 438 orders, events), typed contracts, Zod validation, error model, **provenance model**, **event model** | App runs end-to-end in demo mode with zero external credentials |
| **2 — Action Center + Provenance** | Action model + lifecycle (priority/severity/status/dismiss/complete), Action Center UI, dashboard KPIs, provenance badges, methodology drawer, confidence/freshness, loading/empty/error states | Dashboard answers "what needs my attention?"; **every action has a working destination** |
| **3 — Shop Pulse** | Baseline computation, deviation detection, event correlation, `CORRELATED`/`RULED_OUT`/`UNKNOWN`, uncertainty UI, baseline-vs-actual chart with event markers, Action Center integration, weekly digest structure | A seeded sales drop is detected, explained with observable evidence, and converted into an action. **Requires design work first — see M1.** |
| **4 — Safe Bulk Editor** | 5-step stepper, validation (Ready/Warnings/Blocked), exact diff, typed confirmation, operation state machine, Inngest queue, partial failure, retry, rate-limit handling, audit log, rollback with state recheck | **No mutation occurs without explicit confirmation**; every mutation has an operation ID and audit record |
| **5 — Profit Reality** | Full waterfall incl. payment processing / offsite ads / labor / other (M5), coverage, confidence, missing-data explanation, reconciliation, cost setup, Conservative/Base/Optimistic scenarios (M4), instant recalc | Incomplete profit is **never** presented as complete |
| **6 — Existing Product Integration** | Etsy Connect, Listing Audit, AI Copilot, Keyword Explorer, Keyword Lists, Free Tool Hub, CSV Export, Onboarding, Billing surfaces — connected into the loop | Features are reachable *from* actions and *lead to* actions |
| **7 — AI Copilot Hardening** | Provenance-aware structured prompts, title/tag/description generation, issue explanation, diff + "what changed and why", per-listing approval, quota, AI audit trail | AI cannot invent metrics, claim algorithm knowledge, or bypass confirmation |
| **8 — Billing & Usage** | Stripe abstraction, plans, usage meters, limits, renewal, upgrade/downgrade, cancellation, history, trial/refund terms, webhooks | Transparent, no dark patterns, one-click cancel |
| **9 — Browser Extension** | Shared API client + types, session auth bridge, listing detection, popup UI, all 8 states, Chrome MV3 + Firefox packaging, settings integration | Extension holds **no** Etsy credentials |
| **10 — Simple Calculator & Free Tools** | 8 calculation modes, formula display, copy/reset, validation, mobile, public no-login variant, Free Tool Hub | Fast, deterministic, and separate from Profit Reality |
| **11 — Live Etsy Integration** | `LiveEtsyService`, OAuth, scopes, sync, read + write, rate limits, error handling, security review | Live mode replaces mock **without rewriting the product** |
| **12 — Production Hardening** | Responsive QA, a11y QA (WCAG 2.2 AA), performance, unit/integration/E2E, Sentry, PostHog, Resend, security review, state review, visual consistency pass | Final gate: Action Center · Provenance · Shop Pulse · Bulk Editor · Profit Reality · Billing · core features · states all functional |

One phase at a time. After each: run checks, update `memory.md`, report files changed and open issues, then wait.

---

## 10. Files to Create (Phase 1 initial structure)

Following `architecture.md` §5, adapted to the actual feature set.

```
etsypilot/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx
│   │   ├── tools/etsy-seller-calculator/page.tsx
│   │   ├── legal/{terms,privacy,methodology,subprocessors,ai-disclosure}/page.tsx
│   │   └── status/page.tsx
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── layout.tsx
│   ├── (onboarding)/onboarding/{page,connect,syncing}
│   ├── (dashboard)/
│   │   ├── layout.tsx                    ← AppShell
│   │   ├── dashboard/page.tsx
│   │   ├── action-center/page.tsx
│   │   ├── shop-pulse/
│   │   ├── research/{products,keywords,keyword-lists,competitors}/
│   │   ├── shop/{listings,bulk-editor,change-history,sales-map}/
│   │   ├── analytics/
│   │   ├── profit/{page,scenarios,costs,reconciliation}/
│   │   ├── experiments/
│   │   ├── optimize/{audit,ai-helper,tag-optimizer,compare}/
│   │   ├── tools/
│   │   ├── data/{methodology,sources}/
│   │   ├── billing/
│   │   └── settings/
│   ├── api/{etsy,inngest,stripe,extension,export}/
│   ├── layout.tsx
│   ├── not-found.tsx
│   ├── error.tsx
│   └── global-error.tsx
│
├── components/
│   ├── ui/                 button, input, select, checkbox, toggle, segmented,
│   │                       chip, card, badge, table, pagination, dialog, drawer,
│   │                       tabs, tooltip, toast, skeleton, empty-state,
│   │                       error-state, alert, progress, avatar, breadcrumb
│   ├── layout/             app-shell, sidebar, sidebar-group, top-bar,
│   │                       shop-switcher, command-palette, notifications-panel,
│   │                       page-header, footer, theme-toggle, mobile-tab-bar
│   ├── provenance/         provenance-badge, methodology-tooltip,
│   │                       methodology-drawer, confidence-indicator,
│   │                       freshness-label, estimated-range, unavailable-card,
│   │                       source-chip, coverage-meter
│   ├── action-center/      action-card, action-list, severity-badge, kpi-card,
│   │                       kpi-grid, sparkline, catalog-health, getting-started
│   ├── shop-pulse/         (Phase 3)
│   ├── listings/           listings-table, listing-cell, filter-bar, saved-views,
│   │                       column-manager, bulk-action-bar, listing-editor,
│   │                       tag-editor, listing-health, marketplace-preview
│   ├── bulk-editor/        stepper, validation-summary, diff-viewer,
│   │                       confirm-dialog, operation-progress, rollback-dialog
│   ├── profit/             waterfall-chart, coverage-banner, transaction-table,
│   │                       cost-setup, scenario-tabs
│   ├── ai/                 draft-panel, draft-diff, approval-bar,
│   │                       generation-inputs, quota-meter, ai-disclaimer
│   ├── billing/            plan-card, plan-comparison, usage-meter, cancel-flow
│   ├── charts/             line, bar, waterfall, stacked-bar, heatmap,
│   │                       choropleth, sparkline  (shared axis/tooltip/legend)
│   └── calculator/         calculator-shell, type-picker, formula-display,
│                           result-card
│
├── domain/
│   ├── action-center/      {service,priority,types}.ts
│   ├── shop-pulse/         {baseline,deviation,correlation,diagnosis,types}.ts
│   ├── listings/           {service,validation,seo-health,types}.ts
│   ├── bulk-editor/        {service,state-machine,validation,diff,rollback}.ts
│   ├── profit/             {waterfall,coverage,scenarios,reconciliation}.ts
│   ├── keywords/           {service,opportunity,types}.ts
│   ├── audit/              {rules,scoring,types}.ts
│   └── calculator/         {engine,formulas,types}.ts
│
├── lib/
│   ├── auth/               {index,session,server}.ts
│   ├── db/                 {index,client}.ts
│   ├── etsy/               interface.ts · mock.ts · live.ts · index.ts · rate-limit.ts
│   ├── ai/                 {client,prompts,guardrails}.ts
│   ├── billing/            {client,plans,usage}.ts
│   ├── email/  analytics/  monitoring/
│   ├── provenance/         {types,builders}.ts
│   ├── events/             {types,emit,query}.ts
│   ├── permissions/        {roles,guards}.ts
│   ├── validation/         schemas/*.ts
│   ├── errors/             {types,codes,handler}.ts
│   └── utils/              {format,currency,date,cn}.ts
│
├── db/
│   ├── schema/             user, shop, listing, order, cost, keyword, audit,
│   │                       action, event, bulk-operation, profit, baseline,
│   │                       pulse-alert, experiment, billing, ai-generation
│   ├── migrations/
│   └── seed/               demo-shop.ts, listings.ts, orders.ts, events.ts,
│                           keywords.ts, actions.ts
│
├── inngest/                client.ts, etsy-sync.ts, shop-pulse.ts,
│                           bulk-edit.ts, weekly-digest.ts
│
├── extension/              chrome/  firefox/  shared/        (Phase 9)
│
├── tests/                  unit/ integration/ e2e/
│
├── styles/globals.css      ← design tokens as CSS variables
├── tailwind.config.ts      ← tokens mapped to Tailwind theme
├── public/
├── .env.example
├── package.json
├── tsconfig.json           strict: true
├── memory.md
└── README.md
```

### `.env.example` (no real values, ever)

```
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME="Etsy Pilot"

# Mode — "mock" runs the entire product without any external service
ETSY_MODE=mock
NEXT_PUBLIC_DEMO_MODE=true

# Etsy (Phase 11 — leave blank until credentials exist)
ETSY_API_KEY=
ETSY_API_SECRET=
ETSY_REDIRECT_URI=

# Database
DATABASE_URL=

# Supabase Auth
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI
ANTHROPIC_API_KEY=

# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Jobs / Email / Monitoring / Analytics
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
RESEND_API_KEY=
SENTRY_DSN=
NEXT_PUBLIC_POSTHOG_KEY=
```

---

## 11. Risks

### Technical

| Risk | Impact | Mitigation |
|---|---|---|
| Etsy adapter leaks into UI, making Phase 11 a rewrite | High | UI imports only domain services; a lint rule forbids importing `lib/etsy/*` outside `domain/`. Phase 1 acceptance is that mock and live are interchangeable. |
| Bulk operations at 24,180 listings freeze the UI or exhaust rate limits | High | Batches of 500 with checkpoints, Inngest queue, cursor pagination, deferred column computation — all as the large-catalog screen already specifies |
| Event table growth | Medium | Partition by shop + month; 90-day retention for history, longer for rollback points |
| Provenance treated as decoration and dropped | High | Provenance is part of the domain return type — omitting it fails typecheck |
| Rollback overwrites changes made on Etsy in the interim | High | Mandatory current-state recheck before rollback; skip-rather-than-overwrite (already designed in artboard 45) |
| Waterfall / choropleth chart complexity | Medium | Waterfall built on primitives; map deferred to Phase 6+ with a table fallback |

### Product

| Risk | Impact | Mitigation |
|---|---|---|
| **M1: Shop Pulse has no design but is a Phase 3 gate** | **High** | Design it in the established language before Phase 3. Flagged as C4. |
| Scope inflation from agency/team/automation surfaces | High | Resolve U3 before Phase 1 schema is finalised — it changes the data model |
| Feature count optimised over the loop | Medium | Every phase gate asks "does this connect to an action?" |
| Simple Calculator merges into Profit Reality | Medium | Separate routes, separate domain modules, explicit cross-links (already designed) |

### Security

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-shop data access | Critical | Shop-scoped authorization on every server action; repositories require a shop context argument — no ambient access |
| Etsy tokens reaching the client | Critical | Tokens server-side only, never in props, responses, or the extension |
| Extension holding credentials | Critical | Extension authenticates to *Etsy Pilot* only; Etsy secrets never leave the server |
| Unvalidated bulk input | High | Zod at every boundary; never trust client-supplied listing IDs without ownership check |
| Buyer PII exposure | High | Aggregate-only geography; suppress regions under 5 orders (already designed) |
| Stack traces leaking to users | Medium | Structured errors: user-safe message + internal code + correlation ID |

### Etsy API

| Risk | Impact | Mitigation |
|---|---|---|
| **No credentials yet** | — | Not a blocker by design. Mock-first is Phase 1 acceptance; Phase 11 is the swap. |
| Rate limits | High | Queue with backoff, resume-at messaging, "nothing is lost" copy (already designed) |
| Token expiry / scope revocation | High | Designed states for both; features degrade with explanation rather than breaking |
| Write API rejects a mutation mid-batch | High | Per-item status, partial success, retry, error report — the state machine already models this |
| **Terms-of-service compliance** | High | Trademark disclaimer everywhere; no scraping, no automated Messages, no unauthorized automation — all already ruled out in the brief |
| Etsy changes fee structure | Medium | Fee rules versioned with an effective date (already on screen) |

### AI

| Risk | Impact | Mitigation |
|---|---|---|
| AI invents metrics or search volume | Critical | AI receives structured provenance-tagged data; guardrail prompts; outputs validated against a schema that has no numeric-claim field |
| AI implies causality or algorithm knowledge | High | Guardrails forbid it; "AI never predicts sales, ranking positions or revenue outcomes" is already on screen |
| AI changes published without review | Critical | Approval is a state transition in `AiGeneration`, not a UI convention; bulk drafts approved individually |
| Cost/quota overrun | Medium | Per-plan quotas metered before generation; failed generations are not counted (already designed) |
| Hallucinated product facts (materials, measurements) | High | "AI can be wrong. Check materials and measurements before publishing" + locked terms + diff review |

### UX

| Risk | Impact | Mitigation |
|---|---|---|
| Dashboard becomes a metric wall | High | Max 4 KPI per row; Action Center outranks the chart (already designed) |
| Provenance badges become visual noise | Medium | Badge on important metrics only; detail on demand via drawer |
| Bulk editor feels dangerous or slow | High | Explicit stepper, exact diffs, stated rollback window, live progress counts |
| Mobile complexity | Medium | Intentional re-composition per breakpoint (artboard 90), not shrinking |
| Uncertainty language reads as evasive | Medium | Always pair uncertainty with a concrete next action |
| Accessibility regressions | Medium | Never colour alone; a11y checks in the Phase 12 gate and in component review |

---

## 12. Questions / Conflicts

**These block or shape Phase 1. I have not resolved any of them silently.**

### Conflicts

**C1 — Brand colour: three different answers.**
- Screens' live tokens (all 12 files): terracotta `#B4472A` on cream `#FBF8F3`
- Foundations caption text (same files): blue `#2563EB`
- `design.md` fallback palette: teal `#167C80`

Evidence strongly favours terracotta: the Color Themes file explicitly offers 11 options and says "pick one and I'll apply it", and terracotta *is* the applied token across every file (48 uses vs 6 for blue in Foundations alone). `design.md` §2 itself says existing screens override the fallback.
**Recommendation: Warm Editorial (terracotta).** Confirm.

**C2 — Terracotta vs Etsy's orange.** The design brief says "Do not use Etsy's orange as the main brand color." `#B4472A` is a muted brick/clay, clearly distinct from Etsy's `#F1641E` vermilion, and the source's own audit note calls it "distinct… with no marketplace association." I read this as compliant, but since it is the one colour family adjacent to Etsy's, I want your explicit sign-off rather than my assumption.

**C3 — Product name: "Etsy Pilot" vs "EtsyPilot".** You specified "Etsy Pilot" (two words). Every screen renders `EtsyPilot` (one word) with an `EP` monogram. I will follow your instruction — "Etsy Pilot" in all user-facing copy — but that changes the designed wordmark. Confirm, or tell me to keep the one-word lockup for the logo only.

**C4 — Shop Pulse is a top-3 differentiator with no design.** PRD §4.2 and phases.md Phase 3 treat it as core; it exists in the screens only as a sidebar label. Phase 3 cannot start from the screens. I propose designing it in the established visual language (baseline-vs-actual chart, event markers, evidence panel, CORRELATED/RULED_OUT/UNKNOWN badges reusing the provenance badge form) and showing you the design before implementing. Confirm the approach.

**C5 — Profit Reality vs Profit & fees.** PRD §4.7 specifies a waterfall with **Payment processing, Offsite Ads, Shipping, COGS, Labor, Other costs** and **Conservative/Base/Optimistic scenarios**. The designed waterfall is Gross → Discounts → Refunds → Etsy fees → Production → Ads → Net, with no scenarios and no labor line. Are these the same screen extended, or is "Profit Reality" a separate deeper surface? I recommend one screen, extended to the PRD's full line items, with scenarios as a tab.

**C6 — Navigation IA: three trees.** PRD §9 (Dashboard/Research/Listings/Profit/Tools/Data/Billing/Settings), brief §7 (Home/Research/My Shop/Optimize/Tools/Automations/Team/Settings), and the screens (Home/Research/My shop/Tools/Optimize). My route map in §5 uses the screens' grouping plus PRD-required sections. Confirm, or pick one.

**C7 — MVP scope: agency, team, automations, multi-shop.** PRD §4 MVP omits them entirely; PRD §8 "Explicitly Not Now" does not exclude them either. The brief and screens design them fully (roles matrix, approvals, client workspaces, rule builder). **This is the largest open question** — it changes the schema (`Membership`, approval state on `BulkOperation`), the nav, and the plan structure. I need this before finalising the Phase 1 schema.

**C8 — Pricing and limits disagree.**
- Solo: brief **$12** vs billing screen **$15**
- Free listing cap: brief **50**; screen does not state one
- Solo listing cap: brief **500** vs screen **200**
- Growth listing cap: screen **500**

Which is correct?

### Questions

**Q1 — Domain?** The public calculator page references `rankkw.com/tools/etsy-seller-calculator`. What is the real domain for Etsy Pilot?

**Q2 — Dark mode neutrals.** Light mode is warm (cream/ink-brown); dark mode uses cool slate (`#0F172A`, `#1E293B`, `#CBD5E1`) with a lighter terracotta. Deliberate contrast, or should I warm the dark neutrals to match the Warm Editorial identity? I recommend warming them for coherence.

**Q3 — Database host?** Postgres + Drizzle is specified; the host is not. Supabase Postgres (consistent with Supabase Auth), Neon, or something else?

**Q4 — Supabase Auth confirmed?** `architecture.md` mandates it. It implies adopting the Supabase platform. Confirm, or should auth sit behind our abstraction with a different provider?

**Q5 — Demo shop identity.** Keep "Willow & Fern Studio" / "Salman" from the screens as the canonical demo data, or substitute your own?

**Q6 — Shop Pulse vs Experiments.** Both answer "did my change work?". One feature with two views, or two distinct features? I lean toward: Shop Pulse detects *unplanned* deviations; Experiments measure *planned* changes — related but distinct, sharing the Event store.

**Q7 — AI generation quotas** for Free and Agency plans (Solo 60, Growth 500 are on screen).

**Q8 — Weekly digest delivery.** PRD §6 lists a Weekly Shop Pulse Digest; the screens have a "Weekly summary" notification toggle. Email via Resend, in-app, or both?

---

## Recommended next step

Answer **C1, C3, C5, C6, C7** (the five that shape the Phase 1 schema and shell) and I will begin Phase 1 — Foundation. C2, C4, C8 and Q1–Q8 can be resolved during Phase 1 without blocking it.

Nothing will be built until you approve.
