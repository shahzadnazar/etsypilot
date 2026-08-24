/*
 * The profile's one job that matters elsewhere: the audit log's actor name.
 *
 * The page's subtitle claims this is "how you appear in the audit log". A blank
 * display name would make every future record answer "who did this?" with
 * nothing, so it is refused at the boundary rather than trimmed to an empty
 * string and rendered as a gap.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { getProfile, resetProfiles, saveProfile } from '@/domain/profile/service'
import { AppError } from '@/lib/errors/types'

const SESSION = { userId: 'user-1', name: 'Salman Rahman', email: 'salman@willowandfern.com' }

describe('profile', () => {
  beforeEach(() => resetProfiles())

  it('defaults the display name to the first name', () => {
    expect(getProfile(SESSION).displayName).toBe('Salman')
    expect(getProfile(SESSION).fullName).toBe('Salman Rahman')
  })

  it('reads back what was saved', () => {
    saveProfile(SESSION.userId, { fullName: 'S. Rahman', displayName: 'Sal' })
    expect(getProfile(SESSION).displayName).toBe('Sal')
    expect(getProfile(SESSION).fullName).toBe('S. Rahman')
  })

  it('refuses a blank or whitespace name', () => {
    expect(() => saveProfile(SESSION.userId, { fullName: '', displayName: 'Sal' })).toThrow(AppError)
    expect(() => saveProfile(SESSION.userId, { fullName: 'S', displayName: '   ' })).toThrow(AppError)
    // And nothing was stored on the way out.
    expect(getProfile(SESSION).displayName).toBe('Salman')
  })

  it('refuses a name long enough to break every table it appears in', () => {
    expect(() =>
      saveProfile(SESSION.userId, { fullName: 'x'.repeat(200), displayName: 'Sal' }),
    ).toThrow(AppError)
  })

  it('keeps accounts apart', () => {
    saveProfile('user-1', { fullName: 'One', displayName: 'One' })
    expect(getProfile({ ...SESSION, userId: 'user-2' }).displayName).toBe('Salman')
  })

  it('states UTC as the display zone, because that is what is printed', () => {
    // The page's note — "changing this changes how times are printed, never how
    // numbers are computed" — is only honest while this is the truth.
    expect(getProfile(SESSION).timeZone).toBe('UTC')
  })
})
