/*
 * One audit rule and the listings it flags.
 *
 * Each group states why the rule exists and what the fix is, in mechanical
 * terms. Nothing here says "this will rank higher" — the rules describe what a
 * listing can or cannot do, which is knowable, and never what Etsy will do with
 * it, which is not.
 *
 * "Revenue at risk" is the listing's own receipts, summed, so it stays VERIFIED
 * (summing does not demote). The bulk-fix button hands the selection to the
 * Safe Bulk Editor rather than writing anything itself.
 */

import Link from 'next/link'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { Money, NumericCell } from '@/components/ui/numeric'
import type { RuleResult } from '@/domain/audit/service'

const SEVERITY_FILL = {
  ERROR: { bg: '#FEF2F2', border: '#FECACA', fg: '#991B1B' },
  WARNING: { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E' },
} as const

export function RuleGroup({
  result,
  currency,
  demo,
  sampleSize = 3,
}: {
  result: RuleResult
  currency: string
  demo: boolean
  sampleSize?: number
}) {
  const { rule } = result
  const fill = SEVERITY_FILL[rule.severity]
  const sample = result.findings.slice(0, sampleSize)

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-[18px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
              style={{ background: fill.bg, borderColor: fill.border, color: fill.fg }}
            >
              {rule.severity === 'ERROR' ? 'Error' : 'Warning'}
              {rule.blocksPublishing ? ' · blocks publishing' : ''}
            </span>
            <h3 className="text-section text-ink-1">{rule.label}</h3>
          </div>
          <p className="max-w-[75ch] text-small leading-relaxed text-ink-2">
            <span className="font-semibold text-ink-1">Why this matters. </span>
            {rule.why}
          </p>
          <p className="max-w-[75ch] text-small leading-relaxed text-ink-2">
            <span className="font-semibold text-ink-1">The fix. </span>
            {rule.fix}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-metric text-ink-1">{result.count}</span>
          <span className="text-caption text-muted-1">listings</span>
          <span className="flex items-center gap-1.5 text-caption text-muted-1">
            <Money value={result.revenueAtRisk} currency={currency} /> at risk
            <ProvenanceBadge
              type="VERIFIED"
              demo={demo}
              srDetail="Summed from the receipts these listings produced in the period."
            />
          </span>
        </div>
      </div>

      <table className="w-full border-collapse text-body">
        <caption className="sr-only">
          Sample of {sample.length} of {result.count} listings flagged by {rule.label}, with the
          verified revenue each produced in the period.
        </caption>
        <thead>
          <tr className="bg-canvas-soft text-left text-label text-muted-1">
            <th scope="col" className="px-4 py-2.5 font-semibold">Listing</th>
            {rule.code === 'MISSING_REQUIRED_ATTRIBUTE' ? (
              <>
                <th scope="col" className="px-3 py-2.5 font-semibold">Missing</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Suggested value</th>
              </>
            ) : null}
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Revenue at risk</th>
          </tr>
        </thead>
        <tbody>
          {sample.map((f) => (
            <tr key={f.listingId} className="border-t border-line">
              <td className="px-4 py-3 text-small text-ink-1">
                {f.title}
                {f.sku ? <span className="text-muted-1"> · {f.sku}</span> : null}
              </td>
              {rule.code === 'MISSING_REQUIRED_ATTRIBUTE' ? (
                <>
                  <td className="px-3 py-3 text-small text-ink-2">{f.missingAttribute ?? '—'}</td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {f.suggestedValue ? (
                      f.suggestedValue
                    ) : (
                      /*
                       * No suggestion is an honest empty control. Pre-filling a
                       * plausible material would put a guess into a field that
                       * publishes to a live listing.
                       */
                      <span className="text-muted-1">Choose value</span>
                    )}
                  </td>
                </>
              ) : null}
              <NumericCell className="text-ink-2">
                <Money value={f.revenueAtRisk.value} currency={currency} />
              </NumericCell>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-[18px]">
        <span className="text-caption text-muted-1">
          {result.count > sample.length
            ? `Showing ${sample.length} of ${result.count}.`
            : `Showing all ${result.count}.`}{' '}
          {rule.code === 'MISSING_REQUIRED_ATTRIBUTE'
            ? 'Suggested values are read from your own listing text and can be changed before applying.'
            : null}
        </span>
        {rule.bulkFixable ? (
          <Link
            href={`/listings/bulk-editor?rule=${rule.code}`}
            className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-strong md:h-[38px]"
          >
            Review &amp; fix {result.count} in bulk
          </Link>
        ) : (
          <span className="text-caption text-muted-1">
            Fixed one listing at a time — this one needs judgement, not a rule.
          </span>
        )}
      </div>
    </Card>
  )
}
