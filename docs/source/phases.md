# RankKW — Development Phases

## Strategy

Build vertically and safely. Do not attempt every feature simultaneously.

**Priority:** Foundation → Action Center/Provenance → Shop Pulse → Safe Operations → Profit → Existing Features → Extensions/Tools → Polish.

---

## Phase 0 — Discovery & Audit

### Goal
Understand what already exists before changing it.

### Tasks
- Inspect repository
- Inspect package/dependencies
- Inspect routes
- Inspect components
- Inspect current design system
- Inspect mock data
- Inspect API structure
- Identify reusable components
- Identify incomplete features
- Compare existing product against PRD

### Deliverable
Written implementation plan:
- Files to create
- Files to modify
- Routes
- Database changes
- API abstractions
- Risks

**Do not start major coding before this audit.**

---

## Phase 1 — Foundation

### Goal
Create stable architecture.

### Tasks
- Confirm Next.js/TypeScript structure
- Establish component conventions
- Establish domain boundaries
- Establish PostgreSQL/Drizzle schema
- Add Supabase Auth abstraction
- Add environment template
- Add mock Etsy service
- Add typed API contracts
- Add validation
- Add error model
- Add provenance model
- Add event model

### Acceptance
Application can run completely in demo mode.

---

## Phase 2 — Action Center + Provenance

### Goal
Build the product's main decision surface.

### Tasks
- Action Center UI
- Action model
- Priority/severity
- Evidence/source
- Destination links
- Complete/dismiss actions
- Provenance badges
- Methodology drawer
- Confidence/freshness/limitations
- Loading/error/empty states

### Acceptance
Dashboard answers:

**What needs my attention?**

Every action has a useful destination.

---

## Phase 3 — Shop Pulse

### Goal
Create recurring monitoring value.

### Tasks
- Historical baseline
- Change history
- Sales/revenue deviation detection
- Listing change correlation
- Correlated/Ruled Out/Unknown logic
- Uncertainty UI
- Shop Pulse alerts
- Action Center integration
- Weekly digest structure

### Acceptance
A demo sales drop can be detected, explained with observable evidence, and converted into an action.

---

## Phase 4 — Safe Bulk Editor

### Goal
Allow safe operational changes.

### Tasks
- Listing selection
- Field configuration
- Validation
- Exact before/after diff
- Confirmation
- Operation state machine
- Background queue
- Partial failure
- Retry
- Audit log
- Rollback

### Acceptance
No mutation occurs without explicit confirmation.

---

## Phase 5 — Profit Reality

### Goal
Turn shop data into financial intelligence.

### Tasks
- Revenue waterfall
- Etsy fees
- Processing
- Ads
- Shipping
- COGS
- Labor
- Other costs
- Net profit
- Margin
- Coverage
- Confidence
- Missing-data explanation
- Conservative/Base/Optimistic scenarios
- Instant recalculation

### Acceptance
The product never presents incomplete profit data as complete.

---

## Phase 6 — Existing Product Integration

### Goal
Preserve and connect existing features.

### Tasks
- Etsy Connect
- Listing Audit
- AI Rewrite Copilot
- Keyword Explorer
- Keyword Lists
- Free Tool Hub
- CSV Export
- Onboarding
- Billing

### Acceptance
Existing working features remain functional and are connected to the new RankKW loop.

---

## Phase 7 — AI Copilot Hardening

### Goal
Make AI useful without allowing it to become the source of truth.

### Tasks
- Structured AI input
- Provenance-aware prompts
- Listing rewrite
- Title suggestions
- Tag suggestions
- Description improvements
- Issue explanations
- Action recommendations
- Human approval
- Audit trail for applied AI changes

### Acceptance
AI cannot invent metrics, claim private algorithm knowledge, or bypass confirmation.

---

## Phase 8 — Billing & Usage

### Goal
Production-ready subscription experience.

### Tasks
- Stripe integration abstraction
- Plans
- Usage
- Limits
- Renewal
- Upgrade
- Downgrade
- Cancellation
- Billing history
- Trial/refund information
- Webhook handling

### Acceptance
Billing is transparent and has no dark patterns.

---

## Phase 9 — Browser Extension

### Goal
Extend RankKW intelligence into Etsy browsing.

### Tasks
- Shared API client
- Shared types
- Authentication bridge
- Listing detection
- Popup UI
- Listing health
- Keyword insights
- Provenance
- Quick actions
- Chrome packaging
- Firefox packaging
- Settings integration

### Acceptance
Extension never contains privileged Etsy credentials.

---

## Phase 10 — Simple Calculator & Free Tools

### Goal
Provide lightweight acquisition tools.

### Tasks
- Calculator engine
- Percentage
- Discount
- Profit
- Margin
- Markup
- Fee
- Net Revenue
- Break-even
- Formula display
- Copy
- Reset
- Validation
- Mobile layout
- Free/public calculator version

### Acceptance
Simple Calculator remains fast and separate from Profit Reality.

---

## Phase 11 — Live Etsy Integration

### Goal
Replace demo adapters with production Etsy integration.

### Tasks
- Etsy developer app
- OAuth
- Redirect URI
- Required scopes
- Credentials
- Shop synchronization
- Read operations
- Write operations
- Rate-limit handling
- Error handling
- Security review

### Acceptance
Live mode can replace mock mode without rewriting the product.

---

## Phase 12 — Quality / Production Hardening

### Tasks
- Responsive QA
- Accessibility QA
- Performance
- Unit tests
- Integration tests
- E2E tests
- Sentry
- PostHog
- Resend
- Security review
- Empty/error/loading-state review
- Final visual consistency pass

### Final Gate

Do not call the product complete until these are functional:

- Action Center
- Provenance
- Shop Pulse
- Safe Bulk Editor
- Profit Reality
- Billing
- Existing core features
- Responsive/accessibility/error states

---

## Phase Sequencing Rule

Claude should work on **one phase at a time**.

After each phase:
1. Run tests/checks.
2. Inspect the result.
3. Update `memory.md`.
4. Report files changed.
5. Report remaining issues.
6. Wait for the next phase unless the user explicitly asks to continue.

Do not silently jump from Phase 1 to Phase 8.
