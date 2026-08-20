/*
 * The extension ↔ app contract.
 *
 * ONE source of types, imported by both the Next app and the extension build.
 * Not copied: a duplicated contract drifts, and the half that drifts is always
 * the one nobody is running tests against.
 *
 * The acceptance criterion for this phase is "the extension never contains
 * privileged Etsy credentials", so the contract is written to make that true by
 * construction rather than by discipline:
 *
 *   1. NO TOKEN FIELD. Not on the request, not on the response, not optional.
 *      The extension authenticates with the seller's existing EtsyPilot session
 *      cookie, sent by the browser — it never receives, stores or forwards a
 *      credential, because there is nowhere to put one.
 *
 *   2. NO WRITE SHAPE. Every request type here is a read. The extension cannot
 *      edit, publish or deactivate a listing because no message exists that
 *      would ask the server to. Quick actions are deep links into the app,
 *      where the bulk editor's confirmation gate still applies (D37).
 *
 *   3. PROVENANCE TRAVELS. Every figure carries its class and, where estimated,
 *      its confidence band and limitations — the same badges as the main app.
 *      A popup is the easiest place in a product to lose the qualifier, because
 *      it is small and glanced at.
 */

import type { Confidence, ProvenanceType } from '@/lib/provenance/types'

/** The extension's view of one figure. Deliberately not a bare number. */
export interface ExtensionMetric {
  label: string
  /** Rendered text. Null means unavailable — never a fallback figure. */
  display: string | null
  provenance: ProvenanceType
  confidence?: Confidence
  /** Why the number is what it is. Shown behind "How is this calculated?". */
  methodology: string
  limitations?: string[]
}

export interface ListingHealth {
  score: number
  band: 'GOOD' | 'FAIR' | 'POOR'
  /** How many rule findings this listing has. Counted, not stated. */
  improvements: number
  provenance: ProvenanceType
  methodology: string
}

export interface QuickAction {
  label: string
  /** An absolute URL into the app. The extension never acts, it navigates. */
  href: string
}

export interface ListingIntelligence {
  etsyListingId: string
  title: string
  shopName: string
  /** True when this listing belongs to the seller's own connected shop. */
  isOwnListing: boolean
  health: ListingHealth | null
  metrics: ExtensionMetric[]
  primaryKeyword: ExtensionMetric | null
  /** One sentence, drawn from the audit. Never a prediction. */
  recommendation: string | null
  actions: QuickAction[]
  /** Calendar date of the underlying observation, YYYY-MM-DD (D24). */
  observedOn: string
}

/**
 * Everything the popup can be told.
 *
 * A discriminated union rather than a nullable payload: "signed out", "no shop"
 * and "no listing on this page" are different screens with different actions,
 * and collapsing them into `data === null` is how a popup ends up showing
 * "something went wrong" for a seller who simply has not connected a shop yet.
 */
export type ExtensionResponse =
  | { state: 'OK'; listing: ListingIntelligence }
  | { state: 'SIGNED_OUT'; message: string; signInUrl: string }
  | { state: 'NO_SHOP'; message: string; connectUrl: string }
  | { state: 'NOT_A_LISTING'; message: string; etsyUrl: string }
  | { state: 'ERROR'; message: string; recovery: string }

/** The only request the extension can make. A read, by listing id. */
export interface ListingRequest {
  etsyListingId: string
}

/**
 * Pull an Etsy listing id out of a URL.
 *
 * Shared so the content script and the server agree on what counts as a
 * listing page. Returns null for anything else — including Etsy pages that are
 * not listings, which is the common case while browsing.
 */
export function listingIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (!/(^|\.)etsy\.com$/i.test(parsed.hostname)) return null
    const match = parsed.pathname.match(/\/listing\/(\d+)(?:\/|$)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}
