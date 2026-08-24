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
 * Same globalThis store as costs and the audit log, for the same bundle-boundary
 * reason. Phase 11's `users` row replaces it.
 */

import { Errors } from '@/lib/errors/types'
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

export function getProfile(session: { userId: string; name: string; email: string }): Profile {
  const stored = store().get(session.userId)
  return {
    fullName: stored?.fullName ?? session.name,
    displayName: stored?.displayName ?? (session.name.split(' ')[0] ?? session.name),
    email: session.email,
    emailVerified: true,
    language: 'English (UK)',
    timeZone: DISPLAY_TIMEZONE,
  }
}

const MAX_NAME = 80

export function saveProfile(
  userId: string,
  raw: { fullName?: string; displayName?: string },
): Stored {
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
  store().set(userId, stored)
  return stored
}

/** Test helper. */
export function resetProfiles(): void {
  store().clear()
}
