/*
 * Per-caller rate limiting.
 *
 * Measured motivation, not a checklist item: this app renders about 33 pages
 * per second per process (D58), and /api/export runs the whole profit and
 * audit domain on every call. A request loop is a cheap way to spend all of
 * that, and nothing anywhere refused one.
 *
 * A fixed window, in memory, and both of those are compromises worth naming:
 *
 *   In memory   Each instance counts its own callers, so N instances allow N
 *               times the limit, and a restart forgets everything. That is
 *               honest for one process and useless for a fleet — the same
 *               position MemoryTokenStore is in, and it says so the same way
 *               rather than presenting itself as complete. Redis replaces the
 *               two Map operations below and nothing else.
 *
 *   Fixed window  A caller can send `limit` at the end of one window and
 *               `limit` at the start of the next, so the true worst case is
 *               2x over a window boundary. A sliding log is more precise and
 *               costs memory per request; for shedding a runaway loop the
 *               difference does not matter, and pretending otherwise would be
 *               precision theatre.
 *
 * What it must never do is lock a seller out of their own shop, so the limits
 * are set well above human use: nobody clicks 60 times a minute.
 */

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the window resets. Sent as Retry-After. */
  retryAfter: number
  remaining: number
}

interface Window {
  count: number
  resetAt: number
}

/*
 * On globalThis, not a module-level const.
 *
 * Next can evaluate a module more than once across bundles — the mock billing
 * store was two different Maps for exactly this reason (D45b), and a limiter
 * with two counters is a limiter with twice the limit.
 */
const KEY = Symbol.for('etsypilot.ratelimit')
type Store = Map<string, Window>
const store: Store =
  ((globalThis as Record<symbol, unknown>)[KEY] as Store) ??
  ((globalThis as Record<symbol, unknown>)[KEY] = new Map())

/** Distinct budgets, because these cost very different amounts to serve. */
export const LIMITS = {
  /** Whole-domain work per call: profit reconciliation or a full audit. */
  export: { limit: 10, windowMs: 60_000 },
  /** Everything else under /api. Well above any human rate. */
  api: { limit: 60, windowMs: 60_000 },
  /**
   * Password re-confirmation before a platform role change.
   *
   * THE ONE BUDGET THAT IS NOT ABOUT LOAD. Every other limit here sheds work;
   * this one exists because someone sitting at an operator's unlocked laptop
   * has an open session and unlimited time, and could otherwise guess that
   * operator's password at leisure through the confirmation box. Ten attempts
   * per quarter hour is 40 an hour, which is useless for guessing a password
   * and far beyond what changing roles actually takes.
   *
   * IT COUNTS SUCCESSES TOO, which is a real cost and is chosen rather than
   * overlooked: an operator promoting a dozen people in one sitting will be
   * asked to wait. The alternative — counting only failures — needs a read
   * that does not increment, and two operations where there is now one, for a
   * scenario (bulk promotion) that this panel does not offer and that the
   * confirmation prompt is meant to slow down anyway.
   */
  stepUp: { limit: 10, windowMs: 15 * 60_000 },
} as const

/**
 * The pseudo-path for step-up, so this extends the existing mechanism rather
 * than growing a second one beside it.
 *
 * It is not a URL anyone requests: the role change is a server action, not a
 * route. What it names is the BUDGET, and limitFor() is already the function
 * that maps a name to a budget.
 *
 * The caller pairs it with a key of `step-up:<userId>`, which matters because
 * the window is stored per KEY — the path only chooses the limit. A step-up
 * attempt must not consume an IP's API budget, or drain one.
 */
export const STEP_UP_PATH = '/admin/step-up'

export function limitFor(path: string): { limit: number; windowMs: number } {
  if (path === STEP_UP_PATH) return LIMITS.stepUp
  return path.startsWith('/api/export/') ? LIMITS.export : LIMITS.api
}

/** The key a step-up attempt is counted against. Per operator, not per IP:
 *  the attacker here is already at the operator's desk, so their IP is the
 *  operator's own and throttling it would throttle the wrong thing. */
export function stepUpKey(userId: string): string {
  return `step-up:${userId}`
}

export function rateLimit(key: string, path: string, now: number): RateLimitResult {
  const { limit, windowMs } = limitFor(path)
  const existing = store.get(key)

  if (!existing || now >= existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    // Opportunistic sweep. Without it the map grows once per distinct caller
    // forever, which turns a DoS defence into a memory leak.
    if (store.size > 10_000) {
      for (const [k, w] of store) if (now >= w.resetAt) store.delete(k)
    }
    return { allowed: true, retryAfter: 0, remaining: limit - 1 }
  }

  existing.count += 1
  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    }
  }
  return { allowed: true, retryAfter: 0, remaining: limit - existing.count }
}

/** Test seam. */
export function resetRateLimits(): void {
  store.clear()
}
