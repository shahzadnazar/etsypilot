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

import { getBillingProvider } from '@/lib/billing'
import { isDemoMode } from '@/lib/etsy'
import { marketSignalsMode, signalsAreUnavailable } from '@/lib/signals'
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
  const signals = marketSignalsMode()
  const signalsUnavailable = signalsAreUnavailable(signals)
  /*
   * Null where no payment provider is configured, which is every live
   * deployment. See lib/billing/index.ts for what the fallback used to serve
   * instead.
   */
  const billing = getBillingProvider()

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
     *
     * ── AND A FOURTH ARM, BECAUSE THE SEAM MADE ONE REACHABLE ───────────
     *
     * `signals === 'NONE' ? … : …` was a two-way branch over a three-way
     * answer the moment lib/signals grew a configuration check. A deployment
     * that sets SIGNALS_PROVIDER with no adapter written would have fallen
     * into the else arm and printed "Live sampling" over nothing — the exact
     * defect this row exists to prevent, recreated by a widened union. So the
     * unavailable cases are asked about through signalsAreUnavailable()
     * rather than compared here, and LIVE is the only arm that claims a
     * source.
     */
    {
      key: 'signals',
      name: 'Market signals',
      via: signalsUnavailable
        ? signals === 'CONFIGURED_NOT_BUILT'
          ? 'Provider configured, no adapter built'
          : 'Nothing connected'
        : signals === 'MOCK'
          ? 'Generated, in the demo only'
          : 'Bought keyword data · never from Etsy',
      provides:
        'Keyword demand bands, competition, category distribution, competitor sales ranges, trend direction.',
      class: signalsUnavailable ? 'UNAVAILABLE' : 'ESTIMATED',
      refresh: signalsUnavailable ? 'Never' : signals === 'MOCK' ? 'Static' : 'On request',
      limitations: signalsUnavailable
        ? signals === 'CONFIGURED_NOT_BUILT'
          ? 'A keyword data provider is configured on this deployment and no adapter has been written for it, so nothing is read and nothing is sent. The Research screens stay unbuilt.'
          : 'There is no source. Etsy publishes none of this, nothing else is connected, and the Research screens say so rather than modelling it.'
        : signals === 'MOCK'
          ? 'Never official Etsy figures and never measured — sample data, shown as a range with confidence. Four locales only.'
          : 'Never official Etsy figures. Bought keyword data, which is why it may exist at all: nothing is read from the Etsy API or the Etsy site for it.',
      status: signalsUnavailable
        ? signals === 'CONFIGURED_NOT_BUILT'
          ? 'Not built yet — provider configured, adapter missing'
          : 'Not built yet — no source'
        : signals === 'MOCK'
          ? 'Modelled sample data'
          : 'Live sampling',
    },
    /*
     * ── TWO ROWS ADDED BY THE SWEEP THAT FOUND THEIR CLAIMS ────────────────
     *
     * This catalogue is the product's answer to "where does every figure come
     * from", and tests/unit/source-claims.test.ts now asserts rendered copy
     * against it. Two figure-sources were missing from it, and both had been
     * stating a provenance nobody could check:
     *
     *   The payment provider. /billing described a subscription, a renewal
     *   date, a card and four invoices on every deployment, from
     *   MockBillingProvider. A row here is what makes "do we have one" a
     *   question the page asks rather than assumes.
     *
     *   The seasonal windows. /tools/seasonal-calendar said its dates were
     *   "drawn from public category seasonality". There is no such dataset;
     *   they are three windows authored by hand. An assumption is fine to
     *   ship, so it is listed as one.
     */
    {
      key: 'payments',
      name: 'Payment provider',
      via: billing === null ? 'Nothing connected' : 'Hosted checkout · card never reaches us',
      provides:
        'Your subscription and plan, the renewal date, invoices and the card brand and last four digits.',
      class: billing === null ? 'UNAVAILABLE' : 'VERIFIED',
      refresh: billing === null ? 'Never' : 'On change',
      limitations:
        billing === null
          ? 'There is no payment provider, so there is no subscription, no card and no invoice — and nobody can be charged. No plan limit is applied to anything meanwhile.'
          : 'Card numbers are never stored here. A charge is disclosed before it is made, and refunds are the provider’s to decide.',
      status:
        billing === null
          ? 'Not connected — billing is not open'
          : billing.mode === 'MOCK'
            ? 'Demo billing — the flows run, no money moves'
            : 'Connected',
    },
    {
      key: 'seasonality',
      name: 'CobaltRank’s seasonal assumptions',
      via: 'Authored here, not sampled',
      provides:
        'When each season’s prepare, go-live and peak windows run, on the Seasonal calendar.',
      class: 'ESTIMATED',
      refresh: 'When we revise them',
      limitations:
        'Three windows, written by hand. Not a dataset, not Etsy’s, and not sampled from anywhere. The LIFT over them is measured on your own orders; the dates themselves are not measured at all.',
      status: 'Three windows, authored',
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
        'Every change made through CobaltRank — price, title, tags, state, bulk jobs — with actor and operation ID.',
      class: 'VERIFIED',
      refresh: 'Immediate',
      limitations:
        'Records changes made here. Changes you make directly on Etsy appear only at the next sync.',
      status: null,
    },
    /*
     * ── THERE IS NO LANGUAGE-MODEL ROW, AND THAT IS THE SECOND DECISION ──
     *
     * The first was to keep one: this page is the catalogue of what the
     * product reads from, so "there is no language model here" read as a fact
     * worth stating, following the email, payment and keyword-provider rows
     * that resolve to nothing.
     *
     * The owner decided otherwise, and the sub-processor table settled it the
     * same way: with nothing sent to a model, the honest table has no model
     * row at all. A row stating an absence is still a sentence about a feature
     * this product does not have, on a page a seller reads to find out what it
     * does — and the catalogue's own rule is that every row names something
     * the product actually reads from.
     *
     * The unnamed-role rows are not the same case and stay: an email sender, a
     * payment provider and a keyword data provider are roles this product has
     * code for and intends to fill, each measured from the running
     * configuration. tests/unit/legal-claims.test.ts sweeps every surface,
     * including this file, and fails if a sentence about either removed
     * feature comes back.
     */
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
