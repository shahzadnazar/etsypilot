import Link from 'next/link'
import { billingIsOpen } from '@/lib/billing'
import { TRIAL_TERMS } from '@/domain/billing/plans'
import { cardHighlights } from '@/domain/billing/plan-comparison'
import {
  CHECKOUT_REASON,
  INTERVAL_LABEL,
  PUBLIC_BILLING_INTERVALS,
  PUBLIC_PLANS,
  checkoutState,
  withInterval,
  type PublicBillingInterval,
  type PublicPlan,
} from '@/domain/billing/public-plans'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PRICING CARDS, AND THE TOGGLE THAT SHIPS NO JAVASCRIPT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Three cards, Free then Basic then Pro, and a segmented Monthly/Annually
 * control above them.
 *
 * ── THE TOGGLE IS TWO LINKS, AND THAT IS THE WHOLE IMPLEMENTATION ────────
 *
 * The obvious build is a client component holding `useState('monthly')`. It
 * would have cost a JavaScript bundle on the page whose job is to load fast,
 * and it would have failed four of the brief's own requirements for free:
 *
 *   PRESERVE THE SELECTION   React state does not survive a navigation, so
 *   ACROSS NAVIGATION        "Compare all features" would arrive on the other
 *                            page showing monthly whatever was chosen here.
 *   SUPPORT DIRECT URLs      /pricing?billing=annual has to work for a link
 *                            somebody pastes into an email.
 *   SUPPORT BACK AND         The browser's own buttons move through history
 *   FORWARD                  entries, which state changes do not create.
 *   WORK WITHOUT JS          A pricing page that renders one price and needs a
 *                            bundle to render the other is a pricing page that
 *                            shows the wrong one on a slow connection.
 *
 * A link per interval answers all four with the platform: the URL IS the
 * state, the browser's history is the state history, and every link on both
 * pages carries the choice forward through `withInterval()`.
 *
 * `role="group"` with `aria-current` on the selected link, rather than
 * radiogroup/radio. These are navigations, not form inputs: a screen reader
 * announcing "radio button, not checked" would promise that activating it
 * changes a value in place, and it does not — it loads a page.
 *
 * ── HOVER IS DECORATION, AND NOTHING DEPENDS ON IT ───────────────────────
 *
 * Lift, shadow and a brand-coloured border on hover, 200ms, plus the small
 * arrow in the button sliding. All of it is in styles/marketing.css under
 * `.plan-card`, inside a `prefers-reduced-motion: no-preference` query, and
 * none of it carries information: every price, every feature and every reason
 * a button is disabled is painted before a pointer goes near the card.
 */

export function BillingIntervalToggle({
  interval,
  path,
}: {
  interval: PublicBillingInterval
  /** The page this toggle is on, so the links stay on it. */
  path: string
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="group"
        aria-label="Billing interval"
        className="inline-flex items-center gap-1 border p-1"
        style={{
          borderColor: 'var(--border-strong)',
          background: 'var(--surface)',
          borderRadius: '9999px',
        }}
      >
        {PUBLIC_BILLING_INTERVALS.map((option) => {
          const selected = option === interval
          return (
            <Link
              key={option}
              href={withInterval(path, option)}
              /*
               * `aria-current="true"` rather than `page`: both links point at
               * the page the reader is already on, so "page" would be true of
               * both and say nothing. "true" marks the one whose state is in
               * force, which is what is being communicated.
               */
              {...(selected ? { 'aria-current': 'true' as const } : {})}
              className="inline-flex items-center px-5 text-[13.5px] font-semibold"
              style={{
                minHeight: '40px',
                borderRadius: '9999px',
                background: selected ? 'var(--brand)' : 'transparent',
                color: selected ? 'var(--on-brand)' : 'var(--ink-2)',
              }}
            >
              {INTERVAL_LABEL[option]}
            </Link>
          )
        })}
      </div>

      {/*
        * NO "SAVE 20%" BADGE, and its absence is deliberate rather than
        * pending design. A saving is a claim about two prices, and this
        * product has neither — there has never been an annual interval here,
        * so there is no discount to state and no arithmetic that could
        * produce one. The line below says what IS true.
        */}
      <p className="text-[12px]" style={{ color: 'var(--muted-1)' }}>
        {interval === 'ANNUAL'
          ? 'Annual billing is not set up yet — no annual price or discount has been approved.'
          : 'Free is free on either interval.'}
      </p>
    </div>
  )
}

export function PricingCards({ interval }: { interval: PublicBillingInterval }) {
  /*
   * Asked once, here, rather than inside each card: it reads process.env
   * through lib/billing, and three cards asking the same question three times
   * is three chances for one of them to ask a different one.
   */
  const providerConfigured = billingIsOpen()

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {PUBLIC_PLANS.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          interval={interval}
          providerConfigured={providerConfigured}
        />
      ))}
    </div>
  )
}

