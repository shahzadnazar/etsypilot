import { beforeEach, describe, expect, it } from 'vitest'
import { LIMITS, limitFor, rateLimit, resetRateLimits } from '@/lib/security/rate-limit'

describe('rate limit', () => {
  beforeEach(() => resetRateLimits())

  it('allows a normal burst and refuses the runaway', () => {
    const now = 1_000_000
    for (let i = 0; i < LIMITS.api.limit; i++) {
      expect(rateLimit('ip-a', '/api/x', now).allowed, `request ${i + 1}`).toBe(true)
    }
    const over = rateLimit('ip-a', '/api/x', now)
    expect(over.allowed).toBe(false)
    expect(over.retryAfter).toBeGreaterThan(0)
  })

  it('budgets the expensive route separately', () => {
    // /api/export runs the whole profit or audit domain per call, so it cannot
    // share a budget with a cheap read.
    expect(limitFor('/api/export/transactions').limit).toBe(LIMITS.export.limit)
    expect(limitFor('/api/extension/listing').limit).toBe(LIMITS.api.limit)
    expect(LIMITS.export.limit).toBeLessThan(LIMITS.api.limit)
  })

  it('counts callers separately', () => {
    const now = 1_000_000
    for (let i = 0; i < LIMITS.api.limit; i++) rateLimit('ip-a', '/api/x', now)
    // One caller exhausting their budget must not lock everyone else out —
    // that turns a DoS defence into the DoS.
    expect(rateLimit('ip-a', '/api/x', now).allowed).toBe(false)
    expect(rateLimit('ip-b', '/api/x', now).allowed).toBe(true)
  })

  it('lets the window expire', () => {
    const now = 1_000_000
    for (let i = 0; i <= LIMITS.api.limit; i++) rateLimit('ip-a', '/api/x', now)
    expect(rateLimit('ip-a', '/api/x', now).allowed).toBe(false)
    expect(rateLimit('ip-a', '/api/x', now + LIMITS.api.windowMs + 1).allowed).toBe(true)
  })

  it('sets limits far above human use', () => {
    // A limiter that locks a seller out of their own shop has done more harm
    // than the loop it was meant to shed. Nobody clicks 60 times a minute.
    expect(LIMITS.api.limit).toBeGreaterThanOrEqual(60)
    expect(LIMITS.export.limit).toBeGreaterThanOrEqual(10)
  })
})
