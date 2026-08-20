/*
 * The error model.
 *
 * Structured errors with a user-safe message, an internal code and a
 * correlation ID (architecture.md section 10). The 500 screen's
 * "Reference EP-8F42-2026-08-13" is this ID surfaced to the user.
 *
 * Never expose stack traces or secrets. Never fail silently. Every user-facing
 * error says what happened, what the user can do, and whether retry helps.
 */

export type ErrorKind =
  | 'VALIDATION'
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'NOT_FOUND'
  | 'RATE_LIMIT'
  | 'EXTERNAL_SERVICE'
  | 'BACKGROUND_JOB'
  | 'PLAN_LIMIT'
  | 'AI_UNAVAILABLE'
  | 'UNKNOWN'

export interface UserFacingError {
  kind: ErrorKind
  /** What happened, in plain language. Never "Something went wrong". */
  message: string
  /** What the user can do next. Always present. */
  recovery: string
  retryable: boolean
  /** Shown to the user so support can find the log line. */
  reference: string
  /** Internal only - never serialised to the client. */
  code?: string
}

export class AppError extends Error {
  readonly kind: ErrorKind
  readonly code: string
  readonly recovery: string
  readonly retryable: boolean
  readonly reference: string
  readonly context: Record<string, unknown>

  constructor(args: {
    kind: ErrorKind
    code: string
    message: string
    recovery: string
    retryable?: boolean
    reference?: string
    context?: Record<string, unknown>
  }) {
    super(args.message)
    this.name = 'AppError'
    this.kind = args.kind
    this.code = args.code
    this.recovery = args.recovery
    this.retryable = args.retryable ?? false
    this.reference = args.reference ?? makeReference()
    this.context = args.context ?? {}
  }

  /** The only shape that crosses the wire. No stack, no context, no secrets. */
  toUserFacing(): UserFacingError {
    return {
      kind: this.kind,
      message: this.message,
      recovery: this.recovery,
      retryable: this.retryable,
      reference: this.reference,
    }
  }
}

/** e.g. EP-8F42-2026-08-13 */
export function makeReference(now: Date = new Date()): string {
  const rand = Math.random().toString(16).slice(2, 6).toUpperCase()
  return `EP-${rand}-${now.toISOString().slice(0, 10)}`
}

export const Errors = {
  validation: (message: string, recovery: string) =>
    new AppError({ kind: 'VALIDATION', code: 'VALIDATION_FAILED', message, recovery }),

  notAuthenticated: () =>
    new AppError({
      kind: 'AUTHENTICATION',
      code: 'NOT_AUTHENTICATED',
      message: 'You are signed out.',
      recovery: 'Sign in again to continue. Nothing you were working on was lost.',
    }),

  /** A user must never be able to operate on another shop's data. */
  crossShop: (shopId: string) =>
    new AppError({
      kind: 'AUTHORIZATION',
      code: 'CROSS_SHOP_ACCESS',
      message: 'You do not have access to this shop.',
      recovery: 'Switch to a shop you have connected, or return to your overview.',
      context: { shopId },
    }),

  notFound: (what: string) =>
    new AppError({
      kind: 'NOT_FOUND',
      code: 'NOT_FOUND',
      message: `That ${what} doesn't exist.`,
      recovery: 'The link may be outdated, or it was deleted on Etsy. Nothing is broken with your account.',
    }),

  /*
   * A plan allowance is spent.
   *
   * Says what still works, not only what stopped. A limit that reads like a
   * fault trains a seller to distrust the product; a limit that names what is
   * unaffected and when it resets is a boundary, which is what it actually is.
   */
  limitReached: (what: string, limit: number, resetsOn?: string, unaffected?: string) =>
    new AppError({
      kind: 'PLAN_LIMIT',
      code: 'PLAN_LIMIT_REACHED',
      message: `You have used all ${limit} ${what} on your plan.`,
      recovery: [
        resetsOn ? `Your allowance resets ${resetsOn}.` : 'Your allowance resets at the start of next month.',
        unaffected ?? 'Everything else keeps working — nothing is paused and nothing is deleted.',
      ].join(' '),
      context: { what, limit },
    }),

  /*
   * The AI could not produce a draft.
   *
   * `detail` is ours, written here — never the provider's message, which can
   * carry request ids, model names and header hints. What the seller needs is
   * that nothing changed and nothing was charged, and both are stated.
   */
  aiUnavailable: (detail: string) =>
    new AppError({
      kind: 'AI_UNAVAILABLE',
      code: 'AI_UNAVAILABLE',
      message: 'No draft could be produced.',
      recovery: `${detail} Nothing was changed on your listing and no generation was counted against your allowance. Try again, or edit manually.`,
      retryable: true,
    }),

  /** The model declined. A legitimate outcome, reported as one. */
  aiRefused: (explanation?: string) =>
    new AppError({
      kind: 'AI_UNAVAILABLE',
      code: 'AI_REFUSED',
      message: 'The assistant declined to draft this listing.',
      recovery: `${explanation ? `${explanation} ` : ''}Nothing was changed and no generation was counted. Edit manually, or rephrase the listing text and try again.`,
    }),

  rateLimited: (resumesAt: string) =>
    new AppError({
      kind: 'RATE_LIMIT',
      code: 'ETSY_RATE_LIMIT',
      message: 'Etsy is limiting requests right now.',
      recovery: `Your data is safe and nothing was lost. Syncing resumes automatically at ${resumesAt}.`,
      retryable: true,
      context: { resumesAt },
    }),

  etsyUnavailable: () =>
    new AppError({
      kind: 'EXTERNAL_SERVICE',
      code: 'ETSY_UNAVAILABLE',
      message: 'EtsyPilot could not reach Etsy.',
      recovery: 'Your synced data is still readable. Try again in a few minutes.',
      retryable: true,
    }),

  /** Demo mode cannot write. Stated plainly rather than failing obscurely. */
  demoModeWrite: () =>
    new AppError({
      kind: 'AUTHORIZATION',
      code: 'DEMO_MODE_READ_ONLY',
      message: 'Demo mode cannot publish to Etsy.',
      recovery: 'Connect your own shop to make real changes. Nothing here touches a live listing.',
    }),

  unknown: (context: Record<string, unknown> = {}) =>
    new AppError({
      kind: 'UNKNOWN',
      code: 'UNKNOWN',
      message: 'Something went wrong on our side.',
      recovery: 'This is an EtsyPilot error, not a problem with your shop or your Etsy data. Nothing was published.',
      retryable: true,
      context,
    }),
}
