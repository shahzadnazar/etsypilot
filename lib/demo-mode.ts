/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   IS THE FICTIONAL CATALOGUE BEING SERVED TO THIS REQUEST?
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * One definition, in a leaf module, because two different parts of the
 * product now need the answer and one of them must not be able to see the
 * Etsy adapter.
 *
 * It lived in lib/etsy/index.ts, beside the factory that constructs
 * LiveEtsyService. Importing it from there drags the whole Etsy adapter into
 * the importer's graph — lib/telemetry records that exact failure (node:crypto
 * reaching the Edge runtime) and worked around it by reading ETSY_MODE
 * directly, which quietly drops the public-demo half of the answer.
 *
 * lib/signals cannot take either option:
 *
 *   - It must not import the adapter. tests/unit/signals-boundary.test.ts
 *     forbids it, and the reason is Etsy's Prohibited Behavior item 24: the
 *     market-signals seam is the one a scraper would be written against, and
 *     the guard that keeps it unable to reach a network also keeps it unable
 *     to reach the Etsy client.
 *   - It must not drop the public-demo half. A visitor in the public demo has
 *     ETSY_MODE unset OR a demo cookie, and they are precisely the audience
 *     the sample data exists for.
 *
 * So the predicate moves down here, where its only dependency is the
 * request-scoped flag it already used. lib/etsy/index.ts re-exports it, so
 * the ~40 existing call sites are untouched and there is still one answer.
 */

import { isPublicDemoRequest } from '@/lib/demo-request'

export function isDemoMode(): boolean {
  return process.env.ETSY_MODE !== 'live' || isPublicDemoRequest()
}
