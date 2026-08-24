/*
 * Audit log view.
 *
 * Filtering happens here rather than in the component because the "Refused
 * only" filter is a claim about the Reached Etsy column, and the two must be
 * computed from one field (see isRefusal in ./types).
 *
 * The record count is measured from the store. The artboard shows 248; this
 * shop has as many records as it has, and printing a rounder number beside a
 * table of eight would be authoring a figure — the defect D34 exists about.
 */

import { getBillingProvider } from '@/lib/billing'
import { PLANS, planOf, type Plan } from '@/domain/billing/plans'
import type { ShopContext } from '@/lib/permissions'
import { readAuditRecords } from './store'
import { AUDIT_SOURCES, isRefusal, type AuditFilter, type AuditRecord, type AuditSource } from './types'

export interface AuditLogView {
  records: AuditRecord[]
  /** Every record for this shop, before filtering. */
  total: number
  refusedCount: number
  filter: AuditFilter
  source: AuditSource | 'ALL'
  query: string
  plan: Plan
  /** Null on a plan that connects no shop, so keeps no shop records. */
  retentionDays: number | null
  /*
   * Every plan that keeps records, and for how long. Read from PLANS, so the
   * retention block cannot state a number the billing page contradicts — and a
   * seller weighing a downgrade can see what they would lose without going and
   * looking for it.
   */
  retentionByPlan: { plan: string; days: number }[]
  /** The record the drawer is open on, when one was asked for. */
  selected: AuditRecord | null
}

export interface AuditLogQuery {
  filter?: string
  source?: string
  q?: string
  /** `${id}@${at}` — an id alone is not unique; BE-2291 has two records. */
  record?: string
}

export async function getAuditLogView(
  ctx: ShopContext,
  query: AuditLogQuery = {},
): Promise<AuditLogView> {
  const all = readAuditRecords(ctx.shopId)
  const subscription = await getBillingProvider().getSubscription(ctx.shopId)
  const plan = planOf(subscription.plan)

  const filter: AuditFilter = query.filter === 'REFUSED' ? 'REFUSED' : 'ALL'
  // Anything not in the closed set is ALL, so a hand-typed query string cannot
  // produce a filter that silently matches nothing.
  const source: AuditSource | 'ALL' = AUDIT_SOURCES.includes(query.source as AuditSource)
    ? (query.source as AuditSource)
    : 'ALL'
  const q = (query.q ?? '').trim()
  const needle = q.toLowerCase()

  const records = all
    .filter((r) => (filter === 'REFUSED' ? isRefusal(r) : true))
    .filter((r) => (source === 'ALL' ? true : r.source === source))
    .filter((r) =>
      needle === ''
        ? true
        : [r.id, r.actor.name, r.action, r.detail, r.target]
            .join(' ')
            .toLowerCase()
            .includes(needle),
    )

  return {
    records,
    total: all.length,
    refusedCount: all.filter(isRefusal).length,
    filter,
    source,
    query: q,
    plan,
    retentionDays: plan.limits.auditRetentionDays,
    retentionByPlan: PLANS.filter((p) => p.limits.auditRetentionDays !== null).map((p) => ({
      plan: p.name,
      days: p.limits.auditRetentionDays!,
    })),
    selected: query.record ? (all.find((r) => recordKey(r) === query.record) ?? null) : null,
  }
}

/**
 * A record's address in the URL.
 *
 * The operation id alone is not one: BE-2291 appears twice in the demo shop,
 * once for the confirmation and once for the apply, and opening the drawer on
 * "BE-2291" would show whichever came first.
 *
 * Nor is id plus timestamp. Two rollback refusals on the same job land in the
 * same millisecond, so the store's own sequence completes the address.
 */
export function recordKey(record: AuditRecord): string {
  return `${record.id}@${record.at}#${record.seq ?? 0}`
}
