import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { SimpleCalculator } from '@/components/calculator/simple-calculator'
import { Card } from '@/components/ui/card'
import { getSession } from '@/lib/auth'

export const metadata: Metadata = { title: 'Simple Calculator' }

/*
 * Simple Calculator, inside the app.
 *
 * Under Tools, next to the other calculators — never merged into Profit
 * Reality. The two answer different questions and the difference matters: this
 * one is arithmetic over numbers a seller typed, Profit Reality is a model over
 * their verified receipts. A tool that mixed them would let a typed figure sit
 * in the same frame as a receipt.
 *
 * So the link to Profit Reality is here, phrased as a hand-off rather than an
 * upsell, and the page says plainly what this tool is not.
 */
export default async function SimpleCalculatorPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <>
      <PageHeader
        title="Simple Calculator"
        subtitle="Quick calculations for your Etsy business — no shop connection required."
        actions={
          <Link
            href="/profit"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Open Profit Reality
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <SimpleCalculator demo={session.isDemo} />

        <div className="flex flex-col gap-3">
          <Card className="flex flex-col gap-2 p-[18px]">
            <h2 className="text-section text-ink-1">What this tool is not</h2>
            <p className="text-small leading-relaxed text-ink-2">
              One calculation at a time, over numbers you type. It never reads your shop, so a fee
              rate you enter here is your assumption — not the fee Etsy actually charged you.
            </p>
            <p className="text-small leading-relaxed text-ink-2">
              For real orders, real fees, confirmed costs and multi-scenario profit, use{' '}
              <Link href="/profit" className="font-semibold text-brand-strong underline underline-offset-2">
                Profit Reality
              </Link>
              . That screen works from your receipts; this one works from your keyboard.
            </p>
          </Card>

          <Card className="flex flex-col gap-2 p-[18px]">
            <h2 className="text-section text-ink-1">The labels used here</h2>
            <dl className="flex flex-col gap-2 text-caption">
              <div>
                <dt className="font-semibold text-ink-1">Calculated</dt>
                <dd className="text-muted-1">Pure arithmetic from what you typed in.</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-1">Seller input</dt>
                <dd className="text-muted-1">
                  Assumptions you provide, like a cost or a target margin.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-1">Not used here</dt>
                <dd className="text-muted-1">
                  Verified. Nothing on this page came from Etsy, so nothing on it can be verified —
                  and a rate you type is never labelled an official Etsy fee.
                </dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}
