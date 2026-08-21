/*
 * Redaction, in one place, for anything on its way to a log.
 *
 * This used to live inside lib/etsy/http.ts, scoped to Etsy transport errors.
 * That was the wrong shape: a credential does not become safe because it took
 * a different route to the log line. Redaction belongs at the writing end, not
 * at one of the sources.
 *
 * It is deliberately paranoid and deliberately dumb. It does not try to
 * understand the value it is given — it looks for credential SHAPES and for
 * key NAMES that hold credentials, and blanks both. False positives here cost
 * a slightly less readable log line. A false negative costs a live key sitting
 * in a log aggregator until someone notices, which for most teams is never.
 *
 * It is not a substitute for not putting secrets in error messages. It is the
 * second line, for the day something does.
 */

/** Key names whose VALUE is never safe to print, whatever it looks like. */
const SECRET_KEY = /key|secret|token|authorization|verifier|password|cookie|credential|signature/i

/** Value shapes that are a credential regardless of the key they sit under. */
const SECRET_SHAPE: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi, 'Bearer [redacted]'],
  /*
   * Stripe live/test keys and the webhook signing secret.
   *
   * The character class must include the underscore. Without it the pattern
   * matched only as far as the first `_`, so a real key — `sk_live_51ABCDEF…` —
   * was tested against `live`, which is four characters, failed the length
   * requirement, and passed through UNREDACTED. The test that caught it uses
   * genuine key formats rather than the word "secret", which is the only reason
   * it was caught at all.
   */
  [/\b(sk|pk|rk|whsec)_[A-Za-z0-9_]{8,}/g, '$1_[redacted]'],
  // Anthropic.
  [/\bsk-ant-[A-Za-z0-9-]{6,}/g, 'sk-ant-[redacted]'],
  // form-encoded and JSON-ish assignments: code_verifier=..., "access_token": "..."
  [/((?:access|refresh|id)_token|code_verifier|client_secret|api[_-]?key)(["']?\s*[:=]\s*["']?)[^"'&,\s}]+/gi, '$1$2[redacted]'],
  // A JWT is recognisable on its own.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[redacted jwt]'],
]

export function redact(value: unknown, depth = 0): unknown {
  // A cycle or a pathological object must not take the process down. Logging
  // is the thing you rely on when everything else has already gone wrong.
  if (depth > 6) return '[depth limit]'

  if (typeof value === 'string') {
    let out = value
    for (const [pattern, replacement] of SECRET_SHAPE) out = out.replace(pattern, replacement)
    return out
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redact(value.message, depth + 1),
      // The stack is where file paths and, occasionally, interpolated values
      // live. Redacted like anything else rather than trusted.
      stack: typeof value.stack === 'string' ? redact(value.stack, depth + 1) : undefined,
    }
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        SECRET_KEY.test(k) ? [k, '[redacted]'] : [k, redact(v, depth + 1)],
      ),
    )
  }
  return value
}
