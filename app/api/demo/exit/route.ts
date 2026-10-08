import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { PUBLIC_DEMO_COOKIE } from '@/lib/auth'

/*
 * Leave the public demo.
 *
 * Deletes the flag and goes back to the landing page. There is no state to
 * clear beyond the cookie — a public visitor never wrote anything, which is
 * the point of the whole arrangement.
 */
export async function GET(request: Request): Promise<Response> {
  const jar = await cookies()
  jar.delete(PUBLIC_DEMO_COOKIE)
  return NextResponse.redirect(new URL('/', request.url), 303)
}
