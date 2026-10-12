import Link from 'next/link'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   "HOW THIS DATA WORKS" — ON EVERY RESEARCH SCREEN, FROM ONE DEFINITION.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The Keywords page had this panel and the other four did not. Its own
 * comment set the standard: "Every figure on this page is modelled. Nothing
 * here is Etsy data, and the page says so twice: once in the subtitle, once
 * in the 'How this data works' panel."
 *
 * Four pages said it once or not at all, which left a reader — a seller, or
 * an Etsy reviewer opening Competitors — to infer where the numbers came
 * from. They are modelled: lib/signals/ has one implementation and it is a
 * mock, and tests/unit/signals-boundary.test.ts proves nothing under it can
 * reach a network.
 *
 * ── A COMPONENT RATHER THAN FOUR COPIES ──────────────────────────────────
 *
 * "Make the other four match" is a thing that decays if matching means four
 * people remembering. One component, rendered by all five, and
 * tests/unit/research-provenance.test.ts fails if a research page stops
 * rendering it.
 *
 * ── WHY THIS IS NOT A DISCLAIMER ─────────────────────────────────────────
 *
 * It names a source category, a confidence and an exclusion list. "These
 * figures are estimates" in small grey type is a disclaimer; this is
 * provenance, the same thing the badges do for a single number, at the scale
 * of a page.
 *
 * ── THERE IS NO "LAST UPDATED" ROW ANY MORE ─────────────────────────
 *
 * It took an `updated` string, documented "when the model last observed", and
 * every value a caller could have passed it was the one authored constant in
 * lib/signals/mock.ts. The prop is gone rather than left unused: a row called
 * "Last updated" standing empty is an invitation to fill it with the nearest
 * timestamp-shaped thing, which is how it got there.
 *
 * If the model ever acquires a run time of its own, the row to add says "model
 * last ran" — a claim about this product, which is checkable, and not a claim
 * about Etsy, which is not.
 */
export function ModelledNotice({
  lead,
  sourceCategory = 'Modelled sample data',
  confidence,
  excludes,
  limitations = [],
  methodologyHref,
}: {
  /** What is modelled here and from what. One or two sentences. */
  lead: ReactNode
  sourceCategory?: string
  confidence?: string
  excludes: string
  limitations?: readonly string[]
  methodologyHref: string
}) {
  return (
    <Card className="p-[18px]">
      <h2 className="text-section text-ink-1">How this data works</h2>
      <p className="mt-2 text-small leading-relaxed text-ink-2">{lead}</p>
      <dl className="mt-3 flex flex-col gap-2 text-caption">
        <Row label="Source category" value={sourceCategory} />
        {confidence ? <Row label="Confidence" value={confidence} /> : null}
        <Row label="Excludes" value={excludes} />
      </dl>
      {limitations.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5 text-caption leading-relaxed text-muted-1">
          {limitations.map((l) => (
            <li key={l}>· {l}</li>
          ))}
        </ul>
      ) : null}
      <Link
        href={methodologyHref}
        className="mt-3 inline-block text-caption font-semibold text-brand-strong underline underline-offset-2"
      >
        Open the full methodology →
      </Link>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-1">{label}</dt>
      <dd className="text-right font-semibold text-ink-2">{value}</dd>
    </div>
  )
}
