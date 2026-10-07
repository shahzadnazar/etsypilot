'use client'

import { useMemo, useState } from 'react'
import type { Action, ActionFilter } from '@/domain/action-center/types'
import type { ShopDataSource } from '@/domain/sync/source'
import { FILTER_LABEL, matchesFilter } from '@/domain/action-center/types'
import { EmptyState } from '@/components/ui/states'
import { cn } from '@/lib/utils/cn'
import { ActionCard } from './action-card'

const FILTERS: ActionFilter[] = ['OPEN', 'DONE', 'DISMISSED']

/*
 * The Action Center list.
 *
 * Filter chips carry their counts, so the record is legible before you click
 * into it. Each filter has its own empty state - "nothing dismissed" and
 * "nothing needs attention" mean very different things and should not share
 * copy.
 */
export function ActionList({
  actions,
  counts,
  demo,
  source,
}: {
  actions: Action[]
  counts: Record<ActionFilter, number>
  demo: boolean
  /** Where the orders behind these actions came from. */
  source: ShopDataSource
}) {
  const [filter, setFilter] = useState<ActionFilter>('OPEN')
  const visible = useMemo(() => actions.filter((a) => matchesFilter(a, filter)), [actions, filter])

  /*
   * ══════════════════════════════════════════════════════════════════════
   *   "NOTHING NEEDS YOUR ATTENTION" IS THE MOST DANGEROUS EMPTY STATE IN
   *   THIS PRODUCT, AND IT WAS BEING SHOWN TO SHOPS NOBODY HAD READ.
   * ══════════════════════════════════════════════════════════════════════
   *
   * The copy below is specific and reassuring — "No listing is selling below
   * cost, your cost coverage is complete, and nothing has crossed your
   * baseline" — three positive claims, every one of them unverifiable for a
   * shop whose orders have never been synced. The whole filter row is dropped
   * too: counts of zero across three tabs is the same reassurance in numbers.
   *
   * No chips, no tabs, one honest sentence and the way to fix it.
   */
  if (source.kind === 'NOT_SYNCED' || source.kind === 'NO_SHOP') {
    return (
      <EmptyState
        title={source.kind === 'NO_SHOP' ? 'This shop could not be found' : 'Not synced yet'}
        description={
          source.kind === 'NO_SHOP'
            ? 'The shop this page was opened for is no longer in EtsyPilot. Nothing is wrong with your shop on Etsy.'
            : 'EtsyPilot has not read your orders yet, so it cannot say what needs your attention — and it will not tell you that nothing does. Once a sync runs, every finding appears here with its evidence.'
        }
      />
    )
  }

  return (
    <>
      <div role="tablist" aria-label="Filter actions" className="mb-3.5 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-control px-3 py-1.5 text-[11.5px] font-semibold transition-colors duration-150',
                active
                  ? 'bg-brand-tint text-brand-strong'
                  : 'border border-line text-ink-2 hover:bg-canvas-soft',
              )}
            >
              {FILTER_LABEL[f]} · <span className="tnum">{counts[f]}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState {...EMPTY_COPY[filter]} />
      ) : (
        <div role="tabpanel" className="flex flex-col gap-2.5">
          {visible.map((action) => (
            <ActionCard key={action.id} action={action} demo={demo} />
          ))}
        </div>
      )}

      <p className="mt-4 rounded-card border border-line bg-canvas-soft p-4 text-small leading-relaxed text-ink-2">
        No dead-end alerts. Every card names its evidence and goes somewhere — dismissed items
        keep their reason and can be restored, so the list is a record rather than a queue that
        empties into nothing.
      </p>
    </>
  )
}

const EMPTY_COPY: Record<ActionFilter, { title: string; description: string }> = {
  OPEN: {
    title: 'Nothing needs your attention',
    description:
      'No listing is selling below cost, your cost coverage is complete, and nothing has crossed your baseline. New actions appear here as EtsyPilot observes them.',
  },
  DONE: {
    title: 'Nothing completed yet',
    description:
      'Actions you finish move here with the operation that closed them and, once there is enough data, what measurably changed afterwards.',
  },
  DISMISSED: {
    title: 'Nothing dismissed',
    description:
      'Actions you dismiss are kept here with the reason you gave, and can be restored at any time.',
  },
}
