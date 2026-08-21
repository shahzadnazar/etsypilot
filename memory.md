# Etsy Pilot — Working Memory

> This file is intentionally a lightweight working log.  
> Claude must update it regularly while building the project.

## 1. Current Status

**Phase:** 12 — Quality & Production Hardening (IN PROGRESS)
**Current task:** Phase 12. Security headers + CSP done. Next: accessibility pass.
**Current file being worked on:** None
**Last completed task:** OAuth 2.0 + PKCE, rate-limited HTTP client, encrypted token store,
the full LiveEtsyService adapter and both /api/etsy routes — all written and tested with NO
Etsy API key, which the owner does not have yet. Where the key goes is documented in
docs/ETSY-SETUP.md, in .env.example, and in banners at the top of oauth.ts, live.ts and
the connect route.
**Blockers:** NONE for building. Live mode itself is blocked on the owner's Etsy app
credentials; demo mode is unaffected and needs none.

## 2. Current Objective

Build Etsy Pilot as an Etsy Seller Decision & Operations Intelligence platform using the approved PRD, architecture, rules, phases, and design specifications.

## 3. Current Phase

Update this section whenever the phase changes.

```text
Phase 11 — Live Etsy Integration
Status: COMPLETE — one file chooses the adapter and a test asserts nothing else imports
it, so ETSY_MODE=live is the whole swap. Everything is testable with no key, no network
and no Etsy account because the transport, clock and randomness are injected. Views and
ads performance still return UNAVAILABLE with a live connection, because a connection
does not conjure data Etsy withholds.
```

