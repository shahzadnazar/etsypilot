import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import { PERMISSIONS } from '@/domain/admin/roles'
import {
  NO_OPERATOR_RESET_NOTICE,
  RECOVERY_CODE_COUNT,
  TWO_FACTOR_OUTCOMES,
  TWO_FACTOR_SETUP_PATH,
  TWO_FACTOR_VERIFY_PATH,
  requiresTwoFactor,
  twoFactorOutcome,
  twoFactorRemedy,
} from '@/domain/auth/two-factor'
import {
  MIN_PASSWORD_LENGTH,
  RESET_OUTCOMES,
  RESET_SENT_DETAIL,
  RESET_SENT_TITLE,
  RESET_TIMING_FLOOR_MS,
  checkNewPassword,
  resetOutcome,
} from '@/domain/auth/reset'

/*
 * The parts of two-factor authentication and password reset that a unit test
 * can actually prove.
 *
 * WHAT IS DELIBERATELY NOT HERE: whether the gate refuses an aal1 session.
 * That is a claim about what a REQUEST gets, and this project has shipped two
 * defects that were invisible to unit tests for exactly that reason — a ref
 * never attached to a DOM node, and a check that read a page body while
 * ignoring its status. tests/browser/two-factor.py measures the gate against a
 * running server, with computed TOTP codes; these tests cover the rules and the
 * structure underneath it, which are the parts where a unit test is the
 * cheaper instrument rather than the weaker one.
 */

describe('who must have a second factor', () => {
  it('requires it of every operator role and of no seller', () => {
    expect(requiresTwoFactor('SUPER_ADMIN')).toBe(true)
    expect(requiresTwoFactor('ADMIN')).toBe(true)
    /*
     * MANAGER IS THE ONE WORTH ASSERTING. It is the weakest operator role and
     * the only one granted through a web form rather than an environment
     * variable, which makes it the obvious account to go after. A rule that
     * covered the two env-var roles and not this one would protect the
     * accounts that were already hardest to reach.
     */
    expect(requiresTwoFactor('MANAGER')).toBe(true)
    expect(requiresTwoFactor('USER')).toBe(false)
  })

  it('has no grace period to configure', () => {
    // A day count, an "enforceFrom" date or a feature flag would each be a way
    // to be an operator without a second factor for a while. The function
    // takes a role and nothing else, so there is no such argument to pass.
    expect(requiresTwoFactor.length).toBe(1)
  })
})

describe('the remedy matches which half is missing', () => {
  it('sends someone who has never enrolled to the setup screen', () => {
    expect(twoFactorRemedy({ enrolled: false, satisfied: false })).toBe(TWO_FACTOR_SETUP_PATH)
  })

  it('sends an enrolled aal1 session to the code screen', () => {
    // The distinction the whole feature turns on. One remedy for both would
    // show a QR code to someone who already has one scanned, and the natural
    // reading of that screen invites a second enrollment over a working one.
    expect(twoFactorRemedy({ enrolled: true, satisfied: false })).toBe(TWO_FACTOR_VERIFY_PATH)
  })

  it('has nothing to say to a session that is already satisfied', () => {
    expect(twoFactorRemedy({ enrolled: true, satisfied: true })).toBeNull()
  })

  it('treats an unresolved posture as unsatisfied, not as unenrolled', () => {
    // The closed posture is returned for "nobody" AND for "we could not ask".
    // Both must produce a remedy rather than a pass.
    expect(twoFactorRemedy({ enrolled: false, satisfied: false })).not.toBeNull()
  })
})

describe('the copy is a closed map', () => {
  it('renders nothing for an invented outcome key', () => {
    // The raw text comes from Supabase. Echoing a provider string onto one of
    // these screens makes an upstream wording change into our copy.
    expect(twoFactorOutcome('../../etc/passwd')).toBeNull()
    expect(twoFactorOutcome('wrong_code')).not.toBeNull()
    expect(resetOutcome('not-a-key')).toBeNull()
    expect(resetOutcome('wrong_code')).not.toBeNull()
  })

  it('gives every outcome a tone, a title and a detail', () => {
    for (const [key, outcome] of Object.entries({ ...TWO_FACTOR_OUTCOMES, ...RESET_OUTCOMES })) {
      expect(['info', 'warn', 'danger'], key).toContain(outcome.tone)
      expect(outcome.title.length, key).toBeGreaterThan(0)
      expect(outcome.detail.length, key).toBeGreaterThan(0)
    }
  })

  it('never offers an operator a reset somebody else could perform', () => {
    /*
     * The screen has to SAY this, because a person locked out will otherwise
     * wait for a button that is never coming and ask an admin who will go
     * looking for one. An admin who could clear a manager's factor could
     * enroll their own phone and sign in as them.
     */
    expect(NO_OPERATOR_RESET_NOTICE).toMatch(/no one at etsypilot can reset/i)
    expect(NO_OPERATOR_RESET_NOTICE).toMatch(/recovery code/i)
  })
})

