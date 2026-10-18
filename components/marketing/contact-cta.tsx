import Link from 'next/link'

/*
 * "Need help choosing?", and the one link under it.
 *
 * It goes to /contact — a route that exists, with a form that writes to a
 * table somebody reads. See app/(marketing)/contact/page.tsx for why that is
 * the honest shape here and why there is no email address, no phone number
 * and no response-time promise anywhere on it: lib/brand.ts holds both contact
 * addresses as null, because no domain has been bought.
 *
 * The second link is the demo rather than a second support channel. "I cannot
 * tell which plan I need" is most often answered by using the product, and
 * this one is open with no account.
 */
export function ContactCta() {
  return (
    <section
      id="contact"
      className="border-t"
      style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
    >
      <div className="mx-auto flex max-w-[1180px] flex-col items-center px-5 py-14 text-center md:py-18">
        <h2
          className="display t-h2"
          style={{ color: 'var(--ink-1)' }}
        >
          Need Help Choosing?
        </h2>
        <p
          className="t-lead mt-4 max-w-[52ch]"
          style={{ color: 'var(--ink-2)' }}
        >
          Have a question about plans or features? We&rsquo;re here to help.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="plan-cta inline-flex items-center gap-1.5 px-6 text-[15.5px] font-semibold"
            style={{
              minHeight: '48px',
              background: 'var(--brand)',
              color: 'var(--on-brand)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            Contact Us
            <span aria-hidden className="plan-cta-arrow">
              →
            </span>
          </Link>

          {/*
            * A plain <a>, no prefetch: the demo door is a route handler whose
            * 303 + Set-Cookie the client router cannot apply, and Next
            * prefetches a <Link> on sight — which would open a demo session
            * for anybody who merely scrolled this far.
            */}
          <a
            href="/api/demo/enter"
            className="inline-flex items-center border px-6 text-[15.5px] font-semibold"
            style={{
              minHeight: '48px',
              borderColor: 'var(--border-strong)',
              background: 'var(--surface)',
              color: 'var(--ink-1)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            Try the live demo first
          </a>
        </div>

        <p className="mt-4 text-[12.5px]" style={{ color: 'var(--muted-1)' }}>
          Messages are recorded and read by a person. Nothing is emailed automatically.
        </p>
      </div>
    </section>
  )
}
