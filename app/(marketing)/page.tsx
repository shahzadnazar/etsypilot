import type { Metadata } from 'next'
import { MarketingNav } from '@/components/marketing/nav'
import { Hero } from '@/components/marketing/hero'
import { HeroLedger } from '@/components/marketing/hero-ledger'
import { ProfitCalculator } from '@/components/marketing/profit-calculator'
import { PricingSection } from '@/components/marketing/pricing-cards'
import { ContactCta } from '@/components/marketing/contact-cta'
import {
  Benefits,
  BulkUpdates,
  FinalCta,
  KeywordResearch,
  ListingIntelligence,
  ProfitIntelligence,
  ShopPerformance,
} from '@/components/marketing/previews'
import { WaitlistForm } from '@/components/marketing/waitlist-form'
import {
  Faq,
  MarketingFooter,
  ProvenanceSystem,
  Trust,
  WhatItDoes,
  WhyProfitIsHard,
} from '@/components/marketing/sections'
import { intervalFromParam } from '@/domain/billing/public-plans'
import { canonical } from '@/lib/seo/site'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE FRONT DOOR.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * This file was three lines long and redirected to /dashboard, so the day a
 * domain pointed at it a stranger was bounced to a login screen with no
 * explanation of what they had arrived at. It then became the ledger page, and
 * it is now the approved design's thirteen sections in the approved order.
 *
 * ── THE ORDER IS THE ARGUMENT, AND IT IS NOT ARBITRARY ───────────────────
 *
 * Nav, hero, benefits, keywords, the calculator, profit, listings,
 * performance, bulk, pricing, FAQ, final call, footer. Each product section
 * shows the screen it is describing, so a visitor who scrolls and reads
 * nothing has still seen the product.
 *
 * The calculator sits fifth, immediately after the keyword section and before
 * the profit sections it belongs to. That is deliberate: it is the only thing
 * on this page a visitor can USE, and putting the one interactive proof above
 * the three sections of prose about profit means the claim is demonstrated
 * before it is made. It also answers the brief's "Free tools" nav item with
 * something that works rather than a link to a signup form.
 *
 * ── WHAT THE DESIGN DID NOT HAVE, AND IS KEPT ANYWAY ─────────────────────
 *
 * Four sections from the page this replaces survive, between the product
 * sections and the price:
 *
 *   WHY PROFIT IS HARD   Three checkable facts about Etsy's API. They are the
 *                        reason this product withholds a figure instead of
 *                        estimating one, and no section in the approved design
 *                        carries that argument.
 *   WHAT IT DOES         Five surfaces, each a one-click door into the live
 *                        demo. The strongest thing on the page: a stranger can
 *                        walk the whole product without an account.
 *   PROVENANCE           The five real badges with what each one means. The
 *                        nav's Resources menu links straight to it.
 *   TRUST                Eight claims that were verified against the code
 *                        rather than written from memory.
 *
 * Deleting them to match a visual comp would be deleting the honest part of
 * the page. The design is the visual source of truth, not a list of what may
 * exist.
 *
 * ── WHAT IS DELIBERATELY ABSENT ───────────────────────────────────────────
 *
 * No testimonials, no user count, no star ratings, no press logos, no revenue
 * screenshots, no "trusted by N sellers". There are no customers yet, and a
 * product whose entire premise is that absent is not zero cannot open with an
 * invented number. The social proof is the demo: one click, no account.
 */