```text
Phase 7 — AI Copilot Hardening
Status: COMPLETE — every prohibition is stated twice: once in the prompt and once
as a check on what came back. A draft that breaks a rule is withheld entirely, not
repaired. Facts are the only channel into a prompt, live AI needs two conditions
plus a non-demo shop, and an approved draft is recorded per field with the
approver named.
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
- Phase 10 built: pure calculator engine (8 calculations), formula returned WITH the
  number rather than captioned beside it, refusals instead of coercion, one component
  shared by the in-app page and the public free-tool page at /tools/etsy-seller-calculator
  (no login, no Etsy prompt, sign-up line only after a result). 323 tests, 109 checks.
- D49: the fast/separate acceptance is measured, not asserted. The perf check found a real
  one immediately — Intl.NumberFormat per call made 20k calculations take 3.8s; memoised
  per currency it is 68ms.
- Phase 9 built: MV3 extension for Chrome and Firefox — one UI, one client, one auth
  flow, only the manifest differs. Shared contract in lib/extension/contract.ts with no
  token field and no write message; auth is the existing EtsyPilot session cookie. The
  packaging script AUDITS each package and refuses to write one that requests too much,
  uses a cookie/webRequest API, contains anything key-shaped, or points at a third host —
  verified by four deliberate attacks. Popup composes the audit + signals so it cannot
  drift from the pages it links to. 300 tests, 92 app checks, 12 popup checks.
- D48: the extension's promise is enforced by its packaging, not by review. Its first
  catch was its own deny-list shipping inside the bundle.
- D48c: demo listing ids are numeric now (1400001001+). "L01001" made the own-listing
  path unreachable from a real etsy.com URL — same class as the prerendered billing page.
- Phase 8 built: BillingProvider seam (mock + Stripe), subscription lifecycle with a
  DisclosedCharge branded type, prorated upgrades that show their arithmetic, downgrades
  that pause and never delete, one-click cancel with a symmetric resume, computed refund
  window, usage meters that say what continues, verified idempotent allow-listed webhooks,
  and billing history that keeps declined charges. 278 tests, 84 browser checks.
- D45: "no dark patterns" made structural — lifecycle.ts throws at load if cancelling ever
  takes more steps than subscribing.
- D45a: demo mode blocks Etsy writes, not billing. The real invariant is that a read-only
  context may never reach a LIVE provider.
- D45b: the mock billing store lives on globalThis — Next puts route handlers and pages in
  separate bundles, so module state was two different Maps and the screen never moved.
- D46: a limit is written once and read everywhere. Three restatements found: the copilot
  quota, the shell's plan chip, and Free's listing limit as an ambiguous null that made an
  UPGRADE warn about pausing.
- Phase 11 built: OAuth 2.0 Authorization Code + PKCE (S256, constant-time state, httpOnly
  single-flow cookie), an HTTP client that paces itself from Etsy's own rate headers and
  honours Retry-After exactly, AES-256-GCM token sealing behind a server-only marker, the
  full LiveEtsyService adapter with its mappers, and /api/etsy/connect + /api/etsy/callback.
  Written and verified WITHOUT an Etsy API key — the owner does not have one yet, and
  docs/ETSY-SETUP.md is the checklist for the day it arrives. 382 tests, 133 checks.
- D50: the one-file swap is asserted, not intended — a test walks every source file and the
  list of importers of live.ts must be exactly ['lib/etsy/index.ts'].
- D50a: `server-only` on the adapter turned 12 green test files red and then failed the
  build. Neither was fixed by deleting the marker. The runner got an alias (plus a test that
  the marker is still there); the bulk editor got split into plan.ts (pure) and service.ts
  (talks to Etsy). The confirm gate survived the file move because it is a type, not
  adjacency — which is the argument for making it a type.
- D50c: the six OAuth outcomes are written once in domain/connect/types.ts and the routes'
  outcome type is keyof that object, so a route cannot emit an outcome the page has no copy
  for. Etsy's own error text is never passed into a URL.
- D50e: LiveEtsyService cached ONE HTTP client whose token closure captured a shopId — on a
  process-wide singleton that is a silent cross-shop read. Keyed by shop now. Same class as
  D45b: module-level state that looks like an implementation detail and is a scoping
  decision.
- Deliberate breaks: 17 run against the new checks; 15 failed as intended and one did not —
  removing the flow cookie's userId check stayed green, because every case the test tried
  was ALSO missing `scopes`. Rewritten to omit one field at a time. That check is what stops
  a callback being completed in someone else's session.
- Dependency defect cleared: drizzle-kit's @esbuild-kit chain pinned esbuild ~0.18 with
  four advisories. Aliased those deprecated packages to tsx (their own successor) and
  verified by running drizzle-kit generate. npm audit: 0 vulnerabilities.
- D44: audit review caught "revenue at risk" — a backward-looking measurement wearing a
  forward-looking label. Renamed across five surfaces AND the domain field, because a
  field called revenueAtRisk invites the phrase back. The dedup caption the same review
  asked for was already built; the naming was not.
- Phase 7 built: AiProvider seam (mock + Claude, server-only, lazily keyed); frozen
  system prompt stating the rules as facts about the world; PromptFact as the only
  channel into a prompt; output validation that blocks invented metrics, ranking claims,
  forecasts, unverifiable claims, named competitors, dropped locked terms and Etsy's
  limits; a two-armed DRAFT | REJECTED union so a partially-trusted draft has no shape;
  explanations that fall back to the product's own words; per-field audit events naming
  the approver. D39-D43. 239 tests, 63 browser checks.
- The mock AI provider has a `misbehave` mode so the validator can be tested against
  outputs that break each rule ON PURPOSE. A guardrail nobody has watched fail is a
  guardrail nobody has tested.
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
tests/browser/extension-popup.py  (the popup, run against the BUILT package)
extension/** (MV3 popup, content script, packaging audit — see extension/README.md)
tests/unit/{ai-copilot,ai-hardening}.test.ts
lib/ai/{interface,prompt,mock,claude,index}.ts
domain/ai/{types,service,facts,validate,explain,audit-trail}.ts
components/ai/{draft-review,assisted-note}.tsx
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
Claude AI: Adapter built (lib/ai). Mock provider by default; live needs AI_MODE=live
           AND ANTHROPIC_API_KEY AND a non-demo shop. Model claude-opus-5, structured
           output, adaptive thinking, cached system prompt.
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
- RESOLVED 2026-08-20: Inter is self-hosted via next/font (fetched at build, served
  from this origin). It was not the cosmetic fallback it looked like — the third-party
  <link> was render-blocking and cost 12.6s on EVERY page load in this sandbox, which
  is what made the billing cancel checks fail. See D51.
- npm audit reports 4 moderate advisories, all one chain: drizzle-kit 0.31.10 (latest)
  depends on the deprecated @esbuild-kit/esm-loader, which pins esbuild 0.18. The
  advisory is the esbuild DEV SERVER accepting cross-origin requests. drizzle-kit is a
  CLI dev dependency, we never run an esbuild dev server, and none of it is in the app
  bundle. An npm override does not take (the pin is hard) and audit fix --force would
  break drizzle-kit. Revisit when drizzle-kit drops @esbuild-kit.
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

### Check the build you made, not the server that happens to be up
`next build` over a RUNNING `next start` leaves the old process serving a manifest whose
CSS chunk no longer exists. Every page renders unstyled, and what the browser checks report
is eighteen money cells that "lost tabular-nums" — a page-wide infrastructure problem
wearing a styling regression's clothes. Two runs were spent on it.

`rendered-output.py` now aborts on the first page if no stylesheet loaded, saying so. The
general rule: when a whole CLASS of check fails at once, suspect the harness before the
code. And always restart the server after a rebuild — the same lesson as "check the
artefact, not the source", one layer out.

### A check that passes for a second reason is not a check
A deliberate break removed the OAuth flow cookie's `userId` validation — the field that
stops a callback being completed in someone else's session — and the test suite stayed
green. Every case the test fed it was missing `scopes` as well, so the rejection it observed
came from a different branch every time. The test was watching the right function and
proving nothing about the line that mattered.

The generalisation: when a guard checks N conditions, exercise them **one at a time**. A
fixture missing three fields tests whichever check runs first. This is why every new check
gets broken deliberately before it is kept — and why a break that DOESN'T fail is the most
valuable result the exercise produces.

### A "never says X" check keeps failing on the promise never to say X
Three times now: "at risk" on the audit, "no dark patterns" copy on billing,
"official Etsy fee" on the calculator. Each time the page-wide check tripped on
the sentence that promises the product will not make the claim. The fix is
always the same — assert on the REGION under test (the result card, the totals
row, the column header), never on the prose that describes it. Related to the
RSC false positive: the failure mode is matching text that is near the thing
under test rather than the thing itself.

### Check the artefact, not the source
The source is what a reviewer reads; the package is what a seller installs, and
a security criterion passes or fails on the second one. The extension's audit
runs over the built directory — manifest, compiled JS, static files — and the
same checks run in the unit suite against that build, so they are part of
npm test rather than only of a release step. Attack your own gate before
trusting it: four attempts (over-broad manifest, cookie read, hardcoded key,
third-party host) were each stopped, and only then was it worth believing.

### One fixed surface is not a fixed class
Phase 8's three "state changed, screen didn't move" bugs were fixed one at a
time, and an audit then found a fourth already live and worse: the dashboard
LAYOUT reads the plan, so /billing showed 412 / 2,000 while /dashboard showed
412 / 200. No click involved — the seller upgrades, navigates, and the product
contradicts itself quietly.

Fixed at the source rather than per page (D47): getSession() reads cookies(), so
every page that depends on who is asking is dynamic — including pages nobody has
written yet. When a fix is "this surface now reflects state", always ask which
OTHER surfaces read that state. The answer is usually "a shared layout, on every
page".

### Drive the control, don't just render the page
Phase 8's cancel flow returned 303 from every route and changed nothing on
screen: the billing page was prerendered, and the mock store was a different Map
in the route bundle than in the page bundle. Unit tests passed (one module
instance) and curl passed (303 is a success). Only clicking the button caught
it. A second bug hid behind the same click — the redirect resolved against
NEXT_PUBLIC_APP_URL with a localhost:3000 default, so the browser followed it to
a server that was not there; curl never noticed because it does not follow
redirects.

So: for any flow whose whole point is that it works, the check clicks the
control and asserts the page changed. And a check that MUTATES state normalises
first, or a half-failed run poisons the next one.

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
- A figure is either a measurement of what happened or a projection of what might,
  and the label must say which (D44). No backward-looking number carries a
  forward-looking name.
- A prompt is an instruction; validation is a check (D39). Every AI prohibition is
  stated twice, and a draft that breaks one is withheld entirely, never repaired.
- Facts are the only channel into a prompt (D40). No helper accepts a bare number.
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
Await go-ahead for Phase 8 — Billing & Usage: the Stripe abstraction, real usage
metering, renewal/upgrade/downgrade/cancellation and webhook handling. The plan
model, meters, limit policy and upgrade-required state are already built and
honest (D22); Phase 8 is the money plumbing behind them.
```

