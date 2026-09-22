/*
 * Profile (artboard 110).
 *
 * Two editable fields and nothing else. The subtitle claims this is "how you
 * appear in the audit log", so the display name is read by the audit-log event
 * builder — otherwise the sentence would be decorative.
 *
 * Language and display time zone are NOT editable here, and that is a statement
 * rather than an oversight. EtsyPilot prints every time in UTC today; a select
 * offering four zones that changed nothing would be exactly the kind of control
 * this product spends its effort not shipping. The design's load-bearing
 * sentence — that changing a display setting never changes a calculation —
 * survives without it, and is more clearly true.
 *
 * WHERE THE NAME LIVES NOW. It used to be a globalThis Map, which was correct
 * while no repository existed: a saved name survived until the next restart and
 * the shell never saw it at all, so the greeting stayed "Good morning,
 * malikfarhanjamal314623". It writes to `users` through lib/repositories now.
 *
 * The in-memory store is KEPT, and only for the case it is still right for:
 * demo mode, where there is no DATABASE_URL at all. Without it the profile
 * screen would throw the moment anyone pressed Save on the demo shop. So the
 * rule is one line — persist if there is somewhere to persist to, otherwise
 * hold it in memory and let it die with the process, which is what demo data
 * does anyway.
 *
 * TWO COLUMNS, because the screen edits two fields. `users.name` is the full
 * name and `users.display_name` is the shorter one the audit log prints.
 * Deriving the second from the first would overwrite whatever a seller chose
 * the next time they fixed a typo in the other.
 */

import { Errors } from '@/lib/errors/types'
import { logFailure } from '@/lib/errors/api'
import { isDatabaseConfigured } from '@/lib/db'
import { readOnlyAccountStore, withAccountStore } from '@/lib/repositories/accounts'
import { DISPLAY_TIMEZONE } from '@/lib/utils/format'

export interface Profile {
  fullName: string
  /** The name beside every action in the audit log. */
  displayName: string
  email: string
  emailVerified: boolean
  /** Fixed for now, and the page says why. */
  language: string
  timeZone: string
}

const STORE_KEY = Symbol.for('etsypilot.profile.store')

interface Stored {
  fullName: string
  displayName: string
}

function store(): Map<string, Stored> {
  const g = globalThis as unknown as Record<symbol, Map<string, Stored> | undefined>
  const existing = g[STORE_KEY]
  if (existing) return existing
  const fresh = new Map<string, Stored>()
  g[STORE_KEY] = fresh
  return fresh
}

/** The first word, which is the sensible starting display name. */
function firstWord(name: string): string {
  return name.split(/\s+/)[0] ?? name
}

export async function getProfile(session: {
  userId: string
  name: string
  email: string
}): Promise<Profile> {
  const stored = await readStored(session.userId)
  return {
    fullName: stored?.fullName ?? session.name,
    displayName: stored?.displayName ?? firstWord(session.name),
    email: session.email,
    emailVerified: true,
    language: 'English (UK)',
    timeZone: DISPLAY_TIMEZONE,
  }
}

/**
 * Read the stored names, from wherever they are.
 *
 * A database row wins when there is a database. The two are never consulted
 * together: mixing a persisted full name with an in-memory display name would
 * give a profile that exists in no single place and cannot be reasoned about.
 */
async function readStored(userId: string): Promise<Stored | null> {
  if (!isDatabaseConfigured()) return store().get(userId) ?? null

  const user = await readOnlyAccountStore().findUserById(userId)
  // Mirrors the write's fallback. Without this, a demo save would succeed and
  // then vanish on reload — worse than the refusal it replaced.
  if (!user?.name) return store().get(userId) ?? null
  return { fullName: user.name, displayName: user.displayName ?? firstWord(user.name) }
}

const MAX_NAME = 80

export async function saveProfile(
  userId: string,
  raw: { fullName?: string; displayName?: string },
): Promise<Stored> {
  const fullName = (raw.fullName ?? '').trim()
  const displayName = (raw.displayName ?? '').trim()

  /*
   * A blank name is refused rather than accepted and rendered as an empty gap
   * in the audit log. "Who did this?" answered by nothing is the one answer the
   * log must never give.
   */
  if (fullName === '') {
    throw Errors.validation(
      'Your name cannot be blank.',
      'Enter the name you want on your account. It is not sent to Etsy.',
    )
  }
  if (displayName === '') {
    throw Errors.validation(
      'Your display name cannot be blank.',
      'This is the name beside every action in the audit log, so it has to be something.',
    )
  }
  if (fullName.length > MAX_NAME || displayName.length > MAX_NAME) {
    throw Errors.validation(
      `Names must be ${MAX_NAME} characters or fewer.`,
      'Shorten it and save again. Nothing was changed.',
    )
  }

  const stored: Stored = { fullName, displayName }

  if (!isDatabaseConfigured()) {
    // Demo mode. Held in memory and gone on restart, like every other demo
    // edit — and the only behaviour this screen has ever had until now.
    store().set(userId, stored)
    return stored
  }

  const updated = await withAccountStore((tx) =>
    // The repository speaks in column names; this service speaks in field names.
    tx.updateUserName(userId, { name: fullName, displayName }),
  )

  if (!updated) {
    /*
     * No row for this user. The configuration that reaches here is a real one:
     * a DATABASE_URL set while AUTH_MODE is unset, which is what happens the
     * moment someone flips auth back to demo to check something. The demo
     * session's actor has no `users` row by design, so the first version of
     * this threw and Settings → Profile stopped saving on the demo shop. Found
     * by running it against a real Postgres, not by reading it.
     *
     * So: fall back to memory rather than refuse. A live signed-in seller
     * cannot reach here — getSession() provisions before any page renders, so
     * their row exists by the time Settings loads — which makes "no row" mean
     * the demo session in practice. It is logged anyway, because "in practice"
     * is the kind of reasoning that stops being true quietly.
     */
    logFailure(
      new Error(`profile save found no users row for ${userId}; kept in memory`),
      { path: '/settings/profile' },
    )
    store().set(userId, stored)
  }
  return stored
}

/** Test helper. Clears the in-memory store only; it never touches a database. */
export function resetProfiles(): void {
  store().clear()
}
