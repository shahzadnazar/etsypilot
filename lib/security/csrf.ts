/*
 * Cross-site request forgery.
 *
 * A form on any website can POST to this app, and the browser attaches the
 * seller's cookies. Verified before this existed: a POST to
 * /api/billing/cancel carrying `Origin: https://evil.example` returned 303 —
 * a successful cancellation. Also /resume and /change/[plan].
 *
 * It was not exploitable at the time, for a reason that is not a defence:
 * demo mode returns a fixed session and reads no auth cookie, so there was no
 * cookie to ride. The day Supabase auth lands, every one of those routes
 * becomes a one-click attack from any page a seller happens to visit.
 *
 * The check is on Origin, with Referer as a fallback, rather than a token.
 * Reasons, in order:
 *
 *   - It cannot be forgotten per-route. A token has to be threaded through
 *     every form; this runs in middleware over everything, so a route added
 *     next month is covered without anyone knowing this file exists.
 *   - The forms here are plain HTML posts with no JavaScript (deliberately —
 *     "a cancel button that needs a working bundle is a cancel button that can
 *     fail to appear"). A token would mean either JS or hidden fields in every
 *     form, and a missing one fails closed and silently.
 *   - Browsers have sent Origin on all cross-site POSTs for years, so the
 *     null-Origin case below is a same-origin navigation, not an attacker.
 *
 * SameSite cookies are the other half and are not a substitute: Lax still
 * permits top-level cross-site GETs, and a seller's session cookie policy is
 * not this module's to assume.
 */

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/*
 * Paths that are cross-origin BY DESIGN and prove themselves another way.
 *
 * The Stripe webhook is called by Stripe, from Stripe's servers, with no
 * Origin header — and it already verifies an HMAC signature over the raw body
 * in constant time, which is a strictly stronger check than any origin test.
 * Exempting it is not a hole; requiring an Origin it cannot send would simply
 * break payments.
 */
const SIGNATURE_VERIFIED = ['/api/billing/webhook']

export interface CsrfVerdict {
  allowed: boolean
  /** Set when refused. Never echoed to the caller — for the log only. */
  reason?: string
}

export function checkCsrf(args: {
  method: string
  path: string
  origin: string | null
  referer: string | null
  /** This deployment's own origin, from the request URL. */
  self: string
}): CsrfVerdict {
  if (!UNSAFE.has(args.method.toUpperCase())) return { allowed: true }
  if (SIGNATURE_VERIFIED.some((p) => args.path.startsWith(p))) return { allowed: true }

  if (args.origin) {
    return args.origin === args.self
      ? { allowed: true }
      : { allowed: false, reason: 'origin-mismatch' }
  }

  /*
   * No Origin. Fall back to Referer, and accept only an exact ORIGIN match.
   * `startsWith(self)` would be wrong: "https://etsypilot.app" is a prefix of
   * "https://etsypilot.app.evil.com", so an attacker registers a subdomain of
   * their own domain and walks through.
   */
  if (args.referer) {
    try {
      return new URL(args.referer).origin === args.self
        ? { allowed: true }
        : { allowed: false, reason: 'referer-mismatch' }
    } catch {
      return { allowed: false, reason: 'referer-unparseable' }
    }
  }

  /*
   * Neither header. Allowed, and this is the one judgement call in the file.
   *
   * Every browser sends Origin on a cross-site POST, so a request with neither
   * is a same-origin post from a client with a strict referrer policy, or a
   * server-to-server caller — not a forgery, which needs a browser to attach
   * the cookie. Refusing here would break curl, health checks and any
   * non-browser client for no security gain.
   */
  return { allowed: true }
}
