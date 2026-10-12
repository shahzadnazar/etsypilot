/*
 * Data sources (artboard 94).
 *
 * "Every input CobaltRank reads, what class of number it produces, how often it
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
import { marketSignalsMode } from '@/lib/signals'
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
  /*
   * "Estimated ranges only" was the answer here, and it pointed at the
   * Research section's competitor estimates. Those exist in the demo and
   * nowhere else (lib/signals/index.ts), so on a live deployment the
   * alternative offered was a screen that is not built. The honest answer is
   * the same one the row above it gives.
   */
  { what: "Another shop's real sales", instead: 'Not available anywhere' },
] as const

export function dataSources(): DataSource[] {
  const demo = isDemoMode()
  const ai = getAiProvider().mode
  const signals = marketSignalsMode()

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
      via: 'Entered in CobaltRank',
      provides:
        'Product cost, shipping cost, labour rate, overhead and other costs, per shop, listing or variation.',
      class: 'SELLER_INPUT',
      refresh: 'On save',
      limitations:
        'Only as accurate as what you enter. Gaps reduce profit coverage rather than being filled in.',
      status: null,
    },
    /*
     * ── THE ROW THAT WAS ALREADY TELLING THE TRUTH ─────────────────────
     *
     * `signals === 'MOCK' ? 'Modelled sample data' : 'Live sampling'` was the
     * only honest statement about market signals anywhere in the product, and
     * it was on the page nobody opens while five Research screens printed
     * modelled figures as observations. Everything else is now reconciled to
     * this line rather than the other way round.
     *
     * Two things changed here, both because the branch had no third arm: there
     * is now no adapter at all outside demo mode, so NONE is the live answer,
     * and the row's own name, cadence and limitations were written for the
     * sampler that was planned and has never existed.
     */
    {
      key: 'signals',
      name: 'Market signals',
      via: signals === 'NONE' ? 'Nothing connected' : 'Generated, in the demo only',
      provides:
        'Keyword demand bands, competition, category distribution, competitor sales ranges, trend direction.',
      class: signals === 'NONE' ? 'UNAVAILABLE' : 'ESTIMATED',
      refresh: signals === 'NONE' ? 'Never' : 'Static',
      limitations:
        signals === 'NONE'
          ? 'There is no source. Etsy publishes none of this, nothing else is connected, and the Research screens say so rather than modelling it.'
          : 'Never official Etsy figures and never measured — sample data, shown as a range with confidence. Four locales only.',
      status:
        signals === 'NONE'
          ? 'Not built yet — no source'
          : signals === 'MOCK'
            ? 'Modelled sample data'
            : 'Live sampling',
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
      name: 'CobaltRank event log',
      via: 'Immutable, generated here',
      provides:
        'Every change made through CobaltRank — price, title, tags, state, bulk jobs, AI applications — with actor and operation ID.',
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
