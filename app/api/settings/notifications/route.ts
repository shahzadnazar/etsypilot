/*
 * Saving notification preferences.
 *
 * A plain form POST. Every value is checked against the closed sets in the
 * domain — an event key, a digest day and a section name that a caller could
 * invent are three ways to end up with a preference nobody can turn off.
 */

import { NextResponse } from 'next/server'
import {
  DIGEST_DAYS,
  DIGEST_SECTIONS,
  NOTIFICATION_EVENTS,
  defaultPreferences,
  writePreferences,
  type DigestDay,
  type DigestSection,
  type NotificationEvent,
  type NotificationPreferences,
} from '@/domain/notifications/service'
import { getSession } from '@/lib/auth'
import { errorResponse } from '@/lib/errors/api'
import { Errors } from '@/lib/errors/types'
import { shopContext } from '@/lib/permissions'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) throw Errors.notAuthenticated()
    const ctx = shopContext(session, session.shopId)

    const form = await request.formData()
    writePreferences(ctx.shopId, parse(form))
    return NextResponse.redirect(new URL('/settings/notifications?saved=1', request.url), 303)
  } catch (error) {
    return errorResponse(error, { path: new URL(request.url).pathname })
  }
}

function parse(form: FormData): NotificationPreferences {
  const defaults = defaultPreferences()

  /*
   * An unchecked checkbox sends nothing at all, so every channel is read as
   * "present means on". Reading it the other way round — defaulting to the
   * stored value when absent — would make a box impossible to untick.
   */
  const channels = {} as NotificationPreferences['channels']
  for (const event of NOTIFICATION_EVENTS) {
    channels[event as NotificationEvent] = {
      inApp: form.get(`${event}.inApp`) === 'on',
      email: form.get(`${event}.email`) === 'on',
    }
  }

  const day = String(form.get('digestDay') ?? '')
  const sections = DIGEST_SECTIONS.filter((s) => form.get(`section.${s}`) === 'on')

  return {
    channels,
    digestDay: DIGEST_DAYS.includes(day as DigestDay) ? (day as DigestDay) : defaults.digestDay,
    digestSections: sections as DigestSection[],
    marginFloorPercent: bounded(form.get('marginFloorPercent'), 0, 100, defaults.marginFloorPercent),
    stockFloor: bounded(form.get('stockFloor'), 0, 10_000, defaults.stockFloor),
    quietHoursFrom: time(form.get('quietHoursFrom'), defaults.quietHoursFrom),
    quietHoursTo: time(form.get('quietHoursTo'), defaults.quietHoursTo),
  }
}

function bounded(raw: FormDataEntryValue | null, min: number, max: number, fallback: number): number {
  const n = Number(String(raw ?? ''))
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback
}

/** HH:MM only. Anything else falls back rather than being stored as typed. */
function time(raw: FormDataEntryValue | null, fallback: string): string {
  const value = String(raw ?? '')
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback
}
