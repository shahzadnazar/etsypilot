/*
 * The AI provider selector.
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
 */

import { isDemoMode } from '@/lib/etsy'
import { MockAiProvider } from './mock'
import type { AiProvider } from './interface'

let instance: AiProvider | null = null

export function getAiProvider(): AiProvider {
  if (instance) return instance
  instance = liveConfigured() ? loadClaude() : new MockAiProvider()
  return instance
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
  instance = provider
}

export type * from './interface'
