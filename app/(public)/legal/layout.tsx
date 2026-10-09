import type { ReactNode } from 'react'
import Link from 'next/link'
import { IBM_Plex_Mono, Petrona } from 'next/font/google'
import '@/styles/marketing.css'
import '@/styles/legal.css'
import { DraftNotice } from '@/components/legal/draft-notice'
import { LEGAL_PAGES } from '@/domain/legal/pages'

/*
 * The legal shell.
 *
 * ── WHY THESE PAGES ARE IN (public) AND NOT (marketing) ───────────────────
 *
 * They have to be reachable with no account — a seller reads the terms BEFORE
 * signing up, and a regulator or an Etsy reviewer reads them with no account
 * at all. (public) is the group that already means that: no session read, no
 * sidebar, no shop switcher.
 *
 * ── AND WHY THEY CARRY THE LANDING PAGE'S TYPOGRAPHY ──────────────────────
 *
 * The app loads Inter and nothing else. A policy set in a dense UI face reads
 * like a settings screen; these are documents, and Petrona was picked for the
 * landing page precisely because it reads as a printed financial statement.
 * The two faces are loaded here, scoped to this group, so the dashboard's
 * bundle is untouched — same arrangement as app/(marketing)/layout.tsx, and
 * the same reason the faces are self-hosted rather than linked: a
 * render-blocking request to fonts.googleapis.com is a blank page on a network
 * that cannot reach Google, and a third party learning the IP of someone
 * reading a privacy policy would undo the document's own promise.
 */
const petrona = Petrona({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
  variable: '--font-display',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
})

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${petrona.variable} ${plexMono.variable} marketing legal`}>
      {/*
        * The draft state goes above everything, on every one of these pages,
        * rather than on the two that happen to carry placeholders. A reader
        * who lands on /legal/subprocessors must not have to visit
        * /legal/terms to discover that none of it is in force yet.
        */}
      <DraftNotice />

      <nav
        aria-label="Legal documents"
        className="mb-6 flex flex-wrap gap-x-4 gap-y-1.5 border-b pb-3 text-[13px]"
        style={{ borderColor: 'var(--border)' }}
      >
        {LEGAL_PAGES.map((page) => (
          <Link key={page.href} href={page.href} style={{ color: 'var(--ink-2)' }}>
            {page.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  )
}
