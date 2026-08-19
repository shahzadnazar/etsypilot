# Etsy Pilot — Working Memory

> This file is intentionally a lightweight working log.  
> Claude must update it regularly while building the project.

## 1. Current Status

**Phase:** 0 — Discovery & Audit (COMPLETE)
**Current task:** Awaiting go-ahead to begin Phase 1 — Foundation
**Current file being worked on:** None
**Last completed task:** Recorded confirmed decisions → docs/DECISIONS.md
**Blockers:** O2 (agency/team MVP scope) blocks final schema only. O1 (dark neutrals: D1 vs Q2 contradict), O3 (home for orphaned designed surfaces), O4 (pricing) are non-blocking.

## 2. Current Objective

Build Etsy Pilot as an Etsy Seller Decision & Operations Intelligence platform using the approved PRD, architecture, rules, phases, and design specifications.

## 3. Current Phase

Update this section whenever the phase changes.

```text
Phase 0 — Discovery & Audit
Status: COMPLETE — awaiting approval for Phase 1
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

## 6. Files Currently Being Modified

Update this list whenever work moves to another area.

```text
None
```

## 7. Files Created

```text
docs/PHASE-0-AUDIT.md
docs/DECISIONS.md
docs/source/**   (archived spec docs + screens, incl. Shop Pulse & Profit Reality)
memory.md
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
Etsy: Mock mode
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
None
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
Await go-ahead for Phase 1 — Foundation. Only O2 (agency/team MVP scope)
gates the final schema; everything else in Phase 1 can proceed.
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
