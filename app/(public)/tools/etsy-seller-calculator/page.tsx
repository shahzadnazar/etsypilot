import type { Metadata } from 'next'
import { PublicCalculator } from '@/components/calculator/public-calculator'

export const metadata: Metadata = {
  title: 'Etsy seller calculator — free, no account needed',
  description:
    'Free calculator for Etsy sellers: discount, profit, margin, markup, fee, net revenue and break-even. Shows the formula. No sign-up, no shop connection.',
}

/*
 * The free, public variant.
 *
 * Same component as the in-app page, so the two can never disagree — a
 * calculator that gives different answers at two URLs is worse than not having
 * the second URL.
 *
 * What is deliberately absent, per the design: no login wall, no Etsy
 * connection prompt anywhere on the page, and no sign-up banner until a result
 * has actually been produced. A tool that asks for an account before it will
 * divide two numbers has not earned the ask.
 */
export default function PublicCalculatorPage() {
  return (
    <>
      <div className="flex flex-col gap-1.5 pb-5">
        <h1 className="text-page tracking-[-0.015em] text-ink-1">Etsy seller calculator</h1>
        <p className="max-w-[70ch] text-body text-ink-2">
          Discount, profit, margin, markup, fee, net revenue and break-even — with the formula shown
          every time. No account, no shop connection, nothing to install.
        </p>
      </div>

      <PublicCalculator />
    </>
  )
}
