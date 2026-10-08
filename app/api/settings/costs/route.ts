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
import { loadCosts } from '@/domain/costs/load'
import { COST_FIELDS } from '@/domain/costs/types'
import { writeCostRules } from '@/lib/repositories/costs'
import { shopHeader } from '@/domain/sync/source'
import { auditActor } from '@/domain/profile/service'
import { getSession } from '@/lib/auth'
import { isDemoMode } from '@/lib/etsy'
import { errorResponse } from '@/lib/errors/api'
import { Errors } from '@/lib/errors/types'
import { shopContext } from '@/lib/permissions'
import { assertNotPublicVisitor } from '@/domain/public-demo'

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
      /*
       * ── A WRITE THAT SURVIVES A RESTART ────────────────────────────────
       *
       * This called `writeCostSettings`, a module-level Map on a global
       * symbol. Measured in a browser: saving 41.5 as the default cost rule,
       * restarting the server and reloading the page read back 38.0 — the
       * demo fixture's COGS ratio — with the page having said "Saved changes
       * are recorded in the audit log" either way. A second server instance on
       * the same database read 38.0 while the first still held 41.5.
       *
       * ── THE GATE IS THE MODE, NOT THE SHOP ROW ─────────────────────────
       *
       * assertCanWrite was the first thing written here, and it was wrong. It
       * tests `ctx.readOnly`, which is `shops.is_demo` — "has this shop ever
       * connected to Etsy" — and on a live deployment EVERY new signup carries
       * it until they connect. So the sellers most in need of entering their
       * costs, the ones who have just signed up, were the ones refused. Caught
       * in a browser before any of this shipped: the shops in the database
       * were `is_demo = t` and the save came back a refusal.
       *
       * The right question is the other one this codebase has already settled:
       * ETSY_MODE is "is the fictional catalogue being served". In demo mode
       * domain/costs/load.ts returns DEMO_COST_INPUTS whatever is in the
       * table, so a write there cannot be read back — which is the silent loss
       * this whole change exists to remove, in a new costume. So demo mode is
       * refused, and told why, while a live shop that has not connected yet
       * saves its costs like any other.
       *
       * domain/costs/service.ts already held this line in prose: "Demo mode
       * blocks WRITES TO ETSY. A cost rule is not one." A cost rule reaches
       * nothing outside EtsyPilot, so connection status is not what decides
       * whether a seller may record one.
       */
      assertNotPublicVisitor(ctx)
      if (isDemoMode()) {
        const url = new URL('/settings/costs', request.url)
        url.searchParams.set('blocked', 'demo')
        return NextResponse.redirect(url, 303)
      }

      const before = (await loadCosts(ctx)).costs
      const after = parseCostSettings(raw)
      /*
       * `session.userId` and not the shop: cost_rules.actorId records WHO set
       * a cost, which is the reason the table is append-only. A shop id there
       * would make the trail say only that somebody at this shop did it.
       */
      await writeCostRules(
        ctx.shopId,
        session.userId,
        COST_FIELDS.map((field) => ({ field: field.key, value: after[field.key] })),
      )
      /*
       * The log records this because it happened, not because artboard 109 has
       * a row that says it does. If nothing actually changed, nothing is
       * recorded — a log padded with no-op entries is a log nobody reads.
       */
      // The name the seller set on Profile, which is what that page claims it
      // is for. Reading the session directly would make that claim false.
      /*
       * Our own shop row, not the adapter: `getShop` is ETSY_NOT_CONFIGURED in
       * a live deployment with no API key, which would have made saving costs
       * fail outright on exactly the deployments this change is for.
       */
      const shop = await shopHeader(ctx)
      const record = costChangeRecord({
        before,
        after,
        actor: await auditActor(session),
        currency: shop?.currency ?? 'USD',
      })
      if (record) await appendAuditRecord(ctx.shopId, session.userId, record)
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
    return errorResponse(error, { path: new URL(request.url).pathname, request })
  }
}
