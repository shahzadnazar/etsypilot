# RankKW — Architecture Specification

## 1. Architecture Goal

Build RankKW as a modular, typed, production-ready SaaS while keeping the Etsy integration replaceable.

The architecture must support:

- Mock/demo mode now
- Real Etsy API later
- Safe write operations
- Background jobs
- Provenance
- Event history
- AI assistance
- Billing
- Browser extensions

## 2. Recommended Stack

### Frontend / Application
- Next.js
- App Router
- TypeScript
- React
- Server/client separation

### Styling / UI
- Tailwind CSS
- Reusable component system
- Accessible primitives where needed
- Lucide React for icons

### Database
- PostgreSQL
- Drizzle ORM
- Typed migrations/schema

### Authentication
- Supabase Auth

### Background Jobs
- Inngest

Use for:
- Etsy synchronization
- Shop Pulse calculations
- Baseline calculations
- Anomaly detection
- Bulk edit queues
- Retry handling
- Weekly digests

### Payments
- Stripe

### Email
- Resend

### Monitoring
- Sentry

### Product Analytics
- PostHog

### AI
- Anthropic Claude

AI must receive structured application data and provenance rather than inventing facts.

## 3. High-Level Flow

```text
Browser
   ↓
Next.js UI
   ↓
Server Actions / Route Handlers
   ↓
Domain Services
   ↓
Repositories
   ↓
PostgreSQL
```

External integrations:

```text
RankKW Domain Services
   ├── Etsy Adapter
   ├── AI Adapter
   ├── Billing Adapter
   ├── Email Adapter
   └── Analytics Adapter
```

Background:

```text
Domain Event / User Action
        ↓
      Inngest
        ↓
Background Job
        ↓
Database / Event Store
        ↓
UI reads updated state
```

## 4. Etsy Integration

Use an interface/adapter so the UI never depends directly on Etsy API implementation.

```text
EtsyService
  ├── MockEtsyService
  └── LiveEtsyService
```

Initial environment:

```text
ETSY_API_KEY=
ETSY_API_SECRET=
ETSY_REDIRECT_URI=
```

Never hardcode credentials.

Do not block development on live Etsy credentials.

## 5. Suggested Folder Structure

```text
rankkw/
├── app/
│   ├── (marketing)/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── dashboard/
│   │   ├── shop-pulse/
│   │   ├── action-center/
│   │   ├── listings/
│   │   ├── listing-audit/
│   │   ├── ai-copilot/
│   │   ├── bulk-editor/
│   │   ├── keywords/
│   │   ├── opportunities/
│   │   ├── profit/
│   │   ├── tools/
│   │   ├── billing/
│   │   └── settings/
│   └── api/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── action-center/
│   ├── shop-pulse/
│   ├── listings/
│   ├── bulk-editor/
│   ├── profit/
│   ├── provenance/
│   ├── billing/
│   └── calculator/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── etsy/
│   │   ├── interface.ts
│   │   ├── mock.ts
│   │   └── live.ts
│   ├── ai/
│   ├── billing/
│   ├── email/
│   ├── analytics/
│   ├── monitoring/
│   ├── provenance/
│   ├── events/
│   ├── permissions/
│   └── validation/
│
├── domain/
│   ├── action-center/
│   ├── shop-pulse/
│   ├── listings/
│   ├── bulk-editor/
│   ├── profit/
│   ├── keywords/
│   └── calculator/
│
├── db/
│   ├── schema/
│   ├── migrations/
│   └── seed/
│
├── inngest/
│   ├── etsy-sync.ts
│   ├── shop-pulse.ts
│   ├── bulk-edit.ts
│   └── weekly-digest.ts
│
├── extension/
│   ├── chrome/
│   └── firefox/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── public/
├── .env.example
├── package.json
└── README.md
```

## 6. Domain Boundaries

### Action Center
Owns action prioritization and action lifecycle.

### Shop Pulse
Owns:
- Baselines
- Deviations
- Observable correlations
- Alerts

It does not own Etsy private ranking knowledge.

### Provenance
Centralized system for:
- Type
- Source
- Methodology
- Confidence
- Freshness
- Limitations

### Event Store
Immutable record of meaningful changes.

### Bulk Editor
Owns:
- Selection
- Configuration
- Validation
- Diff
- Confirmation
- Queue
- Execution
- Retry
- Audit
- Rollback

### Profit
Owns:
- Financial calculations
- Coverage
- Confidence
- Scenarios

### AI
AI is an assistant over application data, not the source of truth.

## 7. Data Model — Core Entities

At minimum:

- User
- Shop
- Listing
- Order
- Keyword
- Audit
- Action
- Event
- BulkOperation
- ProfitRecord
- ProfitScenario
- BillingSubscription
- UsageRecord
- ExtensionSession

Important event fields:

```text
event_id
shop_id
listing_id
user_id
timestamp
source
field
before_value
after_value
operation_id
reason
```

## 8. Provenance Model

Every important metric should be representable as:

```ts
{
  type: "VERIFIED" | "CALCULATED" | "ESTIMATED" | "SELLER_INPUT" | "UNAVAILABLE",
  source: string,
  methodology: string,
  confidence?: number,
  freshness?: string,
  limitations?: string[],
}
```

Never silently remove provenance.

## 9. Security Architecture

- Server-side authorization
- Validated inputs
- Secure sessions
- Shop-level authorization
- Scoped Etsy access
- Audit logs
- Secure environment variables
- No secrets in client bundles
- No secrets in extension storage

A user must never be able to operate on another shop's data.

## 10. Error Architecture

Use structured errors with:
- User-safe message
- Internal error code
- Context
- Correlation/request ID
- Logging destination

UI must distinguish:
- Validation error
- Authentication error
- Authorization error
- Not found
- Rate limit
- External service failure
- Background job failure
- Unknown error

Do not expose stack traces or secrets to users.

## 11. Performance

- Server-side data access where appropriate
- Pagination for large listing sets
- Virtualization where necessary
- Caching where appropriate
- Optimized images
- Avoid unnecessary client computation
- Background expensive operations
- Bulk operations must not freeze the UI

## 12. Responsive Architecture

Support:
- Desktop
- Tablet
- Mobile

Priority responsive screens:
- Action Center
- Shop Pulse
- Bulk Editor
- Profit Reality
- Billing
- Calculator

Browser extension is desktop-browser oriented.

## 13. Testing

Use:
- Unit tests for domain calculations and validation
- Integration tests for services/repositories
- E2E tests for critical user flows

Critical E2E flows:
1. Onboarding
2. Demo shop connection
3. Action Center → action
4. Shop Pulse diagnosis
5. Listing Audit
6. AI draft → approval
7. Bulk edit → validation → diff → confirm
8. Profit scenario calculation
9. Billing
