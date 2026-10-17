import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/sections'
import { BillingIntervalToggle, PricingCards } from '@/components/marketing/pricing-cards'
import { PricingFaq } from '@/components/marketing/pricing-faq'
import { ContactCta } from '@/components/marketing/contact-cta'
import { intervalFromParam, withInterval } from '@/domain/billing/public-plans'
import { canonical } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Pricing — Free, Basic and Pro',
  description:
    'Three CobaltRank plans: Free for exploring, Basic for a growing shop, Pro for a large catalogue. Compare every limit, and see what is included before you pay anything.',
  ...canonical('/pricing'),
}

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   /pricing — THREE PLANS, AND NO NUMBER NOBODY APPROVED.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Eight blocks in a fixed order: nav, hero, interval toggle, three cards,
 * "Compare all features", FAQ, contact, footer. Deliberately short — a pricing
 * page's job is to make three options legible, and everything that wants more
 * than a card's worth of space lives on /pricing/compare.
 *
 * ── WHAT THIS PAGE USED TO SHOW ──────────────────────────────────────────
 *
 * Four founding tiers — Starter $20, Growth $27, Pro $35, Studio $45 — from
 * domain/billing/founding-pricing.ts. The public structure is now exactly
 * Free, Basic and Pro, so those four are off this page. The data stays in the
 * repository, untouched: it is the only set of prices anybody has ever
 * approved for anything, and deleting it to tidy a page would be throwing away
 * a commercial decision. What becomes of it is an open question for whoever
 * owns the pricing, and it is written down in that file rather than settled
 * here.
 *
 * ── AND WHY TWO OF THE THREE CARDS HAVE NO PRICE ─────────────────────────
 *
 * Because no public price for Basic or Pro has been approved, and this page
 * is not the place to invent one. domain/billing/public-plans.ts carries the
 * whole argument; the short version is that the two sets of numbers in this
 * repository are a historical tier structure and a legacy founding offer, and
 * neither was set as the public price of these three plans. The cards say
 * "price to be confirmed" with the reason, and their buttons are disabled
 * rather than pointing at a checkout that would fail.
 *
 * Free's $0 is not in that category: the Free plan exists, its entitlements
 * are real and enforced, and nothing in the product charges for it.
 *
 * ── NO CLIENT JAVASCRIPT ─────────────────────────────────────────────────
 *
 * Every block here is a server component. The interval toggle is two links and
 * a search param, the FAQ is <details>, and the hover treatment is CSS. A
 * pricing page that needs a bundle to decide which price to show is a pricing
 * page that shows the wrong one while the bundle loads.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>
}) {
  const { billing } = await searchParams
  const interval = intervalFromParam(billing)

  return (
    <div style={{ background: 'var(--page-bg)' }}>
      {/* ───────────────────────────────── 1. the existing navbar ── */}
      <MarketingNav />

      <main>
        {/* ──────────────────────────────────── 2. the hero ── */}
        <section className="px-5 pt-14 md:pt-20">
          <div className="mx-auto flex max-w-[1180px] flex-col items-center text-center">
            <p
              className="mono text-[11px] font-semibold uppercase tracking-[0.1em]"
              style={{ color: 'var(--brand-strong)' }}
            >
              Simple, transparent pricing
            </p>
            <h1
              className="display mt-4 text-[34px] leading-[1.08] md:text-[46px]"
              style={{ color: 'var(--ink-1)' }}
            >
              Choose Your Growth Plan
            </h1>
            <p
              className="mt-4 max-w-[46ch] text-[15.5px] leading-relaxed"
              style={{ color: 'var(--ink-2)' }}
            >
              Start free. Upgrade when your shop needs more.
            </p>
          </div>
        </section>

        {/* ─────────────────────── 3. monthly / annually ── */}
        <section className="px-5 pt-9">
          <div className="mx-auto flex max-w-[1180px] justify-center">
            <BillingIntervalToggle interval={interval} path="/pricing" />
          </div>
        </section>

        {/* ────────────────────────── 4. the three cards ── */}
        <section id="plans" className="px-5 pt-9">
          <div className="mx-auto max-w-[1180px]">
            <h2 className="sr-only">Plans</h2>
            <PricingCards interval={interval} />
          </div>
        </section>

        {/* ──────────────────── 5. compare all features ── */}
        <section className="px-5 pb-16 pt-10 md:pb-20">
          <div className="mx-auto flex max-w-[1180px] flex-col items-center gap-3 text-center">
            {/*
              * A real route, carrying the chosen interval with it, so the
              * comparison opens on the same basis the visitor was reading.
              * Not a modal: a comparison table is a page people link to, send
              * to a business partner and open in a tab, and a modal is none of
              * those.
              */}
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
            <p className="max-w-[52ch] text-[12.5px]" style={{ color: 'var(--muted-1)' }}>
              Every limit, side by side, read from the entitlements the product actually enforces.
            </p>
          </div>
        </section>

        {/* ───────────────────────────────────── 6. FAQ ── */}
        <PricingFaq interval={interval} />

        {/* ──────────────────────────────── 7. contact ── */}
        <ContactCta />
      </main>

      {/* ───────────────────────────── 8. the existing footer ── */}
      <MarketingFooter />
    </div>
  )
}
