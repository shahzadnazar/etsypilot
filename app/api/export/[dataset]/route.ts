/*
 * CSV export.
 *
 * Server-side and shop-scoped. The dataset name comes from the URL; the shop
 * does NOT — it comes from the session, through shopContext(). A shopId that a
 * caller could pass in a query string is a cross-shop read waiting to be
 * discovered, and there is no legitimate case for one here (D20 seam:
 * single-shop today, and when multi-shop lands the switch is still a server
 * decision).
 *
 * Errors return the AppError's user-facing message and recovery, never a stack
 * trace and never an internal identifier.
 */

import { getSession } from '@/lib/auth'
import { errorResponse } from '@/lib/errors/api'
import { Errors } from '@/lib/errors/types'
import { shopContext } from '@/lib/permissions'
import { auditExport, auditLogExport, toCsv, toJson, transactionsExport } from '@/domain/export/csv'
import { getAuditView } from '@/domain/audit/service'
import { getAuditLogView } from '@/domain/audit-log/service'
import { getProfitView } from '@/domain/profit/service'

const DATASETS = ['transactions', 'audit', 'audit-log'] as const
type Dataset = (typeof DATASETS)[number]

function isDataset(value: string): value is Dataset {
  return (DATASETS as readonly string[]).includes(value)
}

export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  try {
    const session = await getSession()
    if (!session) throw Errors.notAuthenticated()

    const { dataset } = await params
    if (!isDataset(dataset)) throw Errors.notFound('export')

    const ctx = shopContext(session, session.shopId)

    if (dataset === 'transactions') {
      const view = await getProfitView(ctx)
      const spec = transactionsExport({
        periodStart: view.periodStart,
        periodEnd: view.periodEnd,
        currency: view.currency,
        coveragePercent: view.reconciliation.coveragePercent,
      })
      return csvResponse(toCsv(spec, view.reconciliation.rows), spec.filename)
    }

    if (dataset === 'audit-log') {
      const log = await getAuditLogView(ctx)
      const spec = auditLogExport({
        retentionDays: log.retentionDays,
        planName: log.plan.name,
      })
      /*
       * The whole log, not the filtered view. An export named "audit log" that
       * silently dropped the rows the reader had filtered out would be the most
       * dangerous kind of truncation: complete-looking and short.
       */
      if (new URL(request.url).searchParams.get('format') === 'json') {
        return fileResponse(
          toJson(spec, log.records),
          spec.filename.replace(/\.csv$/, '.json'),
          'application/json',
        )
      }
      return csvResponse(toCsv(spec, log.records), spec.filename)
    }

    const view = await getAuditView(ctx)
    const spec = auditExport({
      healthScore: view.healthScore.value ?? 0,
      coveragePercent: view.healthScore.provenance.coverage ?? 0,
    })
    const rows = view.results.flatMap((r) =>
      r.findings.map((f) => ({ ...f, ruleLabel: r.rule.label, severity: r.rule.severity })),
    )
    return csvResponse(toCsv(spec, rows), spec.filename)
  } catch (error) {
    // Shared envelope. The local statusFor this replaces did not even list
    // EXTERNAL_SERVICE, so an Etsy failure during an export reported 500 —
    // "we broke" — for something upstream that is now correctly a 502.
    return errorResponse(error, { path: `/api/export/${(await params).dataset}` })
  }
}

function csvResponse(body: string, filename: string): Response {
  return fileResponse(body, filename, 'text/csv; charset=utf-8')
}

function fileResponse(body: string, filename: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      // A shop's own financial data. Never cached by a shared proxy.
      'Cache-Control': 'private, no-store',
    },
  })
}

