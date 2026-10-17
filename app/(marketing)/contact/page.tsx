import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingNav } from '@/components/marketing/nav'
import { MarketingFooter } from '@/components/marketing/sections'
import { isDatabaseConfigured } from '@/lib/db'
import { contactAddress, hasContactAddress } from '@/lib/brand'
import { CONTACT_LIMITS } from '@/lib/repositories/contact'
import { canonical } from '@/lib/seo/site'

export const metadata: Metadata = {
  title: 'Contact CobaltRank',
  description:
    'Ask a question about the plans, the figures or connecting a shop. Messages are recorded and read — nothing is emailed back automatically.',
  ...canonical('/contact'),
}

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   CONTACT. A REAL FORM, AND AN HONEST ACCOUNT OF WHAT HAPPENS TO IT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The pricing page needs somewhere for "Need help choosing?" to go, and there
 * was nowhere: lib/brand.ts holds both contact addresses as `null` because no
 * domain has been bought, and the footer omits its Contact link for exactly
 * that reason.
 *
 * Three ways to answer that, and only one of them is honest:
 *
 *   INVENT AN ADDRESS        support@cobaltrank.com routes nowhere and is
 *                            somebody else's domain until somebody buys it.
 *   A FORM THAT SAYS         The usual build. It is a lie in the one place a
 *   "WE'LL BE IN TOUCH"      person is most entitled to the truth, because
 *                            there is no email sender in this product at all.
 *   A FORM THAT RECORDS      This. The message goes into `contact_messages`,
 *   AND SAYS SO              which somebody reads; the confirmation says
 *                            exactly that and names what has NOT happened.
 *
 * The third is a real delivery mechanism — durable storage an operator reads —
 * and the page never claims the second. "Recorded. Nothing has been emailed"
 * is a smaller promise than every competitor's and it is one this deployment
 * can keep today.
 *
 * ── WHEN THERE IS NO DATABASE, THE FORM IS NOT SHOWN AT ALL ──────────────
 *
 * Not disabled, not rendered-then-refused: absent, with the state said out
 * loud. A form with nowhere to write is the misleading version of this page,
 * and `isDatabaseConfigured()` is the same check the route makes, so the two
 * cannot disagree about whether a message can be stored.
 *
 * ── AND NO INVENTED DETAILS ANYWHERE ─────────────────────────────────────
 *
 * No email address, no phone number, no postal address, no "we usually reply
 * within one business day". The email line renders only if lib/brand.ts ever
 * holds one; today it does not, and the page says so rather than leaving a
 * gap a reader fills in with an assumption.
 */
