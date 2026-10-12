import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE AUDIT'S CLOCK. ONE MODE CHECK, BECAUSE THE DEMO'S ANSWER IS NOT
 *   THE DEMO'S "NOW".
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * domain/audit/rules.ts held `AUDIT_NOW = '2026-08-20T00:00:00.000Z'` and
 * RENEWS_SOON measured against it on every shop in every mode. What that did
 * to a live seller is written at the bottom of that file and in
 * domain/clock.ts: renewal warnings exactly inverted, a lapsed listing urged
 * and an expiring one ignored.
 *
 * ── WHY THIS IS NOT JUST nowIso() ─────────────────────────────────────────
 *
 * Because the fixture has two clocks. `DEMO_NOW` is 2026-08-12T14:06Z and the
 * audit's was 2026-08-20T00:00Z, eight days later, and the artboards were
 * captured with the second one. Measured over the demo catalogue: the old
 * instant flags 41 listings renewing 2026-08-27, `DEMO_NOW` flags a different
 * 41 renewing 2026-08-16. Same count, different rows, so the issue table and
 * the revenue-weighted health score both move.
 *
 * Collapsing the demo onto one clock is the right end state and it is an
 * artboard change, not a defect fix. So this preserves the demo exactly and
 * fixes the live path, and the choice is recorded beside DEMO_AUDIT_NOW for
 * whoever decides it.
 *
 * The shape is domain/costs/demo.ts's: one exit from the dataset, checking the
 * mode itself, so tests/unit/fixture-containment.test.ts can answer "is this
 * fixture on a live path" by reading one import list.
 */

import { nowIso } from '@/domain/clock'
import { isDemoMode } from '@/lib/etsy'
import { DEMO_AUDIT_NOW } from '@/lib/etsy/demo-dataset'

/**
 * What the audit treats as the current instant.
 *
 * The fixture's audit clock in demo mode, the real one everywhere else. Every
 * rule that measures a distance from now — today only RENEWS_SOON — asks this.
 */
export function auditNow(): string {
  return isDemoMode() ? DEMO_AUDIT_NOW : nowIso()
}
