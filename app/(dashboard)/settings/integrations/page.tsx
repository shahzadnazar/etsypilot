import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { dataSources, NOT_RELEASED } from '@/domain/data-sources/service'
import { getSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Integrations' }

/*
 * Integrations.
 *
 * The one item on the settings rail with no artboard behind it, so this is
 * built from what the product actually connects to rather than from a drawing:
 * the same source list Data Sources renders, each with its live status read
 * from its own adapter.
 *
 * That constraint is the reason this page is honest. There is no seed list of
 * "integrations coming soon" here — a row exists because an adapter exists, and
 * its status is whatever that adapter reports.
 */
export default async function IntegrationsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Not shop-scoped: the source list is about the product, not about a shop.
  const sources = dataSources()

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Everything EtsyPilot connects to, what it reads, and whether it is connected right now."
      />

      <div className="flex flex-col gap-3">
        {sources.map((source) => (
          <Card key={source.name} className="flex flex-col gap-2 p-[18px]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-section text-ink-1">{source.name}</h2>
                <span className="text-caption text-muted-1">
                  {source.via}
                  {source.status ? ` · ${source.status}` : ''}
                </span>
              </div>
              <ProvenanceBadge type={source.class} demo={session.isDemo} />
            </div>
            <p className="max-w-prose text-small leading-relaxed text-ink-2">{source.provides}</p>
            <p className="max-w-prose text-caption leading-relaxed text-muted-1">
              <strong className="font-semibold">Cannot tell you:</strong> {source.limitations}
            </p>
          </Card>
        ))}
      </div>

      {NOT_RELEASED.length > 0 ? (
        <Card className="mt-4 flex flex-col gap-2 p-[18px]">
          <h2 className="text-label text-muted-1">Not available from Etsy at all</h2>
          <p className="max-w-prose text-caption leading-relaxed text-muted-1">
            These are not integrations EtsyPilot has not built. They are data Etsy does not release
            to anyone, so no integration can produce them — and any tool that shows them is
            modelling, whether it says so or not.
          </p>
          <ul className="flex flex-col gap-1.5">
            {NOT_RELEASED.map((item) => (
              <li key={item.what} className="text-caption leading-relaxed text-ink-2">
                <span className="font-semibold">{item.what}</span> — {item.instead}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/settings/shops"
          className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
        >
          Shop connections
        </Link>
        <Link
          href="/settings/extension"
          className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
        >
          Browser extension
        </Link>
        <Link
          href="/data/sources"
          className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
        >
          Data sources in detail
        </Link>
      </div>
    </>
  )
}
