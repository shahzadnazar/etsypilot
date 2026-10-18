import type { Metadata } from 'next'
import { MarketingNav } from '@/components/marketing/nav'
import { Hero } from '@/components/marketing/hero'
import { PricingSection } from '@/components/marketing/pricing-cards'
import { ContactCta } from '@/components/marketing/contact-cta'
import {
  Benefits,
  BulkUpdates,
  FinalCta,
  HowItWorks,
  ShopPerformance,
  WhyChoose,
} from '@/components/marketing/previews'
import { WaitlistForm } from '@/components/marketing/waitlist-form'
import { Faq, MarketingFooter } from '@/components/marketing/sections'
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
 * explanation of what they had arrived at. It then became the ledger page,
 * then the approved design's thirteen sections, and it is now eleven: nav,
 * hero, why choose, the three questions, profit, listings, performance, bulk,
 * how it works, the pricing and CTA area, footer.
 *
 * ── SEVEN SECTIONS CAME OFF, AT THE OWNER'S DIRECTION ────────────────────
 *
 * Five of them carried the page's own argument about its honesty, and they
 * are named here rather than quietly dropped, because the reasoning they held
 * is worth knowing even when the sections are not on the page:
 *
 *   WHY PROFIT IS HARD   Three checkable facts about Etsy's API — no ads
 *                        endpoint, Offsite Ads fees with no link back to the
 *                        order, a dashboard that shows gross. They are why
 *                        this product withholds a figure rather than
 *                        estimating one.
 *   THE LEDGER           A profit statement that filled in and visibly
 *                        stopped, with "Not known" where Etsy exposes
 *                        nothing. The worked example of "absent is not zero".
 *   WHAT IT DOES         Five one-click doors into the live demo.
 *   PROVENANCE           The five real badges and what each one means.
 *   TRUST                Eight claims verified against the code.
 *
 * NONE OF THAT BEHAVIOUR WENT WITH THEM. The provenance system is in
 * lib/provenance and rendered on every figure in the product; the operator
 * write boundary, the export rules and the audit log are untouched; the
 * guards that hold them — tests/unit/source-claims.test.ts,
 * legal-claims.test.ts, operator-write-boundary.test.ts — all still run.
 * What was removed is marketing copy about those things, not the things.
 *
 * The other two were the keyword section, whose panel moved into the Discover
 * row rather than being deleted, and the calculator, which is a page of its
 * own at /tools/etsy-seller-calculator.
 *
 * ── TWO SECTIONS WERE ADDED ──────────────────────────────────────────────
 *
 * "Why choose" under the hero and "How it works" before the price. Both were
 * genuinely absent — the footer's "How it works" column is a list of links,
 * not a section — so neither duplicates anything.
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
      {/* ───────────────────────────────── 1. the existing navbar ── */}
      <MarketingNav />

      {/* ───────────────── 2. hero and the dashboard preview ── */}
      <Hero />

      {/* ──────────────────────────── 3. why choose CobaltRank ── */}
      <WhyChoose />

      {/* ── 4. three questions: Discover, Understand, Improve ── */}
      <Benefits />

      {/*
        * The profit and listing sections used to stand here. Their panels
        * moved up into the Understand and Improve rows above — see
        * components/marketing/previews.tsx — so the same waterfall and the
        * same audit findings are not shown twice on one page, and `#profit`
        * and `#listings` moved with them.
        */}

      {/* ──────────────────────────────────── 5. shop performance ── */}
      <ShopPerformance />

      {/* ───────────────────────────────── 6. safer bulk updates ── */}
      <BulkUpdates />

      {/* ──────────────────────────────────────── 7. how it works ── */}
      <HowItWorks />

      {/* ── 8. the pricing preview and the rest of the CTA area ── */}
      <PricingSection interval={interval} />
      <Faq />
      <WaitlistForm state={waitlist} />
      <ContactCta />
      <FinalCta />

      {/* ─────────────────────────────────────────────── 9. footer ── */}
      <MarketingFooter />
    </div>
  )
}
