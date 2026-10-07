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

import { loadCosts } from '@/domain/costs/load'
import { loadListings } from '@/domain/listings/load'
import { getShopPulse } from '@/domain/shop-pulse/service'
import { loadOrders, ordersWereRead } from '@/domain/orders/load'
import { reconcile } from '@/domain/profit/reconciliation'
import { demoUnmatchedReceiptIds } from '@/domain/costs/demo'
import { costRuleHistory } from '@/lib/repositories/costs'
import { readAggregateSyncedAt } from '@/lib/repositories/sync-state'
import { withAccountStore } from '@/lib/repositories/accounts'
import { shopHeader, type ShopDataSource } from '@/domain/sync/source'
import { PERIOD_END, PERIOD_START } from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'
import type { ShopPulseView } from '@/domain/shop-pulse/types'
import { belowCostAction, missingCostsAction, type ShopFacts } from './generators'
import { isDemoMode } from '@/lib/etsy'
import type { StoredOrder } from '@/domain/orders/types'
import { demoActions, demoActorNow } from './demo'
import type { Action, ActionFilter } from './types'
import { compareActions, matchesFilter } from './types'

export interface ActionCenterView {
  actions: Action[]
  counts: Record<ActionFilter, number>
  /**
   * Where the orders behind these actions came from.
   *
   * On the view, not inferred by the screen from `actions.length === 0`. An
   * empty queue has two completely different meanings and the count cannot
   * tell them apart.
   */
  source: ShopDataSource
}

/**
 * The queue.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   "NOTHING NEEDS YOUR ATTENTION" IS A CLAIM, AND THIS IS THE SCREEN THAT
 *   MOST MUST NOT MAKE IT FALSELY.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every generator below derives an action from observed shop state. Given an
 * empty order list they observe nothing wrong and produce nothing — so a shop
 * whose orders have never been read got a clean, confident, empty queue. That
 * is the worst possible failure for a screen whose entire purpose is to say
 * what the seller should look at: silence that reads as reassurance.
 *
 * So when the orders were not read, the generators that depend on them do not
 * run at all, and the view says NOT_SYNCED. The screen renders that as its own
 * state rather than as an empty list. The generators that do not look at
 * orders are a separate question and are handled in the branch below.
 */