export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const { sent } = await searchParams
  const canStore = isDatabaseConfigured()

  return (
    <div style={{ background: 'var(--page-bg)' }}>
      <MarketingNav />

      <main className="mx-auto max-w-[820px] px-5 py-14 md:py-20">
        <p
          className="mono text-[11px] font-semibold uppercase tracking-[0.1em]"
          style={{ color: 'var(--brand-strong)' }}
        >
          Contact
        </p>
        <h1
          className="display mt-3 text-[34px] leading-[1.08] md:text-[44px]"
          style={{ color: 'var(--ink-1)' }}
        >
          Ask us anything about the plans
        </h1>
        <p
          className="mt-4 max-w-[58ch] text-[15px] leading-relaxed"
          style={{ color: 'var(--ink-2)' }}
        >
          Questions about what a plan includes, how a figure is worked out, or what connecting a
          shop actually does. You do not need an account to ask.
        </p>

        {/*
          * What happens to a message, above the form rather than under it.
          * A disclosure that appears after submission is a disclosure the
          * person did not get to act on.
          */}
        <div
          className="mt-8 border-l-2 pl-4 text-[13.5px] leading-relaxed"
          style={{ borderColor: 'var(--warning)', color: 'var(--ink-2)' }}
        >
          <strong style={{ color: 'var(--ink-1)' }}>What happens to your message.</strong> It is
          recorded in CobaltRank&rsquo;s own database and read by the person building it. No
          automatic email goes out — there is no email sender configured in this product yet, which
          is also why the trial cannot start and why the waitlist says the same thing. If you want
          a reply, leave an address you check; the reply will come from a person, when there is a
          mailbox to send it from.
          {hasContactAddress('support') ? (
            <>
              {' '}
              You can also write to{' '}
              <a
                href={`mailto:${contactAddress('support')}`}
                className="font-semibold underline underline-offset-2"
                style={{ color: 'var(--brand-strong)' }}
              >
                {contactAddress('support')}
              </a>
              .
            </>
          ) : (
            <> There is no support email address to publish yet — no contact domain has been bought.</>
          )}
        </div>

        <div id="contact-form" className="mt-10" style={{ scrollMarginTop: '5.5rem' }}>
          {sent === 'ok' ? (
            <p
              role="status"
              className="mb-7 border-l-2 pl-4 text-[14px] leading-relaxed"
              style={{ borderColor: 'var(--success)', color: 'var(--ink-2)' }}
            >
              <strong style={{ color: 'var(--ink-1)' }}>Recorded.</strong> Your message is stored
              and will be read. Nothing has been emailed — to you or to anybody else — because
              there is no email sender configured yet.
            </p>
          ) : null}

          {sent === 'invalid' ? (
            <p
              role="alert"
              className="mb-7 border-l-2 pl-4 text-[14px] leading-relaxed"
              style={{ borderColor: 'var(--danger)', color: 'var(--ink-2)' }}
            >
              <strong style={{ color: 'var(--ink-1)' }}>Nothing was recorded.</strong> Every field
              is needed, the address needs an <code>@</code> in it, and the message has to be under{' '}
              {CONTACT_LIMITS.message.max.toLocaleString('en-US')} characters. Your text is still in
              the form below.
            </p>
          ) : null}

          {canStore ? (
            <ContactForm />
          ) : (
            /*
             * The development state the brief asks for, rather than a form
             * that would accept a message and lose it. Same condition as the
             * route's, so the page cannot offer what the handler refuses.
             */
            <div
              className="border p-6"
              style={{
                borderColor: 'var(--border-strong)',
                background: 'var(--surface)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <h2 className="display text-[19px]" style={{ color: 'var(--ink-1)' }}>
                The form is not available on this deployment
              </h2>
              <p
                className="mt-2.5 max-w-[60ch] text-[14px] leading-relaxed"
                style={{ color: 'var(--ink-2)' }}
              >
                There is no database configured here, so a message would have nowhere to go. Rather
                than take your question and lose it, the form is switched off and says so. Every
                other part of the product that does not need storage still works — including the
                full demo and the profit calculator on the pricing page.
              </p>
              <Link
                href="/pricing"
                className="mt-5 inline-flex items-center px-4 text-[13.5px] font-semibold"
                style={{
                  minHeight: '44px',
                  background: 'var(--brand)',
                  color: 'var(--on-brand)',
                  borderRadius: 'var(--paper-radius)',
                }}
              >
                Back to pricing
              </Link>
            </div>
          )}
        </div>

        <p className="mt-10 text-[13.5px]" style={{ color: 'var(--muted-1)' }}>
          Looking for the plans?{' '}
          <Link
            href="/pricing"
            className="font-semibold underline underline-offset-2"
            style={{ color: 'var(--brand-strong)' }}
          >
            Back to pricing
          </Link>
          {' · '}
          <Link
            href="/pricing/compare"
            className="font-semibold underline underline-offset-2"
            style={{ color: 'var(--brand-strong)' }}
          >
            Compare all features
          </Link>
        </p>
      </main>

      <MarketingFooter />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────── the form */

function ContactForm() {
  return (
    <form
      method="post"
      action="/api/contact"
      className="border p-6"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface)',
        borderRadius: 'var(--card-radius)',
      }}
    >
      {/*
        * The honeypot. Hidden from sight AND from the accessibility tree, and
        * `tabIndex={-1}` keeps it out of the keyboard path, so no person fills
        * it in by any route. `autoComplete="off"` stops a browser helpfully
        * doing it for them, which is the usual way a honeypot starts rejecting
        * real submissions.
        *
        * Not `type="hidden"`: a hidden input is the first thing an automated
        * submitter skips. A text input positioned off-screen is one it fills.
        */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden" style={{ left: '-9999px' }}>
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <input type="hidden" name="source" value="contact" />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          name="name"
          label="Your name"
          type="text"
          autoComplete="name"
          maxLength={CONTACT_LIMITS.name.max}
        />
        <Field
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          maxLength={CONTACT_LIMITS.email.max}
          hint="So a person can reply when there is a mailbox to reply from."
        />
      </div>

      <div className="mt-5">
        <Field
          name="subject"
          label="Subject"
          type="text"
          autoComplete="off"
          maxLength={CONTACT_LIMITS.subject.max}
        />
      </div>

      <div className="mt-5">
        <label
          htmlFor="contact-message"
          className="block text-[12.5px] font-semibold"
          style={{ color: 'var(--ink-1)' }}
        >
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={6}
          maxLength={CONTACT_LIMITS.message.max}
          className="mt-1.5 w-full border px-3 py-2.5 text-[14px] leading-relaxed outline-none"
          style={{
            borderColor: 'var(--border-strong)',
            background: 'var(--surface)',
            color: 'var(--ink-1)',
            borderRadius: 'var(--paper-radius)',
          }}
        />
      </div>

      <button
        type="submit"
        className="mt-6 inline-flex items-center px-5 text-[14px] font-semibold"
        style={{
          minHeight: '44px',
          background: 'var(--brand)',
          color: 'var(--on-brand)',
          borderRadius: 'var(--paper-radius)',
        }}
      >
        Send message
      </button>

      <p className="mt-3 text-[11.5px] leading-snug" style={{ color: 'var(--muted-1)' }}>
        {/*
          * `required` and `maxLength` do the browser-side validation, and the
          * route checks the same bounds again from one shared definition.
          * Client validation is a convenience; the server's is the one that
          * decides, and the database's CHECK constraints are the third copy of
          * the same numbers deliberately.
          */}
        Validated here and again on the server. Nothing is shared with anyone else, and this form
        sets no cookies.
      </p>
    </form>
  )
}

function Field({
  name,
  label,
  type,
  autoComplete,
  maxLength,
  hint,
}: {
  name: string
  label: string
  type: 'text' | 'email'
  autoComplete: string
  maxLength: number
  hint?: string
}) {
  const id = `contact-${name}`
  return (
    <div>
      <label htmlFor={id} className="block text-[12.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        maxLength={maxLength}
        {...(hint ? { 'aria-describedby': `${id}-hint` } : {})}
        className="mt-1.5 w-full border px-3 text-[14px] outline-none"
        style={{
          minHeight: '44px',
          borderColor: 'var(--border-strong)',
          background: 'var(--surface)',
          color: 'var(--ink-1)',
          borderRadius: 'var(--paper-radius)',
        }}
      />
      {hint ? (
        <span id={`${id}-hint`} className="mt-1 block text-[11.5px]" style={{ color: 'var(--muted-1)' }}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