describe('the forgot-password form tells nobody who is registered', () => {
  it('answers conditionally rather than claiming an email was sent', () => {
    // "We've sent you a code" to an address with no account is a lie that
    // sends someone to check an inbox nothing is coming to. The conditional
    // is what lets one string serve both cases honestly.
    expect(RESET_SENT_TITLE).toMatch(/if that email is registered/i)
    expect(RESET_SENT_DETAIL.length).toBeGreaterThan(0)
  })

  it('uses that one string for the only "sent" outcome there is', () => {
    // If a second, different success outcome existed, the two could be reached
    // by different addresses — which is the oracle, reintroduced through the
    // copy rather than through a branch.
    const sentLike = Object.entries(RESET_OUTCOMES).filter(([, outcome]) =>
      /sent/i.test(outcome.title),
    )
    expect(sentLike.map(([key]) => key)).toEqual(['sent'])
  })

  it('pads the response out so the two cases cannot be told apart on a clock', () => {
    // Same words in 40ms versus 600ms is the same oracle, read off a stopwatch.
    expect(RESET_TIMING_FLOOR_MS).toBeGreaterThanOrEqual(500)
  })
})

describe('a new password is checked in the order that helps', () => {
  it('reports a mismatch before a length problem', () => {
    // When both are true the person almost certainly mistyped the
    // confirmation, and telling them the password is short sends them to fix
    // the wrong field.
    expect(checkNewPassword('short', 'different')).toBe('mismatch')
    expect(checkNewPassword('short', 'short')).toBe('weak_password')
    expect(checkNewPassword('long-enough-passphrase', 'long-enough-passphrase')).toBeNull()
  })

  it('uses the same minimum the sign-up form does', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })
})

describe('recovery codes', () => {
  it('asks for enough to survive a lost phone and fit on one piece of paper', () => {
    expect(RECOVERY_CODE_COUNT).toBeGreaterThanOrEqual(8)
    expect(RECOVERY_CODE_COUNT).toBeLessThanOrEqual(16)
  })
})

/*
 * ══════════════════════════════════════════════════════════════════════════
 *   THE ORDERING TRAP, AS A STRUCTURAL GUARD
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Turning the aal2 requirement on locks out every operator who has not yet
 * enrolled — including whoever turns it on. If the enrollment screen lived
 * under app/(admin), that person would need aal2 to reach the screen that
 * grants aal2, and the only way out would be an intervention in the Supabase
 * dashboard.
 *
 * tests/browser/two-factor.py WALKS that path on a running server, which is the
 * real proof. These assertions are the cheap half: they fail the moment someone
 * moves the file, which is the edit that would recreate the trap, and they fail
 * in a suite that runs on every commit rather than only where a browser and a
 * database are available.
 */
describe('the enrollment screen is outside the gate it unlocks', () => {
  const SETUP_FILE = 'app/(account)/two-factor/page.tsx'
  const VERIFY_FILE = 'app/(account)/two-factor/verify/page.tsx'

  it('exists where the gate redirects to', () => {
    expect(existsSync(SETUP_FILE), SETUP_FILE).toBe(true)
    expect(existsSync(VERIFY_FILE), VERIFY_FILE).toBe(true)
    // The paths the gate sends people to and the files that answer them are
    // the same two routes — a route group is invisible in the URL, so this is
    // the only place the correspondence can be checked.
    expect(TWO_FACTOR_SETUP_PATH).toBe('/two-factor')
    expect(TWO_FACTOR_VERIFY_PATH).toBe('/two-factor/verify')
  })

  it('is not under app/(admin), where reaching it would need what it grants', () => {
    const underAdmin: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = posixJoin(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/two-factor/.test(path)) underAdmin.push(path)
      }
    }
    walk('app/(admin)')
    expect(underAdmin).toEqual([])
  })

  it('is not under app/(dashboard) either, which provisions before it renders', () => {
    /*
     * A subtler version of the same trap. app/(dashboard)/layout.tsx resolves
     * the caller's SHOP through getSession(), which repairs a missing one by
     * writing three seller tables. An operator locked out of the console would
     * then have their enrollment screen gated behind provisioning that has
     * nothing to do with enrolling — and a super admin whose own shop row was
     * broken would be locked out of the fix by a table this flow never reads.
     * That exact failure is why getOperatorIdentity() exists.
     */
    const underDashboard: string[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = posixJoin(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/two-factor/.test(path)) underDashboard.push(path)
      }
    }
    walk('app/(dashboard)')
    expect(underDashboard).toEqual([])
  })

  it('reaches the session through the module that cannot write', () => {
    const layout = readFileSync('app/(account)/layout.tsx', 'utf8')
    expect(layout).toContain('getOperatorIdentity')
    // getSession() is the one that provisions. Importing it here would drag
    // three seller tables into the route an operator uses when locked out.
    expect(layout).not.toMatch(/from '@\/lib\/auth'/)
  })
})

