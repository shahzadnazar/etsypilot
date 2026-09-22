/*
 * The profile's one job that matters elsewhere: the audit log's actor name.
 *
 * The page's subtitle claims this is "how you appear in the audit log". A blank
 * display name would make every future record answer "who did this?" with
 * nothing, so it is refused at the boundary rather than trimmed to an empty
 * string and rendered as a gap.
 *
 * These run with no DATABASE_URL, which is the in-memory branch — the demo-mode
 * path, and the one that must keep behaving exactly as before. The persisted
 * branch is covered by the repository's own tests; what is asserted here is the
 * VALIDATION, which is shared by both and is the part with a rule in it.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import { getProfile, resetProfiles, saveProfile } from '@/domain/profile/service'
import { AppError } from '@/lib/errors/types'

const SESSION = { userId: 'user-1', name: 'Salman Rahman', email: 'salman@willowandfern.com' }

describe('profile', () => {
  beforeEach(() => resetProfiles())

  it('defaults the display name to the first name', async () => {
    expect((await getProfile(SESSION)).displayName).toBe('Salman')
    expect((await getProfile(SESSION)).fullName).toBe('Salman Rahman')
  })

  it('reads back what was saved', async () => {
    await saveProfile(SESSION.userId, { fullName: 'S. Rahman', displayName: 'Sal' })
    expect((await getProfile(SESSION)).displayName).toBe('Sal')
    expect((await getProfile(SESSION)).fullName).toBe('S. Rahman')
  })

  it('refuses a blank or whitespace name', async () => {
    await expect(
      saveProfile(SESSION.userId, { fullName: '', displayName: 'Sal' }),
    ).rejects.toThrow(AppError)
    await expect(
      saveProfile(SESSION.userId, { fullName: 'S', displayName: '   ' }),
    ).rejects.toThrow(AppError)
    // And nothing was stored on the way out.
    expect((await getProfile(SESSION)).displayName).toBe('Salman')
  })

  it('refuses a name long enough to break every table it appears in', async () => {
    await expect(
      saveProfile(SESSION.userId, { fullName: 'x'.repeat(200), displayName: 'Sal' }),
    ).rejects.toThrow(AppError)
  })

  it('keeps accounts apart', async () => {
    await saveProfile('user-1', { fullName: 'One', displayName: 'One' })
    expect((await getProfile({ ...SESSION, userId: 'user-2' })).displayName).toBe('Salman')
  })

  it('saves for a session that has no users row', async () => {
    /*
     * The demo session's actor has no row, by design. With a DATABASE_URL set
     * and AUTH_MODE unset — which is what happens the moment someone flips auth
     * back to demo — the first version of this THREW and Settings → Profile
     * stopped saving on the demo shop. Found against a real Postgres.
     *
     * Here there is no database at all, so this exercises the same fallback the
     * other configuration lands on.
     */
    await expect(
      saveProfile('demo-user-salman', { fullName: 'Salman R.', displayName: 'Salman' }),
    ).resolves.toEqual({ fullName: 'Salman R.', displayName: 'Salman' })

    // And it reads back, rather than succeeding and vanishing on reload.
    const back = await getProfile({ userId: 'demo-user-salman', name: 'x', email: 'x@y.z' })
    expect(back.fullName).toBe('Salman R.')
  })

  it('states UTC as the display zone, because that is what is printed', async () => {
    // The page's note — "changing this changes how times are printed, never how
    // numbers are computed" — is only honest while this is the truth.
    expect((await getProfile(SESSION)).timeZone).toBe('UTC')
  })
})
