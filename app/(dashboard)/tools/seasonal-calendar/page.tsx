import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { getSeasonalCalendar, MONTH_INITIALS } from '@/domain/seasonal/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import type { Confidence } from '@/lib/provenance/types'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Seasonal calendar' }

const CONFIDENCE_FILL: Record<Confidence, { bg: string; border: string; fg: string }> = {
  HIGH: { bg: 'var(--success-surface)', border: 'var(--success-border)', fg: 'var(--success-ink)' },
  MODERATE: {
    bg: 'var(--warning-surface)',
    border: 'var(--warning-border)',
    fg: 'var(--warning-ink)',
  },
  LOW: { bg: 'var(--canvas-soft)', border: 'var(--border)', fg: 'var(--muted-1)' },
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  HIGH: 'High confidence',
  MODERATE: 'Moderate confidence',
  LOW: 'Low confidence',
}

/*
 * Seasonal calendar (artboard 99).
 *
 * This ships on thin history because the confidence field is allowed to say so.
 * Every window is ESTIMATED, every one carries the basis it rests on, and the
 * demo shop's four months of orders produce three LOW-confidence windows whose
 * cards explain exactly why — rather than three windows that look measured.
 *
 * Windows are planning guidance, never a forecast. Nothing here says what will
 * happen; the dates say when the prep window closes if the pattern holds.
 */
export default async function SeasonalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const query = await searchParams
  const ctx = shopContext(session, session.shopId)
  const view = await getSeasonalCalendar(ctx, query)

  return (
    <>
      <PageHeader
        title="Seasonal calendar"
        subtitle={`${view.market} · ${view.year} · when to prepare, drawn from your own order history and public category seasonality`}
      />

      {view.empty ? (
        <EmptyState
          title="No seasonal windows yet"
          description="Windows are drawn from your own order history and the category the listings sit in. With no listings and no orders there is nothing to draw them from — and a calendar of generic dates would be a guess with a grid around it."
          action={
            <Link
              href="/settings/shops"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Connect a shop
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {view.windows.map((window) => {
            const fill = CONFIDENCE_FILL[window.confidence]
            return (
              <Card key={window.id} className="flex flex-col gap-3 p-[18px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-section text-ink-1">{window.name}</h2>
                    <p className="text-caption text-muted-1">
                      Prepare {window.prepareFrom} – {window.prepareTo} · listings live by{' '}
                      {window.liveBy} · peak {window.peakFrom} – {window.peakTo}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ProvenanceBadge type="ESTIMATED" demo={session.isDemo} />
                    <span
                      className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: fill.bg, borderColor: fill.border, color: fill.fg }}
                    >
                      {CONFIDENCE_LABEL[window.confidence]}
                    </span>
                  </div>
                </div>

                {/*
                 * The strip is a locator, not the data. Every month is labelled
                 * and the covered ones are named in the caption, so the window
                 * is never carried by fill colour alone (artboard 89).
                 */}
                <div className="flex gap-1" role="img" aria-label={monthsLabel(window.months)}>
                  {MONTH_INITIALS.map((initial, index) => (
                    <span
                      key={`${window.id}-${index}`}
                      aria-hidden
                      className={cn(
                        'flex h-7 flex-1 items-center justify-center rounded-[4px] text-[10px] font-semibold',
                        window.months.includes(index)
                          ? 'bg-brand text-brand-on'
                          : 'bg-canvas-soft text-muted-2',
                      )}
                    >
                      {initial}
                    </span>
                  ))}
                </div>

                <p className="max-w-prose text-small leading-relaxed text-ink-2">{window.basis}</p>

                <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                  <Link
                    href={`/research/keywords?q=${encodeURIComponent(window.name)}`}
                    className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
                  >
                    Research keywords
                  </Link>
                  <Link
                    href="/listings"
                    className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
                  >
                    Prepare listings
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <p className="mt-4 max-w-prose text-caption leading-relaxed text-muted-1">
        Windows are drawn from your own order history plus public category seasonality. They are
        planning guidance, not a forecast, and each is labelled with the confidence the underlying
        history supports — this shop has{' '}
        <span className="tnum">{view.historyMonths}</span> months of it, which is why nothing here
        reads higher than it does. A seasonal claim is a claim about a repeating pattern, and one
        season cannot show a repeat.
      </p>
    </>
  )
}

/** "Covers August to December" — the strip's meaning, in words. */
function monthsLabel(months: number[]): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const first = months[0]
  const last = months[months.length - 1]
  if (first === undefined || last === undefined) return 'No months covered'
  return first === last
    ? `Covers ${names[first]}`
    : `Covers ${names[first]} to ${names[last]}`
}
