/*
 * The one place every server-side error passes through.
 *
 * Next calls `onRequestError` for any error thrown while rendering a page or
 * handling a route. Catching them here rather than in each try/catch means a
 * route someone adds next month is covered without them knowing this file
 * exists — the same argument as discovering UI states rather than listing them.
 *
 * What this fixes, measured rather than assumed. A page that threw
 * `Error('... sk_live_51ABCDEF...')` produced, in the production server log:
 *
 *     ⨯ Error: LEAKCANARY sk_live_51ABCDEFsecret at /home/user/.../tokens.ts:42
 *       digest: '3664705723'
 *
 * Nothing reached the browser — Next strips error detail in production, and the
 * user correctly saw only the 500 page and a reference. But the raw string went
 * to stdout, and stdout on a real deployment is a log aggregator that keeps it
 * for a year. "Never put secrets in logs" was being kept by luck, not by
 * anything in the code.
 *
 * Note what this does NOT claim. Next writes its own line before calling this
 * hook, and that line is not ours to suppress. The redacted, structured record
 * here is what a log DESTINATION should be configured from, and the real
 * protection remains never putting a credential in an error message — which is
 * why lib/etsy/http.ts builds errors from status, method and path only, and why
 * a test asserts it.
 */

export async function register(): Promise<void> {
  // Reserved for tracing/Sentry init. Deliberately empty rather than absent:
  // Next only calls onRequestError from an instrumentation file it loads.
}

export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routerKind?: string; routePath?: string; renderSource?: string },
): Promise<void> {
  const { log } = await import('./lib/observability/logger')

  /*
   * Next's digest is the reference the USER is shown on the 500 page, so it is
   * the field a support conversation joins on. Recording anything else here
   * would give us a tidy log that cannot be matched to the person reporting the
   * problem.
   */
  const digest =
    error && typeof error === 'object' && 'digest' in error
      ? String((error as { digest?: unknown }).digest)
      : undefined

  log.error('unhandled server error', error, {
    ...(digest ? { reference: digest } : {}),
    // Path only. A full URL carries the query string, and a query string
    // carries whatever someone put in it.
    ...(request.path ? { path: request.path } : {}),
    ...(request.method ? { method: request.method } : {}),
    ...(context.routePath ? { route: context.routePath } : {}),
    ...(context.renderSource ? { source: context.renderSource } : {}),
  })
}
