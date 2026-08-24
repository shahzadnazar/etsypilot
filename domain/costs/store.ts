/*
 * Where cost settings live until there is a database.
 *
 * Same shape as the billing mock store, and for the same reason: Next builds
 * pages and route handlers into separate server bundles, so a module-level Map
 * is a different Map in each. A form POST that writes one and a page that reads
 * the other looks exactly like a broken save while every unit test passes.
 *
 * Explicitly a demo store. The Drizzle `shop_cost_settings` row replaces it, and
 * nothing outside this file knows which one it is talking to.
 */

import { DEMO_COST_INPUTS } from '@/lib/etsy/demo-dataset'
import type { CostSettings } from './types'

const STORE_KEY = Symbol.for('etsypilot.costs.store')

function store(): Map<string, CostSettings> {
  const g = globalThis as unknown as Record<symbol, Map<string, CostSettings> | undefined>
  const existing = g[STORE_KEY]
  if (existing) return existing
  const fresh = new Map<string, CostSettings>()
  g[STORE_KEY] = fresh
  return fresh
}

/**
 * The demo shop's starting point, which is exactly what Profit Reality already
 * assumes. If these two ever disagree the seller sees one set of costs on the
 * settings page and a different set in the waterfall, so they come from one
 * place.
 */
export function defaultCostSettings(): CostSettings {
  return {
    defaultRulePercent: DEMO_COST_INPUTS.cogsPercent,
    shippingPerOrder: DEMO_COST_INPUTS.shippingPerOrder,
    labourTotal: DEMO_COST_INPUTS.labourTotal,
    otherCosts: DEMO_COST_INPUTS.otherCosts,
    /*
     * Null, not a figure. The demo shop's owner has never told us what they
     * spent on ads, and Etsy will not tell us either.
     */
    adSpend: null,
  }
}

export function readCostSettings(shopId: string): CostSettings {
  const existing = store().get(shopId)
  if (existing) return { ...existing }
  return defaultCostSettings()
}

export function writeCostSettings(shopId: string, settings: CostSettings): void {
  store().set(shopId, { ...settings })
}

/** Test helper. Not exported through the service. */
export function resetCostSettings(): void {
  store().clear()
}
