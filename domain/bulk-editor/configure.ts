/*
 * Turning a configured change into a proposed after-value.
 *
 * Pure and deterministic: same listing plus same config always produces the
 * same after-value. That is what lets the diff be fingerprinted, and the
 * fingerprint is what binds confirmation to the exact change the user reviewed.
 */

import type { EtsyListing } from '@/lib/etsy/interface'
import type { FieldChange } from './types'

/** The maximum Etsy allows. Listings already at the limit warn rather than truncate. */
export const MAX_TAGS = 13

export interface ProposedChange {
  price?: number
  tags?: string[]
  quantity?: number
  state?: EtsyListing['state']
}

export function proposeChanges(listing: EtsyListing, changes: FieldChange[]): ProposedChange {
  const proposed: ProposedChange = {}

  for (const change of changes) {
    switch (change.kind) {
      case 'PRICE': {
        const base = proposed.price ?? listing.price
        const raw = change.mode === 'PERCENT' ? base * (1 + change.amount / 100) : base + change.amount
        proposed.price = change.roundTo ? roundTo(raw, change.roundTo) : round2(raw)
        break
      }
      case 'TAGS': {
        const current = proposed.tags ?? listing.tags
        proposed.tags = applyTags(current, change.mode, change.tags)
        break
      }
      case 'QUANTITY': {
        const base = proposed.quantity ?? listing.quantity
        proposed.quantity = Math.max(0, change.mode === 'SET' ? change.amount : base + change.amount)
        break
      }
      case 'STATE': {
        proposed.state = change.state
        break
      }
    }
  }

  return proposed
}

/**
 * Tag arithmetic.
 *
 * ADD never truncates past the limit - it returns the over-length result and
 * lets validation report it as a warning. Silently dropping the tags the seller
 * asked for would be the worst of both: they think it worked, and it did not.
 */
function applyTags(current: string[], mode: 'ADD' | 'REMOVE' | 'REPLACE', tags: string[]): string[] {
  const normalise = (t: string) => t.trim().toLowerCase()
  switch (mode) {
    case 'ADD': {
      const seen = new Set(current.map(normalise))
      return [...current, ...tags.filter((t) => !seen.has(normalise(t)))]
    }
    case 'REMOVE': {
      const drop = new Set(tags.map(normalise))
      return current.filter((t) => !drop.has(normalise(t)))
    }
    case 'REPLACE':
      return [...tags]
  }
}

function roundTo(value: number, multiple: number): number {
  return round2(Math.round(value / multiple) * multiple)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
