import Link from 'next/link'
import { PLANS, CANCELLATION_TERMS, LIMIT_POLICY, AGENCY_NOTE } from '@/domain/billing/plans'
import { PUBLIC_PLANS, withInterval, type PublicBillingInterval } from '@/domain/billing/public-plans'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PRICING FAQ. SEVEN ANSWERS, NONE OF THEM INVENTED.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A pricing FAQ is where a product makes its most specific promises — about
 * money, about cancellation, about what happens to somebody's data — and it is
 * written by whoever is closest to the marketing copy and furthest from the
 * code. The defaults are familiar and almost all of them would be false here:
 * "cancel any time for a full refund", "we'll email you first", "upgrade
 * instantly".
 *
 * So every answer below is either read from the domain or written from a
 * behaviour that exists:
 *
 *   SWITCHING PLANS      domain/billing/lifecycle.ts: planChange() with a
 *                        disclosed charge, downgradeEffects() listing what is
 *                        lost. The flow is real and walkable in the demo.
 *   CANCELLING           CANCELLATION_TERMS, verbatim. "Charges are not
 *                        refunded" is the whole policy and it is stated rather
 *                        than left as an absence to discover after clicking.
 *   LIMITS               LIMIT_POLICY, verbatim. Nothing is deleted at a
 *                        limit; bulk jobs pause.
 *   MORE THAN ONE SHOP   AGENCY_NOTE, verbatim and approved. Multi-shop is in
 *                        development, so the answer is "one", not "contact us
 *                        about our agency plan".
 *   SECURITY             The OAuth posture the trust section already states
 *                        and tests/unit/legal-claims.test.ts holds.
 *
 * ── THE TWO ANSWERS ABOUT MONEY SAY NOTHING CAN TAKE MONEY ───────────────
 *
 * Because nothing can. There is no payment provider on any deployment and no
 * approved public price for Basic or Pro. An FAQ that answered "can I pay
 * monthly or annually?" with "yes, and annual saves you 20%" would be the most
 * expensive sentence on the site.
 *
 * ── <details>, NOT A CLIENT COMPONENT ────────────────────────────────────
 *
 * A disclosure that works with no JavaScript, is focusable and operable from
 * the keyboard by default, and whose open state cannot drift from its
 * `aria-expanded` because the browser owns both. A hand-rolled accordion gets
 * the second of those wrong roughly every other time it is written — the
 * approved design's own navigation shipped with a hardcoded
 * `aria-expanded="false"` on menus that opened.
 */

interface FaqItem {
  q: string
  a: React.ReactNode
}

function items(interval: PublicBillingInterval): FaqItem[] {
  const free = PLANS.find((plan) => plan.key === 'FREE')
  const names = PUBLIC_PLANS.map((plan) => plan.name)

  return [
    {
      q: 'Can I start CobaltRank for free?',
      a: (
        <>
          Yes. The Free plan costs nothing and needs no card:{' '}
          {free ? free.includes.join(', ').toLowerCase() : 'the calculators and the methodology'}.
          It connects no Etsy shop, which is why there is nothing to cancel and no trial to end.
        </>
      ),
    },
    {
      q: `What is the difference between ${names[0]}, ${names[1]} and ${names[2]}?`,
      a: (
        <>
          Free is the calculators and the methodology, with no shop connected. Basic connects one
          Etsy shop and turns on everything that works over your own orders — profit over real
          receipts, the listing audit, Shop Pulse and bulk edits with a confirmed diff. Pro is the
          same product with a larger catalogue and a longer memory: more listings, a longer
          rollback window and more performance history.{' '}
          <Link
            href={withInterval('/pricing/compare', interval)}
            className="font-semibold underline underline-offset-2"
            style={{ color: 'var(--brand-strong)' }}
          >
            Every limit, side by side
          </Link>
          .
        </>
      ),
    },
    {
      q: 'Can I switch plans later?',
      a: (
        <>
          Yes, in both directions, and you see the exact charge before it happens — the amount, the
          date and what changes — rather than being billed and told afterwards. Moving down lists
          what you lose before you confirm it. {LIMIT_POLICY}
        </>
      ),
    },
    {
      q: 'Can I pay monthly or annually?',
      a: (
        <>
          Neither yet, and this is the honest answer rather than a cautious one. No payment
          provider is connected to this deployment, and no public price has been approved for Basic
          or Pro. Annual billing has never existed in this product at all, so there is no annual
          price and no annual discount — any figure for one would have been made up. The pricing
          above says which plans this applies to.
        </>
      ),
    },
    {
      q: 'What happens if I cancel?',
      a: <>{CANCELLATION_TERMS} Cancelling is one click — no email, no retention call, no survey.</>,
    },
    {
      q: 'Are my Etsy shop details secure?',
      a: (
        <>
          CobaltRank never receives your Etsy password. You connect with an OAuth token, scoped to
          what it needs and stored encrypted, and revoking it from your Etsy account stops every
          read and every write immediately. Nothing is written to your shop without you confirming
          the exact before-and-after on screen first.
        </>
      ),
    },
    {
      q: 'Can I connect more than one Etsy shop?',
      a: <>One shop per account today, on every paid plan. {AGENCY_NOTE}</>,
    },
  ]
}

export function PricingFaq({ interval }: { interval: PublicBillingInterval }) {
  return (
    <section id="faq" className="border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-[820px] px-5 py-16 md:py-20">
        <h2
          className="display text-[28px] leading-[1.15] md:text-[34px]"
          style={{ color: 'var(--ink-1)' }}
        >
          Frequently Asked Questions
        </h2>

        <div className="mt-8 border-t" style={{ borderColor: 'var(--border)' }}>
          {items(interval).map((item) => (
            <details key={item.q} className="faq-row border-b" style={{ borderColor: 'var(--border)' }}>
              <summary
                className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold"
                style={{ color: 'var(--ink-1)', minHeight: '56px' }}
              >
                {item.q}
                {/*
                  * The indicator is a glyph that ROTATES rather than two
                  * different characters swapped by a CSS rule, so there is one
                  * element and one state. `aria-hidden`, because <details>
                  * already announces expanded and collapsed — a second
                  * announcement from the arrow would be the same fact twice.
                  */}
                <span
                  aria-hidden
                  className="faq-marker shrink-0 text-[13px] leading-none"
                  style={{ color: 'var(--brand-strong)' }}
                >
                  ▾
                </span>
              </summary>
              <p
                className="max-w-[72ch] pb-5 text-[14px] leading-relaxed"
                style={{ color: 'var(--ink-2)' }}
              >
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
