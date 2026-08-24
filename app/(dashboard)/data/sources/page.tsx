import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { dataSources, NOT_RELEASED } from '@/domain/data-sources/service'
import { TRADEMARK_NOTICE } from '@/domain/connect/types'
import { isDemoMode } from '@/lib/etsy'

export const metadata: Metadata = { title: 'Data sources' }

/*
 * Data sources (artboard 94).
 *
 * This is where every provenance drawer's chain of "but where did that come
 * from?" terminates. Methodology (93) explains how a metric is computed; this
 * explains what it was computed FROM, and — the column that matters — what
 * that input cannot tell you.
 *
 * It was the last dead link out of the provenance system: the badge promised
 * an explanation, the drawer promised a methodology, the methodology promised
 * a source, and the source was a 404.
 *
 * Nothing on this page is authored. Every status is read from the adapter that
 * serves that source, so the page cannot claim a live connection while the
 * mock is running (D59a).
 */
export default function DataSourcesPage() {
  const sources = dataSources()

  return (
    <>
      <PageHeader
        title="Data sources"
        subtitle="Every input EtsyPilot reads, what class of number it produces, how often it refreshes, and what it cannot tell you."
        actions={
          <Link
              prefetch={false}
            href="/api/export/audit"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Export this table
          </Link>
        }
      />

      {isDemoMode() ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">
          This is the demo shop, so the Etsy row below reads &ldquo;not connected&rdquo;. Every
          status on this page is read from the adapter that serves it — the page cannot tell you a
          source is live while the demo one is running.
        </Card>
      ) : null}

      <Card
        tabIndex={0}
        role="region"
        aria-label="Data sources, scrolls horizontally"
        className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <table className="w-full min-w-[880px] border-collapse text-small">
          <thead>
            <tr className="border-b border-line bg-canvas-soft text-left text-label text-muted-1">
              <th className="px-3 py-2.5 font-semibold">Source</th>
              <th className="px-3 py-2.5 font-semibold">What it provides</th>
              <th className="px-3 py-2.5 font-semibold">Class</th>
              <th className="px-3 py-2.5 font-semibold">Refresh</th>
              <th className="px-3 py-2.5 font-semibold">Limitations</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.key} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-3">
                  <span className="block font-semibold text-ink-1">{s.name}</span>
                  <span className="block text-caption text-muted-1">{s.via}</span>
                  {s.status ? (
                    <span className="mt-1 block text-caption font-semibold text-muted-1">
                      {s.status}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-3 leading-relaxed text-ink-2">{s.provides}</td>
                <td className="px-3 py-3">
                  {/*
                    * The real badge, so D11 turns it into "Demo" in demo mode
                    * like every other badge in the product. A class printed as
                    * plain text here would be the one place the override does
                    * not reach.
                    */}
                  <ProvenanceBadge type={s.class} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap text-ink-2">{s.refresh}</td>
                <td className="px-3 py-3 leading-relaxed text-muted-1">{s.limitations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-4 p-[18px]">
        <h2 className="text-section text-ink-1">What Etsy does not release, and what to do instead</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {NOT_RELEASED.map((row) => (
            <li key={row.what} className="text-small leading-relaxed text-ink-2">
              {row.what} <span className="text-muted-1">→ {row.instead}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4 p-[18px]">
        <h2 className="text-section text-ink-1">Your data</h2>
        <p className="mt-2 max-w-[80ch] text-small leading-relaxed text-ink-2">
          Disconnect, export everything, or delete your shop data at any time. Customer locations
          are stored aggregated only — never individual buyers.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/settings/export"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Export &amp; deletion
          </Link>
          <Link
            href="/settings/shops"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Shop connections
          </Link>
        </div>
      </Card>

      <p className="mt-4 max-w-[80ch] text-caption leading-relaxed text-muted-1">
        {TRADEMARK_NOTICE}
      </p>
    </>
  )
}
