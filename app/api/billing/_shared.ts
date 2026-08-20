/*
 * Shared handling for the billing mutation routes.
 *
 * Every one of them is a POST from a plain form on the billing page — no
 * client-side JS required to cancel, which is the point: a cancel button that
 * needs a working bundle is a cancel button that can fail to appear.
 *
 * The shop comes from the session, never from the request. A shopId a caller
 * could supply is a cross-shop write waiting to happen.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { AppError, Errors } from '@/lib/errors/types'
import { shopContext, type ShopContext } from '@/lib/permissions'

export async function withShop(
  request: Request,
  run: (ctx: ShopContext) => Promise<void>,
): Promise<Response> {
  try {
    const session = await getSession()
    if (!session) throw Errors.notAuthenticated()
    await run(shopContext(session, session.shopId))
    /*
     * Back to the page that asked, resolved against the REQUEST's own origin.
     *
     * It used to resolve against NEXT_PUBLIC_APP_URL with a localhost:3000
     * default, so on any other port or host the browser followed the redirect
     * to a server that was not there and simply hung. curl never noticed —
     * it does not follow redirects by default. Driving the button did.
     */
    return NextResponse.redirect(new URL('/billing', request.url), 303)
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { message: error.message, recovery: error.recovery, code: error.code } },
        { status: statusFor(error) },
      )
    }
    const fallback = Errors.unknown()
    return NextResponse.json(
      { error: { message: fallback.message, recovery: fallback.recovery, code: fallback.code } },
      { status: 500 },
    )
  }
}

export function statusFor(error: AppError): number {
  switch (error.kind) {
    case 'AUTHENTICATION':
      return 401
    case 'AUTHORIZATION':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'VALIDATION':
      return 400
    case 'PLAN_LIMIT':
      return 402
    case 'RATE_LIMIT':
      return 429
    default:
      return 500
  }
}
