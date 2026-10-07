import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ONE PLACE THE DEMO SHOP'S AUTHORED ACTIONS ARE ALLOWED TO EXIST.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Four object literals that used to live in ./service.ts and ran on every
 * shop. Two of them are real generators now (./generators.ts). These two are
 * not, and cannot be from what the product holds:
 *
 *   ACT-0003  a completed bulk job, BE-2288, with a rollback point. Needs a
 *             completed operation this shop ran. `events` is empty — nothing
 *             writes it — and domain/change-history/store.ts is a module-level
 *             Map seeded from demoChangeJobs(). There is no record of a live
 *             seller's bulk edits to report.
 *   ACT-0004  "Your linen category showed a 2.4× order lift in this window
 *             last year." Needs a year of history. EtsyPilot holds one
 *             reporting period and one baseline window.
 *
 * ACT-0001 and ACT-0002 are kept here too, unchanged, so that the demo shop's
 * Action Center is byte-for-byte what it was — the numbers in them were
 * reverse-derived to match the artboards, and the real generators measuring
 * the same demo catalogue would produce near-miss figures that make the
 * designed narrative read as drift.
 *
 * Everything in this file describes Willow & Fern. None of it may leave
 * demo mode, and tests/unit/action-center.test.ts asserts the containment the
 * same way the costs slice does.
 */

import { DEMO_ACTOR_ID, DEMO_COUNTS, DEMO_NOW } from '@/lib/etsy/demo-dataset'
import { isDemoMode } from '@/lib/etsy'
import { formatCurrency } from '@/lib/utils/format'
import type { ShopContext } from '@/lib/permissions'
import type { Action } from './types'

/**
 * The demo shop's authored queue, or nothing at all.
 *
 * Empty array rather than null: the caller spreads it into the list, and a
 * shop not being served the fixture has no authored actions — which is an
 * answer, not an absence the caller has to branch on.
 */
export function demoActions(ctx: ShopContext): Action[] {
  if (!isDemoMode()) return []
  return [belowCost(ctx), missingCosts(ctx), renewalsFixed(ctx), seasonalWindow(ctx)]
}

/** The demo actor and clock, re-exported for the screens that stage them. */
export function demoActorNow(): { DEMO_ACTION_ACTOR: string; DEMO_ACTION_NOW: string } {
  return { DEMO_ACTION_ACTOR: DEMO_ACTOR_ID, DEMO_ACTION_NOW: DEMO_NOW }
}

function belowCost(ctx: ShopContext): Action {
  return {
    id: 'ACT-0001',
    shopId: ctx.shopId,
    priority: 10,
    severity: 'CRITICAL',
    title: '4 listings are selling below cost',
    explanation:
      'Their price minus Etsy fees, shipping and your product cost is negative. Every sale of these four loses money.',
    evidence: {
      summary: `38 orders in the last 30 days across 4 listings · combined loss ${formatCurrency(184.2)}`,
      provenance: 'CALCULATED',
      source: 'your receipts and cost setup',
    },
    destination: { label: 'Review pricing', href: '/listings?filter=below-cost' },
    status: 'OPEN',
    createdAt: '2026-08-12T06:04:00.000Z',
  }
}

function missingCosts(ctx: ShopContext): Action {
  const covered = 12
  const total = DEMO_COUNTS.listingsWithoutCost
  return {
    id: 'ACT-0002',
    shopId: ctx.shopId,
    priority: 11,
    severity: 'ATTENTION',
    title: `${total} listings have no product cost`,
    explanation: `83% of order value has a confirmed cost. The other 17% falls back to your default rule, so profit for those ${total} listings rests on an assumption you set rather than a cost you confirmed.`,
    evidence: {
      summary: `${total} of ${DEMO_COUNTS.activeListings} active listings have no cost rule · ${formatCurrency(6998)} of order value uncovered`,
      provenance: 'CALCULATED',
      source: 'your cost setup',
    },
    destination: { label: 'Continue cost setup', href: '/settings/costs' },
    status: 'IN_PROGRESS',
    progress: { current: covered, total },
    createdAt: '2026-08-06T09:20:00.000Z',
    lastWorkedAt: '2026-08-11T14:02:00.000Z',
    lastWorkedBy: 'Salman R.',
  }
}

function renewalsFixed(ctx: ShopContext): Action {
  return {
    id: 'ACT-0003',
    shopId: ctx.shopId,
    priority: 12,
    severity: 'INFO',
    title: 'Renewal dates fixed on 9 listings',
    explanation: 'Bulk job BE-2288 applied the change.',
    evidence: {
      summary: '9 listings updated · rollback point created',
      provenance: 'VERIFIED',
      source: 'your change history',
    },
    destination: { label: 'View the change', href: '/listings/change-history' },
    status: 'COMPLETED',
    createdAt: '2026-07-30T11:15:00.000Z',
    completedAt: '2026-08-02T16:41:00.000Z',
    completedBy: 'Salman R.',
    operationId: 'BE-2288',
    // Measured against the shop's own orders. Never a projection.
    outcome: 'Orders on those listings are up 4% since — measured, not claimed.',
    rollbackAvailable: true,
  }
}

function seasonalWindow(ctx: ShopContext): Action {
  return {
    id: 'ACT-0004',
    shopId: ctx.shopId,
    priority: 13,
    severity: 'INFO',
    title: 'Seasonal window opens for holiday linens',
    explanation: 'Your linen category showed a 2.4× order lift in this window last year.',
    evidence: {
      summary: 'Based on one year of your own order history · confidence moderate',
      provenance: 'ESTIMATED',
      source: 'your order history and public category seasonality',
    },
    destination: { label: 'Open seasonal calendar', href: '/tools/seasonal-calendar' },
    status: 'DISMISSED',
    createdAt: '2026-08-09T07:00:00.000Z',
    dismissedAt: '2026-08-09T09:12:00.000Z',
    dismissedBy: 'Salman R.',
    dismissedReason: 'not this year',
  }
}
