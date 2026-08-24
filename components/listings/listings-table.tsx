import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Money, NumericCell } from '@/components/ui/numeric'
import { PAGE_SIZE, type ListingsView } from '@/domain/listings/service'
import { healthLabel, STATUS_LABEL, type ListingStatus, type HealthKind } from '@/domain/listings/types'
import { formatDate, formatPercent, formatRelative } from '@/lib/utils/format'
import { cn } from '@/lib/utils/cn'

/*
 * The listings manager's table (artboard 36).
 *
 * Two columns carry a claim rather than a fact, and both are named in the
 * footnote the artboard specifies: SEO health, which is this product's own rule
 * set rather than Etsy's opinion, and Margin, which is null wherever no
 * confirmed cost exists.
 *
 * No Views column, deliberately. Etsy does not expose per-listing views, and a
 * column of dashes across 404 rows would be an accusation aimed at the wrong
 * party — the footnote says it once instead.
 */

const STATUS_FILL: Record<ListingStatus, { bg: string; border: string; fg: string }> = {
  ACTIVE: { bg: 'var(--success-surface)', border: 'var(--success-border)', fg: 'var(--success-ink)' },
  EXPIRING: { bg: 'var(--warning-surface)', border: 'var(--warning-border)', fg: 'var(--warning-ink)' },
  DRAFT: { bg: 'var(--canvas-soft)', border: 'var(--border)', fg: 'var(--ink-2)' },
  EXPIRED: { bg: 'var(--danger-surface)', border: 'var(--danger-border)', fg: 'var(--danger-ink)' },
  INACTIVE: { bg: 'var(--canvas-soft)', border: 'var(--border)', fg: 'var(--muted-1)' },
}

/** A dot AND the word. Colour never carries the meaning on its own (89). */
const HEALTH_DOT: Record<HealthKind, string> = {
  GOOD: 'var(--success)',
  NEEDS_WORK: 'var(--warning)',
  ERRORS: 'var(--danger)',
}

export function ListingsTable({ view }: { view: ListingsView }) {
  if (view.total === 0) {
    return (
      <EmptyState
        title="No listings yet"
        description="Connect a shop and sync it, and every listing appears here with its status, renewal date and cost coverage. Nothing on this page is written back to Etsy."
        action={
          <Link
            href="/settings/shops"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Connect a shop
          </Link>
        }
      />
    )
  }

  if (view.matching === 0) {
    return (
      <EmptyState
        title="No listing matches these filters"
        description={`All ${view.total.toLocaleString('en-US')} listings are still here — this view is just hiding them. Clear the filters to see the catalogue.`}
        action={
          <Link
            href="/listings"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Clear filters
          </Link>
        }
      />
    )
  }

  const from = (view.page - 1) * PAGE_SIZE + 1
  const to = from + view.rows.length - 1

  return (
    <div className="flex flex-col gap-3">
      <Card
        tabIndex={0}
        role="region"
        aria-label="Listings, scrolls horizontally"
        className="overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <table className="w-full min-w-[1000px] border-collapse text-body">
          <caption className="sr-only">
            Listings {from} to {to} of {view.matching} matching, from {view.total} in the shop.
            Listing fields are verified from your connected shop; margin is calculated.
          </caption>
          <thead>
            <tr className="bg-canvas-soft text-left text-label text-muted-1">
              <th scope="col" className="px-4 py-2.5 font-semibold">Listing</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Price</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Qty</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Variations</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Section</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">Renews</th>
              <th scope="col" className="px-3 py-2.5 font-semibold">SEO health</th>
              <th scope="col" className="px-3 py-2.5 text-right font-semibold">Margin</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">Last changed</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => {
              const fill = STATUS_FILL[row.status]
              return (
                <tr key={row.etsyListingId} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <span className="block text-small font-medium text-ink-1">{row.title}</span>
                    <span className="tnum mt-0.5 block text-caption text-muted-2">
                      {row.sku ? `SKU ${row.sku} · ` : ''}
                      {row.tagCount} {row.tagCount === 1 ? 'tag' : 'tags'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: fill.bg, borderColor: fill.border, color: fill.fg }}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <NumericCell className="text-ink-2">
                    <Money value={row.price} currency={view.currency} />
                  </NumericCell>
                  <NumericCell className="text-ink-2">
                    {row.quantity === null ? (
                      <>
                        <span aria-hidden>∞</span>
                        <span className="sr-only">Unlimited — this is a digital listing</span>
                      </>
                    ) : (
                      row.quantity.toLocaleString('en-US')
                    )}
                  </NumericCell>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {row.variationSummary ??
                      (row.hasVariations ? (
                        <span title="Etsy reports that this listing has variations; the list itself is a separate call">
                          Yes
                        </span>
                      ) : (
                        <span className="text-muted-1">None</span>
                      ))}
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {row.section ?? <span className="text-muted-1">No section</span>}
                  </td>
                  <td className="px-3 py-3 text-small text-ink-2">
                    {row.renewsAt ? (
                      formatDate(row.renewsAt)
                    ) : (
                      <>
                        <span aria-hidden className="text-muted-1">
                          —
                        </span>
                        <span className="sr-only">Not renewing — this listing is not active</span>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex items-center gap-1.5 text-small text-ink-2">
                      <span
                        aria-hidden
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: HEALTH_DOT[row.health.kind] }}
                      />
                      {healthLabel(row.health)}
                    </span>
                  </td>
                  <NumericCell className={cn(row.margin !== null && row.margin < 0 && 'text-danger')}>
                    {row.margin === null ? (
                      <>
                        <span aria-hidden className="text-muted-1">
                          —
                        </span>
                        <span className="sr-only">
                          No confirmed cost for this listing, so no margin is computed
                        </span>
                      </>
                    ) : (
                      formatPercent(row.margin, 0)
                    )}
                  </NumericCell>
                  <td className="px-4 py-3 text-small text-muted-1">
                    {formatRelative(row.lastChangedAt, new Date(view.now))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tnum text-caption text-muted-1">
          Showing {from.toLocaleString('en-US')}–{to.toLocaleString('en-US')} of{' '}
          {view.matching.toLocaleString('en-US')}
          {view.matching !== view.total
            ? ` matching · ${view.total.toLocaleString('en-US')} in the shop`
            : ''}
        </p>
        <nav aria-label="Pages" className="flex items-center gap-2">
          <PageLink view={view} to={view.page - 1} label="Prev" disabled={view.page <= 1} />
          <span className="tnum text-caption text-muted-1">
            Page {view.page} of {view.pageCount}
          </span>
          <PageLink
            view={view}
            to={view.page + 1}
            label="Next"
            disabled={view.page >= view.pageCount}
          />
        </nav>
      </div>
    </div>
  )
}

function PageLink({
  view,
  to,
  label,
  disabled,
}: {
  view: ListingsView
  to: number
  label: string
  disabled: boolean
}) {
  if (disabled) {
    return (
      <span
        aria-disabled
        className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-muted-2 md:h-[38px]"
      >
        {label}
      </span>
    )
  }
  const params = new URLSearchParams()
  if (view.filters.q) params.set('q', view.filters.q)
  if (view.filters.status !== 'ALL') params.set('status', view.filters.status)
  if (view.filters.health !== 'ALL') params.set('health', view.filters.health)
  if (view.filters.section !== 'ALL') params.set('section', view.filters.section)
  params.set('page', String(to))
  return (
    <Link
      href={`/listings?${params}`}
      className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
    >
      {label}
    </Link>
  )
}
