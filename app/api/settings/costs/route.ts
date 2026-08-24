/*
 * Saving cost settings.
 *
 * A plain form POST, like the billing routes, so saving your costs does not
 * depend on a working JavaScript bundle.
 *
 * Nothing here touches Etsy. That is the point of the surface: a cost rule
 * changes what EtsyPilot calculates and reaches nothing outside it, which is
 * how the audit log records it.
 *
 * The shop comes from the session, never from the body. A shopId a caller could
 * supply is a cross-shop write waiting to happen.
 */

import { NextResponse } from 'next/server'
import { appendAuditRecord } from '@/domain/audit-log/store'
import { costChangeRecord } from '@/domain/audit-log/events'
import { parseCostSettings, CostValidationError } from '@/domain/costs/validate'
import { readCostSettings, writeCostSettings } from '@/domain/costs/store'
import { getProfile } from '@/domain/profile/service'
import { getSession } from '@/lib/auth'
import { getEtsyService } from '@/lib/etsy'
import { errorResponse } from '@/lib/errors/api'
import { Errors } from '@/lib/errors/types'
import { shopContext } from '@/lib/permissions'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session) throw Errors.notAuthenticated()
    const ctx = shopContext(session, session.shopId)

    const form = await request.formData()
    const raw: Record<string, string> = {}
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') raw[key] = value
    }

    try {
      const before = readCostSettings(ctx.shopId)
      const after = parseCostSettings(raw)
      writeCostSettings(ctx.shopId, after)
      /*
       * The log records this because it happened, not because artboard 109 has
       * a row that says it does. If nothing actually changed, nothing is
       * recorded — a log padded with no-op entries is a log nobody reads.
       */
      // The name the seller set on Profile, which is what that page claims it
      // is for. Reading the session directly would make that claim false.
      const shop = await getEtsyService().getShop(ctx.shopId)
      const record = costChangeRecord({
        before,
        after,
        actor: getProfile(session).displayName,
        currency: shop.currency,
      })
      if (record) appendAuditRecord(ctx.shopId, record)
    } catch (error) {
      /*
       * A rejected form goes back to the form, not to a JSON error page. The
       * seller keeps the page they were on and is told which field to fix —
       * two enum values in the query string, never a reflected message.
       */
      if (error instanceof CostValidationError) {
        const url = new URL('/settings/costs', request.url)
        url.searchParams.set('field', error.report.field.key)
        url.searchParams.set('problem', error.report.problem)
        return NextResponse.redirect(url, 303)
      }
      throw error
    }

    return NextResponse.redirect(new URL('/settings/costs?saved=1', request.url), 303)
  } catch (error) {
    return errorResponse(error, { path: new URL(request.url).pathname })
  }
}
