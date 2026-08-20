/*
 * Fact assembly.
 *
 * The only path by which a number reaches a prompt.
 *
 * Every helper here takes a Provenanced value and returns a PromptFact carrying
 * its class, so a caller cannot hand the model a bare figure — there is no
 * function that accepts one. An UNAVAILABLE value becomes an explicit "you do
 * not know this" line rather than being silently omitted, because a model that
 * notices a missing field will happily reason about why it is missing.
 *
 * ESTIMATED facts arrive with their caveat attached. The prompt renders it in
 * the same line as the value, so the range and the reason it is a range cannot
 * be separated by whatever the model does next.
 */

import type { PromptFact } from '@/lib/ai/interface'
import type { Provenanced } from '@/lib/provenance/types'
import type { EstimatedRange } from '@/lib/signals/interface'

export function fact(label: string, value: Provenanced<number | string>): PromptFact {
  if (value.value === null) return unavailableFact(label, value.provenance.methodology)
  return {
    label,
    value: String(value.value),
    provenance: value.provenance.type,
    ...(value.provenance.type === 'ESTIMATED' ? { caveat: caveatFor(value) } : {}),
  }
}

/** A range stays a range all the way into the prompt. */
export function rangeFact(label: string, value: Provenanced<EstimatedRange>): PromptFact {
  if (value.value === null) return unavailableFact(label, value.provenance.methodology)
  return {
    label,
    value: `${value.value.min.toLocaleString('en-US')}–${value.value.max.toLocaleString('en-US')}`,
    provenance: value.provenance.type,
    caveat: caveatFor(value),
  }
}

/** A plain count the caller measured. Named separately so it reads as verified. */
export function countFact(label: string, count: number): PromptFact {
  return { label, value: String(count), provenance: 'VERIFIED' }
}

export function unavailableFact(label: string, reason: string): PromptFact {
  return {
    label,
    value: 'not available',
    provenance: 'UNAVAILABLE',
    caveat: reason,
  }
}

function caveatFor(value: Provenanced<unknown>): string {
  const parts = [
    value.provenance.confidence ? `confidence ${value.provenance.confidence.toLowerCase()}` : null,
    ...(value.provenance.limitations ?? []),
  ].filter((p): p is string => p !== null)
  return parts.join(' · ') || 'modelled, not measured'
}

/**
 * The facts every listing task gets.
 *
 * Character counts and tag counts — things this product counted itself, on the
 * seller's own text. Nothing about performance, because nothing about
 * performance is knowable per listing: Etsy exposes neither views nor the
 * search terms buyers used, and the interface has no method for either.
 */
export function listingFacts(listing: {
  title: string
  tags: string[]
  description: string
}): PromptFact[] {
  return [
    countFact('Current title length in characters', listing.title.length),
    countFact('Current tag count', listing.tags.length),
    countFact('Etsy’s tag limit', 13),
    countFact('Current description length in characters', listing.description.length),
    unavailableFact(
      'Views for this listing',
      'Etsy does not provide listing views through the public API.',
    ),
    unavailableFact(
      'Search terms buyers used',
      'Etsy does not release the search terms buyers used. This is not available anywhere, from any tool.',
    ),
  ]
}
