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

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { AppError, Errors } from '@/lib/errors/types'
import { shopContext } from '@/lib/permissions'
import { auditExport, toCsv, transactionsExport } from '@/domain/export/csv'
import { getAuditView } from '@/domain/audit/service'
import { getProfitView } from '@/domain/profit/service'

const DATASETS = ['transactions', 'audit'] as const
type Dataset = (typeof DATASETS)[number]

function isDataset(value: string): value is Dataset {
  return (DATASETS as readonly string[]).includes(value)
}

export async function GET(_request: Request, { params }: { params: Promise<{ dataset: string }> }) {
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
    if (error instanceof AppError) {
      return NextResponse.json(
        { error: { message: error.message, recovery: error.recovery, code: error.code } },
        { status: statusFor(error) },
      )
    }
    const fallback = Errors.unknown()
    return NextResponse.json(
      { error: { message: fallback.message, recovery: fallback.recovery, code: fallback.code } },
      { status: 500 },
    )
  }
}

function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // A shop's own financial data. Never cached by a shared proxy.
      'Cache-Control': 'private, no-store',
    },
  })
}

function statusFor(error: AppError): number {
  switch (error.kind) {
    case 'AUTHENTICATION':
      return 401
    case 'AUTHORIZATION':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'VALIDATION':
      return 400
    case 'RATE_LIMIT':
      return 429
    default:
      return 500
  }
}
