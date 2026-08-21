/*
 * The cases that matter, including the ones a naive check gets wrong.
 */

import { describe, expect, it } from 'vitest'
import { checkCsrf } from '@/lib/security/csrf'

const SELF = 'https://etsypilot.app'
const post = (over: Partial<Parameters<typeof checkCsrf>[0]> = {}) =>
  checkCsrf({ method: 'POST', path: '/api/billing/cancel', origin: null, referer: null, self: SELF, ...over })

describe('csrf', () => {
  it('refuses the attack that was verified working', () => {
    // POST /api/billing/cancel with Origin: https://evil.example returned 303
    // before this existed.
    expect(post({ origin: 'https://evil.example' }).allowed).toBe(false)
  })

  it('allows a same-origin post', () => {
    expect(post({ origin: SELF }).allowed).toBe(true)
  })

  it('is not fooled by a prefix domain', () => {
    /*
     * The bug a startsWith() check would have: "https://etsypilot.app" is a
     * prefix of "https://etsypilot.app.evil.com", so the attacker only has to
     * register a subdomain of their own domain.
     */
    expect(post({ origin: 'https://etsypilot.app.evil.com' }).allowed).toBe(false)
    expect(post({ referer: 'https://etsypilot.app.evil.com/x' }).allowed).toBe(false)
  })

  it('accepts a same-origin referer when Origin is absent', () => {
    expect(post({ referer: `${SELF}/billing` }).allowed).toBe(true)
  })

  it('refuses an unparseable referer rather than guessing', () => {
    expect(post({ referer: 'not a url' }).allowed).toBe(false)
  })

  it('leaves safe methods alone', () => {
    expect(checkCsrf({ method: 'GET', path: '/billing', origin: 'https://evil.example', referer: null, self: SELF }).allowed).toBe(true)
  })

  it('exempts the signature-verified webhook', () => {
    /*
     * Stripe calls this from its own servers with no Origin, and it already
     * verifies an HMAC over the raw body in constant time. Requiring an origin
     * it cannot send would break payments and add nothing.
     */
    expect(post({ path: '/api/billing/webhook', origin: null }).allowed).toBe(true)
    expect(post({ path: '/api/billing/webhook', origin: 'https://stripe.com' }).allowed).toBe(true)
  })

  it('allows a request with neither header', () => {
    // A forgery needs a browser to attach the cookie, and every browser sends
    // Origin on a cross-site POST. Refusing here breaks curl for no gain.
    expect(post().allowed).toBe(true)
  })
})
