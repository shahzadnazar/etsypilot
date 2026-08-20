/*
 * Authorization.
 *
 * Server-side, shop-scoped, on every request. A user must never be able to
 * operate on another shop's data (architecture.md section 9).
 *
 * Repositories take a shop context argument rather than reading an ambient one,
 * so "forgot to scope this query" is a missing-argument compile error.
 */

import { Errors } from '@/lib/errors/types'
import type { Session } from '@/lib/auth'

export interface ShopContext {
  shopId: string
  actorId: string
  /** Demo shops are read-only. Checked before any write path runs. */
  readOnly: boolean
}

/** The only sanctioned way to turn a session plus a shop id into a context. */
export function shopContext(session: Session, shopId: string): ShopContext {
  if (session.shopId !== shopId) throw Errors.crossShop(shopId)
  return { shopId, actorId: session.userId, readOnly: session.isDemo }
}

/** Call at the top of every mutation, before validation or queueing. */
export function assertCanWrite(ctx: ShopContext): void {
  if (ctx.readOnly) throw Errors.demoModeWrite()
}
