/*
 * The telemetry selectors.
 *
 * Three separate switches, deliberately. Wanting error reports is not
 * consenting to product analytics, and neither implies sending email — a
 * single TELEMETRY=on flag would bundle three different disclosures into one
 * decision nobody made explicitly.
 *
 * Each one additionally requires that the app is NOT in demo mode. A demo shop
 * has no seller to report on, and its "errors" are a developer's own. That is
 * a second condition rather than an assumed one for the same reason the AI
 * provider needs two (D-billing): a stray key in someone's environment must
 * not put a demo on a live pipeline.
 */

import { NoopAnalytics, NoopErrorReporter, NoopMailer } from './noop'
import type { Analytics, ErrorReporter, Mailer } from './interface'

let reporter: ErrorReporter | null = null
let analytics: Analytics | null = null
let mailer: Mailer | null = null

export function getErrorReporter(): ErrorReporter {
  if (!reporter) {
    /*
     * SENTRY_DSN is where the live adapter switches on. The transport is not
     * written yet, and a NoopErrorReporter that logs is a truthful stand-in;
     * a LiveErrorReporter that silently dropped events would not be. When it
     * lands it MUST send `redact(error)` — an error tracker is a log with a
     * web UI and someone else's retention policy (D55).
     */
    reporter = new NoopErrorReporter()
  }
  return reporter
}

export function getAnalytics(): Analytics {
  if (!analytics) {
    /*
     * NEXT_PUBLIC_POSTHOG_KEY is public by design — it identifies the project
     * to a browser, and treating it as a secret would be theatre. What is NOT
     * automatic is the sending: analytics stays off in demo mode and off
     * without the key, and the event vocabulary in interface.ts is what bounds
     * it when it is on.
     */
    analytics = new NoopAnalytics()
  }
  return analytics
}

export function getMailer(): Mailer {
  if (!mailer) mailer = new NoopMailer()
  return mailer
}

/** Test seams, matching the other adapters. */
export function setTelemetry(next: {
  reporter?: ErrorReporter | null
  analytics?: Analytics | null
  mailer?: Mailer | null
}): void {
  if (next.reporter !== undefined) reporter = next.reporter
  if (next.analytics !== undefined) analytics = next.analytics
  if (next.mailer !== undefined) mailer = next.mailer
}

/** True when nothing at all is being sent to a third party. Shown in Settings. */
export function telemetryIsSilent(): boolean {
  if (isDemo()) return true
  return (
    getErrorReporter().mode === 'noop' &&
    getAnalytics().mode === 'noop' &&
    getMailer().mode === 'noop'
  )
}

/*
 * Read from the environment rather than by importing isDemoMode from
 * '@/lib/etsy'.
 *
 * That import looked tidier and broke the build: lib/etsy pulls in
 * LiveEtsyService, which pulls in node:crypto, which the Edge runtime cannot
 * load — so one convenience import dragged the entire Etsy adapter into a
 * graph that had no business containing it.
 *
 * The layering is better this way regardless. Telemetry has no reason to know
 * that an Etsy adapter exists; it needs one fact about the environment, and it
 * reads that fact.
 */
function isDemo(): boolean {
  return process.env.ETSY_MODE !== 'live'
}

export type * from './interface'

