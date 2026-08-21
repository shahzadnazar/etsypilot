/*
 * The default for all three. Sends nothing, anywhere.
 *
 * Not a stub to be replaced — this is what runs in demo mode, in development,
 * in CI, and in any deployment where the credential is absent. A product that
 * ships a seller's data to three vendors the moment someone forgets an env var
 * is not one that can claim the data stays theirs.
 *
 * The noop adapters are silent rather than chatty on purpose. An earlier
 * instinct was to console.log each dropped event so a developer could see the
 * wiring work; that turns "we send nothing" into "we write everything to
 * stdout", which on a real deployment is the same disclosure through a
 * different pipe.
 */

import { log } from '@/lib/observability/logger'
import type { Analytics, AnalyticsEvent, AnalyticsProps, ErrorReporter, Mailer } from './interface'

export class NoopErrorReporter implements ErrorReporter {
  readonly mode = 'noop' as const

  reportError(error: unknown, context: { reference?: string; path?: string }): void {
    /*
     * Not swallowed. With no tracker configured the structured log IS the
     * error record, and dropping it here would make "no DSN set" mean "errors
     * disappear" — which is how a quiet production incident happens.
     */
    log.error('error (no reporter configured)', error, context)
  }
}

export class NoopAnalytics implements Analytics {
  readonly mode = 'noop' as const
  track(_event: AnalyticsEvent, _props?: AnalyticsProps): void {
    // Nothing. See the note above: logging the event would be a disclosure.
  }
}

export class NoopMailer implements Mailer {
  readonly mode = 'noop' as const

  async send(args: { to: string; kind: string }): Promise<{ delivered: boolean; reason?: string }> {
    /*
     * Reports NOT delivered, with a reason. The alternative — returning
     * `{delivered: true}` because nothing went wrong locally — would have the
     * product tell a seller "we emailed you" when no mailer exists. The
     * recipient address is never logged.
     */
    log.info('email not sent (no mailer configured)', { kind: args.kind })
    return { delivered: false, reason: 'No mail provider is configured on this server.' }
  }
}
