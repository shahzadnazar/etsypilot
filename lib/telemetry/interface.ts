/*
 * Telemetry: error reporting, product analytics, and transactional email.
 *
 * Three services, one interface file, because they share the property that
 * matters most here: each one SENDS A SELLER'S DATA TO A THIRD PARTY. That is
 * a different kind of dependency from the Etsy adapter or the AI provider, and
 * the shape of these interfaces is where that difference gets enforced.
 *
 * The rules, and where each is enforced rather than promised:
 *
 *   Nothing is sent by default. Every adapter is the noop one unless its
 *   credential is configured, so a developer running `npm run dev` ships no
 *   data anywhere, and demo mode never can.
 *
 *   Errors go through the redactor. `reportError` takes the error whole so
 *   lib/observability/redact.ts sees its name, message and stack — the same
 *   pass that protects the log. An error tracker is a log with a web UI and a
 *   third-party retention policy.
 *
 *   Analytics carries no seller content. `track` accepts a fixed vocabulary of
 *   event names and a `props` type that admits numbers, booleans and enums —
 *   NOT arbitrary strings. A listing title, a search term or a shop name
 *   cannot be passed without changing this file, which is the point: "we
 *   don't send your listing text" survives longer as a type than as a habit.
 *
 *   Email is transactional only. `EmailKind` is a closed set of messages a
 *   seller asked for by using the product. There is no `sendCampaign`, no
 *   template id parameter and no recipient list — a marketing send has nowhere
 *   to go without someone adding it deliberately and explaining why.
 */

export interface ErrorReporter {
  readonly mode: 'noop' | 'live'
  /** Takes the error whole so the redactor sees all of it. */
  reportError(error: unknown, context: { reference?: string; path?: string }): void
}

/*
 * The closed vocabulary. Adding an event is a deliberate edit here, which is
 * how "we only measure these things" stays inspectable — someone can read this
 * list and know exactly what leaves the product.
 */
export const ANALYTICS_EVENTS = [
  'shop_connected',
  'audit_run',
  'bulk_job_confirmed',
  'bulk_job_rolled_back',
  'ai_draft_requested',
  'ai_draft_approved',
  'export_downloaded',
  'plan_changed',
  'calculator_used',
] as const
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

/**
 * What may accompany an event.
 *
 * Numbers, booleans and a small set of enums. Deliberately NOT
 * `Record<string, unknown>`: that type is how a listing title ends up in an
 * analytics pipeline six months later, in a call nobody reviewed.
 */
export interface AnalyticsProps {
  count?: number
  durationMs?: number
  succeeded?: boolean
  plan?: 'FREE' | 'SOLO' | 'GROWTH' | 'PRO'
  surface?: 'dashboard' | 'audit' | 'bulk-editor' | 'copilot' | 'profit' | 'research' | 'tools'
}

export interface Analytics {
  readonly mode: 'noop' | 'live'
  track(event: AnalyticsEvent, props?: AnalyticsProps): void
}

/** Transactional only. Each one is a message the seller's own action asked for. */
export type EmailKind =
  | 'BULK_JOB_FINISHED'
  | 'BULK_JOB_FAILED'
  | 'SYNC_FAILED'
  | 'ETSY_DISCONNECTED'
  | 'PLAN_CHANGED'
  | 'EXPORT_READY'

export interface Mailer {
  readonly mode: 'noop' | 'live'
  send(args: {
    to: string
    kind: EmailKind
    /** Substitutions for the template. Same restriction as analytics props. */
    vars?: Record<string, string | number>
  }): Promise<{ delivered: boolean; reason?: string }>
}
