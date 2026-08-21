/*
 * Redaction, tested on the shapes that actually appear.
 *
 * The values below are the real formats this product handles — Stripe keys,
 * Anthropic keys, OAuth token responses, PKCE verifiers, JWTs, bearer headers.
 * Testing redaction against `'secret'` proves nothing; testing it against the
 * string a provider genuinely returns is the point.
 */

import { describe, expect, it } from 'vitest'
import { redact } from '@/lib/observability/redact'

const has = (value: unknown, needle: string) => JSON.stringify(value).includes(needle)

describe('redact', () => {
  it('removes credentials by their shape, whatever key they sit under', () => {
    const cases = [
      'Authorization: Bearer ya29.A0ARrdaM9xKqLpQ7vN2sT4uW',
      'sk_live_51ABCDEFghijklmnop',
      'whsec_9aB7cD2eF4gH6iJ8kL0mN2oP',
      'sk-ant-api03-XyZ123456789abcdef',
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r',
      'grant_type=authorization_code&code_verifier=dBjftJeZ4CVPmB92K27uhbUJU1p1r',
      '{"access_token":"abc123def456ghi","refresh_token":"zzz999yyy888"}',
    ]
    for (const raw of cases) {
      const out = String(redact(raw))
      expect(out, `not redacted: ${raw}`).toContain('redacted')
      // The distinctive middle of each secret must be gone, not just prefixed.
      for (const fragment of ['ya29.A0ARrdaM9', '51ABCDEFghij', '9aB7cD2eF4', 'XyZ123456789',
                              'dBjftJeZ4CVPmB92', 'abc123def456', 'zzz999yyy888']) {
        if (raw.includes(fragment)) expect(out).not.toContain(fragment)
      }
    }
  })

  it('removes a value because of its KEY even when the value looks harmless', () => {
    const out = redact({ apiKey: 'hunter2', shopId: '18274531', nested: { refreshToken: 'plain' } })
    expect(has(out, 'hunter2')).toBe(false)
    expect(has(out, 'plain')).toBe(false)
    // ...and keeps what is safe. A redactor that blanks everything is useless
    // in exactly the moment you need the log.
    expect(has(out, '18274531')).toBe(true)
  })

  it('redacts an Error entirely — message and stack', () => {
    const error = new Error('exchange failed for sk_live_51ABCDEFghijklmnop')
    error.stack = 'Error: exchange failed for sk_live_51ABCDEFghijklmnop\n    at tokens.ts:42'
    const out = redact(error)
    expect(has(out, '51ABCDEFghij')).toBe(false)
    // The stack is not dropped, only cleaned: losing it would trade one problem
    // for a harder one.
    expect(has(out, 'tokens.ts:42')).toBe(true)
  })

  it('survives a cycle rather than taking the process down', () => {
    // Logging is what you rely on when everything else has already failed, so
    // it must not be the thing that throws.
    const a: Record<string, unknown> = { name: 'a' }
    a.self = a
    expect(() => redact(a)).not.toThrow()
  })
})
