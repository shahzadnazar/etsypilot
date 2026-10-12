import type { ReactNode } from 'react'

import { EmptyState } from '@/components/ui/states'
import { formatRelative } from '@/lib/utils/format'
import { windowHours } from '@/lib/etsy/freshness'
import { refreshWouldHelp, withheldReason, type ShopDataSource } from '@/domain/sync/source'
import { RefreshTrigger } from './refresh-trigger'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ONE PLACE A SELLER IS TOLD WHY A SCREEN IS NOT SHOWING FIGURES.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Five pages and three components each had their own version of this, testing
 * `source.kind` inline against two string literals. Adding STALE to the union
 * would have meant eight edits, and the cost of missing one is the worst
 * failure this product has: the page falls through to its ordinary render, the
 * loader has already withheld the rows, and the seller reads a screen of
 * zeroes as a measurement of their shop. That is precisely the defect
 * tests/browser/reporting-window.py was written for, arriving by a new route.
 *
 * So the branch is here, and tests/unit/freshness-window.test.ts fails on any
 * surface in app/ or components/ that compares `.kind` to a freshness literal
 * of its own. A screen added next month is covered without anyone adding it to
 * a list.
 *
 * ── THE THREE REASONS ARE NOT THE SAME SENTENCE ───────────────────────────
 *
 *   NEVER_SYNCED  "we have not read your shop yet." Each page says what it
 *                 would compute from, because the thing missing differs:
 *                 receipts for profit, a baseline for Shop Pulse. That is the
 *                 `neverSynced` prop, and it is the only per-screen copy left.
 *   STALE         "what we hold is older than Etsy lets us display." One
 *                 sentence everywhere, because the reason is one rule and not
 *                 a property of the screen. It names the age and the window,
 *                 both from the same constants that enforce them.
 *   NO_SHOP       the shop row is gone. Nothing to refresh, so no trigger.
 *
 * ── AND IT IS A WITHHOLDING, NOT A BLANK ──────────────────────────────────
 *
 * "Absent is not zero" has a second half: a page that shows a blank where a
 * figure was is also a defect. So this never renders an empty area. It renders
 * a titled block that says which figures are not here, why, what is being done
 * about it, and — when it has failed — what the seller can do.
 */

/** Which Etsy content the window is about, in the seller's words. */
const NOUN: Record<string, string> = {
  LISTINGS: 'listings',
  ORDERS: 'order receipts',
}

export function DataWithheld({
  source,
  neverSynced,
  action,
  quiet = false,
}: {
  source: ShopDataSource
  /** What this screen would have computed, and from what. Per screen. */
  neverSynced: ReactNode
  action?: ReactNode
  /** Inside a card that already has its own heading. */
  quiet?: boolean
}) {
  const reason = withheldReason(source)
  if (!reason) return null

  if (reason === 'NO_SHOP') {
    return (
      <EmptyState
        quiet={quiet}
        title="This shop could not be found"
        description="The shop this page was opened for is no longer in CobaltRank. Nothing is wrong with your shop on Etsy."
        action={action}
      />
    )
  }

  const stale = source.kind === 'STALE' ? source : null
  const trigger = refreshWouldHelp(source) ? (
    <RefreshTrigger
      aggregates={stale ? [stale.aggregate] : ['LISTINGS', 'ORDERS']}
      staleAt={stale ? stale.lastSyncedAt : null}
    />
  ) : null

  /*
   * ── THE TRIGGER GOES IN `action`, NOT IN `description` ────────────────
   *
   * EmptyState renders `description` inside a <p>. The trigger renders a <p>
   * of its own, and a <div> when it has a failure to report, and a block
   * element inside a <p> is invalid markup that the HTML parser closes the
   * paragraph on — so the server's tree and the client's would disagree and
   * React would throw a hydration mismatch on exactly the screens this
   * component exists to make trustworthy. Caught by reading the component it
   * composes rather than by the browser, which recovers silently.
   */
  const footer =
    trigger || action ? (
      <div className="flex flex-col items-start gap-3">
        {trigger}
        {action}
      </div>
    ) : undefined

  if (stale) {
    const noun = NOUN[stale.aggregate] ?? 'Etsy content'
    const hours = windowHours(stale.aggregate)
    return (
      <EmptyState
        quiet={quiet}
        title="Re-reading your shop from Etsy"
        description={
          <>
            CobaltRank last read your {noun} {formatRelative(stale.lastSyncedAt)}. Etsy&rsquo;s API
            Terms do not allow an application to display {noun} more than {hours} hours older than
            Etsy&rsquo;s own, so these figures are held back until the re-read finishes — they are
            not missing, and your shop is not empty.
          </>
        }
        action={footer}
      />
    )
  }

  return (
    <EmptyState
      quiet={quiet}
      title="Not synced yet"
      description={neverSynced}
      action={footer}
    />
  )
}
