import type { Metadata } from 'next'
import Link from 'next/link'
import { HeroLedger } from '@/components/marketing/hero-ledger'
import { FeeCalculator } from '@/components/marketing/fee-calculator'
import { WaitlistForm } from '@/components/marketing/waitlist-form'
import {
  Faq,
  MarketingFooter,
  MarketingNav,
  Pricing,
  ProvenanceSystem,
  Trust,
  WhatItDoes,
  WhyProfitIsHard,
} from '@/components/marketing/sections'

export const metadata: Metadata = {
  title: 'Know what you actually made',
  description:
    'Etsy shows you gross revenue. Fees arrive in a separate ledger and your costs live in your head. EtsyPilot works out what you actually made — and says so when it cannot.',
}

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE FRONT DOOR.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file was three lines long and redirected to /dashboard, so the day a
 * domain pointed at it a stranger was bounced to a login screen with no
 * explanation of what they had arrived at.
 *
 * ── ONE PAGE, PLUS A SHALLOW /pricing ─────────────────────────────────────
 *
 * Everything is on `/`, because the argument is cumulative: the ledger with
 * holes in it only lands once you have read why the holes are there, and the
 * price only lands after the trust section. Splitting it would mean making
 * that argument twice.
 *
 * `/pricing` exists anyway and renders the same two components, because the
 * nav links to it and "send me the pricing page" is a real thing people say.
 * It is the same source, not a copy.
 *
 * ── WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────────
 *
 * No testimonials, no user count, no star ratings, no press logos, no revenue
 * screenshots, no "trusted by N sellers". There are no customers yet, and a
 * product whose entire premise is that absent is not zero cannot open with an
 * invented number. The social proof is the demo: one click, no account.
 *
 * There is also no claim about EtsyPilot's own accuracy that the product
 * cannot demonstrate on screen — which is why the hero is a real ledger with
 * real gaps rather than a figure about how much sellers save.
 */
export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ waitlist?: string }>
}) {
  const { waitlist } = await searchParams

  return (
    <div style={{ background: 'var(--page-bg)' }}>
      <MarketingNav />

      {/* ───────────────────────────────────────── 2. the hero ledger ── */}
      <section>
        <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-14 md:py-20 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:gap-14">
          <div className="flex flex-col justify-center">
            <h1
              className="display text-[40px] leading-[1.05] md:text-[56px]"
              style={{ color: 'var(--ink-1)' }}
            >
              Know what you actually made.
            </h1>
            <p
              className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed"
              style={{ color: 'var(--ink-2)' }}
            >
              Etsy shows you gross revenue. Your fees arrive days later in a separate
              payment-account ledger, and what it costs you to make anything lives in your head. So
              most sellers are guessing at profit — and guessing high, because the number in front
              of them is the one before everything comes out of it.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              {/*
                * A plain <a>: <Link> client-side navigates, and a route
                * handler's 303 + Set-Cookie cannot be applied by the router.
                * Measured — the click left the browser on `/` with no cookie.
                */}
              <a
                href="/api/demo/enter"
                className="px-4 py-2.5 text-[14px] font-semibold"
                style={{
                  background: 'var(--brand)',
                  color: 'var(--on-brand)',
                  borderRadius: 'var(--paper-radius)',
                }}
              >
                See the live demo
              </a>
              <Link
                href="#waitlist"
                className="border px-4 py-2.5 text-[14px] font-semibold"
                style={{
                  borderColor: 'var(--border)',
                  color: 'var(--ink-1)',
                  borderRadius: 'var(--paper-radius)',
                }}
              >
                Join the waitlist
              </Link>
            </div>

            {/*
              * Not a user count. There are no users, and this product cannot
              * open with an invented number — so the line under the buttons is
              * a promise about the figures instead.
              */}
            <p className="mt-4 text-[12.5px] leading-relaxed" style={{ color: 'var(--muted-1)' }}>
              No estimated sales figures. Every number says where it came from.
            </p>
          </div>

          <HeroLedger />
        </div>
      </section>

      {/* ──────────────────────────── 3. the calculator, working ── */}
      <section
        className="border-t"
        style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
      >
        <div className="mx-auto max-w-[1000px] px-5 py-16 md:py-20">
          <h2
            className="display max-w-[24ch] text-[28px] leading-[1.15] md:text-[36px]"
            style={{ color: 'var(--ink-1)' }}
          >
            Try the arithmetic on a price of your own.
          </h2>
          <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            This is the product&rsquo;s own fee calculator, running here. Same function, same rate
            table, same provenance labels as the screen behind the login.
          </p>
          <div className="mt-8">
            <FeeCalculator />
          </div>
        </div>
      </section>

      <WhyProfitIsHard />
      <WhatItDoes />
      <ProvenanceSystem />
      <Trust />
      <Pricing />
      <Faq />
      <WaitlistForm state={waitlist} />
      <MarketingFooter />
    </div>
  )
}
