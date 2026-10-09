import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE SUB-PROCESSOR TABLE IS A SECTION OF THE PRIVACY POLICY, RENDERED ON
 *   ITS OWN PAGE. IT IS NOT A SECOND DOCUMENT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The choice was to lift §4 out of the Privacy Policy into its own markdown
 * file, or to render §4 where it already is. Rendered, for three reasons:
 *
 *   1. GDPR Article 28 notice obligations attach to the policy. §4 already
 *      says "The current list is maintained at [[DOMAIN]]/legal/subprocessors"
 *      and "We will tell you before adding a new one" — if the page and the
 *      policy were two files, the policy would eventually name a provider the
 *      page did not, or the reverse, and the reader could not tell which one
 *      was the notice.
 *
 *   2. `tests/unit/legal-claims.test.ts` already checks §4 against
 *      package.json: an AI SDK in the dependencies requires an AI provider in
 *      the table. That guard reads the Privacy Policy. Moving the table out
 *      from under it would have quietly disarmed the one check that caught
 *      Anthropic's absence.
 *
 *   3. One source means one correction. Adding a provider is an edit to the
 *      policy, and the page follows.
 *
 * ── AND WHAT THE PAGE ADDS THAT THE TABLE CANNOT ──────────────────────────
 *
 * Four of the six rows name a `[[PLACEHOLDER]]` because the provider has not
 * been chosen. In the middle of the policy that reads as an unfinished
 * sentence. On a page headed "who else processes your data" it would read as a
 * fact — "a payment provider takes payment" — about something that does not
 * happen, because no payment provider is connected and no payment is taken.
 *
 * So each row is classified, and a row whose provider is still a blank is
 * marked NOT IN USE rather than listed as though it were live. That is the
 * instruction this page was built to: anything not yet wired up is marked, not
 * stated.
 */

import { emailSenderConfigured } from '@/domain/billing/trial'
import { paymentProviderConfigured } from '@/lib/billing'
import { legalDocument } from './documents'

/*
 * ── THE DISTINCTION THIS PAGE GOT WRONG ONCE, AND NOW MEASURES ────────────
 *
 * The first version of this page had two states — named, or a placeholder —
 * and marked every placeholder row "not in use". That put "database and
 * authentication" under NOT IN USE, which is false: a database is in use on
 * every request, Supabase handles every password, and what is missing is only
 * the NAME in the document.
 *
 * Telling a reader that nothing processes their data when something does is a
 * worse error than the over-claim this page was built to avoid. So there are
 * three states, and which one a row is in is read from the running
 * configuration rather than from the shape of the text:
 *
 *   NAMED             the document names the provider and it is in use
 *   IN_USE_UNNAMED    the role is live, the document has not named it. This is
 *                     a GDPR gap, not a formatting one — Article 28 requires
 *                     naming a processor — and the page says so rather than
 *                     softening it
 *   NOT_IN_USE        nothing is connected, so nothing is sent. Measured: the
 *                     email sender and the payment provider each answer for
 *                     themselves, through the same function the product uses
 *                     to decide whether it can send or charge
 */
export type SubProcessorStatus = 'NAMED' | 'IN_USE_UNNAMED' | 'NOT_IN_USE'

export interface SubProcessorRow {
  /** The provider, or the role, when the document names no provider. */
  who: string
  what: string
  where: string
  status: SubProcessorStatus
  /** Why it is in that state, measured. Empty for a named provider. */
  because: string
}

/**
 * How each unnamed role answers for itself.
 *
 * A placeholder with no entry here is a build error on the page rather than a
 * silent default, because the default a reader is owed depends entirely on
 * which role it is — and guessing is what put the database under "not in use".
 */
const UNNAMED_ROLES: Record<string, () => { status: SubProcessorStatus; because: string }> = {
  DATABASE_PROVIDER: () => ({
    status: 'IN_USE_UNNAMED',
    because:
      'A database holds every row in this product and an authentication provider handles every password, so this role is live. The Privacy Policy has not named the provider yet; naming it is required before launch, not optional.',
  }),
  HOSTING_PROVIDER: () => ({
    status: 'IN_USE_UNNAMED',
    because:
      'Something is serving this page, so this role is live by definition. The Privacy Policy has not named the host yet.',
  }),
  EMAIL_PROVIDER: () =>
    emailSenderConfigured()
      ? {
          status: 'IN_USE_UNNAMED',
          because:
            'An email sender is configured on this deployment, so email is being sent. It must be named in the Privacy Policy.',
        }
      : {
          status: 'NOT_IN_USE',
          because:
            'No email sender is configured, so no email is sent at all. This is also why a card-required free trial cannot start here: the trial promises an email before it ends, and the flow refuses rather than taking a card it cannot warn.',
        },
  PAYMENT_PROVIDER: () =>
    paymentProviderConfigured()
      ? {
          status: 'IN_USE_UNNAMED',
          because:
            'A payment provider is connected on this deployment. It must be named in the Privacy Policy.',
        }
      : {
          status: 'NOT_IN_USE',
          because:
            'No payment provider is connected, so no payment data exists. A Stripe adapter is written and every method of it except webhook verification refuses with a stated reason until a key and a customer mapping arrive.',
        },
}

const PLACEHOLDER = /\[\[([A-Z][A-Z0-9_]*)\]\]/

function cells(line: string): string[] {
  return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
}

/** The markdown of §4, exactly as the Privacy Policy carries it. */
export function subProcessorSection(): string {
  const { raw } = legalDocument('privacy')
  const start = raw.indexOf('## 4.')
  const end = raw.indexOf('## 5.')
  if (start === -1 || end === -1) {
    /*
     * Fails loudly rather than rendering an empty page. A sub-processor page
     * that silently shows nothing is indistinguishable from a product with no
     * sub-processors, which is the most misleading state this page could be
     * in.
     */
    throw new Error('the Privacy Policy has no section 4; the sub-processor page cannot be built')
  }
  return raw.slice(start, end).trim()
}

export function subProcessors(): SubProcessorRow[] {
  const rows: SubProcessorRow[] = []

  for (const line of subProcessorSection().split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const parts = cells(line)
    if (parts.length < 3) continue
    const [who = '', what = '', where = ''] = parts
    // The header row and the |---| alignment row carry no provider.
    if (/^who$/i.test(who) || /^[-:\s]+$/.test(who)) continue

    const blank = PLACEHOLDER.exec(who)
    if (!blank) {
      rows.push({
        who: who.replace(/[`*]/g, ''),
        what: what.replace(/[`*]/g, ''),
        where: where.replace(/[`*]/g, ''),
        status: 'NAMED',
        because: '',
      })
      continue
    }

    const role = blank[1]!
    const answer = UNNAMED_ROLES[role]
    if (!answer) {
      throw new Error(
        `section 4 of the Privacy Policy has an unnamed sub-processor role (${role}) that lib/legal/subprocessors.ts does not classify; a reader must not be told it is in use or not in use by default`,
      )
    }

    rows.push({
      who: role.replace(/_/g, ' ').toLowerCase(),
      what: what.replace(/[`*]/g, ''),
      where: where.replace(/[`*]/g, ''),
      ...answer(),
    })
  }

  if (rows.length === 0) {
    throw new Error('section 4 of the Privacy Policy has no table rows')
  }
  return rows
}