function PlanCard({
  plan,
  interval,
  providerConfigured,
}: {
  plan: PublicPlan
  interval: PublicBillingInterval
  providerConfigured: boolean
}) {
  const price = plan.price[interval]
  const state = checkoutState(plan, interval, { providerConfigured })
  const highlights = cardHighlights(plan)

  return (
    /*
     * `h-full` on a grid child plus `flex-col` inside, so the three cards are
     * the same height whatever their feature lists do, and the call to action
     * sits on the same line across all three — `mt-auto` on the button does
     * the rest. Equal height by layout rather than by a fixed pixel value that
     * clips the day somebody adds a seventh feature line.
     */
    <div
      className={`plan-card flex h-full flex-col border p-6${plan.featured ? ' plan-card-featured' : ''}`}
      style={{
        borderColor: plan.featured ? 'var(--brand)' : 'var(--border)',
        background: 'var(--surface)',
        borderRadius: 'var(--card-radius)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PlanMark plan={plan} />
          <h3 className="display text-[20px]" style={{ color: 'var(--ink-1)' }}>
            {plan.name}
          </h3>
        </div>
        {plan.featuredLabel ? (
          <span
            className="mono px-2 py-1 text-[9.5px] font-semibold uppercase tracking-[0.07em]"
            style={{
              background: 'var(--brand-tint)',
              color: 'var(--brand-strong)',
              borderRadius: '9999px',
            }}
          >
            {plan.featuredLabel}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-[13px] leading-snug" style={{ color: 'var(--muted-1)' }}>
        {plan.tagline}
      </p>

      {/* ── the price, or the stated absence of one ─────────────────── */}
      <div className="mt-5 min-h-[4.5rem]">
        {price.state === 'SET' ? (
          <>
            <p className="flex items-baseline gap-1.5">
              <span
                className="figure text-[38px] font-semibold leading-none"
                style={{ color: 'var(--ink-1)' }}
              >
                ${price.amount}
              </span>
              <span className="text-[13px]" style={{ color: 'var(--muted-1)' }}>
                {interval === 'ANNUAL' ? '/ year' : '/ month'}
              </span>
            </p>
            {price.amount === 0 ? (
              <p className="mt-1.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                No card, no trial to end.
              </p>
            ) : null}
          </>
        ) : (
          /*
           * A stated absence, not a blank. "Pricing coming soon" over an empty
           * box reads as a page that failed to load; the reason underneath is
           * what makes it a deliberate state a visitor can act on.
           */
          <>
            <p
              className="text-[20px] font-semibold leading-tight"
              style={{ color: 'var(--ink-2)' }}
            >
              Price to be confirmed
            </p>
            <p className="mt-1.5 text-[12px] leading-snug" style={{ color: 'var(--muted-1)' }}>
              {price.reason}
            </p>
          </>
        )}
      </div>

      {/* ── the call to action ─────────────────────────────────────── */}
      {state === 'FREE_SIGNUP' ? (
        <Link
          href="/signup"
          className="plan-cta mt-5 inline-flex items-center justify-center gap-1.5 px-4 text-[14px] font-semibold"
          style={{
            minHeight: '44px',
            background: plan.featured ? 'var(--brand)' : 'var(--surface)',
            color: plan.featured ? 'var(--on-brand)' : 'var(--brand-strong)',
            border: `1px solid ${plan.featured ? 'var(--brand)' : 'var(--border-strong)'}`,
            borderRadius: 'var(--paper-radius)',
          }}
        >
          {plan.cta}
          <span aria-hidden className="plan-cta-arrow">
            →
          </span>
        </Link>
      ) : (
        /*
         * A DISABLED BUTTON, not a link to a checkout that would fail.
         *
         * `disabled` keeps it out of the tab order and announces its state;
         * the reason sits beside it in text rather than only in a title
         * attribute, which a touch user never sees and a screen reader may
         * not read. `aria-describedby` ties the two together so the reason is
         * announced with the button rather than discovered later.
         */
        <>
          <button
            type="button"
            disabled
            aria-describedby={`${plan.id}-cta-reason`}
            className="mt-5 inline-flex items-center justify-center px-4 text-[14px] font-semibold"
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
          <p
            id={`${plan.id}-cta-reason`}
            className="mt-2 text-[11.5px] leading-snug"
            style={{ color: 'var(--muted-1)' }}
          >
            {CHECKOUT_REASON[state]}
          </p>
        </>
      )}

      {/* ── what you get ───────────────────────────────────────────── */}
      <ul className="mt-6 flex flex-col gap-2.5 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
        {highlights.map((line) => (
          <li key={line} className="flex gap-2.5 text-[13px] leading-snug" style={{ color: 'var(--ink-2)' }}>
            <span
              aria-hidden
              className="mt-px grid h-[18px] w-[18px] shrink-0 place-items-center text-[10px] font-bold"
              style={{
                background: 'var(--success-surface)',
                color: 'var(--success)',
                borderRadius: '9999px',
              }}
            >
              ✓
            </span>
            {line}
          </li>
        ))}
      </ul>

      {/*
        * `mt-auto` pushes this to the bottom of the card, so the three cards'
        * last lines sit on one baseline however long their feature lists are.
        * Without it Free — which has two highlights to Pro's five — ended with
        * a hand's width of dead space under its link.
        */}
      <p className="mt-auto pt-5 text-[11.5px]" style={{ color: 'var(--muted-2)' }}>
        <Link
          href={withInterval('/pricing/compare', interval)}
          className="underline underline-offset-2"
          style={{ color: 'var(--muted-1)' }}
        >
          Every limit for {plan.name}
        </Link>
      </p>
    </div>
  )
}

/*
 * The plan's mark. Three tinted glyphs rather than three imported icons.
 *
 * lucide-react is already a dependency and would have been the obvious
 * choice; these are inline SVG because a pricing card needs three shapes and
 * pulling three more components into the public bundle for decoration is the
 * kind of weight that is never noticed individually.
 */
function PlanMark({ plan }: { plan: PublicPlan }) {
  const tint = plan.featured ? 'var(--brand-tint)' : 'var(--canvas-soft)'
  const ink = plan.featured ? 'var(--brand-strong)' : 'var(--ink-2)'

  return (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 place-items-center"
      style={{ background: tint, color: ink, borderRadius: '10px' }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {plan.id === 'FREE' ? (
          <>
            <path d="M12 3v18" />
            <path d="M3 12h18" />
          </>
        ) : plan.id === 'BASIC' ? (
          <>
            <path d="M3 17l5-5 4 4 8-8" />
            <path d="M15 8h5v5" />
          </>
        ) : (
          <>
            <path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z" />
          </>
        )}
      </svg>
    </span>
  )
}


/* ────────────────────────────────── the same three cards, on the landing page */

/*
 * The landing page's pricing block.
 *
 * The SAME cards and the SAME toggle as /pricing, rather than a second set
 * tuned for a narrower column — two pricing tables in one product is two sets
 * of numbers to keep in step, and the one that goes stale is always the one
 * nobody is looking at.
 *
 * What it adds is the heading, the compare link and the trial terms, because
 * on `/` this is a section inside a longer argument rather than the whole
 * page.
 */
export function PricingSection({ interval }: { interval: PublicBillingInterval }) {
  return (
    <section
      id="pricing"
      className="border-t"
      style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
    >
      <div className="mx-auto max-w-[1180px] px-5 py-16 md:py-20">
        <div className="flex flex-col items-center text-center">
          <p
            className="mono text-[11px] font-semibold uppercase tracking-[0.1em]"
            style={{ color: 'var(--brand-strong)' }}
          >
            Simple, transparent pricing
          </p>
          <h2
            className="display mt-3 text-[28px] leading-[1.15] md:text-[36px]"
            style={{ color: 'var(--ink-1)' }}
          >
            Choose Your Growth Plan
          </h2>
          <p className="mt-3 max-w-[44ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Start free. Upgrade when your shop needs more.
          </p>

          <div className="mt-7">
            <BillingIntervalToggle interval={interval} path="/#pricing" />
          </div>
        </div>

        <div className="mt-9">
          <PricingCards interval={interval} />
        </div>

        <div className="mt-9 flex flex-col items-center gap-3">
          <Link
            href={withInterval('/pricing/compare', interval)}
            className="plan-cta inline-flex items-center gap-1.5 border px-5 text-[14px] font-semibold"
            style={{
              minHeight: '44px',
              borderColor: 'var(--brand)',
              background: 'var(--surface)',
              color: 'var(--brand-strong)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            Compare All Features
            <span aria-hidden className="plan-cta-arrow">
              →
            </span>
          </Link>
        </div>

        {/*
          * The trial terms, verbatim as the owner set them, and the DAYS come
          * from TRIAL_TERMS so this page cannot say seven while the flow does
          * something else. domain/billing/trial.ts refuses to start that flow
          * at all until an email sender is configured, because "we'll email
          * you before it ends" is a promise this deployment cannot keep.
          */}
        <p
          className="mx-auto mt-10 max-w-[70ch] border-l-2 pl-4 text-[13px] leading-relaxed"
          style={{ borderColor: 'var(--brand)', color: 'var(--ink-2)' }}
        >
          {TRIAL_TERMS.terms}
        </p>
      </div>
    </section>
  )
}
