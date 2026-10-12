'use client'

import { useMemo, useState } from 'react'
import type { Action, ActionFilter } from '@/domain/action-center/types'
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
 *
 * ── THE WITHHOLDING MOVED OUT OF HERE, AND HAD TO ─────────────────────────
 *
 * This component used to decide for itself whether the orders behind the
 * actions had been read, because "nothing needs your attention" is the most
 * dangerous empty state in the product and was being shown to shops nobody
 * had read. The decision is still made — it is just made by the two SERVER
 * pages that render this list, through components/sync/data-withheld.tsx.
 *
 * It had to move. This file is a client component, and the withheld state now
 * has to know Etsy's display windows and carry the control that re-reads the
 * shop. Importing domain/sync/source.ts here would pull a `server-only` module
 * into the browser bundle. Deciding on the server is also strictly better: a
 * withheld Action Center no longer costs an AI recommendation on the way to
 * being withheld.
 */
export function ActionList({
  actions,
  counts,
  demo,
}: {
  actions: Action[]
  counts: Record<ActionFilter, number>
  demo: boolean
}) {
  const [filter, setFilter] = useState<ActionFilter>('OPEN')
  const visible = useMemo(() => actions.filter((a) => matchesFilter(a, filter)), [actions, filter])

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
          {/*
            * ── THE CHIP IS A RANK IN THIS LIST, NOT AN INTERNAL FIELD ─────
            *
            * It rendered `action.priority` straight through. That field orders
            * the queue and its values are whatever the generators chose —
            * 0,1,2,3 for Shop Pulse findings and 10..13 for the rest. With the
            * four authored cards gone, a live shop with one real action showed
            * a single card chipped "11", which reads as eleventh of a list of
            * one. The rank a reader can check is the position on the screen.
            */}
          {visible.map((action, index) => (
            <ActionCard key={action.id} action={action} rank={index + 1} demo={demo} />
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
  /*
   * ── AN EMPTY QUEUE IS A CLAIM, AND THIS SENTENCE IS THE CLAIM ───────────
   *
   * "Nothing has crossed your baseline" implies a baseline that exists and was
   * checked. A shop without enough order history to baseline anything has not
   * been checked — and Shop Pulse keeps findings it could not measure, which
   * the Action Center deliberately does not turn into work. So the last clause
   * names what was actually established and points at the screen holding the
   * rest, rather than reporting an all-clear on a test that did not run.
   */
  OPEN: {
    title: 'Nothing needs your attention',
    description:
      'No listing with a confirmed cost is selling below it, and every active listing has a cost. Anything CobaltRank observed but could not measure is on Shop Pulse rather than here — this queue is work, not everything that happened.',
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
