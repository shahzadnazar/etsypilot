import { describe, expect, it } from 'vitest'
import { greetingName, initialsFor } from '@/lib/utils/name'

/*
 * Both of these were found by RUNNING the old expressions over real name
 * shapes, not by reading them. Each had survived review.
 *
 *   "O'Brien"      the avatar showed O' — punctuation, because the one-word
 *                  branch took the first two CHARACTERS rather than letters.
 *   "  Jo Ann"     the greeting was "Good morning, " with nothing after it:
 *                  split(' ')[0] on a leading space is the empty string.
 */

describe('the greeting never comes out empty', () => {
  it('uses the first word', () => {
    expect(greetingName('Farhan Jamal')).toBe('Farhan')
    expect(greetingName('Anne-Marie Smith')).toBe('Anne-Marie')
  })

  it('survives leading, trailing and doubled whitespace', () => {
    // The defect. "  Jo Ann".split(' ')[0] === ''.
    expect(greetingName('  Jo  Ann  ')).toBe('Jo')
    expect(greetingName(' Prince')).toBe('Prince')
  })

  it('falls back rather than greeting nobody', () => {
    expect(greetingName('')).toBe('there')
    expect(greetingName('   ')).toBe('there')
  })

  it('leaves a one-word name alone', () => {
    expect(greetingName('Prince')).toBe('Prince')
    expect(greetingName('malikfarhanjamal314623')).toBe('malikfarhanjamal314623')
  })
})

describe('avatar initials are letters, and always two when there are two', () => {
  it('takes one letter from each of two words', () => {
    expect(initialsFor('Farhan Jamal')).toBe('FJ')
    expect(initialsFor('Salman R.')).toBe('SR')
  })

  it('takes two letters from a single word', () => {
    // Otherwise a provisioned account's one-word label gives a single
    // character and the avatar is a different shape from everyone else's.
    expect(initialsFor('Prince')).toBe('PR')
    expect(initialsFor('malikfarhanjamal314623')).toBe('MA')
  })

  it('never puts punctuation in the avatar', () => {
    // The defect: "O'Brien".slice(0, 2) === "O'".
    expect(initialsFor("O'Brien")).toBe('OB')
    expect(initialsFor('Mary-Jane')).toBe('MA')
    expect(initialsFor("Anne-Marie O'Neill")).toBe('AO')
  })

  it('keeps accented and non-Latin letters instead of blanking them', () => {
    // [A-Za-z] would have dropped every one of these and left an empty avatar.
    expect(initialsFor('Émile Zola')).toBe('ÉZ')
    expect(initialsFor('Ayşe Yılmaz')).toBe('AY')
    expect(initialsFor('李雷')).toBe('李雷')
  })

  it('falls back to the email when there is no usable name', () => {
    expect(initialsFor('', 'farhan@example.com')).toBe('FA')
    expect(initialsFor('123', 'farhan@example.com')).toBe('FA')
  })

  it('returns at most two characters, whatever it is given', () => {
    for (const name of ['Farhan Jamal Khan Malik', 'A B C D', 'Prince', '', '   ']) {
      expect(initialsFor(name, 'x@y.z').length, name).toBeLessThanOrEqual(2)
    }
  })
})

/* ───────────────── no name is ever cut out of an email address ───────────── */

import { existsSync, readFileSync } from 'node:fs'
import { getProfile, auditActor } from '@/domain/profile/service'

/** Source with comments removed, so a guard cannot match its own reasoning. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('an email address is not a name', () => {
  /*
   * FOUND ON THE RUNNING APP. An account with no name was greeted
   *
   *     Good morning, malikfarhanjamal7229
   *
   * which is the local part of the address. It is not a name, it is not what
   * that person is called, and for a great many addresses it is a string
   * nobody would want on their own screen: a year, a nickname, a former
   * surname, a number someone was assigned.
   */

  it('CUTS NO NAME OUT OF AN ADDRESS, anywhere that resolves an identity', () => {
    const suspects = [
      'lib/auth/index.ts',
      'domain/profile/service.ts',
      'domain/auth/provision.ts',
      'app/(dashboard)/layout.tsx',
      'app/(dashboard)/dashboard/page.tsx',
      'app/(admin)/layout.tsx',
      'components/layout/user-menu.tsx',
    ]
    // Anti-vacuity: a renamed file would make every assertion below pass.
    for (const file of suspects) expect(existsSync(file), file).toBe(true)

    for (const file of suspects) {
      expect(code(file), file).not.toMatch(/email[\w.]*\s*\.\s*split\s*\(\s*['"]@['"]/)
      expect(code(file), file).not.toMatch(/split\s*\(\s*['"]@['"]\s*\)\s*\[\s*0\s*\]/)
    }
  })

  it('catches the shape it is looking for when it is really there', () => {
    /*
     * The positive control. Without it this rule passes on a repository where
     * the pattern was renamed rather than removed — and it is the rule, not
     * the spelling, that has to survive.
     */
    const rule = /email[\w.]*\s*\.\s*split\s*\(\s*['"]@['"]/
    expect(rule.test("const local = user.email.split('@')[0] ?? ''")).toBe(true)
    expect(rule.test('const local = session.email.split("@")[0]')).toBe(true)
    expect(rule.test("const domain = host.split('.')[0]")).toBe(false)
  })

  it('leaves the profile form EMPTY rather than pre-filled with a guess', async () => {
    /*
     * The second half of the same defect, and the worse one: the profile form
     * pre-filled from the same derived value, so pressing Save would have
     * STORED the fragment of the address as the seller's name — turning a
     * display fallback into a fact about them.
     */
    const profile = await getProfile({ userId: 'no-such-user', name: null, email: 'a1b2@x.com' })
    expect(profile.fullName).toBe('')
    expect(profile.displayName).toBe('')
    expect(profile.email).toBe('a1b2@x.com')
  })

  it('still uses a real name when there is one', async () => {
    // The converse, so the assertion above is not satisfied by a function that
    // returns empty strings for everybody.
    const profile = await getProfile({ userId: 'no-such-user', name: 'Jo Ann', email: 'j@x.com' })
    expect(profile.fullName).toBe('Jo Ann')
    expect(profile.displayName).toBe('Jo')
  })

  it('names the ADDRESS in the audit log rather than nobody', async () => {
    /*
     * Where the empty string would be worse than the derived one. An audit
     * entry has to say who acted, so the fallback is the address SHOWN AS AN
     * ADDRESS — a different thing from an address dressed as a name.
     */
    expect(await auditActor({ userId: 'no-such-user', name: null, email: 'a1b2@x.com' })).toBe(
      'a1b2@x.com',
    )
    expect(await auditActor({ userId: 'no-such-user', name: 'Jo Ann', email: 'j@x.com' })).toBe(
      'Jo',
    )
  })
})
