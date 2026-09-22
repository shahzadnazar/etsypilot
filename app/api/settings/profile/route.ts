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

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) throw Errors.notAuthenticated()
    // Called for its cross-shop assertion, not its result.
    shopContext(session, session.shopId)

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
    return errorResponse(error, { path: new URL(request.url).pathname })
  }
}
