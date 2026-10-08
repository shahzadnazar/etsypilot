
/*
 * The waitlist form.
 *
 * A plain <form method="post">, so it works with no JavaScript, like every
 * other mutation in this product. It is also the only write a person with no
 * account can perform, which is why lib/repositories/waitlist.ts has no read
 * path at all — see that file for what protects a table with no shop to scope.
 *
 * ── NO EMAIL IS SENT, AND IT SAYS SO ──────────────────────────────────────
 *
 * There is no SMTP provider in this repository. "Check your inbox" over a
 * mailbox nothing will ever reach is the kind of small lie that costs more
 * than the feature earns, so the confirmation says what actually happened:
 * the address is recorded, and nothing has been sent.
 */
export function WaitlistForm({ state }: { state?: string }) {
  return (
    <section id="waitlist" className="border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-[760px] px-5 py-16 md:py-20">
        <h2 className="display text-[28px] leading-[1.15] md:text-[36px]" style={{ color: 'var(--ink-1)' }}>
          Be told when it opens.
        </h2>
        <p className="mt-3 max-w-[58ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          One email when billing is live, and nothing else. No sequence, no newsletter, no
          partners. You can walk through the whole product today without giving us anything.
        </p>

        {state === 'ok' ? (
          <p
            role="status"
            className="mt-6 border-l-2 pl-4 text-[14px] leading-relaxed"
            style={{ borderColor: 'var(--success)', color: 'var(--ink-2)' }}
          >
            <strong style={{ color: 'var(--ink-1)' }}>We have your address.</strong> Nothing has
            been sent — there is no email sender configured yet, which is also why the trial cannot
            start. You will hear from us once both are in place.
          </p>
        ) : null}

        {state === 'invalid' ? (
          <p
            role="alert"
            className="mt-6 border-l-2 pl-4 text-[14px] leading-relaxed"
            style={{ borderColor: 'var(--danger)', color: 'var(--ink-2)' }}
          >
            That does not look like an email address. Nothing was recorded.
          </p>
        ) : null}

        <form method="post" action="/api/waitlist" className="mt-7 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[15rem] flex-1 flex-col gap-1.5">
            <span className="mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--muted-1)' }}>
              Email
            </span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@yourshop.com"
              className="h-11 border px-3 text-[14px] outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink-1)',
                borderRadius: 'var(--paper-radius)',
              }}
            />
          </label>

          <label className="flex min-w-[15rem] flex-1 flex-col gap-1.5">
            <span className="mono text-[10.5px] uppercase tracking-[0.06em]" style={{ color: 'var(--muted-1)' }}>
              Shop URL <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <input
              type="text"
              name="shopUrl"
              placeholder="etsy.com/shop/yourshop"
              className="h-11 border px-3 text-[14px] outline-none"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                color: 'var(--ink-1)',
                borderRadius: 'var(--paper-radius)',
              }}
            />
          </label>

          <input type="hidden" name="source" value="landing" />

          <button
            type="submit"
            className="h-11 px-5 text-[13.5px] font-semibold"
            style={{
              background: 'var(--brand)',
              color: 'var(--on-brand)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            Join the waitlist
          </button>
        </form>

        <p className="mt-4 text-[12.5px] leading-relaxed" style={{ color: 'var(--muted-1)' }}>
          Or go and look first —{' '}
          <a href="/api/demo/enter"
            className="font-semibold underline underline-offset-2"
            style={{ color: 'var(--brand-strong)' }}
          >
            open the live demo
          </a>
          . No account, no email, nothing to install.
        </p>
      </div>
    </section>
  )
}
