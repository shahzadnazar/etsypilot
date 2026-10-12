import Link from 'next/link'
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT A LIVE SELLER SEES ON A RESEARCH SCREEN: NOT BUILT, NOT BROKEN.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * These five screens were rendering a mock's output to live sellers — demand
 * bands, competitor revenue, "last observed" dates, none of which existed.
 * lib/signals/index.ts now returns no service outside demo mode, and this is
 * what stands where the figures were.
 *
 * ── IT IS AN "UNBUILT" STATE, NOT AN "UNAVAILABLE" ONE ───────────────────
 *
 * This product keeps those two apart everywhere else and it matters most
 * here:
 *
 *   UNAVAILABLE   the feature exists, this figure is missing. Etsy returned
 *                 no fee line; the sample was too thin to model. The screen
 *                 renders, with a hole in it and the reason beside it.
 *   UNBUILT       there is no source at all. Nothing was tried, nothing is
 *                 missing, and the screen should not pretend to be a screen.
 *
 * Rendering the Keyword Explorer with "Not available" in every tile would say
 * the first and mean the second — a more convincing untruth than the mock
 * was, because it would look like a working feature having a bad day.
 *
 * The vocabulary is the sidebar's: components/layout/navigation.ts carries an
 * `unbuilt` flag whose rule is "listed, not linked — the roadmap is not a
 * secret, it just stops pretending to be a destination". That flag is NOT set
 * on these items, deliberately: it means "has no page file", it is asserted
 * against the filesystem in both directions, and these pages exist. What is
 * reused is the idea and the wording, at the level where it is true.
 *
 * ── WHY IT NAMES THE DEMO ────────────────────────────────────────────────
 *
 * The sample data is real work and it is reachable: the public demo shows
 * exactly what this screen will look like. Pointing at it is more useful than
 * a flat "coming soon", and it is the one place the figures can be shown
 * without a claim being made about them.
 */
export function ResearchNotBuilt({
  title,
  what,
  needs,
  missing = 'data source',
  figures = true,
}: {
  /** The screen's own title, so the page reads as itself and not as an error. */
  title: string
  /** What this screen would show, in a few words. "Keyword demand and competition". */
  what: string
  /*
   * What is missing, where it is not a market-data source.
   *
   * Four of the five screens are missing the same thing and say so from the
   * default. Keyword Lists is missing a STORE, and printing "needs a
   * market-data source" on a screen that needs no figures at all would be a
   * small untruth of exactly the kind this component exists to stop.
   */
  needs?: ReactNode
  /** What is absent, named in the subtitle. "data source" for four of five. */
  missing?: string
  /*
   * False on the one screen that has no figures on it.
   *
   * Keyword Lists holds terms, not numbers, so "there is no source for these
   * figures" and "rather than show you a number we modelled" would both be
   * about something that was never on the screen. Its own panel has said "there
   * are no figures on this page" since it was written; this keeps that true in
   * the state the page falls back to.
   */
  figures?: boolean
}) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={`Not built yet — there is no ${missing} behind this screen`}
      />

      <Card className="max-w-[72ch] p-[18px]">
        <h2 className="text-section text-ink-1">
          {figures
            ? 'There is no source for these figures yet'
            : 'There is nothing behind this screen yet'}
        </h2>
        <p className="mt-2 text-small leading-relaxed text-ink-2">
          {needs ?? (
            <>
              {what} would need a market-data source, and CobaltRank does not have one. Etsy
              publishes no search volume, no competitor sales and no product-level figures to
              anyone, through its API or otherwise — so these figures would have to come from
              somewhere else, and nothing is connected.
            </>
          )}
        </p>
        <p className="mt-2 text-small leading-relaxed text-ink-2">
          {figures
            ? 'Rather than show you a number we modelled and hope you read the badge, this screen shows you nothing.'
            : 'Rather than show you lists nobody saved, this screen shows you nothing.'}{' '}
          It is the same rule as everywhere else in the product:{' '}
          <strong>no estimate dressed as a measurement.</strong>
        </p>
        <p className="mt-2 text-caption leading-relaxed text-muted-1">
          The screen is built and the sample data is real work — you can see exactly what it will
          look like in the public demo, where everything on it is sample data and the screen says
          so. What is missing is a source that is honest to use.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/data/sources"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            What CobaltRank does have
          </Link>
          <Link
            href="/data/methodology"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            How every figure is classified
          </Link>
        </div>
      </Card>
    </>
  )
}
