/*
 * Rolling back a change job.
 *
 * A plain form POST, so undoing a change does not depend on a working bundle.
 *
 * Nothing here trusts the form beyond two values: which job, and the
 * fingerprint the seller was looking at. The set of listings to restore is
 * re-planned server-side against the live catalogue — a count posted from a
 * browser is a count an attacker can choose, and a rollback that believed one
 * would overwrite whatever the number said.
 */

import { NextResponse } from 'next/server'
import { getChangeHistory } from '@/domain/change-history/service'
import { applyRollback, RollbackRefused } from '@/domain/change-history/rollback'
import { getProfile } from '@/domain/profile/service'
import { getSession } from '@/lib/auth'
import { getEtsyService } from '@/lib/etsy'
import { DEMO_NOW } from '@/lib/etsy/demo-dataset'
import { errorResponse } from '@/lib/errors/api'
import { Errors } from '@/lib/errors/types'
import { shopContext } from '@/lib/permissions'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) throw Errors.notAuthenticated()
    const ctx = shopContext(session, session.shopId)

    const form = await request.formData()
    const jobId = String(form.get('job') ?? '')
    const fingerprint = String(form.get('fingerprint') ?? '')
    const acknowledged = form.get('acknowledge') === 'yes'

    const view = await getChangeHistory(ctx, { job: jobId })
    if (!view.selected) throw Errors.notFound('change job')

    const { listings } = await getEtsyService().getListings(ctx.shopId, { limit: 500 })

    try {
      applyRollback(ctx, {
        job: view.selected.row.job,
        listings,
        confirmedFingerprint: fingerprint,
        acknowledged,
        actor: (await getProfile(session)).displayName,
        now: DEMO_NOW,
      })
    } catch (error) {
      /*
       * A refusal goes back to the job it refused, with a closed-set code —
       * never the message reflected through the query string.
       */
      if (error instanceof RollbackRefused) {
        const url = new URL('/listings/change-history', request.url)
        url.searchParams.set('job', jobId)
        url.searchParams.set('refused', error.reason)
        return NextResponse.redirect(url, 303)
      }
      throw error
    }

    const url = new URL('/listings/change-history', request.url)
    url.searchParams.set('rolledBack', jobId)
    return NextResponse.redirect(url, 303)
  } catch (error) {
    return errorResponse(error, { path: new URL(request.url).pathname })
  }
}
