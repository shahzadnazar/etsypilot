/*
 * Saving the profile.
 *
 * A plain form POST like the billing and cost routes. The user comes from the
 * session, never from the body — a userId a caller could supply is somebody
 * else's account.
 */

import { NextResponse } from 'next/server'
import { saveProfile } from '@/domain/profile/service'
import { getSession } from '@/lib/auth'
import { errorResponse } from '@/lib/errors/api'
import { AppError, Errors } from '@/lib/errors/types'
import { shopContext } from '@/lib/permissions'
import { assertNotPublicVisitor } from '@/domain/public-demo'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) throw Errors.notAuthenticated()
    /*
     * ── A VISITOR WITH NO ACCOUNT HAS NO PROFILE TO SAVE ──────────────────
     *
     * `saveProfile` takes a user id rather than a context, so the refusal goes
     * where the context is. Without it, a public visitor's save ran against
     * `public-demo-visitor`, matched no `users` row, updated nothing and
     * redirected to "Saved" — a silent no-op, which this product refuses
     * everywhere else and which is exactly what the cost settings form was
     * doing before it got a table.
     */
    const ctx = shopContext(session, session.shopId)
    assertNotPublicVisitor(ctx)

    const form = await request.formData()
    const read = (key: string) => {
      const value = form.get(key)
      return typeof value === 'string' ? value : undefined
    }

    try {
      await saveProfile(session.userId, {
        fullName: read('fullName'),
        displayName: read('displayName'),
      })
    } catch (error) {
      /*
       * Back to the form, not to a JSON error page. `problem` is a closed set
       * of two values, so nothing the user typed is reflected into the URL.
       */
      if (error instanceof AppError && error.kind === 'VALIDATION') {
        const url = new URL('/settings/profile', request.url)
        url.searchParams.set('problem', 'NAME')
        return NextResponse.redirect(url, 303)
      }
      throw error
    }

    return NextResponse.redirect(new URL('/settings/profile?saved=1', request.url), 303)
  } catch (error) {
    return errorResponse(error, { path: new URL(request.url).pathname, request })
  }
}
