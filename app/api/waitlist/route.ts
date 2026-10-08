import { NextResponse } from 'next/server'
import { addToWaitlist } from '@/lib/repositories/waitlist'
import { errorResponse } from '@/lib/errors/api'
import { isDatabaseConfigured } from '@/lib/db'
import { Errors } from '@/lib/errors/types'

/*
 * The waitlist form.
 *
 * A plain form POST, like every other mutation here, so it works with no
 * JavaScript. It is also the only write in the product reachable by somebody
 * with no account, which is why what it may do is so narrow: one row, two
 * fields, no read path, nothing echoed back.
 *
 * ── NO EMAIL IS SENT, AND THE PAGE SAYS SO ────────────────────────────────
 *
 * There is no SMTP provider in this repository (see domain/billing/trial.ts).
 * So this records the address and the confirmation says exactly that — "we
 * have your address, nothing has been sent". Writing "check your inbox" over
 * a mailbox nothing will ever reach is the kind of small lie that costs more
 * than the feature earns.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData()
    const read = (key: string) => {
      const value = form.get(key)
      return typeof value === 'string' ? value : ''
    }

    const email = read('email').trim()
    /*
     * The same shape the CHECK constraint enforces, so the page's refusal and
     * the database's agree. Deliberately not an RFC-5322 regex: addresses that
     * look wrong and are valid are common, and the only cost of accepting one
     * is a row nobody emails.
     */
    if (!email.includes('@') || email.length < 3 || email.length > 320) {
      return NextResponse.redirect(new URL('/?waitlist=invalid#waitlist', request.url), 303)
    }

    if (!isDatabaseConfigured()) throw Errors.unknown({ reason: 'waitlist storage' })

    await addToWaitlist({
      email,
      shopUrl: read('shopUrl'),
      source: read('source') || 'landing',
    })

    /*
     * The SAME destination whether the row was new or already there. The
     * repository knows which, and the page must not: a form that says "you are
     * already on the list" is a membership check anyone can run against any
     * address.
     */
    return NextResponse.redirect(new URL('/?waitlist=ok#waitlist', request.url), 303)
  } catch (error) {
    return errorResponse(error, { path: '/api/waitlist', request })
  }
}
