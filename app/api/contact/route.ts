import { NextResponse } from 'next/server'
import { CONTACT_LIMITS, recordContactMessage } from '@/lib/repositories/contact'
import { errorResponse } from '@/lib/errors/api'
import { isDatabaseConfigured } from '@/lib/db'
import { Errors } from '@/lib/errors/types'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE CONTACT FORM. IT RECORDS A MESSAGE, AND IT DOES NOT EMAIL ANYBODY.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A plain form POST, like every other mutation here, so it works with no
 * JavaScript. It is the second of exactly two writes in this product reachable
 * by somebody with no account — /api/waitlist is the first — which is why what
 * it may do is so narrow: one row, five fields, no read path, nothing echoed
 * back.
 *
 * ── WHAT "DELIVERED" MEANS HERE, SAID EXACTLY ────────────────────────────
 *
 * There is no email sender in this product. domain/billing/trial.ts names the
 * two environment variables one would need and refuses to start a trial until
 * they are set, and the waitlist's confirmation already says "nothing has been
 * sent" for the same reason.
 *
 * So this endpoint does not claim delivery it cannot verify. It claims exactly
 * what it did: the message is in a table that somebody can read. The redirect
 * target is `?sent=ok`, and the page it lands on says "recorded — nothing has
 * been emailed", with the reason. "We'll get back to you within 24 hours" is
 * the sentence this file exists to not write.
 *
 * ── AND WHEN THERE IS NO DATABASE, IT SAYS THAT INSTEAD ──────────────────
 *
 * `isDatabaseConfigured()` is false on a deployment with no DATABASE_URL, and
 * then there is nowhere to put the message at all. The form refuses rather
 * than silently dropping it — a form that accepts a message, stores nothing
 * and thanks you is the worst available behaviour, because the person walks
 * away believing they have asked.
 *
 * ── SPAM ─────────────────────────────────────────────────────────────────
 *
 * Two defences, neither of them a CAPTCHA:
 *
 *   RATE LIMIT   `/api/contact` is in LIMITS.publicForm — five a minute per
 *                caller, applied in middleware.ts before this handler runs.
 *   HONEYPOT     A field named `website`, hidden from people and from screen
 *                readers, left empty by anybody filling the form in a browser.
 *                A submission that fills it is answered with the SAME
 *                redirect as a successful one and nothing is written: telling
 *                a submitter their message was rejected is telling them how
 *                to send the next one.
 *
 * A third-party CAPTCHA would mean a script from another origin on a public
 * page, a hole in the CSP, and a visitor's IP handed to a company this
 * product's own privacy policy does not name. For a form that writes one row
 * behind a five-per-minute limit, that trade is not worth making.
 */

/** Where a submission lands, with its outcome. */
const PAGE = '/contact'

export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData()
    const read = (key: string) => {
      const value = form.get(key)
      return typeof value === 'string' ? value.trim() : ''
    }

    /*
     * The honeypot, checked first and answered as success. See the module
     * note: a distinguishable refusal is a tuning signal.
     */
    if (read('website')) {
      return NextResponse.redirect(new URL(`${PAGE}?sent=ok`, request.url), 303)
    }

    const name = read('name')
    const email = read('email')
    const subject = read('subject')
    const message = read('message')

    /*
     * The same bounds the CHECK constraints enforce, read from one definition
     * rather than written out again — so a value this accepts can never be
     * one the database rejects, which would turn a typo into a 500.
     */
    const within = (value: string, bounds: { min: number; max: number }) =>
      value.length >= bounds.min && value.length <= bounds.max

    const valid =
      within(name, CONTACT_LIMITS.name) &&
      within(subject, CONTACT_LIMITS.subject) &&
      within(message, CONTACT_LIMITS.message) &&
      within(email, CONTACT_LIMITS.email) &&
      email.includes('@')

    if (!valid) {
      return NextResponse.redirect(new URL(`${PAGE}?sent=invalid#contact-form`, request.url), 303)
    }

    if (!isDatabaseConfigured()) {
      /*
       * Not a silent drop and not a fake success. The page renders the error
       * path, which says the message could not be recorded and that nothing
       * was sent — so the person knows to ask again another way rather than
       * waiting for an answer that is not coming.
       */
      throw Errors.unknown({ reason: 'contact message storage' })
    }

    await recordContactMessage({
      name,
      email,
      subject,
      message,
      source: read('source') || 'contact',
    })

    return NextResponse.redirect(new URL(`${PAGE}?sent=ok#contact-form`, request.url), 303)
  } catch (error) {
    return errorResponse(error, { path: '/api/contact', request })
  }
}
