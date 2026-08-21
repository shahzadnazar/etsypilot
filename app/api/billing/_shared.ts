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
import { errorResponse } from '@/lib/errors/api'
import { Errors } from '@/lib/errors/types'
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
    /*
     * One envelope for every route (lib/errors/api.ts), rather than a hand
     * rolled JSON body here and a slightly different one in the export route.
     *
     * The local copy this replaces had a `default: 500` switch, so an ErrorKind
     * added later silently became a 500 without anyone deciding it should. The
     * shared map is a Record<ErrorKind, number> — it does not compile until the
     * new kind is given a status on purpose. That is not hypothetical: adding
     * the map immediately failed to build over a missing BACKGROUND_JOB.
     */
    return errorResponse(error, { path: new URL(request.url).pathname })
  }
}

