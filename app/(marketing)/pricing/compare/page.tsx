import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/sections'
import { BillingIntervalToggle } from '@/components/marketing/pricing-cards'
import { ContactCta } from '@/components/marketing/contact-cta'
import { billingIsOpen } from '@/lib/billing'
import { comparisonCategories, type Cell } from '@/domain/billing/plan-comparison'
import {
  CHECKOUT_REASON,
  PUBLIC_PLANS,
  checkoutState,
  intervalFromParam,
  withInterval,
  type PublicBillingInterval,
  type PublicPlan,
} from '@/domain/billing/public-plans'
import { canonical } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Compare CobaltRank Plans',
  description:
    'Every CobaltRank limit side by side: listings managed, rollback window, performance history and audit retention across Free, Basic and Pro.',
  ...canonical('/pricing/compare'),
}

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   /pricing/compare — SIXTY CELLS, NONE OF THEM TYPED BY HAND.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Every figure here is read from domain/billing/plan-comparison.ts, which
 * reads the `limits` object that the usage meter, change history, the audit
 * log and Shop Pulse all enforce. Nothing on this page is a number somebody
 * decided looked right in a grid.
 *
 * ── THE THIRD KIND OF CELL IS THE POINT ──────────────────────────────────
 *
 * Included, excluded, a limit — and "not built", which every column shows in
 * the same words when a feature does not exist on any plan. A tick in the Pro
 * column for something nobody can use is the most expensive sentence a SaaS
 * comparison table can contain, and it is almost always written by somebody
 * filling in a grid rather than reading the code. The keyword research
 * category is entirely of this kind, for two independent reasons set out in
 * the domain file.
 *
 * ── MOBILE: SCROLL, WITH THE LABELS PINNED ───────────────────────────────
 *
 * One table at every width, scrolled horizontally on a narrow screen with the
 * row-label column stuck to the left edge (styles/marketing.css). A
 * comparison table scrolled sideways with its labels gone is three columns of
 * ticks about nothing, which is the usual outcome of `overflow-x: auto` and
 * no further thought.
 *
 * The scroller carries `tabindex="0"` and a label, because a region that
 * scrolls must be reachable by keyboard — otherwise the right-hand column is
 * unreachable without a pointer. Browsers do this automatically for some
 * overflow containers and not reliably for all, so it is explicit.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>
}) {
  const { billing } = await searchParams
  const interval = intervalFromParam(billing)
  const categories = comparisonCategories()
  const providerConfigured = billingIsOpen()

  return (
    <div style={{ background: 'var(--page-bg)' }}>
      <MarketingNav />

      <main>
        <section className="px-5 pt-12 md:pt-16">
          <div className="mx-auto max-w-[1180px]">
            <Link
              href={withInterval('/pricing', interval)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
              style={{ color: 'var(--brand-strong)', minHeight: '40px' }}
            >
              <span aria-hidden>←</span> Back to Pricing
            </Link>

            <h1
              className="display mt-3 text-[32px] leading-[1.08] md:text-[42px]"
              style={{ color: 'var(--ink-1)' }}
            >
              Compare CobaltRank Plans
            </h1>
            <p
              className="mt-3 max-w-[52ch] text-[15px] leading-relaxed"
              style={{ color: 'var(--ink-2)' }}
            >
              Find the tools and limits that fit your shop.
            </p>

            <div className="mt-8 flex justify-start">
              <BillingIntervalToggle interval={interval} path="/pricing/compare" />
            </div>
          </div>
        </section>

        <section className="px-5 py-12">
          {/*
            * ── THE SCROLLER IS MOBILE-ONLY, AND THE STICKY HEADER IS WHY ──
            *
            * `overflow-x: auto` makes this element a scroll container on BOTH
            * axes — the spec computes `overflow-y: visible` to `auto` the
            * moment the other axis is not visible — and a `position: sticky`
            * descendant sticks to its nearest scroll container rather than to
            * the viewport. So with the scroller on at every width, the plan
            * names stuck 64px below the TABLE's top instead of below the site
            * header, and sat on top of the first category row: the keyword
            * category's heading and its note were covered at rest, before any
            * scrolling at all. Caught in a screenshot, not reasoned about.
            *
            * From `md` up the table fits — 720px of content in a 1180px
            * column — so there is nothing to scroll and the container is not
            * needed. Below `md` the scroller is on and the sticky header rule
            * is off (it is inside its own min-width query), so the two are
            * never in force together.
            */}
          {/*
            * ── `relative` IS LOAD-BEARING, AND IT COST AN HOUR TO FIND ────
            *
            * Every cell in this table carries an `sr-only` span — "Rollback
            * window: included in Pro" — because a tick announced on its own
            * tells a screen reader nothing about which row it is on. `sr-only`
            * is `position: absolute`.
            *
            * An absolutely positioned element is clipped by an ancestor's
            * `overflow` ONLY IF that ancestor is itself positioned. This
            * wrapper was static, so sixty-odd of those spans — whose static
            * positions are spread across a 720px-wide table — escaped the
            * scroller entirely and extended the DOCUMENT's scroll area. The
            * page scrolled 302px sideways at 390px wide.
            *
            * None of the usual diagnostics find it: `document.body.scrollWidth`
            * reads 390, and a sweep for elements whose bounding box exceeds
            * the viewport returns nothing, because every one of them is inside
            * something that *looks* like it clips. It was found by hiding the
            * table and watching the overflow disappear.
            */}
          <div
            className="relative mx-auto max-w-[1180px] overflow-x-auto md:overflow-x-visible"
            tabIndex={0}
            role="region"
            aria-label="Plan comparison, scrollable"
            style={{ borderRadius: 'var(--card-radius)' }}
          >
            <table
              className="compare-table w-full border-collapse text-left"
              style={{ minWidth: '720px' }}
            >
              <caption className="sr-only">
                Every CobaltRank feature and limit across the Free, Basic and Pro plans. Features
                that are not built yet say so in every column.
              </caption>

              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-[34%] border-b px-4 py-4 align-bottom text-[12px] font-semibold"
                    style={{ borderColor: 'var(--border-strong)', color: 'var(--muted-1)' }}
                  >
                    Feature
                  </th>
                  {PUBLIC_PLANS.map((plan) => (
                    <PlanHeader
                      key={plan.id}
                      plan={plan}
                      interval={interval}
                      providerConfigured={providerConfigured}
                    />
                  ))}
                </tr>
              </thead>

              {categories.map((category) => (
                <tbody key={category.name}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={1 + PUBLIC_PLANS.length}
                      className="border-y px-4 py-3 text-left"
                      style={{
                        borderColor: 'var(--border)',
                        background: 'var(--brand-tint)',
                      }}
                    >
                      <span
                        className="mono block text-[11px] font-semibold uppercase tracking-[0.08em]"
                        style={{ color: 'var(--brand-strong)' }}
                      >
                        {category.name}
                      </span>
                      {category.note ? (
                        <span
                          className="mt-1 block max-w-[84ch] text-[11.5px] font-normal leading-snug"
                          style={{ color: 'var(--ink-2)' }}
                        >
                          {category.note}
                        </span>
                      ) : null}
                    </th>
                  </tr>

                  {category.rows.map((row) => (
                    <tr key={row.label} className="border-b" style={{ borderColor: 'var(--border)' }}>
                      <th
                        scope="row"
                        className="px-4 py-3 text-left text-[13.5px] font-medium"
                        style={{ color: 'var(--ink-1)' }}
                      >
                        {row.label}
                        {row.note ? (
                          <span
                            className="mt-0.5 block max-w-[46ch] text-[11.5px] font-normal leading-snug"
                            style={{ color: 'var(--muted-1)' }}
                          >
                            {row.note}
                          </span>
                        ) : null}
                      </th>
                      {row.cells.map((cell, index) => (
                        <td
                          key={PUBLIC_PLANS[index]?.id ?? index}
                          className="px-4 py-3 text-center align-middle"
                        >
                          <CellValue cell={cell} plan={PUBLIC_PLANS[index]?.name ?? ''} row={row.label} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}

              <tfoot>
                <tr>
                  <td className="px-4 py-5" />
                  {PUBLIC_PLANS.map((plan) => (
                    <td key={plan.id} className="px-4 py-5 text-center align-top">
                      <PlanCta
                        plan={plan}
                        interval={interval}
                        providerConfigured={providerConfigured}
                      />
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          <p
            className="mx-auto mt-6 max-w-[1180px] text-[12px] leading-relaxed"
            style={{ color: 'var(--muted-1)' }}
          >
            Every limit above is read from the entitlements this product enforces — the same
            numbers that cap the usage meter, size the rollback window and set how far Shop Pulse
            looks back. A row marked <strong style={{ color: 'var(--ink-2)' }}>not built</strong> is
            not available on any plan, including Pro.
          </p>
        </section>

        <ContactCta />
      </main>

      <MarketingFooter />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────── the pieces */

function PlanHeader({
  plan,
  interval,
  providerConfigured,
}: {
  plan: PublicPlan
  interval: PublicBillingInterval
  providerConfigured: boolean
}) {
  const price = plan.price[interval]

  return (
    <th
      scope="col"
      className="w-[22%] border-b px-4 py-4 text-center align-bottom"
      style={{
        borderColor: plan.featured ? 'var(--brand)' : 'var(--border-strong)',
        borderBottomWidth: plan.featured ? '2px' : '1px',
      }}
    >
      <span className="display block text-[18px]" style={{ color: 'var(--ink-1)' }}>
        {plan.name}
      </span>
      {price.state === 'SET' ? (
        <span className="figure mt-1 block text-[20px] font-semibold" style={{ color: 'var(--ink-1)' }}>
          ${price.amount}
          <span className="text-[11px] font-normal" style={{ color: 'var(--muted-1)' }}>
            {interval === 'ANNUAL' ? '/yr' : '/mo'}
          </span>
        </span>
      ) : (
        <span className="mt-1 block text-[12px] font-normal leading-snug" style={{ color: 'var(--muted-1)' }}>
          Price to be confirmed
        </span>
      )}
      {!providerConfigured ? (
        <span className="mt-1 block text-[10.5px] font-normal" style={{ color: 'var(--muted-2)' }}>
          Not purchasable yet
        </span>
      ) : null}
    </th>
  )
}

function PlanCta({
  plan,
  interval,
  providerConfigured,
}: {
  plan: PublicPlan
  interval: PublicBillingInterval
  providerConfigured: boolean
}) {
  const state = checkoutState(plan, interval, { providerConfigured })

  if (state === 'FREE_SIGNUP') {
    return (
      <Link
        href="/signup"
        className="plan-cta inline-flex items-center justify-center gap-1.5 px-4 text-[13.5px] font-semibold"
        style={{
          minHeight: '44px',
          background: 'var(--brand)',
          color: 'var(--on-brand)',
          borderRadius: 'var(--paper-radius)',
        }}
      >
        {plan.cta}
        <span aria-hidden className="plan-cta-arrow">
          →
        </span>
      </Link>
    )
  }

  return (
    <>
      <button
        type="button"
        disabled
        aria-describedby={`compare-${plan.id}-reason`}
        className="inline-flex items-center justify-center px-4 text-[13.5px] font-semibold"
        style={{
          minHeight: '44px',
          background: 'var(--canvas-soft)',
          color: 'var(--muted-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--paper-radius)',
          cursor: 'not-allowed',
        }}
      >
        {plan.cta}
      </button>
      <span
        id={`compare-${plan.id}-reason`}
        className="mt-2 block text-[11px] leading-snug"
        style={{ color: 'var(--muted-1)' }}
      >
        {CHECKOUT_REASON[state]}
      </span>
    </>
  )
}

/*
 * One cell.
 *
 * The visible mark is `aria-hidden` and every cell carries a sentence for a
 * screen reader instead, naming the plan and the feature. A table read cell by
 * cell announces "✓" with no context otherwise, and a reader who has navigated
 * down a column has no idea which row they are on.
 */
function CellValue({ cell, plan, row }: { cell: Cell; plan: string; row: string }) {
  if (cell.kind === 'LIMIT') {
    return (
      <span className="figure text-[13px]" style={{ color: 'var(--ink-1)' }}>
        {cell.value}
      </span>
    )
  }

  if (cell.kind === 'NOT_BUILT') {
    return (
      <>
        <span
          aria-hidden
          className="mono text-[10.5px] uppercase tracking-[0.06em]"
          style={{ color: 'var(--warning-ink)' }}
        >
          Not built
        </span>
        <span className="sr-only">{`${row}: not available on ${plan}, or on any plan`}</span>
      </>
    )
  }

  if (cell.kind === 'INCLUDED') {
    return (
      <>
        <span
          aria-hidden
          className="inline-grid h-[22px] w-[22px] place-items-center text-[11px] font-bold"
          style={{
            background: 'var(--success-surface)',
            color: 'var(--success)',
            borderRadius: '9999px',
          }}
        >
          ✓
        </span>
        <span className="sr-only">{`${row}: included in ${plan}`}</span>
      </>
    )
  }

  return (
    <>
      <span aria-hidden className="text-[14px]" style={{ color: 'var(--muted-2)' }}>
        —
      </span>
      <span className="sr-only">{`${row}: not included in ${plan}`}</span>
    </>
  )
}
