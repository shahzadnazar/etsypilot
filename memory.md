# Etsy Pilot — Working Memory

> This file is intentionally a lightweight working log.  
> Claude must update it regularly while building the project.

## 1. Current Status

**Phase:** 6 — Existing Product Integration (COMPLETE)
**Current task:** Awaiting go-ahead for Phase 7 — AI Copilot Hardening
**Current file being worked on:** None
**Last completed task:** Etsy Connect, Listing Audit, AI Copilot, Keyword Explorer,
Keyword Lists, Tool Hub, CSV Export, Onboarding, Billing
**Blockers:** NONE. D22 7a is closed by D35 (Audit log under Shops & data).

## 2. Current Objective

Build Etsy Pilot as an Etsy Seller Decision & Operations Intelligence platform using the approved PRD, architecture, rules, phases, and design specifications.

## 3. Current Phase

Update this section whenever the phase changes.

```text
Phase 6 — Existing Product Integration
Status: COMPLETE — nine surfaces, connected to the loop. Modelled research data
lives behind its own adapter so it can never look like Etsy data; AI drafts reach
Etsy only through the bulk editor's confirmation gate; the audit weighs money
rather than listings; every export carries provenance per column.
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
- Phase 4 built: operation state machine, configure/validate/diff/confirm/apply/rollback,
  ConfirmedOperation branded type as the write gate, fingerprint binding confirmation to
  the reviewed diff, per-item partial success, rollback with current-state recheck,
  5-step wizard UI. 108 tests.
- Phase 5 built: VerifiedTotals/SellerAssumptions type split so scenarios cannot vary
  an Etsy fee; projected lines relabelled CALCULATED outside BASE; reconciliation with
  a resolution on every exception; missing data as a first-class panel; four-tab
  Profit Reality. 128 tests.
- D32 recorded and audited: swept domain/ for verified figures being divided or scaled.
  Two hits, both in the profit inputs panel - Average price and effective Etsy fee rate
  were implying Verified and are now CALCULATED with the transform named. Sales and
  Offsite Ads stay VERIFIED (exact aggregates, not transforms). Every inputs row now
  carries its own badge, so locked is visibly not the same as verified.
- D34: cost coverage was STATED (62%) while the ledger measured 83%, and three surfaces
  claimed uncosted orders were "excluded rather than given an assumed cost" while the
  waterfall applied the default 38% rule to all revenue. Coverage constant deleted and
  computed in reconcile(); copy now names the fallback rule and what rests on it. Net
  profit unchanged at $4,937.15 - no figure moved, only the sentences about it.
- D34a: domain/profit/totals.ts (sumOrNull / partialSum / ledgerTotals) and a totals row
  on the ledger where Cost and Profit go blank because 87 orders have no confirmed cost.
- D33 recorded and audited: the inputs panel was the only surface with locked value
  fields; every row carries its badge and the note naming its transform.
- D35 closes D22 7a: Audit log sits under Shops & data, directly below Data permissions.
  SETTINGS_NAV encoded in navigation.ts.
- Refreshed design bundle archived: artboard 92 now gives every locked row its own badge,
  the intro copy is corrected, and the three stale items (America/New_York, $4,938, -12%)
  are gone from the source.
- Phase 6 built: MarketSignalsService as a SEPARATE adapter (D36); Keyword Explorer with
  ranges, sparse handling and a computed opportunity score; Keyword Lists that hand off to
  the bulk editor rather than writing; 14-rule Listing Audit with a revenue-weighted health
  score (D38); AI Copilot whose only route to Etsy is the confirmation gate (D37); Etsy
  Connect with scopes, what-breaks-without-each, staged sync and no password field anywhere
  in the type; five-step onboarding + setup checklist; three-tier billing per D22 with
  counted meters; CSV export carrying a provenance column per value column; free tool hub.
  196 tests, 51 browser checks.
- components/ui/numeric.tsx added: Money / Numeric / NumericCell. Money takes
  number | null and handles null itself, so no call site can render a null as zero or
  forget tabular-nums + nowrap. Applied across waterfall, scenarios, transactions,
  missing data, inputs, both KPI rows and the dashboard metrics.

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
         bulk-editor/{types,state-machine,configure,validate,service}
         profit/{types,waterfall,scenarios,reconciliation,service}
components/  ui/{button,card,states} · action-center/{action-card,action-list}
             shop-pulse/{baseline-chart,changes-panel}
             bulk-editor/{stepper,validation-summary,diff-viewer,confirm-dialog,
                          operation-progress,bulk-editor-wizard}
             profit/{profit-tabs,waterfall-table,scenario-comparison,inputs-panel,
                     missing-data-panel,transactions-table}
             provenance/{provenance-badge,diagnosis-badge,methodology-drawer,
                         provenance-button}
             layout/{app-shell,sidebar,top-bar,shop-context,demo-banner,mobile-tabs,
                     page-header,navigation,theme-script,theme-toggle}
      lib/provenance/methodology.ts
app/  layout · page · not-found · error
      (dashboard)/{layout,dashboard,profit,action-center,shop-pulse,
                   listings/bulk-editor}(+loading)
tests/unit/{waterfall,provenance,action-center,methodology,shop-pulse,
            narrative,digest,bulk-editor,profit-scenarios}.test.ts
tests/browser/rendered-output.py   (kept assertions on painted text, see 13b)
tests/unit/{research,audit,ai-copilot,integration}.test.ts
lib/signals/{interface,mock,index}.ts
domain/{research/{types,service},audit/{rules,service},ai/{types,service},
        connect/{types,service},billing/{plans,service},export/csv}.ts
components/{research/{demand-chart,related-terms},audit/rule-group,ai/draft-review,
            connect/{scope-list,sync-progress},provenance/estimate}.tsx
app/(dashboard)/{research/{keywords,keyword-lists},listings/{audit,ai-copilot},
                 billing,settings/shops,onboarding,tools}/page.tsx
app/api/export/[dataset]/route.ts
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
- Design handoff bundle refreshed 2026-08-20 and archived at docs/source/handoff
  (supersedes docs/source/screens). All previously flagged stale items are corrected
  at source: UTC captions, $4,937.15, -57%, per-row badges in the inputs panel.
- Open discrepancy, non-blocking: artboard 92 shows Labour as "$24 / hr" while the
  domain models it as a period total (labourTotal), which is what the screen's own
  missing-data row describes ("labour is applied as a period total"). Flagged, not
  changed - a per-unit labour model is a Phase 7+ change, not a caption fix.
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

## 13b. Permanent Notes (not phase notes — these do not expire)

### The browser catches meaning errors that green tests miss
Three times now the suite has been green while the screen was wrong, and all
three were meaning errors, not logic errors:

1. Dark mode rendered white-on-white (a token used as a background inverted).
2. The thin-sample rule labelled the clearest case "Not enough data".
3. Scenario selection leaked projected KPIs above the real Transactions receipts.

Each passed typecheck and every unit test. The shared cause is **tests asserting
what the code does rather than what the seller sees**. A function can be right in
isolation and wrong in the sentence it lands in.

So: every phase ends with a browser pass, and some assertions stay on rendered
output permanently. This is not a Phase 5 note — it applies to every phase after it.

These assertions are kept in `tests/browser/rendered-output.py` and run against a
production build at the end of each phase.

### Copy is only caught by the browser
Deliberately breaking five Phase 6 guarantees at once: the unit suite caught three
(the Agency card returning, the health-score formula losing its wording, sparse
terms getting a number). It missed two, and both were COPY in components — the
AI screen printing a predicted lift, and the connect screen dropping "EtsyPilot
never receives your Etsy password". Product promises that live in a sentence in
a component have no other test. That is instances four and five of the pattern
below.

### Break every new rendered-output check before keeping it
A check that has never failed is a check that has never been shown to test
anything. Before a new assertion goes into rendered-output.py, break the thing
it watches on purpose and confirm it goes red, then restore. Done for D34a
(sumOrNull made to skip nulls -> two checks failed), for the D34 copy (exclusion
claim restored -> two checks failed) and for measured coverage (constant put
back -> the unit test failed). Both of this phase's false positives matched
prose sitting near the thing under test rather than the thing itself, and a
deliberate break is what separates the two.

### Assert on what's painted, never on what's shipped
Scope browser assertions to **visible text** — `page.locator('main').inner_text()`,
not the raw HTML. Searching the HTML also matches the RSC serialization payload,
which produced a false pass on "no Verified badge appears in a projected scenario":
the string was in the wire format, not on the screen.

---

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
- Locked is not the same as verified (D33). Read-only styling and provenance are
  orthogonal; a greyed field reads as authoritative, so any disabled or derived
  field anywhere needs its badge.
- A null in a column total propagates (D34a). sumOrNull has no skipNulls option;
  partialSum is the explicit alternative and returns the count it left out.
- A screen may fall back to a seller's own assumption, but it must name the
  assumption and what rests on it, and never call that exclusion (D34).
- Provenance is a property of the number as displayed, not of its source table (D32).
  Any transform — projection, proration, currency conversion, apportioning a
  shop-level fee across listings — demotes a verified figure and names what was done.
- Every money column renders null as an em dash, never 0.00, via the shared
  Money/NumericCell components. A zero is a claim; "we do not know" is not zero.

## 15. Next Step

Always keep exactly one clear next step.

```text
Next:
Await go-ahead for Phase 7 — AI Copilot Hardening: structured AI input,
provenance-aware prompts, and the audit trail for applied AI changes. The seams
are built — generateDraft() is the single function Phase 7 replaces, and the
write path already runs through the bulk editor's confirmation gate.
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
