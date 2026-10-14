/*
 * The provenance model.
 *
 * Every important metric a domain service returns carries a Provenance value
 * object. It is part of the return type, not a UI decoration - which makes
 * "an estimate shown as verified" a type error rather than a design slip
 * (architecture.md section 8, rules.md section 4).
 *
 * Canonical one-line definitions come from Methodology artboard 93.
 */

/*
 * ── AI_DRAFT IS NOT ONE OF THESE ANY MORE ────────────────────────────────
 *
 * It was the sixth class: "AI-generated draft requiring review." D95 removed
 * the AI Copilot, and nothing in the product can produce a figure of that
 * class now.
 *
 * It goes rather than staying as an unproducible option, because this list is
 * rendered. components/marketing/sections.tsx maps over it to publish the
 * whole provenance legend on the landing page — so the class would have gone
 * on advertising "written by the assistant from evidence on your screen" to
 * every visitor, which is a claim about a capability rather than a gap in a
 * table. A vocabulary a product renders in full cannot hold a word it has no
 * use for.
 *
 * Every `Record<ProvenanceType, …>` in the repository lost its entry with it,
 * which the compiler enumerated: the label, the definition, the badge's
 * colours and the landing page's line.
 */
export const PROVENANCE_TYPES = [
  'VERIFIED',
  'CALCULATED',
  'ESTIMATED',
  'SELLER_INPUT',
  'UNAVAILABLE',
] as const

export type ProvenanceType = (typeof PROVENANCE_TYPES)[number]

export type Confidence = 'HIGH' | 'MODERATE' | 'LOW'

export interface Provenance {
  type: ProvenanceType
  /** Where the input came from, e.g. "Etsy Open API v3". */
  source: string
  /** How the number was produced. Plain language, no jargon. */
  methodology: string
  confidence?: Confidence
  /** ISO timestamp of the underlying observation, not of this render. */
  freshness?: string
  /** What this number cannot tell you. Never omitted for ESTIMATED. */
  limitations?: string[]
  /** 0-100. Present where a metric covers only part of the data. */
  coverage?: number
}

/**
 * A value paired with the provenance that produced it.
 *
 * `value` is null when type is UNAVAILABLE: Etsy does not expose it, so we show
 * nothing rather than a guess (Methodology 93).
 */
export interface Provenanced<T> {
  value: T | null
  provenance: Provenance
}

/**
 * An estimate is always a range. Never a falsely precise midpoint.
 * "Treat two terms with overlapping bands as equal." (Methodology 93)
 */
export interface EstimatedRange {
  min: number
  max: number
}

export function isUnavailable<T>(p: Provenanced<T>): boolean {
  return p.provenance.type === 'UNAVAILABLE' || p.value === null
}

/** Human-readable label. Every badge carries an icon *and* a word. */
export const PROVENANCE_LABEL: Record<ProvenanceType, string> = {
  VERIFIED: 'Verified',
  CALCULATED: 'Calculated',
  ESTIMATED: 'Estimated',
  SELLER_INPUT: 'Seller input',
  UNAVAILABLE: 'Unavailable',
}

/** The canonical definitions, as published on the Methodology page. */
export const PROVENANCE_DEFINITION: Record<ProvenanceType, string> = {
  VERIFIED: 'Etsy returned it for your own shop. Exact.',
  CALCULATED: 'A visible formula over visible inputs. Reproducible.',
  ESTIMATED: 'Modelled from observable signals. Always a range.',
  SELLER_INPUT: 'You or a teammate entered it. We never guess it.',
  UNAVAILABLE: 'Etsy does not expose it. We show nothing, not a guess.',
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  HIGH: 'High',
  MODERATE: 'Moderate',
  LOW: 'Low',
}
