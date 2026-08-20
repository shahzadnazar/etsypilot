/*
 * Authentication abstraction.
 *
 * Supabase Auth is the chosen provider (architecture.md section 2) but nothing
 * above this module knows that. In demo mode a fixed session is returned so the
 * whole product is reachable with no credentials configured.
 *
 * Authorization is NOT delegated to the provider - see lib/permissions.
 */

import { cookies } from 'next/headers'
import { DEMO_ACTOR_ID, DEMO_SHOP_ID } from '@/lib/etsy/demo-dataset'
import { isDemoMode } from '@/lib/etsy'

export interface Session {
  userId: string
  email: string
  name: string
  /** The shop this request operates on. Single-shop in MVP (D20). */
  shopId: string
  isDemo: boolean
}

const DEMO_SESSION: Session = {
  userId: DEMO_ACTOR_ID,
  email: 'salman@willowandfern.com',
  name: 'Salman R.',
  shopId: DEMO_SHOP_ID,
  isDemo: true,
}

/**
 * Server-only. Returns null when signed out.
 *
 * Phase 11 swaps the demo branch for a Supabase session read; the signature
 * does not change.
 *
 * The `cookies()` read is not decoration and it is not a trick. A session is
 * per-request by definition, so a page whose content depends on WHO is asking
 * cannot be prerendered — and touching the request's cookies is how Next is
 * told that. Without it, demo mode returned a constant session, every dashboard
 * page was prerendered at build time, and the shell went on showing the plan it
 * had been built with after the seller changed it: /billing said "412 / 2,000"
 * while /dashboard said "412 / 200".
 *
 * Doing it here rather than sprinkling `export const dynamic` across the pages
 * means the property holds for every page that exists today AND every page
 * added later, without anyone remembering (D47).
 */
export async function getSession(): Promise<Session | null> {
  // Read, deliberately unused in demo mode: Phase 11 reads the auth cookie here.
  await cookies()
  if (isDemoMode()) return DEMO_SESSION
  return null
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) {
    const { Errors } = await import('@/lib/errors/types')
    throw Errors.notAuthenticated()
  }
  return session
}
