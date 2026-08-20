/*
 * Authentication abstraction.
 *
 * Supabase Auth is the chosen provider (architecture.md section 2) but nothing
 * above this module knows that. In demo mode a fixed session is returned so the
 * whole product is reachable with no credentials configured.
 *
 * Authorization is NOT delegated to the provider - see lib/permissions.
 */

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
 */
export async function getSession(): Promise<Session | null> {
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
