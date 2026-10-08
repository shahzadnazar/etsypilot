/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   IS *THIS REQUEST* BEING SERVED THE FICTIONAL CATALOGUE?
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Until now that question had one answer per deployment: `ETSY_MODE`. A
 * public demo makes it a question per REQUEST — the same process has to serve
 * Willow & Fern to a visitor with no account and a real catalogue to a signed-in
 * seller, in the same second, from the same code.
 *
 * ── WHY THIS IS A FLAG AND NOT A PARAMETER ────────────────────────────────
 *
 * The alternative was threading it through. `ShopContext` is `{ shopId,
 * actorId, readOnly }` and lib/permissions/index.ts is locked, so there is no
 * field to add; and the ten `domain/**\/demo.ts` modules that gate the fixture
 * all call `isDemoMode()` with no context at hand. Threading would have meant
 * changing every one of their signatures and every call site, and the first
 * one anybody forgot would be a seller looking at a fictional shop.
 *
 * So the single decision point stays single, and gets a second input.
 * `isDemoMode()` keeps its meaning exactly — "is the fixture being served" —
 * and now answers it for the request rather than for the process.
 *
 * ── REQUEST SCOPE, VIA React cache() ──────────────────────────────────────
 *
 * `cache()` memoises per request: the object below is one object for one
 * render and a different one for the next. That is the property that makes
 * this safe. A module-level `let` would be shared by every concurrent request
 * in the process, and one public visitor would flip the whole server into demo
 * mode for every seller on it — which is the exact failure this file exists to
 * make impossible.
 *
 * ── IT FAILS CLOSED, AND THAT IS CHECKED ──────────────────────────────────
 *
 * Outside a React request scope `cache()` has nothing to memoise against. Both
 * functions swallow that and report "not a public demo", so any path that did
 * not go through getSession() — a route handler, a background job — reads the
 * deployment's own ETSY_MODE. On a live deployment that means the real tables,
 * for a shop id (`demo-willow-fern`) that has no row, which renders as
 * NO_SHOP. Degraded, never a fixture presented as somebody's shop, and never
 * one seller's data shown to another.
 *
 * Set in exactly one place: lib/auth/index.ts, when getSession() resolves a
 * visitor with no Supabase user and a public-demo cookie. A signed-in seller
 * never reaches that branch, because the Supabase user is checked first.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { cache } from 'react'

interface RequestFlags {
  publicDemo: boolean
}

/*
 * ── TWO MECHANISMS, AND THE SECOND IS NOT BELT-AND-BRACES ─────────────────
 *
 * `cache()` is request-scoped inside a React render, which is where almost
 * every read happens: a page asks getSession(), then a domain service asks
 * isDemoMode(), both in the same render.
 *
 * It is scoped to nothing OUTSIDE a render — a route handler, a test, a
 * background job — where `cache()` has no request to memoise against and
 * throws. The first version of this file only had `cache()`, and the
 * integration suite proved the gap immediately: a visitor sweep that should
 * have made zero database calls made seventeen, because the flag had been set
 * into nothing and `isDemoMode()` fell back to ETSY_MODE.
 *
 * AsyncLocalStorage covers that. `enterWith` binds the store to the current
 * async context and everything that continues from it, which is per request in
 * a Node server and per test in vitest. Both are written on mark and either
 * satisfies a read, so whichever scope exists is the one that answers.
 *
 * `node:async_hooks` is a Node builtin and this module is only ever reached
 * from Node: lib/auth/index.ts and lib/etsy/index.ts. The Edge middleware
 * bundle imports neither (D59b), so the import cannot reach it.
 */
const als = new AsyncLocalStorage<RequestFlags>()

const flags = cache((): RequestFlags => ({ publicDemo: false }))

/** Called by getSession() when this request is an anonymous demo visitor. */
export function markPublicDemoRequest(): void {
  try {
    flags().publicDemo = true
  } catch {
    // No React render. The async-context store below is the one that applies.
  }
  const existing = als.getStore()
  if (existing) existing.publicDemo = true
  else als.enterWith({ publicDemo: true })
}

/** True only for a request getSession() identified as an anonymous visitor. */
export function isPublicDemoRequest(): boolean {
  if (als.getStore()?.publicDemo) return true
  try {
    return flags().publicDemo
  } catch {
    return false
  }
}

/**
 * Test helper. Not reachable from a screen.
 *
 * `enterWith` binds for the remainder of the async context, so without this a
 * single visitor test would leave every later test in the same file believing
 * it was a visitor — and "a public visitor writes nothing" would then be
 * asserted about a seller.
 */
export function resetPublicDemoRequest(): void {
  const existing = als.getStore()
  if (existing) existing.publicDemo = false
  try {
    flags().publicDemo = false
  } catch {
    // Nothing to reset.
  }
}
