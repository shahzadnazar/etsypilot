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

  /**
   * A visitor with no account tried to change something.
   *
   * Separate from demoModeWrite because the remedy is different and the
   * remedy is the whole point of an error object here. "Connect your own
   * shop" is the right next step for a demo SELLER; a public visitor has no
   * account to connect one to, so theirs is to join the waitlist. A message
   * whose recovery nobody can act on is a dead end wearing an explanation.
   */
  publicDemoWrite: () =>
    new AppError({
      kind: 'AUTHORIZATION',
      code: 'PUBLIC_DEMO_READ_ONLY',
      message: 'This is the live demo, so nothing here can be changed.',
      recovery:
        'You are looking at Willow & Fern, a fictional shop, with no account. With your own shop connected this would show you the exact change first and send nothing to Etsy until you confirmed it.',
    }),

  /**
   * The card-required trial cannot start because it cannot keep its promise.
   *
   * Names the missing variables, because the only person who can reach this is
   * a developer and the useful message is the one that says what to set. The
   * seller-facing half says nothing about configuration — from their side the
   * trial simply is not open yet, which is true.
   */
  trialNotConfigured: (missing: readonly string[]) =>
    new AppError({
      kind: 'EXTERNAL_SERVICE',
      code: 'TRIAL_SENDER_NOT_CONFIGURED',
      message: 'The free trial is not open yet.',
      recovery:
        'The trial takes a card and promises an email before it ends, and this deployment has no email sender configured — so it refuses to start rather than charge somebody without the warning they were promised. Join the waitlist and we will tell you when it opens.',
      context: { missing: [...missing] },
    }),

  /**
   * The seller has not accepted the Application Terms, so no Etsy data moves.
   *
   * Etsy's API Terms §4 requires executed Application Terms with each seller;
   * this is what "not executed yet" looks like at the connect and sync
   * boundaries. Not an error in the sense of something broken — a refusal with
   * an action attached, which is why the recovery names the screen.
   */
  termsNotAccepted: () =>
    new AppError({
      kind: 'AUTHORIZATION',
      code: 'TERMS_NOT_ACCEPTED',
      message: 'The Application Terms have not been accepted for this shop yet.',
      recovery:
        'Open Settings → Shop connections, read the Terms of Service and the Privacy Policy, and accept them there. Etsy requires an accepted agreement with each seller before an application may read their shop, so nothing is read or written until that is on file.',
    }),

  /**
   * The documents themselves are not finished, so there is nothing to accept.
   *
   * A different refusal from the one above and deliberately so: the seller has
   * done nothing wrong and there is no action they can take. `missing` names
   * the unfilled placeholders because the person who hits this in development
   * is the person who has to fill them in.
   */
  termsNotPublished: (missing: readonly string[]) =>
    new AppError({
      kind: 'EXTERNAL_SERVICE',
      code: 'TERMS_NOT_PUBLISHED',
      message: 'Connecting an Etsy shop is not open yet.',
      recovery:
        'EtsyPilot\u2019s Terms of Service and Privacy Policy are still drafts \u2014 the legal entity behind them has not been established, so they name no party and nobody can accept them. Connecting a shop is blocked rather than allowed on an unfinished agreement. You can read both documents in full in the meantime.',
      context: { missing: [...missing] },
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
