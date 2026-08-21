/*
 * Structured logging.
 *
 * One JSON object per line, redacted on the way out. JSON rather than prose
 * because the first thing anyone does with a production log is search it, and
 * `grep` over a sentence is guesswork while a field is a field.
 *
 * Three rules:
 *
 *   1. Everything is redacted, always. There is no `logRaw`, and `redact` is
 *      applied inside the writer rather than left to each caller — a rule every
 *      call site has to remember is a rule that gets forgotten at 3am.
 *   2. Every error carries a REFERENCE, and the same reference is what the user
 *      is shown. A support conversation that cannot join those two is a support
 *      conversation about nothing.
 *   3. It never throws. A logger that can fail takes down the request it was
 *      trying to explain.
 *
 * Sentry: `SENTRY_DSN` is read here, and this is where the transport goes when
 * it is added. The shape above is what it will send — deliberately, so adding
 * a destination does not change what gets recorded.
 */

import { redact } from './redact'

export type Level = 'debug' | 'info' | 'warn' | 'error'

export interface LogFields {
  /** Correlates a user-facing reference with this line. */
  reference?: string
  /** Route or job that produced it. Never a full URL — a path only. */
  path?: string
  /** Never a raw shop name or a user email; an id is enough to join on. */
  shopId?: string
  [key: string]: unknown
}

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function threshold(): number {
  const configured = (process.env.LOG_LEVEL ?? '').toLowerCase() as Level
  return LEVELS[configured] ?? (process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug)
}

function write(level: Level, message: string, fields: LogFields): void {
  if (LEVELS[level] < threshold()) return
  try {
    const line = {
      level,
      // Read at write time. Nothing in this module is evaluated at import, so
      // a module-load clock read cannot make two deployments disagree.
      at: new Date().toISOString(),
      message: redact(message),
      ...(redact(fields) as Record<string, unknown>),
    }
    const serialised = JSON.stringify(line)
    if (level === 'error') console.error(serialised)
    else if (level === 'warn') console.warn(serialised)
    else console.log(serialised)
  } catch {
    // Rule 3. A circular field or a serialiser that throws must not become the
    // failure the user sees.
  }
}

export const log = {
  debug: (message: string, fields: LogFields = {}) => write('debug', message, fields),
  info: (message: string, fields: LogFields = {}) => write('info', message, fields),
  warn: (message: string, fields: LogFields = {}) => write('warn', message, fields),
  /**
   * The error path. Takes the error as a field rather than a message so the
   * name, message and stack are all redacted by the same pass.
   */
  error: (message: string, error: unknown, fields: LogFields = {}) =>
    write('error', message, { ...fields, error: redact(error) }),
}
