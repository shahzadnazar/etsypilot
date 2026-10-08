import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   A VISITOR WITH NO ACCOUNT MAY READ THE FIXTURE AND WRITE NOTHING AT ALL.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `assertCanWrite(ctx)` already refuses a read-only context, and a public
 * visitor's context is read-only. That covers everything that writes to ETSY.
 * It does not cover everything a visitor can reach, and the survey that
 * produced this file found three places it does not:
 *
 *   /api/settings/notifications  writePreferences(ctx.shopId, …) writes a
 *                                module-level store keyed by the demo shop
 *                                id. Process-wide, shared by every visitor and
 *                                by the demo seller — so one anonymous person
 *                                could change what every other person sees.
 *   /api/settings/profile        saveProfile(session.userId, …) updates
 *                                `users`. The visitor has no row, so it
 *                                updates nothing and reports success, which is
 *                                the silent no-op this product refuses
 *                                everywhere else.
 *   /api/billing/*               assertBillingWritable() deliberately permits
 *                                a read-only context while the provider is the
 *                                MOCK, so the demo seller can walk through a
 *                                plan change. With the mock in every
 *                                deployment today, a visitor could change the
 *                                demo shop's plan for everybody.
 *
 * None of those reach Etsy, and none of them touches a real seller's data. All
 * three are still writes performed by somebody with no account, on state other
 * people see.
 *
 * ── WHY THE ACTOR ID AND NOT A NEW CONTEXT FIELD ──────────────────────────
 *
 * lib/permissions/index.ts is locked, so `ShopContext` stays `{ shopId,
 * actorId, readOnly }`. That is enough: `PUBLIC_DEMO_ACTOR_ID` is a constant
 * assigned in exactly one place — lib/auth/index.ts, to a session with no
 * Supabase user — and nothing provisions a `users` row for it, so no real
 * actor can ever carry it. Checking it is as precise as a field would be, and
 * it cannot be set by anything a visitor sends.
 *
 * ── AND WHY THIS IS NOT assertCanWrite ────────────────────────────────────
 *
 * They answer different questions and both are needed. `assertCanWrite` asks
 * "may this SHOP be written to", which is false for any shop that has not
 * connected — including a brand-new seller's. This asks "is anybody actually
 * here", which is false only for an anonymous visitor. A seller exploring
 * their own unconnected shop must still be able to set their notification
 * preferences; a visitor must not.
 */

import { Errors } from '@/lib/errors/types'
import { PUBLIC_DEMO_ACTOR_ID } from '@/lib/auth/public-demo-actor'
import type { ShopContext } from '@/lib/permissions'

/** True when this context belongs to nobody — a landing-page visitor. */
export function isPublicVisitor(ctx: ShopContext): boolean {
  return ctx.actorId === PUBLIC_DEMO_ACTOR_ID
}

/**
 * Refuse anything that changes state for a visitor with no account.
 *
 * Call it at the top of a domain mutation, beside `assertCanWrite` where that
 * also applies. tests/unit/public-demo.test.ts asserts that every mutating
 * route reaches one of the two.
 */
export function assertNotPublicVisitor(ctx: ShopContext): void {
  if (isPublicVisitor(ctx)) throw Errors.publicDemoWrite()
}
