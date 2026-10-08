import type { Metadata } from 'next'
import {
  Faq,
  MarketingFooter,
  MarketingNav,
  Pricing,
} from '@/components/marketing/sections'
import { WaitlistForm } from '@/components/marketing/waitlist-form'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Four founding tiers, a 7-day trial, and no payment provider wired up yet — so every button joins the waitlist rather than pretending to take money.',
}

/*
 * Pricing, as its own URL.
 *
 * The argument lives on `/` and is cumulative — the price only lands after the
 * ledger and the trust section — so this is not a second pitch. It exists
 * because the nav links to it and because "send me the pricing page" is a real
 * thing people say, and it renders the SAME components rather than a copy of
 * them. A second table would be a second set of numbers to keep in step.
 */
export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ waitlist?: string }>
}) {
  const { waitlist } = await searchParams

  return (
    <div style={{ background: 'var(--page-bg)' }}>
      <MarketingNav />
      <div className="mx-auto max-w-[1180px] px-5 pt-14 md:pt-20">
        <h1 className="display text-[40px] leading-[1.05] md:text-[52px]" style={{ color: 'var(--ink-1)' }}>
          Pricing
        </h1>
        <p className="mt-4 max-w-[56ch] text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Nothing here can take money yet. There is no payment provider wired up, so every button
          joins the waitlist — which is also the honest state of the product today.
        </p>
      </div>
      <Pricing heading={false} />
      <Faq />
      <WaitlistForm state={waitlist} />
      <MarketingFooter />
    </div>
  )
}
