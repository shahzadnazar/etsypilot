/*
 * The Content-Security-Policy, as a pure function of (nonce, environment).
 *
 * Extracted from middleware.ts after a bug that only appeared in development:
 * the production policy was applied to `next dev` too, where it produced 34
 * violations and an unstyled page. Two causes, both specific to the dev server:
 *
 *   style-src 'self'   `next dev` injects its stylesheets as INLINE <style>
 *                      elements for hot reloading. Production emits an external
 *                      .css file, which passes. So the policy that is correct
 *                      in production blocks every style in development, and the
 *                      page renders as unstyled HTML.
 *
 *   strict-dynamic     Turbopack's dev chunks carry no nonce, and
 *                      'strict-dynamic' ignores 'self' by design (D52a). The
 *                      same bug that made the production build use webpack,
 *                      biting again where webpack is not an option.
 *
 * It was invisible because every check in this project runs against a
 * production build — `npm run build && next start`. Nothing had ever loaded a
 * page from `next dev`. See D63.
 *
 * Development is deliberately looser and that is not a compromise: the dev
 * server binds to localhost and serves the developer their own code. The
 * policy that ships is the production one, and `cspFor({ isDev: false })` is
 * unchanged from what was reviewed.
 */

export interface CspOptions {
  /** True when the request itself arrived over TLS. */
  isHttps?: boolean
  nonce: string
  isDev: boolean
}

export function cspFor({ nonce, isDev, isHttps }: CspOptions): string {
  /*
   * 'unsafe-eval' is required by the dev server's hot-module runtime, and
   * 'unsafe-inline' is IGNORED by a browser when a nonce is present — so the
   * dev script policy drops the nonce rather than pairing the two, which would
   * silently do nothing.
   */
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : `script-src 'self' 'nonce-${nonce}'`

  // Inline <style> is a dev-server mechanism. Production keeps 'self' only.
  const styleSrc = isDev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'"

  return [
    "default-src 'self'",
    scriptSrc,
    styleSrc,
    // Style ATTRIBUTES, in both modes. React sets them for computed values and
    // no nonce or hash can ever permit them (D52).
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    // The dev server talks to itself over a websocket for hot reloading.
    isDev ? "connect-src 'self' ws: wss:" : "connect-src 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    /*
     * Only where the page is already HTTPS.
     *
     * This directive rewrites every http:// request the page makes to https://,
     * which is exactly right in production and breaks an http origin — and
     * `next dev`, `next start` and every browser check in this project serve
     * http. It surfaced as ERR_SSL_PROTOCOL_ERROR on a redirect to
     * https://localhost:3111, from a page that had only ever asked for the
     * http one.
     *
     * Same shape as D63: a header written for production, applied everywhere,
     * breaking the environment nothing was testing. There is nothing to upgrade
     * on a connection that is already plaintext by choice.
     */
    ...(isHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}
