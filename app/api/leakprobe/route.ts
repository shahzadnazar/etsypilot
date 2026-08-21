/*
 * A route that throws, on purpose, so the error path is exercised by the checks
 * rather than reasoned about.
 *
 * It is NOT a debug leftover. The browser checks fetch it and assert three
 * things that are otherwise untestable: that an unhandled throw returns JSON
 * rather than an empty body, that the body carries a message, a recovery and a
 * reference, and that no part of the thrown string — which contains a
 * credential shape and a source path — appears anywhere in the response.
 *
 * It exists only outside production, so it cannot be reached on a deployment.
 */

import { errorResponse } from '@/lib/errors/api'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_ERROR_PROBE !== '1') {
    return new Response('Not found', { status: 404 })
  }
  return errorResponse(
    new Error('LEAKCANARY sk_live_51ABCDEFsecret at /home/user/etsypilot/lib/etsy/tokens.ts:42'),
    { path: '/api/leakprobe' },
  )
}
