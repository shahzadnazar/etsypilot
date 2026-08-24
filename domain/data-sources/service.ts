/*
 * Data sources (artboard 94).
 *
 * "Every input EtsyPilot reads, what class of number it produces, how often it
 * refreshes, and what it cannot tell you."
 *
 * The `status` on each row is READ from the adapter that serves it, never
 * written here. Same rule as the telemetry disclosure on Export & deletion
 * (D59a): a page that describes the system rather than reading it is true on
 * the day it is written and unowned afterwards. If the AI provider is on mock,
 * this table says so, because it asked.
 *
 * The `limitations` are the honest half and they are not optional decoration —
 * this is the page every provenance drawer's "where does this come from?"
 * eventually lands on, so a source without its limits stated would make the
 * whole provenance system a formality.
 */

import { getAiProvider } from '@/lib/ai'
import { isDemoMode } from '@/lib/etsy'
import { getSignalsService } from '@/lib/signals'
import type { ProvenanceType } from '@/lib/provenance/types'

export interface DataSource {
  key: string
  name: string
  /** How it reaches us. Under the name in the design. */
  via: string
  provides: string
  /** The class of number this source can produce. Never more than one. */
  class: ProvenanceType
  refresh: string
  limitations: string
  /** Read from the adapter at request time. Null where there is nothing to read. */
  status: string | null
}

/** What Etsy does not release, and the supported alternative. Artboard 94. */
export const NOT_RELEASED = [
  { what: 'Listing views and visits', instead: 'Import your Etsy Stats CSV' },
  { what: 'Search terms buyers used', instead: 'Not available anywhere' },
  { what: 'Etsy Ads performance', instead: 'Enter spend manually' },
  { what: "Another shop's real sales", instead: 'Estimated ranges only' },
] as const

export function dataSources(): DataSource[] {
  const demo = isDemoMode()
  const ai = getAiProvider().mode
  const signals = getSignalsService().mode

  return [
    {
      key: 'etsy-api',
      name: 'Etsy Open API v3',
      via: 'OAuth 2.0 · your authorisation',
      provides:
        'Your shop, listings, inventory, order receipts, Etsy fees, payment processing and Offsite Ads charges.',
      class: 'VERIFIED',
      refresh: 'Every 15 min',
      limitations:
        'No listing views, impressions, search terms or Etsy Ads performance. Rate limited by Etsy.',
      status: demo ? 'Not connected — demo mode' : 'Connected',
    },
    {
      key: 'cost-setup',
      name: 'Your cost setup',
      via: 'Entered in EtsyPilot',
      provides:
        'Product cost, shipping cost, labour rate, overhead and other costs, per shop, listing or variation.',
      class: 'SELLER_INPUT',
      refresh: 'On save',
      limitations:
        'Only as accurate as what you enter. Gaps reduce profit coverage rather than being filled in.',
      status: null,
    },
    {
      key: 'signals',
      name: 'Public marketplace signals',
      via: 'Sampled, aggregated',
      provides:
        'Keyword demand bands, competition, category distribution, competitor sales ranges, trend direction.',
      class: 'ESTIMATED',
      refresh: 'Weekly',
      limitations:
        'Never official Etsy figures. Always shown as a range with confidence. Four locales only.',
      status: signals === 'MOCK' ? 'Modelled sample data' : 'Live sampling',
    },
    {
      key: 'stats-import',
      name: 'Etsy Stats import',
      via: 'CSV you download from Etsy',
      provides:
        'Listing views, visits and traffic sources — the metrics the API does not expose.',
      class: 'SELLER_INPUT',
      refresh: 'On upload',
      limitations:
        'Historic snapshot, not live. Goes stale between uploads and is labelled with its export date.',
      // Said plainly rather than left blank. A source listed with no state
      // reads as available.
      status: 'No import yet',
    },
    {
      key: 'event-log',
      name: 'EtsyPilot event log',
      via: 'Immutable, generated here',
      provides:
        'Every change made through EtsyPilot — price, title, tags, state, bulk jobs, AI applications — with actor and operation ID.',
      class: 'VERIFIED',
      refresh: 'Immediate',
      limitations:
        'Records changes made here. Changes you make directly on Etsy appear only at the next sync.',
      status: null,
    },
    {
      key: 'llm',
      name: 'Language model',
      via: 'Drafting only',
      provides: 'Title, tag and description drafts, issue explanations, recommended actions.',
      class: 'AI_DRAFT',
      refresh: 'On request',
      limitations:
        'Never applied without your approval. Produces language, never data — no figure originates here.',
      status: ai === 'MOCK' ? 'Rule-based drafter — nothing leaves this machine' : 'Live model',
    },
    {
      key: 'demo',
      name: 'Demo dataset',
      via: 'Willow & Fern, synthetic',
      provides: 'A complete fictional shop so every screen can be explored before connecting anything.',
      class: 'VERIFIED',
      refresh: 'Static',
      limitations:
        'Not a real shop and not benchmark data. Every screen in demo mode carries a persistent banner.',
      status: demo ? 'Serving every screen' : 'Off',
    },
  ]
}
