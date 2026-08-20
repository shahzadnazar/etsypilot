/*
 * The market-signals selector.
 *
 * Separate from getEtsyService() on purpose. Two adapters, two switches, so a
 * shop that is connected to Etsy does not silently promote modelled research
 * figures to verified ones, and a shop that is not connected still gets its
 * research tools ("Every tool works before you connect Etsy").
 */

import { MockMarketSignalsService } from './mock'
import type { MarketSignalsService } from './interface'

let instance: MarketSignalsService | null = null

export function getSignalsService(): MarketSignalsService {
  if (!instance) instance = new MockMarketSignalsService()
  return instance
}

export type * from './interface'
