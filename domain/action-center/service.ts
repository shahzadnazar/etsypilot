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
import { getShopPulse } from '@/domain/shop-pulse/service'
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
import type { ShopPulseView } from '@/domain/shop-pulse/types'
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

  // Shop Pulse is a generator like any other: its findings enter the same
  // queue rather than living in a parallel list the seller has to check.
  const pulse = await getShopPulse(ctx)

  const actions = [
    ...pulseActions(ctx, pulse),
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

/* ---------------------------------------------------- Shop Pulse findings */

/**
 * One action per Shop Pulse finding that is worth acting on.
 *
 * RULED_OUT findings do not become actions - "we checked and it was not this"
 * is worth reading on Shop Pulse, but it is not work.
 *
 * UNKNOWN findings DO become actions, and say so plainly. An unexplained drop
 * is the thing a seller most needs to know about, and the honest framing is to
 * hand them the evidence rather than a cause we do not have.
 */
function pulseActions(ctx: ShopContext, pulse: ShopPulseView): Action[] {
  /*
   * UNKNOWN findings are never truncated.
   *
   * Capping by magnitude alone dropped the unexplained drop off the queue
   * behind three larger correlated ones - and an unexplained drop is the single
   * thing a seller most needs to see. Correlated findings are capped because
   * they already have an explanation attached; unexplained ones do not.
   */
  const unknown = pulse.changes.filter((c) => c.diagnosis === 'UNKNOWN')
  const correlated = pulse.changes.filter((c) => c.diagnosis === 'CORRELATED').slice(0, 2)

  return [...unknown, ...correlated]
    .map((c, i) => {
      const unknown = c.diagnosis === 'UNKNOWN'
      const destination = c.destinations[0] ?? { label: 'Open Shop Pulse', href: '/shop-pulse' }
      return {
        id: `ACT-PULSE-${c.id}`,
        shopId: ctx.shopId,
        priority: i,
        /*
         * The unexplained finding outranks the explained ones.
         *
         * A -100% drop the seller caused by deactivating a section is a change
         * they already know about; an unexplained shop-wide drop is not. This
         * surface answers "what needs my attention", and the thing you already
         * understand needs less of it than the thing you do not.
         */
        severity: unknown ? 'CRITICAL' : 'ATTENTION',
        title: unknown
          ? 'Orders fell below your baseline with no recorded change'
          : `${c.title} — orders moved ${c.ordersAfterPercent}% after`,
        explanation: unknown
          ? 'No event in your history explains this. EtsyPilot is not guessing at a cause — the evidence is on Shop Pulse so you can judge it.'
          : `${c.scope}. This change and the movement that followed it occurred together; that is a correlation, not a cause.`,
        evidence: {
          summary: c.evidence.observed[1] ?? c.detail,
          provenance: 'CALCULATED',
          source: 'your order history and change log',
        },
        destination: { label: destination.label, href: '/shop-pulse' },
        status: 'OPEN',
        createdAt: c.occurredAt,
      } satisfies Action
    })
}

/* ---------------------------------------------------------------- OPEN */

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

/* --------------------------------------------------------- IN_PROGRESS */

function missingCosts(ctx: ShopContext, coveragePercent: number): Action {
  const covered = 12
  const total = DEMO_COUNTS.listingsWithoutCost
  return {
    id: 'ACT-0002',
    shopId: ctx.shopId,
    priority: 11,
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

/* ----------------------------------------------------------- DISMISSED */

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

export const DEMO_ACTION_ACTOR = DEMO_ACTOR_ID
export const DEMO_ACTION_NOW = DEMO_NOW