describe('the gate asks both questions', () => {
  const source = readFileSync('domain/admin/access.ts', 'utf8')

  it('spends the posture through the shared rule rather than its own if', () => {
    expect(source).toContain('requiresTwoFactor')
    expect(source).toContain('twoFactorRemedy')
  })

  it('refuses a non-operator BEFORE it redirects anyone', () => {
    /*
     * A redirect to /two-factor tells the recipient that /admin exists, which
     * is the disclosure the 404 exists to deny. It is only safe because
     * requireOperatorTwoFactor() takes an AdminAccess — it cannot be called
     * until the caller has already been established as an operator. That is a
     * property of the signature, not of the order somebody wrote the lines in.
     */
    expect(source).toMatch(/requireOperatorTwoFactor\(access: AdminAccess\)/)
  })
})

describe('nothing in the new auth code hard-codes where the product lives', () => {
  const FILES = [
    'lib/auth/mfa.ts',
    'lib/auth/mfa-actions.ts',
    'lib/auth/reset-actions.ts',
    'domain/auth/two-factor.ts',
    'domain/auth/reset.ts',
    'app/(account)/layout.tsx',
    'app/(account)/two-factor/page.tsx',
    'app/(account)/two-factor/verify/page.tsx',
    'app/(public)/forgot-password/page.tsx',
    'app/(public)/reset-password/page.tsx',
    'app/(public)/reset-password/new/page.tsx',
  ]

  /*
   * The product has no domain yet. When one arrives the change must be an
   * environment value and some Supabase dashboard settings — never an edit to
   * a file. The code flow makes that easy to hold: `resetPasswordForEmail`
   * needs a `redirectTo` only for the LINK flow, and the six-digit code flow
   * needs none, so there is no site URL in any of these files to get wrong.
   */
  it('contains no host, no domain and no localhost', () => {
    const offenders: string[] = []
    for (const file of FILES) {
      const source = readFileSync(file, 'utf8')
      // Comments are stripped first. A guard that fires on its own
      // documentation has been found in this repository eighteen times.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      for (const pattern of [/localhost/i, /https?:\/\/[a-z0-9.-]+/i, /\.vercel\.app/i]) {
        if (pattern.test(code)) offenders.push(`${file}: ${pattern}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('asks Supabase for a recovery code rather than a link', () => {
    const source = readFileSync('lib/auth/reset-actions.ts', 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    )
    expect(source).toContain('resetPasswordForEmail')
    expect(source).toContain("type: 'recovery'")
    // redirectTo is what a link flow needs and what would require a domain.
    expect(source).not.toContain('redirectTo')
  })
})

describe('no table of ours holds a second factor or a reset code', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   THE OPERATOR AREA MAY WRITE EXACTLY FOUR THINGS, AND STILL DOES.
   * ══════════════════════════════════════════════════════════════════════
   *
   * A TOTP secret is a password equivalent — it generates every future code —
   * and a six-digit reset code is a million possibilities, so hashing one
   * protects very little next to expiry, an attempt cap and a rate limit.
   * Supabase holds all of them, with all three protections, and a second copy
   * in a table of ours would be a second thing that can leak. Row-level
   * security on this project was disabled and exploitable within the last
   * week; a readable table of reset codes is a password reset for everybody
   * in it at once.
   */
  it('adds no schema for factors, secrets or codes', () => {
    const schema = readFileSync('db/schema/index.ts', 'utf8')
    for (const forbidden of [
      'mfa_factors',
      'totp_secrets',
      'password_reset',
      'reset_codes',
      'recovery_codes',
      'two_factor',
    ]) {
      expect(schema, forbidden).not.toContain(forbidden)
    }
  })

  it('reads enrollment out of Supabase, never out of a column', () => {
    const source = readFileSync('lib/auth/mfa.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(source).toContain('supabase.auth.getUser')
    expect(source).not.toContain('getDb')
    expect(source).not.toMatch(/from '@\/lib\/db'/)
    expect(source).not.toMatch(/from '@\/lib\/repositories/)
  })

  it('leaves the permission list untouched', () => {
    // 2FA is not a permission and must not become one: it is a property of the
    // SESSION, and adding a key here would let the matrix turn it off.
    expect(PERMISSIONS).not.toContain('two_factor.manage' as never)
  })
})

describe('the aal claim is only believed after the server validated the token', () => {
  const source = readFileSync('lib/auth/mfa.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  it('calls getUser() before it decodes anything', () => {
    /*
     * `aal` rides in a cookie. Reading a privilege level straight out of one
     * would be the same defect as trusting getSession(), which this codebase
     * already refuses to do. getUser() checks the signature SERVER-SIDE, so a
     * token with a hand-edited claim fails there; only then are its claims
     * worth reading.
     */
    const getUserAt = source.indexOf('supabase.auth.getUser')
    const decodeAt = source.indexOf('claimsOf(token)')
    expect(getUserAt).toBeGreaterThan(-1)
    expect(decodeAt).toBeGreaterThan(getUserAt)
  })

  it('binds the decoded token to the user the server returned', () => {
    expect(source).toContain('claims.sub !== userData.user.id')
  })

  it('does not use the argument-free assurance-level helper', () => {
    // Its public signature takes no JWT, and in that form it reads the session
    // out of storage and decodes it WITHOUT the getUser() round trip —
    // precisely the decode without the validation.
    expect(source).not.toContain('getAuthenticatorAssuranceLevel')
  })
})
