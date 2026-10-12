/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE AI PROVIDER SELECTOR. THE DECISION IS MADE ON EVERY CALL, BECAUSE
 *   THE MODE IS PER REQUEST.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The ONLY place that decides which provider runs. Nothing above the domain
 * layer imports mock.ts or claude.ts directly.
 *
 * Two conditions, not one. `AI_MODE=live` alone is not enough — a key must also
 * be present. The alternative is an environment that says it is live, has no
 * credentials, and fails at the moment a seller clicks the button rather than
 * at the moment someone misconfigured it.
 *
 * Demo mode never reaches the live provider, whatever the environment says.
 * That is the same double guard as the bulk editor's write path: one guard is a
 * guard, two is a property.
 *
 * ── WHAT THE OLD CACHE DID, MEASURED ─────────────────────────────────────
 *
 * This file read:
 *
 *     let instance: AiProvider | null = null
 *     export function getAiProvider(): AiProvider {
 *       if (instance) return instance
 *       instance = liveConfigured() ? loadClaude() : new MockAiProvider()
 *       return instance
 *     }
 *
 * `liveConfigured()` calls `isDemoMode()`, which is
 * `process.env.ETSY_MODE !== 'live' || isPublicDemoRequest()` — and the second
 * half is PER REQUEST. So on a live deployment that also serves the public
 * demo, which is every deployment, the answer differs between two requests in
 * the same process, and the first one to arrive cached its answer for all of
 * them.
 *
 * Measured on one server process, AI_MODE=live with a key, AUTH_MODE=live,
 * a public-demo visitor and a signed-in seller in separate cookie jars:
 *
 *   demo visitor first    visitor -> Rule-based drafter   (right)
 *                         seller  -> Rule-based drafter   (WRONG: canned mock
 *                                    copy from AI Copilot, nothing on screen
 *                                    saying so)
 *   seller first          seller  -> Live model           (right)
 *                         visitor -> Live model           (WRONG: an
 *                                    unauthenticated request reached the live
 *                                    model. Their /listings/ai-copilot came
 *                                    back AI_UNAVAILABLE, which is the live
 *                                    provider having tried)
 *
 * The second direction is the reason this was not a cleanup. There is no plan
 * limit in front of it either — a9fa7ee correctly removed plan limits while no
 * plan exists — so it was an unauthenticated path from the public internet to
 * the owner's AI spend.
 *
 * ── ONE INSTANCE PER MODE, AND THE DECISION BEFORE THE CACHE ─────────────
 *
 * The shape lib/etsy/index.ts has always had, and lib/billing/index.ts was
 * given in a9fa7ee after the same defect. A per-request mode and a
 * process-wide singleton are the wrong pair: the cache has to be keyed on
 * whatever the decision was keyed on, or it is answering a different question
 * from the one asked.
 *
 * tests/unit/selector-cache.test.ts holds the rule for every selector in lib/,
 * without naming any of them.
 */

import { isDemoMode } from '@/lib/etsy'
import { MockAiProvider } from './mock'
import type { AiProvider } from './interface'

/*
 * An override for the test seam, and one cached instance per kind. The
 * override is not a cache: nothing in this file assigns it, so it can only
 * hold what a caller put there deliberately.
 */
let override: AiProvider | null = null
let liveInstance: AiProvider | null = null
let mockInstance: AiProvider | null = null

export function getAiProvider(): AiProvider {
  if (override) return override

  if (liveConfigured()) {
    liveInstance ??= loadClaude()
    return liveInstance
  }
  mockInstance ??= new MockAiProvider()
  return mockInstance
}

export function liveConfigured(): boolean {
  if (isDemoMode()) return false
  return process.env.AI_MODE === 'live' && Boolean(process.env.ANTHROPIC_API_KEY)
}

/**
 * Loaded lazily so the Anthropic SDK is never pulled into a build that will
 * not use it, and so `import 'server-only'` in claude.ts cannot be tripped by
 * a module graph that merely mentions it.
 */
function loadClaude(): AiProvider {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ClaudeAiProvider } = require('./claude') as typeof import('./claude')
  return new ClaudeAiProvider()
}

/** Test seam. Never called by application code. */
export function __setAiProvider(provider: AiProvider | null): void {
  override = provider
}

export type * from './interface'
