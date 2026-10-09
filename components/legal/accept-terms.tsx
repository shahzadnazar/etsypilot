import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { LEGAL_PAGES } from '@/domain/legal/pages'
import type { AcceptanceStatus } from '@/domain/legal/acceptance'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ACCEPT ACTION. EXPLICIT, UNTICKED, AND A REAL FORM POST.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Etsy's API Terms §4 requires Application Terms "executed with each Etsy
 * seller". Three things follow, and all three are visible in this file:
 *
 *   THE BOX STARTS UNTICKED and has no `defaultChecked`. A pre-ticked box is
 *   not consent, it is a default somebody failed to notice.
 *
 *   IT IS A FORM, not a fetch. Acceptance that depends on JavaScript having
 *   loaded is acceptance that can silently fail to record, and the record is
 *   the entire point. This posts with no JavaScript running at all.
 *
 *   THE VERSION IS SHOWN. Not as decoration: it is the hash that goes on the
 *   acceptance row, so a seller can match what they agreed to against what is
 *   on screen later without taking anybody's word for it.
 *
 * The checkbox is not the gate. /api/etsy/connect and /api/etsy/callback both
 * refuse server-side, and so do both sync entry points — see
 * domain/legal/acceptance.ts. This is the surface that lets a seller satisfy
 * the gate, not the thing that enforces it.
 */
export function AcceptTerms({ status }: { status: AcceptanceStatus }) {
  const documents = LEGAL_PAGES.slice(0, 2)

  if (status.current) {
    return (
      <Card className="mb-4 p-[18px]">
        <h3 className="text-section text-ink-1">Agreement on file</h3>
        <p className="mt-2 max-w-[75ch] text-small leading-relaxed text-ink-2">
          You accepted EtsyPilot&rsquo;s{' '}
          <Link
            href="/legal/terms"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link
            href="/legal/privacy"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          {status.acceptedAt ? ` on ${status.acceptedAt.slice(0, 10)}` : ''}. Etsy requires this
          agreement to exist before EtsyPilot may read your shop.
        </p>
        <p className="mt-2 text-caption text-muted-1">
          Version <span className="tabular-nums">{status.version.slice(0, 12)}</span>. If either
          document changes, you will be asked again before the next connect or sync — the version is
          a fingerprint of the documents themselves, so a change cannot go unnoticed.
        </p>
      </Card>
    )
  }

  return (
    <Card className="mb-4 p-[18px]">
      <h3 className="text-section text-ink-1">
        {status.stale
          ? 'The agreement has changed — please read it again'
          : 'Accept the agreement before connecting a shop'}
      </h3>
      <p className="mt-2 max-w-[75ch] text-small leading-relaxed text-ink-2">
        {status.stale ? (
          <>
            You accepted an earlier version of these documents
            {status.acceptedAt ? ` on ${status.acceptedAt.slice(0, 10)}` : ''}, and they have changed
            since. Etsy requires EtsyPilot to hold a current agreement with each seller, so please
            read them again.
          </>
        ) : (
          <>
            Etsy requires EtsyPilot to have an agreement with each seller before it may read their
            shop. This is that agreement. Nothing on Etsy is read or changed until it is accepted,
            and connecting is refused on the server rather than hidden in this page.
          </>
        )}
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {documents.map((page) => (
          <li key={page.href} className="text-small">
            <Link
              href={page.href}
              className="font-semibold text-brand-strong underline underline-offset-2"
            >
              {page.title}
            </Link>
          </li>
        ))}
      </ul>

      {/*
        * A plain form to a POST route. No onSubmit, no client component, no
        * JavaScript required — and the middleware's CSRF check covers it the
        * same way it covers every other unsafe method.
        */}
      <form action="/api/legal/accept" method="post" className="mt-4">
        <label className="flex max-w-[75ch] items-start gap-2.5 text-small leading-relaxed text-ink-1">
          {/*
            * No defaultChecked. Deliberately.
            *
            * h-6 w-6 and not h-4: WCAG 2.2 SC 2.5.8 wants a 24px target, and
            * tests/unit/tap-targets.test.ts enforces it across the product. A
            * consent checkbox is the last control that should be fiddly to
            * hit on a phone.
            */}
          <input
            type="checkbox"
            name="accept"
            required
            className="mt-0.5 h-6 w-6 shrink-0 accent-[var(--brand)]"
          />
          <span>
            I have read and accept EtsyPilot&rsquo;s Terms of Service and Privacy Policy, and I am
            authorised to accept them for this shop.
          </span>
        </label>
        <button
          type="submit"
          className="mt-3 inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
        >
          Accept and continue
        </button>
        <p className="mt-2 text-caption text-muted-1">
          Recorded against this shop with the date and the exact version you accepted:{' '}
          <span className="tabular-nums">{status.version.slice(0, 12)}</span>. The record is
          append-only — nothing in EtsyPilot can edit or delete it.
        </p>
      </form>
    </Card>
  )
}