export const metadata: Metadata = {
  /*
   * The brief's own title, and it is 59 characters — inside the ~60 a search
   * result shows before truncating. `app/layout.tsx` appends " · CobaltRank"
   * via its template, so the rendered tab reads the product name too.
   */
  title: 'Find better Etsy keywords and know your real profit',
  description:
    'Research Etsy keywords, check listings with evidence, monitor shop performance, and make safer bulk updates — all in one place. Every figure says where it came from.',
  /*
   * Canonical and the social cards resolve against the deployment's configured
   * URL and are OMITTED when none is set. No domain has been bought, and a
   * canonical tag pointing at a guessed host is worse than none: it tells a
   * crawler the real page lives somewhere that does not answer. See
   * lib/seo/site.ts.
   */
  ...canonical('/'),
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ waitlist?: string; billing?: string }>
}) {
  const { waitlist, billing } = await searchParams
  /*
   * The same interval the /pricing toggle uses, read from the same param, so
   * a link that carries `?billing=annual` lands on the right basis wherever
   * it points.
   */
  const interval = intervalFromParam(billing)

  return (
    <div style={{ background: 'var(--page-bg)' }}>
      {/* ─────────────────────────────────────────── A. navigation ── */}
      <MarketingNav />

      {/* ───────────────────── B. hero and the dashboard preview ── */}
      <Hero />

      {/* ──────────────────────────────────────── C. core benefits ── */}
      <Benefits />

      {/* ────────────────────────────────────── D. keyword research ── */}
      <KeywordResearch />

      {/* ─────────────────── E. the calculator, actually working ── */}
      <section
        id="calculator"
        className="border-y px-4 py-14 md:px-6 md:py-20"
        style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
      >
        <div className="mx-auto max-w-[1180px]">
          <h2
            className="display max-w-[24ch] text-[26px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            Try the arithmetic on a price of your own.
          </h2>
          <p
            className="mt-3 max-w-[64ch] text-[14.5px] leading-relaxed"
            style={{ color: 'var(--ink-2)' }}
          >
            Free, no account, nothing stored. Every fee rate below is a dated assumption you can
            edit — and editing one changes every figure, because this is the product&rsquo;s own
            calculation running here rather than a copy of it.
          </p>
          <div className="mt-8">
            <ProfitCalculator />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────── F. profit intelligence ── */}
      <ProfitIntelligence />

      {/* ──────────────────────── G. evidence-based listing checks ── */}
      <ListingIntelligence />

      {/* ─────────────────────────────────────── H. shop performance ── */}
      <ShopPerformance />

      {/* ────────────────────────────────── I. safer bulk updates ── */}
      <BulkUpdates />

      {/* ── the four sections the comp did not have. See above. ── */}
      <WhyProfitIsHard />

      {/*
        * THE LEDGER WITH HOLES IN IT, MOVED OUT OF THE HERO.
        *
        * It was the hero of the page this replaces: a real profit waterfall
        * whose three fee lines read "Not known" and whose net profit never
        * arrives, filling in row by row and then visibly stopping where the
        * data does.
        *
        * The approved design's hero is a confident dashboard, so this is not
        * the first thing a visitor sees any more — and it is better here than
        * it was there. Directly under the three reasons profit is hard on
        * Etsy, it is the evidence for them rather than a claim a reader has
        * not yet been given a reason to believe; and directly above the
        * provenance system, it is the worked example of what "absent is not
        * zero" looks like on a screen.
        *
        * Its stagger animation and the pause before the unfillable lines are
        * in styles/marketing.css and animate only TOWARDS what is already
        * painted, so with the stylesheet gone or reduced motion on, the
        * complete ledger is still there.
        */}
      <section className="border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-[1180px] px-5 py-14 md:py-20">
          <h2
            className="display max-w-[26ch] text-[26px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            This is what those three reasons look like on a real statement.
          </h2>
          <p
            className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed"
            style={{ color: 'var(--ink-2)' }}
          >
            The sample shop&rsquo;s period, with every line labelled by where it came from — and
            three of them withheld, because Etsy does not expose what they would need. A tool that
            filled those in would be guessing at the most consequential figure on the page.
          </p>
          <div className="mt-8">
            <HeroLedger />
          </div>
        </div>
      </section>

      <WhatItDoes />
      <ProvenanceSystem />
      <Trust />

      {/* ───────────────────────────────────────────── J. pricing ── */}
      <PricingSection interval={interval} />

      {/* ───────────────────────────────────────────────── K. FAQ ── */}
      <Faq />

      {/* The waitlist, because nothing here can take money yet. */}
      <WaitlistForm state={waitlist} />

      {/* Somewhere to ask, before the final call to action. */}
      <ContactCta />

      {/* ─────────────────────────────────────────── L. final CTA ── */}
      <FinalCta />

      {/* ─────────────────────────────────────────────── M. footer ── */}
      <MarketingFooter />
    </div>
  )
}
