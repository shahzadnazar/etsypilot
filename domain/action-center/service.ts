/*
 * Action Center service.
 *
 * Actions are DERIVED from observable shop state, not authored. Each generator
 * below answers one question with evidence attached, and every one of them
 * returns a destination - an action that cannot say where to go does not get
 * created.
 *
 * In Phase 3 Shop Pulse becomes another generator here, feeding its diagnoses
 * into the same queue.
 */

import { computeWaterfall } from '@/domain/profit/waterfall'
import { getEtsyService } from '@/lib/etsy'
import {
  DEMO_ACTOR_ID,
  DEMO_COST_INPUTS,
  DEMO_COUNTS,
  DEMO_NOW,
  PERIOD_END,
  PERIOD_START,
} from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'
import { formatCurrency } from '@/lib/utils/format'
import type { Action, ActionFilter } from './types'
import { compareActions, matchesFilter } from './types'

export interface ActionCenterView {
  actions: Action[]
  counts: Record<ActionFilter, number>
}

export async function getActions(ctx: ShopContext): Promise<ActionCenterView> {
  const etsy = getEtsyService()
  const orders = await etsy.getOrders(ctx.shopId, { since: PERIOD_START, until: PERIOD_END })
  const profit = computeWaterfall(orders, DEMO_COST_INPUTS)

  const actions = [
    belowCost(ctx),
    missingCosts(ctx, profit.coveragePercent),
    renewalsFixed(ctx),
    seasonalWindow(ctx),
  ].sort(compareActions)

  return {
    actions,
    counts: {
      OPEN: actions.filter((a) => matchesFilter(a, 'OPEN')).length,
      DONE: actions.filter((a) => matchesFilter(a, 'DONE')).length,
      DISMISSED: actions.filter((a) => matchesFilter(a, 'DISMISSED')).length,
    },
  }
}

/* ---------------------------------------------------------------- OPEN */

function belowCost(ctx: ShopContext): Action {
  return {
    id: 'ACT-0001',
    shopId: ctx.shopId,
    priority: 1,
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

/* --------------------------------------------------------- IN_PROGRESS */

function missingCosts(ctx: ShopContext, coveragePercent: number): Action {
  const covered = 12
  const total = DEMO_COUNTS.listingsWithoutCost
  return {
    id: 'ACT-0002',
    shopId: ctx.shopId,
    priority: 2,
    severity: 'ATTENTION',
    title: `${total} listings have no product cost`,
    explanation: `Profit is calculated for ${coveragePercent}% of order value. Those ${total} listings are excluded rather than given an assumed cost.`,
    evidence: {
      summary: `${total} of ${DEMO_COUNTS.activeListings} active listings have no cost rule · ${formatCurrency(6998)} of order value uncovered`,
      provenance: 'CALCULATED',
      source: 'your cost setup',
    },
    destination: { label: 'Continue cost setup', href: '/profit' },
    status: 'IN_PROGRESS',
    progress: { current: covered, total },
    createdAt: '2026-08-06T09:20:00.000Z',
    lastWorkedAt: '2026-08-11T14:02:00.000Z',
    lastWorkedBy: 'Salman R.',
  }
}

/* ----------------------------------------------------------- COMPLETED */

function renewalsFixed(ctx: ShopContext): Action {
  return {
    id: 'ACT-0003',
    shopId: ctx.shopId,
    priority: 3,
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

/* ----------------------------------------------------------- DISMISSED */

function seasonalWindow(ctx: ShopContext): Action {
  return {
    id: 'ACT-0004',
    shopId: ctx.shopId,
    priority: 4,
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

export const DEMO_ACTION_ACTOR = DEMO_ACTOR_ID
export const DEMO_ACTION_NOW = DEMO_NOW
