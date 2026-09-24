import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

/*
 * The one table in the operator console.
 *
 * Six pages wrote this wrapper out by hand — accounts, managers, audit,
 * permissions, Etsy connections and subscriptions — and it is not a wrapper
 * anyone should be writing from memory.
 *
 * ── `relative` IS LOAD-BEARING, AND IT WAS REMEMBERED IN SIX PLACES ───────
 *
 * MEASURED at 390 and 768 (commit 81852ac): the accounts page scrolled
 * SIDEWAYS as a whole, 778px of document in a 390px viewport, while the table
 * inside its own scroll container behaved perfectly. The cause is the sr-only
 * spans in the rows — "open account detail", "for <email>". Tailwind's
 * `sr-only` is position:absolute, and an absolutely positioned element is only
 * clipped by an overflow ancestor that is ALSO ITS CONTAINING BLOCK. With no
 * positioned ancestor between them and the root, those 1px spans sat at x=777
 * in the document and dragged the page's scroll width out with them.
 *
 * Making the scroll container positioned gives them a containing block that
 * clips. Nothing about the announcement changes: still in the accessibility
 * tree, still read, still invisible.
 *
 * A fix remembered in six places is a fix that will be forgotten in the
 * seventh, and it is invisible at 1440 — which is the D56 argument in one
 * sentence. It lives here now, in the component every operator table goes
 * through, and a test asserts there is no other <table under app/(admin).
 *
 * ── WHY A SCROLL REGION RATHER THAN A RESPONSIVE COLLAPSE ─────────────────
 *
 * These tables compare accounts to one another: a row per account, the same
 * column in the same place. Reflowing them into stacked cards on a phone
 * keeps every value on screen and destroys the comparison, which is the whole
 * reason they are tables. So they scroll — and the container is focusable,
 * labelled and announced as a region, because a scroll container that cannot
 * be reached from the keyboard is content a keyboard user cannot read.
 */
export function OperatorTable({
  /** Announced on the region. "Accounts" gives "Accounts, scrolls horizontally". */
  label,
  /**
   * The sr-only <caption>: what this table is OF, in a sentence.
   *
   * Required, not optional. It is the thing a screen-reader user hears before
   * the columns, and an optional prop is one a hurried copy-paste omits.
   */
  caption,
  /**
   * The width below which the table scrolls instead of squashing.
   *
   * Explicit per table because the honest value depends on the columns — it
   * was hand-picked six times as 720, 760, 820, 860, 860 and 900, and those
   * numbers were right. What was wrong was the twenty characters of scroll
   * plumbing copied alongside each of them.
   */
  minWidth,
  /** `border-0` on the pages that nest this inside another Card. */
  borderless = false,
  children,
}: {
  label: string
  caption: ReactNode
  minWidth: number
  borderless?: boolean
  children: ReactNode
}) {
  return (
    <Card
      tabIndex={0}
      role="region"
      aria-label={`${label}, scrolls horizontally`}
      className={`relative w-full max-w-full overflow-x-auto${
        borderless ? ' border-0' : ''
      } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
    >
      <table className="w-full border-collapse text-body" style={{ minWidth: `${minWidth}px` }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </Card>
  )
}
