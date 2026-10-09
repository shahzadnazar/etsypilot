import Link from 'next/link'
import { legalDocumentsInForce } from '@/lib/legal/documents'
import { LEGAL_PAGES } from '@/domain/legal/pages'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PUBLIC LINKS, AND THE RULE THAT DECIDES WHETHER THEY EXIST.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A page carrying an unfilled placeholder must not be publicly linked and must
 * not be presented as an agreement. A footer link is a presentation: it says
 * "here are our terms", and a visitor who follows it is entitled to assume
 * that what they find is in force.
 *
 * So one function answers it — `legalDocumentsInForce()` in
 * lib/legal/documents.ts — and every public surface reads the same answer. The
 * marketing footer, this component's signup variant and the acceptance flow
 * cannot disagree about whether these documents are ready.
 *
 * ── WHAT IS RENDERED WHILE THEY ARE DRAFTS ────────────────────────────────
 *
 * Not nothing. Silence on a signup form is its own small deception: the
 * documents themselves say "by creating an account … you accept these terms",
 * and a visitor creating an account is owed the fact that no such agreement
 * exists yet. So the draft state renders a sentence and NO LINK — the pages
 * stay reachable by URL for anyone who wants them (see
 * components/legal/draft-notice.tsx) and are not advertised as settled.
 *
 * The footer variant renders nothing at all while in draft, deliberately: a
 * line of small print about unfinished documents at the bottom of every
 * marketing page is noise, and the signup form is where it matters.
 */

export function LegalLinks({
  variant,
  className,
}: {
  variant: 'footer' | 'signup'
  className?: string
}) {
  const inForce = legalDocumentsInForce()

  if (!inForce) {
    if (variant === 'footer') return null
    return (
      <p className={className}>
        EtsyPilot&rsquo;s Terms of Service and Privacy Policy are still drafts: the legal entity
        behind EtsyPilot has not been established, so they name no party and are not in force.
        Nothing is being presented to you for acceptance, and no Etsy shop can be connected until
        they are finished.
      </p>
    )
  }

  if (variant === 'footer') {
    return (
      <>
        {LEGAL_PAGES.map((page) => (
          <Link key={page.href} href={page.href} style={{ color: 'var(--ink-2)' }}>
            {page.label}
          </Link>
        ))}
      </>
    )
  }

  return (
    <p className={className}>
      By creating an account you accept EtsyPilot&rsquo;s{' '}
      <Link href="/legal/terms" className="font-semibold underline underline-offset-2">
        Terms of Service
      </Link>{' '}
      and{' '}
      <Link href="/legal/privacy" className="font-semibold underline underline-offset-2">
        Privacy Policy
      </Link>
      . Connecting an Etsy shop asks you to accept them explicitly, and records that you did.
    </p>
  )
}