export async function getActions(ctx: ShopContext): Promise<ActionCenterView> {
  const { orders, source } = await loadOrders(ctx, { since: PERIOD_START, until: PERIOD_END })

  if (!ordersWereRead(source)) {
    /*
     * No actions, and the source says why. Not even the order-independent
     * generators run: every one of them is currently built from the demo
     * dataset's own constants (DEMO_COUNTS, a hardcoded renewal count), so on
     * a real unsynced shop they would be inventing findings about a catalogue
     * nobody has read — which is a worse lie than an empty queue, because an
     * action is an instruction.
     */
    return { actions: [], counts: { OPEN: 0, DONE: 0, DISMISSED: 0 }, source }
  }

  /*
   * ── EVERY CARD IS BUILT FROM WHAT THIS SHOP ACTUALLY HAS ────────────────
   *
   * The catalogue, the confirmed per-listing costs, the default rule and the
   * measured coverage, gathered once and handed to every generator. One set of
   * facts, so two cards cannot describe two different shops — which is exactly
   * what happened when the coverage figure was measured from real orders and
   * the listing counts beside it were DEMO_COUNTS.
   *
   * Null in demo mode, where the authored queue below is served instead and
   * NOT ONE DATABASE ROW IS READ — asserted with a getDb spy in
   * tests/integration/action-center.int.ts, the same guard the costs slice
   * uses.
   */
  const facts = await shopFacts(ctx, orders)

  // Shop Pulse is a generator like any other: its findings enter the same
  // queue rather than living in a parallel list the seller has to check.
  const pulse = await getShopPulse(ctx)

  /*
   * ══════════════════════════════════════════════════════════════════════════
   *   THE FOUR AUTHORED ACTIONS WERE DEMO FURNITURE SHOWN TO REAL SHOPS, AND
   *   TWO OF THEM ARE NOW REAL GENERATORS.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `belowCostAction` and `missingCostsAction` run on every shop and compute
   * every figure they print. The other two do not, and the reason is the
   * data, not the effort:
   *
   *   ACT-0003, the completed bulk job, needs a completed operation. `events`
   *   is append-only and empty — nothing writes it yet — and the change-history
   *   store is a module-level Map seeded from demoChangeJobs(). There is no
   *   record of a real seller's bulk edits to report, so no card claims one.
   *
   *   ACT-0004, the seasonal window, claims "a 2.4× order lift in this window
   *   last year". That needs a year of history; EtsyPilot holds one period and
   *   one baseline window. An ESTIMATED card is still a claim, and this one
   *   cannot be made from what the product has.
   *
   * Both stay exactly as they are in demo mode, where they describe a shop
   * that really does have those things.
   */
  const generated =
    facts === null
      ? []
      : [belowCostAction(facts), missingCostsAction(facts)].filter((a): a is Action => a !== null)

  const actions = [...pulseActions(ctx, pulse), ...generated, ...demoActions(ctx)].sort(
    compareActions,
  )

  return {
    actions,
    counts: {
      OPEN: actions.filter((a) => matchesFilter(a, 'OPEN')).length,
      DONE: actions.filter((a) => matchesFilter(a, 'DONE')).length,
      DISMISSED: actions.filter((a) => matchesFilter(a, 'DISMISSED')).length,
    },
    source,
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
  /*
   * ══════════════════════════════════════════════════════════════════════════
   *   A FINDING NOBODY COULD MEASURE IS NOT AN ACTION.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `diagnose` returns UNKNOWN for two different things: "something moved and
   * no recorded event accounts for it", and "there was too little data to
   * compare at all". The Action Center rendered both as the same CRITICAL card
   * — "Orders fell below your baseline with no recorded change" — and for the
   * second kind BOTH halves of that sentence are false: nothing was shown to
   * have fallen, and the finding is attached to a change that WAS recorded.
   *
   * Measured in a browser, on a live shop with two listings and two orders:
   * four of these, every one carrying its own refutation in its evidence line
   * — "too few orders on 3 listings to measure a rate (0 before, 0 after)".
   *
   * `ordersAfterPercent` already separates them. Shop Pulse sets it to null
   * when the sample cannot support a percentage ("a percentage the sample
   * cannot support is not published at all") and to the measured change
   * otherwise. So a null here means no comparison was made, and a screen whose
   * job is to rank by measured impact has nothing to rank.
   *
   * The finding still appears on Shop Pulse, where "we could not measure this"
   * is a useful thing to read. It is not work.
   */
  const measured = pulse.changes.filter((c) => c.ordersAfterPercent !== null)
  const unknown = measured.filter((c) => c.diagnosis === 'UNKNOWN')
  const correlated = measured.filter((c) => c.diagnosis === 'CORRELATED').slice(0, 2)

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

/* ------------------------------------------------------------------ facts */

/**
 * Everything the generators need, measured once, or null in demo mode.
 *
 * ── DEMO MODE READS NO DATABASE ROWS, AND THAT IS LOAD-BEARING ────────────
 *
 * `loadListings` and `loadCosts` already branch on the mode and serve the
 * fixture without touching a table. The three reads below do not — they go
 * straight to `sync_state`, `cost_rules` and `users` — so the whole gather is
 * behind the branch rather than the individual calls. Without it the first
 * demo render threw DATABASE_NOT_CONFIGURED, which is how this was caught.
 */
async function shopFacts(
  ctx: ShopContext,
  orders: readonly StoredOrder[],
): Promise<ShopFacts | null> {
  if (isDemoMode()) return null

  const [shop, catalogue, sellerCosts, listingsSyncedAt, ordersSyncedAt, history] = await Promise.all([
    shopHeader(ctx),
    loadListings(ctx),
    loadCosts(ctx),
    readAggregateSyncedAt(ctx.shopId, 'LISTINGS'),
    readAggregateSyncedAt(ctx.shopId, 'ORDERS'),
    costRuleHistory(ctx.shopId, 1),
  ])

  const reconciliation = reconcile({
    orders,
    listings: catalogue.listings,
    costs: catalogue.costs,
    unmatchedOrderIds: demoUnmatchedReceiptIds(orders),
  })

  const lastEdit = history[0]

  return {
    shopId: ctx.shopId,
    listings: catalogue.listings,
    costs: catalogue.costs,
    orders,
    defaultRulePercent: sellerCosts.costs.defaultRulePercent,
    coveragePercent: reconciliation.coveragePercent,
    currency: shop?.currency ?? 'USD',
    /*
     * The listings sync, falling back to the orders one. Both are real
     * observations. `new Date()` is not: it would restamp every card as new on
     * every page load, on the one screen that ranks by what needs attention.
     */
    observedAt: listingsSyncedAt ?? ordersSyncedAt ?? PERIOD_END,
    lastCostEdit: lastEdit ? { at: lastEdit.at, by: await actorName(lastEdit.actorId) } : null,
  }
}

/* ------------------------------------------------------------------ actor */

/**
 * The display name this shop recorded against a change, or null.
 *
 * ── NEVER A NAME THAT IS NOT IN THE DATA ──────────────────────────────────
 *
 * Two cards carried `lastWorkedBy: 'Salman R.'` and `completedBy: 'Salman R.'`
 * on every shop. He is a person in the demo dataset. A live seller was shown
 * a stranger's name against work on their own shop — and if they share the
 * shop with anybody, a name on a card is the first thing they would check.
 *
 * Null when the row has no actor, or the actor has no name on file. The
 * caller omits the field entirely rather than printing "Unknown".
 */
async function actorName(actorId: string | null): Promise<string | null> {
  if (!actorId) return null
  const user = await withAccountStore((store) => store.findUserById(actorId))
  return user?.displayName ?? user?.name ?? null
}

export const { DEMO_ACTION_ACTOR, DEMO_ACTION_NOW } = demoActorNow()
