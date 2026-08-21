/*
 * The Etsy HTTP client: rate limiting, retries, and redaction.
 *
 * Etsy publishes two limits — per second and per day — and returns the
 * remaining budget on every response. This client reads those headers and
 * paces itself, rather than discovering the limit by being refused. A bulk job
 * that trips a daily cap does not just fail; it fails partway through, which is
 * the state this product spends the most effort avoiding.
 *
 * Three properties, all testable without credentials because the transport is
 * injected (D28):
 *
 *   1. It waits rather than hammers. 429 with Retry-After is honoured exactly;
 *      without one, backoff is exponential with jitter.
 *   2. It gives up honestly. After the retry budget it throws an AppError whose
 *      recovery names the resume time and says nothing was lost.
 *   3. It cannot leak a credential. Errors carry status, method and PATH only.
 *      The key and the bearer token are held in a closure the error never sees,
 *      and a redaction pass runs over anything that does get attached.
 */

import { AppError, Errors } from '@/lib/errors/types'

/** Etsy's documented rate-limit headers. Verify on the first live run. */
const HEADER = {
  remainingSecond: 'x-remaining-this-second',
  remainingToday: 'x-remaining-today',
  limitPerSecond: 'x-limit-per-second',
  limitPerDay: 'x-limit-per-day',
  retryAfter: 'retry-after',
} as const

export interface RateBudget {
  remainingThisSecond: number | null
  remainingToday: number | null
  limitPerSecond: number | null
  limitPerDay: number | null
}

export interface EtsyClientOptions {
  apiKey: string
  /** Called before each request; returns a valid bearer token. */
  accessToken: () => Promise<string>
  fetchImpl?: typeof fetch
  /** Injected so retry timing is testable without real waiting. */
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  maxRetries?: number
  timeoutMs?: number
  /** Deterministic in tests; jittered in production. */
  jitter?: () => number
}

export class EtsyHttpError extends AppError {
  readonly status: number
  readonly path: string

  constructor(args: { status: number; method: string; path: string; etsyCode?: string }) {
    super({
      kind: args.status === 429 ? 'RATE_LIMIT' : args.status >= 500 ? 'EXTERNAL_SERVICE' : 'VALIDATION',
      code: `ETSY_HTTP_${args.status}`,
      message:
        args.status === 401
          ? 'Etsy no longer accepts this connection.'
          : args.status === 403
            ? 'Etsy refused this request for this shop.'
            : 'Etsy could not complete that request.',
      recovery:
        args.status === 401
          ? 'Reconnect the shop from Settings → Shop connections. Nothing was changed.'
          : 'Your synced data is still readable and nothing was changed. Try again shortly.',
      retryable: args.status === 429 || args.status >= 500,
      // Path only — never the query string, which can carry identifiers, and
      // never headers, which carry the credential.
      context: { status: args.status, method: args.method, path: args.path, etsyCode: args.etsyCode },
    })
    this.status = args.status
    this.path = args.path
  }
}

/*
 * Redaction moved to lib/observability/redact.ts.
 *
 * It was defined here, scoped to Etsy transport errors — which was the wrong
 * shape. A credential does not become safe because it reached the log by a
 * different route, so the redactor belongs at the writing end and is now
 * applied inside the logger itself, to every field of every line.
 */
import { redact } from '@/lib/observability/redact'

export { redact }

export class EtsyClient {
  private readonly options: Required<Omit<EtsyClientOptions, 'apiKey' | 'accessToken'>> &
    Pick<EtsyClientOptions, 'apiKey' | 'accessToken'>

  /** Last seen budget, for the sync screen and for pacing. */
  private budget: RateBudget = {
    remainingThisSecond: null,
    remainingToday: null,
    limitPerSecond: null,
    limitPerDay: null,
  }

  constructor(options: EtsyClientOptions) {
    this.options = {
      fetchImpl: fetch,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: Date.now,
      maxRetries: 3,
      timeoutMs: 15_000,
      jitter: Math.random,
      ...options,
    }
  }

  rateBudget(): RateBudget {
    return { ...this.budget }
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>('GET', path, params)
  }

  async put<T>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>('PUT', path, undefined, body)
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | undefined>,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const { fetchImpl, sleep, maxRetries, timeoutMs, jitter } = this.options

    const url = new URL(path.startsWith('http') ? path : `https://openapi.etsy.com/v3/application${path}`)
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    let attempt = 0
    for (;;) {
      // Pace before asking. If Etsy said one request remains this second, the
      // polite thing is to wait rather than to spend it and be refused.
      if (this.budget.remainingThisSecond !== null && this.budget.remainingThisSecond <= 0) {
        await sleep(1000)
        this.budget.remainingThisSecond = null
      }

      const token = await this.options.accessToken()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      let response: Response
      try {
        response = await fetchImpl(url.toString(), {
          method,
          headers: {
            // The two credentials. They exist only inside this call.
            'x-api-key': this.options.apiKey,
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        })
      } catch (error) {
        clearTimeout(timer)
        if (attempt >= maxRetries) {
          throw Errors.etsyUnavailable()
        }
        attempt += 1
        await sleep(backoff(attempt, jitter))
        continue
      }
      clearTimeout(timer)

      this.readBudget(response)

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= maxRetries) {
          const retryAfter = Number(response.headers.get(HEADER.retryAfter) ?? 0)
          if (response.status === 429) {
            throw Errors.rateLimited(
              retryAfter > 0
                ? `in ${Math.ceil(retryAfter / 60)} minute${retryAfter >= 120 ? 's' : ''}`
                : 'shortly',
            )
          }
          throw new EtsyHttpError({ status: response.status, method, path: url.pathname })
        }
        attempt += 1
        const retryAfter = Number(response.headers.get(HEADER.retryAfter) ?? 0)
        // Honour Retry-After exactly when given: guessing shorter is how a
        // client turns a rate limit into a ban.
        await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff(attempt, jitter))
        continue
      }

      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string }
        throw new EtsyHttpError({
          status: response.status,
          method,
          path: url.pathname,
          ...(detail.error ? { etsyCode: String(redact(detail.error)) } : {}),
        })
      }

      return (await response.json()) as T
    }
  }

  private readBudget(response: Response): void {
    const num = (name: string): number | null => {
      const raw = response.headers.get(name)
      if (raw === null) return null
      const parsed = Number(raw)
      return Number.isFinite(parsed) ? parsed : null
    }
    this.budget = {
      remainingThisSecond: num(HEADER.remainingSecond),
      remainingToday: num(HEADER.remainingToday),
      limitPerSecond: num(HEADER.limitPerSecond),
      limitPerDay: num(HEADER.limitPerDay),
    }
  }
}

/** Exponential with jitter, capped. Exported so the test can assert the shape. */
export function backoff(attempt: number, jitter: () => number = Math.random): number {
  const base = Math.min(8000, 2 ** attempt * 250)
  return Math.round(base + jitter() * base * 0.25)
}
