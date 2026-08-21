import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { METHODOLOGIES, type Methodology } from '@/lib/provenance/methodology'
import { formatDateTime } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Methodology' }

/*
 * The Methodology page (artboard 93).
 *
 * Every provenance drawer in the product ends with "Open the full methodology
 * →", and every one of those links pointed at this route. It did not exist.
 * Eleven dead links, on the surfaces whose entire job is to explain where a
 * number came from — found by an audit that diffed every href in the source
 * against every page that exists, not by anyone clicking.
 *
 * The page is GENERATED from METHODOLOGIES rather than written alongside it.
 * That is the point: the drawer and this page read the same record, so they
 * cannot drift into describing the same metric two different ways. A
 * methodology page that disagrees with the badge it explains is worse than no
 * page — it turns one uncertain number into two contradictory claims.
 *
 * Ordering follows the catalogue, and the anchor comes from the entry's own
 * readMoreHref, so a link that exists somewhere in the product lands here on
 * the right heading by construction.
 */

/** The anchor a drawer will arrive on, taken from the entry itself. */
function anchorOf(m: Methodology): string | null {
  const hash = m.readMoreHref?.split('#')[1]
  return hash ?? null
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-caption font-semibold text-muted-1 sm:w-[128px]">{label}</dt>
      <dd className="text-small leading-relaxed text-ink-2">{children}</dd>
    </div>
  )
}

export default function MethodologyPage() {
  const entries = Object.values(METHODOLOGIES)

  return (
    <>
      <PageHeader
        title="Methodology"
        subtitle="Where every number on this product comes from, how it was produced, and what it cannot tell you."
      />

      <Card className="mb-4 p-4">
        <p className="max-w-[80ch] text-small leading-relaxed text-ink-2">
          Two sentences that apply to everything below. EtsyPilot does not model Etsy&rsquo;s
          ranking algorithm and no one outside Etsy can — nothing here is a prediction of where a
          listing will rank. And where Etsy publishes no data, this product says so and shows
          nothing, rather than filling the gap with a modelled figure wearing a confident label.
        </p>
      </Card>

      {/*
        * py-1 is not decoration. These chips are standalone controls in a nav
        * list, not links inside a sentence, so WCAG 2.2's 24x24 target-size
        * applies with no inline exemption. At 15.4px tall they failed it — on
        * a page this product built to explain itself.
        */}
      <nav aria-label="Metrics" className="mb-4 flex flex-wrap gap-x-3 gap-y-1">
        {entries.map((m) => {
          const anchor = anchorOf(m)
          return anchor ? (
            <a
              key={m.metric}
              href={`#${anchor}`}
              className="inline-flex min-h-[24px] items-center text-caption font-semibold text-brand-strong underline underline-offset-2"
            >
              {m.metric}
            </a>
          ) : null
        })}
      </nav>

      <div className="flex flex-col gap-3">
        {entries.map((m) => {
          const anchor = anchorOf(m)
          return (
            <Card key={m.metric} id={anchor ?? undefined} className="scroll-mt-6 p-[18px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-section text-ink-1">{m.metric}</h2>
                <ProvenanceBadge type={m.type} />
              </div>

              <dl className="mt-3 flex flex-col gap-2">
                <Line label="Source">{m.source}</Line>
                <Line label="How">{m.method}</Line>
                {m.freshness ? (
                  <Line label="Observed">{formatDateTime(m.freshness)}</Line>
                ) : null}
                {m.confidence ? (
                  <Line label="Confidence">
                    {m.confidence.charAt(0) + m.confidence.slice(1).toLowerCase()}
                  </Line>
                ) : null}
                {/*
                  * Coverage prints only when the catalogue carries one. Several
                  * entries deliberately omit it because coverage is measured per
                  * shop and per period (D34) — a number written here would be an
                  * authored one, and an authored coverage figure is exactly the
                  * defect this page exists to argue against.
                  */}
                {m.coverage !== undefined ? (
                  <Line label="Coverage">
                    {m.coverage}% {m.coverageLabel ?? ''}
                  </Line>
                ) : m.coverageLabel ? (
                  <Line label="Coverage">
                    Measured per shop and period — the figure is shown on the metric itself,{' '}
                    {m.coverageLabel}.
                  </Line>
                ) : null}
              </dl>

              {m.limitations?.length ? (
                <>
                  <h3 className="mt-3 text-caption font-semibold text-muted-1">
                    What this cannot tell you
                  </h3>
                  <ul className="mt-1 flex flex-col gap-1">
                    {m.limitations.map((l) => (
                      <li key={l} className="text-small leading-relaxed text-ink-2">
                        · {l}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}

              {m.exclusions?.length ? (
                <>
                  <h3 className="mt-3 text-caption font-semibold text-muted-1">Left out</h3>
                  <ul className="mt-1 flex flex-col gap-1">
                    {m.exclusions.map((l) => (
                      <li key={l} className="text-small leading-relaxed text-ink-2">
                        · {l}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          )
        })}
      </div>
    </>
  )
}
