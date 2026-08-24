/*
 * Turning things that happen into audit records.
 *
 * One function per event, so the log's copy is derived from the change rather
 * than typed next to the code that made it. A cost rule change is EtsyPilot-only
 * by construction here — there is no branch that could mark it as having
 * reached Etsy, because nothing in this file can send anything.
 */

import { COST_FIELDS, type CostSettings } from '@/domain/costs/types'
import { formatCurrency } from '@/lib/utils/format'
import type { AuditRecord } from './types'

/**
 * Null when nothing changed.
 *
 * A save that changes no value is not an event. Recording it anyway is how a
 * log fills with rows that say nothing, and a log nobody scrolls is a log that
 * cannot answer anything either.
 */
export function costChangeRecord(args: {
  before: CostSettings
  after: CostSettings
  actor: string
  currency?: string
  at?: string
}): AuditRecord | null {
  const currency = args.currency ?? 'USD'
  const changes = COST_FIELDS.filter((f) => args.before[f.key] !== args.after[f.key]).map((f) => ({
    field: f,
    before: describe(args.before[f.key], f.kind, currency),
    after: describe(args.after[f.key], f.kind, currency),
  }))
  if (changes.length === 0) return null

  const at = args.at ?? new Date().toISOString()
  const first = changes[0]!
  /*
   * One change in the row, the rest in the drawer.
   *
   * Five changes joined into one line pushed the Action column to four wrapped
   * rows and made the table unscannable — and the sequence below carries every
   * one of them, so nothing is lost by summarising here.
   */
  const summary =
    changes.length === 1
      ? `${first.field.label} ${first.before} → ${first.after}`
      : `${first.field.label} ${first.before} → ${first.after} · +${changes.length - 1} more`

  return {
    id: `OP-${at.slice(0, 10).replace(/-/g, '')}-COST`,
    at,
    actor: {
      name: args.actor,
      role: 'Owner',
      session: '2a··f1',
      device: 'This browser',
    },
    action: changes.length === 1 ? 'Cost rule changed' : 'Cost settings changed',
    detail: summary,
    target: 'Shop-wide',
    source: 'MANUAL',
    /*
     * Not a refusal, and not a send. Cost settings are EtsyPilot's own state —
     * the seller's assumptions about their own costs — and no request to Etsy
     * exists for this to have failed.
     */
    reached: { kind: 'NOT_APPLICABLE', reason: 'ETSYPILOT_ONLY' },
    sequence: changes.map((c) => ({
      at,
      label: c.field.label,
      detail: `${c.before} → ${c.after}`,
    })),
    wouldHaveChanged: [],
    wouldHaveChangedMore: 0,
    origin: 'Changed on Costs & fees',
    jobHref: '/settings/costs',
  }
}

/** "38.0%", "$4.20", or "not set" — never a bare null rendered as blank. */
function describe(value: number | null, kind: 'PERCENT' | 'MONEY', currency: string): string {
  if (value === null) return 'not set'
  return kind === 'PERCENT' ? `${(value * 100).toFixed(1)}%` : formatCurrency(value, currency)
}
