# RankKW — Development Rules

## 1. Highest-Priority Rules

1. Read all specification files before coding.
2. Inspect the existing project/screens before changing anything.
3. Preserve working functionality.
4. Do not rebuild the product from scratch if an existing implementation exists.
5. Build mock/demo mode before live Etsy integration.
6. Never hardcode credentials.
7. Never expose secrets in frontend code.
8. Never claim estimated data is verified.
9. Never claim access to Etsy's private ranking algorithm.
10. Never make destructive Etsy changes without explicit user confirmation.
11. Every bulk mutation must be auditable.
12. Keep AI outputs reviewable and reversible.

## 2. Existing Product Rule

The existing screens/project are the visual and functional foundation.

Before modifying:
- Inspect routes
- Inspect components
- Inspect dashboard
- Inspect sidebar
- Inspect navigation
- Inspect cards
- Inspect tables
- Inspect charts
- Inspect forms
- Inspect modals
- Inspect mock data
- Inspect API structure

Do not create a generic SaaS dashboard.

## 3. AI Boundaries

AI may:
- Rewrite listing titles
- Suggest tags
- Improve descriptions
- Explain detected issues
- Suggest actions
- Summarize evidence
- Generate drafts

AI may NOT:
- Invent Etsy metrics
- Invent search volume
- Invent competitor sales
- Claim private Etsy algorithm knowledge
- Claim causality without evidence
- Automatically publish destructive changes
- Bypass confirmation
- Override provenance
- Treat an estimate as a fact

AI must receive structured, provenance-aware application data.

## 4. Data Rules

Every important external/derived metric must be classified:

- VERIFIED
- CALCULATED
- ESTIMATED
- SELLER_INPUT
- UNAVAILABLE

If data is estimated:
- Use ranges where appropriate
- Show confidence
- Explain methodology
- Show limitations
- Never use fake precision

If data is unavailable:
- Say unavailable
- Explain why when useful
- Do not fabricate a fallback value

## 5. Shop Pulse Rules

Only make claims supported by observable evidence.

Allowed:
- CORRELATED
- RULED_OUT
- UNKNOWN

Not allowed:
- "This definitely caused your sales drop."
- "Etsy reduced your ranking because..."
- "We know Etsy's algorithm changed."

Use the seller's own historical baseline first.

## 6. Bulk Editor Rules

Workflow is mandatory:

**SELECT → CONFIGURE → VALIDATE → DIFF → CONFIRM → APPLY → AUDIT → ROLLBACK**

Never skip:
- Validation
- Exact before/after preview
- Explicit confirmation
- Audit logging

Support:
- Partial success
- Retry
- Failure
- Rate limits
- Rollback where supported

## 7. Billing Rules

Billing must be honest.

Always expose:
- Price
- Usage
- Limits
- Renewal
- Cancellation
- Upgrade
- Downgrade
- Trial terms
- Refund terms

No:
- Hidden renewal
- Fake countdowns
- Forced continuation
- Misleading button labels
- Dark patterns

## 8. Security Rules

Never:
- Put secrets in source code
- Put Etsy secrets in browser storage
- Expose secrets through API responses
- Trust client input
- Allow cross-shop access
- Ask users for Etsy passwords
- Automatically publish listings

Use:
- Environment variables
- Server authorization
- Validation
- Scoped permissions
- Audit logs

## 9. Libraries

Preferred:
- Next.js
- React
- TypeScript
- Tailwind CSS
- Lucide React
- Drizzle
- PostgreSQL
- Supabase Auth
- Inngest
- Stripe
- Resend
- Sentry
- PostHog
- Anthropic Claude

Do not add a dependency merely because it makes one small UI task easier.

Before adding a library:
1. Check whether an existing project dependency already solves it.
2. Prefer native/browser/React functionality when reasonable.
3. Keep dependencies maintained and minimal.

## 10. UI Rules

Do:
- Use reusable components
- Use semantic HTML
- Maintain consistent spacing
- Maintain accessible focus states
- Make primary actions obvious
- Show loading/error/empty/success states
- Use clear data labels

Avoid:
- Giant metric walls
- Excessive gradients
- Excessive animation
- Fake AI visual gimmicks
- Unnecessary glassmorphism
- Clutter
- Decorative charts with no decision value

## 11. Accessibility Rules

- Keyboard navigation
- Visible focus
- Semantic buttons
- Proper labels
- Accessible dialogs
- Screen-reader-friendly states
- Error messages connected to inputs
- Sufficient contrast

## 12. Error Handling

Never silently fail.

For user-facing errors:
- Explain what happened
- Explain what the user can do next
- Provide retry when appropriate

For external APIs:
- Handle timeout
- Handle rate limits
- Handle invalid responses
- Handle unavailable service
- Log safely

For background jobs:
- Retry transient failures
- Mark permanent failures
- Show operation state to user

## 13. Code Quality

- Strict TypeScript
- Avoid `any` unless justified
- Small focused modules
- Domain logic outside UI where practical
- Reuse calculation functions
- Validate all external input
- Keep API contracts typed
- Keep components composable

## 14. Calculator Rules

Simple Calculator is separate from Profit Reality.

Simple Calculator:
- Deterministic
- Client-side where appropriate
- No account required for basic calculations
- Validate all inputs
- Show formula
- Support copy/reset

Profit Reality:
- Financial analysis
- Uses order/cost data
- Shows coverage/confidence
- Supports scenarios

Do not merge the two concepts.

## 15. Demo Mode Rules

Mock data must be realistic but clearly represent demo data.

Never imply mock values are live Etsy data.

Create:
- Mock shops
- Mock listings
- Mock orders
- Mock revenue
- Mock fees
- Mock events
- Mock alerts
- Mock keywords
- Mock billing usage

## 16. Change Discipline

Before a significant change, report:
- What will change
- Why
- Files affected
- Routes affected
- Data changes
- Risks

After a significant change, report:
- What changed
- Files created
- Files modified
- Tests run
- Known limitations

## 17. Definition of Done

A feature is not complete merely because the happy-path UI exists.

Check:
- Loading
- Empty
- Error
- Success
- Partial data
- Unavailable data
- Responsive behavior
- Accessibility
- Authorization
- Validation
- Tests where appropriate
