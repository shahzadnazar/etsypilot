# Etsy Pilot — Working Memory

> This file is intentionally a lightweight working log.  
> Claude must update it regularly while building the project.

## 1. Current Status

**Phase:** 3 — Shop Pulse (COMPLETE)
**Current task:** Awaiting go-ahead for Phase 4 — Safe Bulk Editor
**Current file being worked on:** None
**Last completed task:** D24-D27 corrections: UTC time basis, thin-sample UNKNOWN,
disjointness invariant, residual sweep in methodology
**Blockers:** NONE. One item flagged for a decision, non-blocking: D22 7a (Audit log
placement in the settings sidebar).

## 2. Current Objective

Build Etsy Pilot as an Etsy Seller Decision & Operations Intelligence platform using the approved PRD, architecture, rules, phases, and design specifications.

## 3. Current Phase

Update this section whenever the phase changes.

```text
Phase 3 — Shop Pulse
Status: COMPLETE — a seeded sales drop is detected, explained with observable
evidence, and converted into an action. Verdicts are reached, not asserted.
```

## 4. Current Work

Update before starting a meaningful task.

```text
Task:
Files:
Routes:
Database:
Notes:
```

## 5. Recently Completed

Keep the latest 5–10 meaningful items.

- Read all 7 spec docs + the 1,191-line design brief found inside the screens ZIP.
- Inspected all 12 canvas files (~90 artboards) and both reference PNGs.
- Extracted the applied design token set (Warm Editorial: terracotta #B4472A on cream #FBF8F3).
- Confirmed PRD.md is byte-identical to the original product MD.
- Identified 17 missing features (M1-M17) and 14 unclear items (U1-U14).
- Wrote docs/PHASE-0-AUDIT.md.
- Received EtsyPilot Shop Pulse & Profit Reality.dc.html — closes M1/M2/M3/M4/M5 and C4/C5/C6.
- Owner confirmed C1 (Warm Editorial tokens), C2 (terracotta signed off), C3 (one-word "EtsyPilot").
- Wrote docs/DECISIONS.md with D1-D8 locked and O1-O4 open.
- Round 2 designs received (artboards 93-108): Data & Methodology, Niche Research +
  Demo Mode + Digest, PRD Gap Fixes, Tools. Closes M6, M8, M9, M10, M11, M12, M16, M17
  and O4. Recorded as D9-D18.
- Round 3: O1 resolved (dark stays cool slate), O2 resolved (multi-user out of MVP,
  seams built), O3 resolved (Analytics group of three; Orders/Reviews/Inventory/
  Delivery omitted). Recorded as D19-D21.
- D22 approved: three tiers (Free $0 / Solo $15 / Growth $29), Agency held, Growth cap
  500 -> 2,000. Seven screen consequences locked, incl. shop switcher collapse and
  settings nav rework.
- Phase 1 built: Next 16 + TS strict, D1/D19 tokens, UI primitives, D21 shell,
  provenance/event/error models, Drizzle schema with D20 seams, MockEtsyService,
  deterministic Willow & Fern seed, dashboard + Profit Reality waterfall.
  12 tests passing, typecheck clean, build clean, verified in browser light/dark/mobile.
- Net profit canonicalised at $4,937.15 (computed, never stored); design source corrected.
- D23 recorded: literal #241B12 for elements that must stay dark in both themes. Audit
  found a second instance of the same bug in the top-bar avatar chip; fixed.
- Phase 2 built: Action model with all four lifecycle states, Action Center page + the
  same list on the dashboard, methodology drawer on the artboard-93 content model
  (incl. coverage), clickable provenance badges. 26 tests passing.
- Phase 3 built: demo seed rewritten to be narrative-driven so the shop genuinely
  contains its drop; baseline from 90 days of the shop's own history by weekday;
  correlation engine reaching CORRELATED/RULED_OUT/UNKNOWN from measurement;
  Shop Pulse page with baseline chart and evidence panel; weekly digest with the
  suppression rule; Shop Pulse wired in as an Action Center generator. 63 tests.

## 6. Files Currently Being Modified

Update this list whenever work moves to another area.

```text
None
```

## 7. Files Created

```text
docs/PHASE-0-AUDIT.md · docs/DECISIONS.md · docs/source/** (21 screen files)
package.json · tsconfig.json · next.config.ts · tailwind.config.ts · postcss.config.mjs
drizzle.config.ts · vitest.config.ts · .env.example · .gitignore · README.md · memory.md
styles/globals.css
lib/  utils/{cn,format} · provenance/{types,builders} · events/types · errors/types
      etsy/{interface,mock,live,index,demo-dataset,demo-events} · db/index · auth/index
      permissions/index
db/schema/index.ts
domain/  profit/waterfall · shop/overview · action-center/{types,service}
         shop-pulse/{types,baseline,correlation,service,digest}
components/  ui/{button,card,states} · action-center/{action-card,action-list}
             shop-pulse/{baseline-chart,changes-panel}
             provenance/{provenance-badge,diagnosis-badge,methodology-drawer,
                         provenance-button}
             layout/{app-shell,sidebar,top-bar,shop-context,demo-banner,mobile-tabs,
                     page-header,navigation,theme-script,theme-toggle}
      lib/provenance/methodology.ts
app/  layout · page · not-found · error
      (dashboard)/{layout,dashboard,profit,action-center,shop-pulse}(+loading)
tests/unit/{waterfall,provenance,action-center,methodology,shop-pulse,
            narrative,digest}.test.ts
```

## 8. Files Modified

```text
None
```

## 9. Routes Added/Changed

```text
None
```

## 10. Database Changes

```text
None
```

## 11. Integrations

```text
Etsy: Mock mode (MockEtsyService, read-only, no credentials)
Claude AI: Not configured
Stripe: Not configured
Supabase: Not configured
Inngest: Not configured
Resend: Not configured
Sentry: Not configured
PostHog: Not configured
```

## 12. Known Issues

```text
- The corrected artboard 91 (residual wording, -57%) has not reached the repo -
  the newest upload is the one already archived and still shows neither. Not
  blocking: D25 makes the computation authoritative.
- Google Fonts is loaded over the network; in a sandbox with no egress the font
  falls back to system sans. Consider self-hosting Inter in Phase 12.
- Mobile top bar is functional but not yet the designed compact bar (logo, shop,
  notifications, menu). Phase 2.
```

## 13. Decisions

Record important architectural/product decisions here.

Format:

```text
### YYYY-MM-DD — Decision
Decision:
Reason:
Impact:
```

### 2026-08-19 — Design tokens come from the screens, not design.md
Decision: Adopt the "Warm Editorial" token set (terracotta #B4472A on cream #FBF8F3) applied in all 12 canvas files.
Reason: design.md §2 states existing screens override the fallback palette. The Color Themes file offered 11 options and this one was applied across every screen. The blue #2563EB in Foundations caption text is stale copy from the original brief.
Impact: Tailwind theme + globals.css derive from this set. CONFIRMED by owner 2026-08-19 (see docs/DECISIONS.md D1). Ship exact values, no re-derivation.

### 2026-08-19 — Shop Pulse and Profit Reality designed (gap closed)
Decision: Owner supplied artboards 91 (Shop Pulse) and 92 (Profit Reality).
Reason: Closed the M1/M2/M3/M4/M5 gaps found in the Phase 0 audit.
Impact: Phase 3 and Phase 5 now have a visual source. New diagnosis badge component
(CORRELATED / RULED OUT / UNKNOWN, 6px square, leading rule) is the only new visual
vocabulary in the product. Profit Reality REPLACES the old Profit & fees waterfall.

### 2026-08-19 — Navigation IA is PRD section 9
Decision: Dashboard / Research / Listings / Profit / Tools / Data / Billing / Settings.
Reason: Stated explicitly in the Shop Pulse file as the answer to the three-nav-tree conflict.
Impact: Route map rewritten. Orphaned designed surfaces (Shop Analytics, Sales Map,
Experiments, Orders, Change History) need placement — open item O3.

### 2026-08-19 — Demo mode overrides provenance badges globally
Decision: In demo mode the dashed border + "Demo" chip REPLACE the provenance badge everywhere.
Reason: Artboard 103b - so a screenshot taken in demo mode can never be mistaken for real figures.
Impact: ProvenanceBadge renders its Demo variant whenever demo mode is active, regardless
of underlying provenance type. A global override, not a per-component choice.

### 2026-08-19 — Weekly digest suppresses itself when nothing changed
Decision: If nothing crossed the baseline that week, no email is sent.
Reason: Artboard 104b - "A digest with nothing in it trains you to ignore the next one."
Impact: The Inngest digest job checks for material change before sending and no-ops silently.

### 2026-08-19 — Pricing settled: Solo is $15/month
Decision: Free $0 / Solo $15 / Growth $29 / Agency $79. Trial 14 days Growth, no card.
Refund window 14 days from charge.
Reason: Billing history (artboard 107) shows $15.00 Solo charges. Brief's $12 superseded.
Impact: Closes O4.

### 2026-08-20 — UTC is the single time basis
Decision: All timestamps render in UTC. Calendar dates never pass through a zoned
formatter. Any comparison of two periods scales both sides identically.
Reason: Two bugs (period start off by a day, chart axis off by a day) and the revenue
deviation reading double all traced to two time bases and asymmetric scaling.
Impact: format.ts DISPLAY_TIMEZONE, period constants, day bucketing, UI captions.
Supersedes artboard 91's "shop time zone" caption.

### 2026-08-20 — Never author a Shop Pulse figure
Decision: -57% is canonical for the unexplained row. Every Shop Pulse artboard figure
is illustrative of shape, not a target. Computation wins over design.
Reason: The -12% was hand-written and sat in a column of computed values.
Impact: Residual-sweep explanation added to the methodology; a test asserts every
reported percentage is restated by the evidence that produced it.

### 2026-08-20 — Thin samples return UNKNOWN
Decision: 20 observations total and 5 per side before materiality decides anything.
Below that, UNKNOWN and a null percentage.
Reason: A verdict reachable only by labelling is not a verdict.
Impact: diagnose() check order; ordersAfterPercent is nullable; UI shows "Not enough data".

### 2026-08-20 — Disjoint groups enforced at runtime, not by test
Decision: narrativeGroups throws on overlap. Keep it even when overlap is convenient.
Reason: Overlapping groups are how a correlation engine becomes a rumour mill.
Impact: Also found that capping pulse findings by magnitude dropped the unexplained
one - UNKNOWN findings are now never truncated, and outrank correlated ones.

### 2026-08-19 — Dark theme stays cool slate
Decision: Ship D1's exact dark values. Warmed neutrals rejected and recorded as such.
Reason: The terracotta decision was about the light theme, which is the default. The dark
theme is a cool slate carrying a warm accent, deliberately, and is what all 19 screens render.
Impact: One CSS block. Do not re-propose warming.

### 2026-08-19 — Multi-user out of MVP; build the seams
Decision: Single owner, single shop. shop_id + actor_id on every row, single-owner
Membership row, approval_state nullable on BulkOperation. No role matrix, client
workspaces, approval queue or automation rule builder.
Reason: None of the PRD's 12 must-haves or 6 success criteria involve a second person.
Impact: Schema stays additive. Growth and Agency plan copy must be rewritten (D22).

### 2026-08-19 — Navigation: Analytics group of three; four surfaces omitted
Decision: Add Analytics (Shop Analytics, Sales Map, Experiments) between Listings and
Profit. Change History moves under Listings. Orders, Reviews, Inventory and Delivery
status are omitted from nav entirely - they have no design and must not look built.
Reason: Owner correction - Orders is a nav item from the old brief, not a designed screen.
Impact: Supersedes the route map in PHASE-0-AUDIT.md section 5.

### 2026-08-19 — Three pricing tiers; Agency held until its features exist
Decision: Free $0 / Solo $15 / Growth $29. Growth cap 500 -> 2,000 listings. No Agency
card; an unpriced line under the table instead. When Agency returns it is a new tier at
a price set then - do not resurrect the old card.
Reason: With multi-shop and team parked, all four Agency bullets are empty. Selling it
would be the dark pattern rules.md section 7 forbids.
Impact: Billing screen, usage meters, upgrade-required state, shop switcher, command
palette and settings nav all change. Settings Workspace group is deleted; Billing & plan
and Audit log fold into Account.

### 2026-08-19 — Product name is "EtsyPilot", one word
Decision: One word everywhere; EP monogram lockup unchanged; no two-word variant.
Reason: Owner confirmation, matching every screen.
Impact: All UI copy, metadata, docs and error strings.

## 14. Things NOT To Forget

- Do not rebuild existing working product unnecessarily.
- Existing screens are the visual foundation.
- Mock/demo Etsy mode comes first.
- Never hardcode Etsy credentials.
- Never expose secrets in client code.
- Never present estimates as verified.
- Never claim Etsy private algorithm access.
- AI suggestions require human review before changes.
- Bulk changes require validation, diff, confirmation, audit, and rollback where supported.
- Profit Reality must show coverage/confidence.
- Every important screen needs loading/empty/error/success/partial/unavailable states.

## 15. Next Step

Always keep exactly one clear next step.

```text
Next:
Begin Phase 1 — Foundation: design tokens, Tailwind theme, UI primitives,
app shell with the D21 sidebar, provenance + event models, mock Etsy service,
Willow & Fern seed data.
```

## 16. Memory Update Rule

Claude must update this file:
- At the end of every meaningful phase
- After creating a major feature
- After changing architecture
- After changing database schema
- After resolving a significant bug
- Before stopping work

Do not turn this into a long diary. Keep it concise and operational.
