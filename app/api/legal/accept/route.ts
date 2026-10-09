/*
 * POST /api/legal/accept — record that this seller accepted the Application
 * Terms.
 *
 * Etsy's API Terms §4 asks for terms "executed with each Etsy seller". This is
 * the execution: an explicit action by a signed-in seller, recorded against
 * their shop with the exact version of the documents they were shown.
 *
 * ── WHY A POST ROUTE AND A REAL FORM ──────────────────────────────────────
 *
 * A fetch from a component would make acceptance depend on JavaScript having
 * loaded, and consent that silently fails to record is worse than consent
 * nobody asked for. A form POST works with no JavaScript running, is refused
 * cross-origin by the middleware's CSRF check like every other unsafe method,
 * and leaves the browser on a page that tells the seller what happened.
 *
 * ── WHAT THIS ROUTE DOES NOT DO ───────────────────────────────────────────
 *
 * A public demo visitor is refused in the domain, by assertNotPublicVisitor —
 * an acceptance names a person, and the demo's actor is deliberately not one.
 *
 * It does not accept a version from the request. The version is computed from
 * the documents on disk, server-side: a version a caller could supply is an
 * acceptance of a document nobody published. The only thing read from the body
 * is the checkbox, and the only thing read from the session is who and which
 * shop.
 */

import { NextResponse } from 'next/server'

import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { AppError } from '@/lib/errors/types'
import { log } from '@/lib/observability/logger'
import { recordTermsAcceptance, termsAreOfferable } from '@/domain/legal/acceptance'

export const dynamic = 'force-dynamic'

/** Back to the screen that asked, with an outcome it knows how to render. */
function back(request: Request, accepted: 'yes' | 'unchecked' | 'not_published' | 'failed'): NextResponse {
  const url = new URL('/settings/shops', request.url)
  url.searchParams.set('terms', accepted)
  return NextResponse.redirect(url, 303)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) return NextResponse.redirect(new URL('/login', request.url), 303)

  /*
   * Refused before anything is read or written. A deployment whose documents
   * still carry `[[LEGAL_ENTITY]]` has no agreement for anyone to accept, and
   * a row in `terms_acceptances` claiming otherwise would be a false record in
   * the one table that exists to be evidence.
   */
  if (!termsAreOfferable()) return back(request, 'not_published')

  const form = await request.formData()
  /*
   * The checkbox must be ticked. An unticked box is not a formality to be
   * forgiven server-side — implied consent from "the link was on the page" is
   * exactly what §4 does not accept, and it is what this whole flow replaces.
   */
  if (form.get('accept') !== 'on') return back(request, 'unchecked')

  try {
    await recordTermsAcceptance({
      ctx: shopContext(session, session.shopId),
      userId: session.userId,
    })
    return back(request, 'yes')
  } catch (error) {
    if (error instanceof AppError && error.code === 'TERMS_NOT_PUBLISHED') {
      return back(request, 'not_published')
    }
    // Never a stack trace and never an internal identifier in front of a
    // seller; the detail goes to the log, redacted.
    log.error('recording an Application Terms acceptance failed', error, {
      path: '/api/legal/accept',
    })
    return back(request, 'failed')
  }
}