### A timeout that "usually passes" is measuring something — find out what

Five billing checks failed around the cancel flow. First diagnosis: CPU contention
from a second browser. That was **wrong**, and the way it was wrong is the lesson.

Measure each layer separately before believing any story about the whole:

| Layer | Time |
| --- | --- |
| `POST /api/billing/cancel` | 3 ms |
| `GET /billing` (returns the cancelled page) | 18 ms |
| Browser paints it | **13.4 s** |

The mutation was never slow. The browser was blocking 12.6 s on a render-blocking
Google Fonts stylesheet before it failed, and `main` read empty the whole time. The
15-second budget had a 1.6-second margin, so contention was only the thing that
pushed an already-failing check over the line. Every page load in the suite paid it.

Fixed with `next/font` (build-time fetch, self-hosted): 13.4 s → 0.3 s, holding under
eight busy loops on four cores; whole suite ten-plus minutes → 28 s. See D51.

**A margin of 1.6 seconds out of 15 is not a passing check. It is a failing check that
has not happened yet.** When a check passes slowly, time the layers.

Corollary, and the reason it stayed hidden: **a third-party dependency is invisible in
the DOM, invisible in the unit tests, and on a fast machine invisible in the browser.**
The only thing that catches it is asserting on the ORIGIN of each request. That check
now exists and names the offending URL when it fires.

## 16. Memory Update Rule

Claude must update this file:
- At the end of every meaningful phase
- After creating a major feature
- After changing architecture
- After changing database schema
- After resolving a significant bug
- Before stopping work

Do not turn this into a long diary. Keep it concise and operational.
