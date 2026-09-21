import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { AUTH_OUTCOMES, authOutcome, outcomeForAuthError } from '@/domain/auth/outcomes'

/*
 * The sign-in screens must never publish a provider's words.
 *
 * Every failure a seller sees comes from the closed map in
 * domain/auth/outcomes.ts. These check the two things that would quietly break
 * that: a Supabase error reaching the page as text, and the copy answering a
 * question it should refuse to answer.
 */

describe('a provider error becomes our copy, never its own', () => {
  it('maps the failures a seller will actually hit', () => {
    expect(outcomeForAuthError({ code: 'invalid_credentials' })).toBe('invalid')
    expect(outcomeForAuthError({ code: 'email_not_confirmed' })).toBe('unconfirmed')
    expect(outcomeForAuthError({ code: 'weak_password' })).toBe('weak_password')
    expect(outcomeForAuthError({ code: 'over_request_rate_limit' })).toBe('rate_limited')
    expect(outcomeForAuthError({ status: 429 })).toBe('rate_limited')
  })

  it('reads the message only as a fallback, and still lands on a named outcome', () => {
    // Older Supabase releases send no `code`. The substring route is fragile,
    // which is why it ends at a key rather than passing text through.
    expect(outcomeForAuthError({ message: 'Invalid login credentials' })).toBe('invalid')
    expect(outcomeForAuthError({ message: 'Email not confirmed' })).toBe('unconfirmed')
  })

  it('turns an unrecognised failure into our problem, not a mystery string', () => {
    const outcome = outcomeForAuthError({ message: 'pg: connection refused at 10.0.0.4:5432' })
    expect(outcome).toBe('unavailable')
    // The detail is ours and says what a seller needs: nothing was submitted.
    expect(AUTH_OUTCOMES[outcome].detail).toContain('Nothing was submitted')
  })

  it('never returns a key that has no copy', () => {
    const inputs = [
      { code: 'invalid_credentials' },
      { code: 'nonsense_code_from_the_future' },
      { message: '' },
      {},
    ]
    for (const input of inputs) {
      expect(AUTH_OUTCOMES[outcomeForAuthError(input)]).toBeTruthy()
    }
  })

  it('renders nothing for an invented query value rather than echoing it', () => {
    expect(authOutcome('<script>alert(1)</script>')).toBeNull()
    expect(authOutcome('invalid')).toBe('invalid')
    expect(authOutcome(undefined)).toBeNull()
  })
})

describe('the forms do not answer "does this person have an account"', () => {
  it('blames the pair, never one half of it', () => {
    /*
     * Naming the wrong field turns the form into an existence oracle: submit
     * an address with a junk password, read the wording, learn whether that
     * person is a seller here. Supabase returns one error for both cases and
     * this copy must not undo that.
     */
    const copy = `${AUTH_OUTCOMES.invalid.title} ${AUTH_OUTCOMES.invalid.detail}`.toLowerCase()
    expect(copy).toContain('email and password')
    for (const leak of ['no account', 'not found', 'does not exist', 'unknown email', 'wrong password']) {
      expect(copy).not.toContain(leak)
    }
  })

  it('gives an already-registered address the same answer as a new one', () => {
    // Not "that account exists". Same neutral outcome either way.
    expect(outcomeForAuthError({ code: 'user_already_exists' })).toBe('check_email')
    expect(outcomeForAuthError({ message: 'User already registered' })).toBe('check_email')
    expect(AUTH_OUTCOMES.check_email.detail.toLowerCase()).toContain('if that address can be registered')
  })
})

describe('no Supabase detail can reach a signed-out page', () => {
  /*
   * Comments stripped before asserting — D59c. This file and the module it
   * checks both DISCUSS the provider by name, and a promise never to print X
   * contains X. The rule is about the code, so the check is too.
   */
  const source = readFileSync('domain/auth/outcomes.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('holds the error object without ever returning part of it', () => {
    // Returns a key. No template literal, no concatenation, no spread of the
    // error into anything that leaves the function.
    expect(source).not.toMatch(/return\s+`/)
    expect(source).not.toMatch(/error\.message\s*\)/)
    expect(source).toMatch(/return 'unavailable'/)
  })

  it('keeps the copy for every outcome written here', () => {
    for (const [key, outcome] of Object.entries(AUTH_OUTCOMES)) {
      expect(outcome.title.length, key).toBeGreaterThan(0)
      // Every outcome says what to do next, per rules.md section 12.
      expect(outcome.detail.length, key).toBeGreaterThan(20)
      expect(['info', 'warn', 'danger']).toContain(outcome.tone)
    }
  })
})
