/*
 * An AI-written paragraph, shown as one.
 *
 * Three states, and the third is the one worth building:
 *
 *   assisted   the model's text, badged AI draft.
 *   plain      the product's own words, unbadged, because the model's version
 *              was withheld or the service was unreachable.
 *   withheld   same as plain, plus a line saying a version was withheld and
 *              why — so a seller never wonders whether they are missing
 *              something.
 *
 * The seller reads the same information in all three. AI is decoration on an
 * explanation the domain already computed, never the explanation itself, which
 * is why "the AI is down" costs a badge rather than a paragraph.
 */

import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import type { Explanation } from '@/domain/ai/explain'

export function AssistedNote({
  explanation,
  demo,
  label = 'What this means',
}: {
  explanation: Explanation
  demo: boolean
  label?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-label text-muted-1">{label}</span>
        {explanation.aiAssisted ? (
          <ProvenanceBadge
            type="AI_DRAFT"
            demo={demo}
            srDetail="Written by the assistant from the finding and the evidence on this screen, then checked against the guardrails before display."
          />
        ) : null}
      </div>

      <p className="text-small leading-relaxed text-ink-2">{explanation.text}</p>

      {explanation.withheldBecause.length > 0 ? (
        <p className="text-caption leading-relaxed text-muted-1">
          An assistant-written version was withheld and you are reading the product’s own wording
          instead. {explanation.withheldBecause[0]}
        </p>
      ) : null}
    </div>
  )
}
