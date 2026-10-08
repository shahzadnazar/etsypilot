'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

/*
 * What a public visitor sees when they click something that needs an account.
 *
 * ── ONE PLACE, EVERY FORM, INCLUDING THE ONES WRITTEN LATER ───────────────
 *
 * Every mutation in this product is a plain <form method="post">, so a refusal
 * answered with JSON replaces the screen with machine text. lib/errors/api.ts
 * sends PUBLIC_DEMO_READ_ONLY back to the page it came from with ?demo=blocked
 * instead, and this renders the explanation — mounted once in the dashboard
 * layout, so a form added next year is covered without anybody remembering.
 *
 * The alternative was disabling the buttons. That is worse twice over: it
 * hides the product's actual behaviour from the person evaluating it, and a
 * disabled control teaches nothing about what would happen with a real shop.
 * The refusal is the demo.
 */
export function PublicDemoNotice() {
  const params = useSearchParams()
  if (params.get('demo') !== 'blocked') return null

  return (
    <div
      role="alert"
      className="mb-4 rounded-card border p-4 text-small leading-relaxed"
      style={{
        background: 'var(--warning-surface)',
        borderColor: 'var(--warning-border)',
        color: 'var(--warning-ink)',
      }}
    >
      <strong className="font-semibold">Nothing was changed — this is the live demo.</strong>{' '}
      You are looking at Willow &amp; Fern, a fictional shop, with no account. Every figure here is
      real product behaviour over invented data, and nothing can be written to it.
      <br />
      <span className="mt-1.5 block">
        With your own shop connected, this same action would show you the exact before-and-after
        first, and send nothing to Etsy until you confirmed it. Every write — including the ones
        EtsyPilot refuses — is recorded in an audit log you can export.
      </span>
      <span className="mt-2 flex flex-wrap gap-2">
        <Link
          href="/#waitlist"
          className="rounded-control px-2.5 py-1.5 text-[11.5px] font-semibold"
          style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}
        >
          Join the waitlist
        </Link>
        <Link
          href="/data/methodology"
          className="rounded-control border px-2.5 py-1.5 text-[11.5px] font-semibold"
          style={{ borderColor: 'var(--warning-border)', color: 'var(--warning-ink)' }}
        >
          How every number is produced
        </Link>
      </span>
    </div>
  )
}
