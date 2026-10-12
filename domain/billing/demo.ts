import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE BILLING CLOCK. THE FOURTH FROZEN "NOW" IN THIS PRODUCT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * domain/billing/service.ts read `const today = BILLING_NOW` — '2026-08-20' in
 * lib/billing/mock.ts — in every mode, and handed it to the trial countdown and
 * to every plan change's proration. So a live seller was told "$10.39 today,
 * charged for the 23 days left in this period", counted from a date in August
 * against a period the mock invented.
 *
 * It is the fourth: DEMO_NOW (fixed by domain/clock.ts), the reporting window
 * (356eef2), DEMO_AUDIT_NOW (routed through domain/audit/demo.ts in the same
 * commit), and this one.
 *
 * ── AND IT STAYS SEPARATE, FOR THE SAME REASON THE AUDIT'S DOES ───────────
 *
 * BILLING_NOW is 2026-08-20 and DEMO_NOW is 2026-08-12. Collapsing them moves
 * the demo: the invented period runs 12 August to 12 September, so the trial
 * countdown and every proration line on the billing screen would change. That
 * is an artboard decision, not a defect fix.
 *
 * What changes is that a deployment with no mock no longer gets the mock's
 * clock. Today that path is unreachable — there is no payment provider, so
 * getBillingProvider() returns null and the billing screen does not describe a
 * subscription at all — and it is written now because the alternative is a
 * fixture constant sitting on a live code path waiting for a provider to make
 * it visible.
 */

import { nowIso } from '@/domain/clock'
import { isDemoMode } from '@/lib/etsy'
import { BILLING_NOW } from '@/lib/billing/mock'

/**
 * The date billing reckons from: proration, trial countdown, cancellation.
 *
 * The mock's fixed clock in demo mode, the real one everywhere else.
 */
export function billingToday(): string {
  return isDemoMode() ? BILLING_NOW : nowIso().slice(0, 10)
}
