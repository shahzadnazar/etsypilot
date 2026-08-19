# Etsy Pilot — Working Memory

> This file is intentionally a lightweight working log.  
> Claude must update it regularly while building the project.

## 1. Current Status

**Phase:** 0 — Discovery & Audit (COMPLETE)
**Current task:** Awaiting approval to begin Phase 1 — Foundation
**Current file being worked on:** None
**Last completed task:** Full source + screen audit → docs/PHASE-0-AUDIT.md
**Blockers:** 5 decisions needed before Phase 1 schema/shell: C1 brand colour, C3 product name lockup, C5 Profit Reality scope, C6 navigation IA, C7 agency/team MVP scope

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

## 6. Files Currently Being Modified

Update this list whenever work moves to another area.

```text
None
```

## 7. Files Created

```text
docs/PHASE-0-AUDIT.md
docs/source/**   (archived spec docs + screens)
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
Impact: Tailwind theme + globals.css derive from this set. PENDING USER CONFIRMATION (conflict C1).

### 2026-08-19 — Shop Pulse must be designed before Phase 3
Decision: Shop Pulse has no artboard anywhere in the screen set despite being a Phase 3 gate.
Reason: Exhaustive search: the term appears only as a sidebar label and an extension button; CORRELATED/RULED_OUT/UNKNOWN appear zero times.
Impact: Phase 3 requires a design pass in the established visual language first (conflict C4).

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
Await answers to conflicts C1, C3, C5, C6, C7 in docs/PHASE-0-AUDIT.md §12,
then begin Phase 1 — Foundation.
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
