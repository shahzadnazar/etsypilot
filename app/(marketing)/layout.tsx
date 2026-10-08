import { IBM_Plex_Mono, Petrona } from 'next/font/google'
import '@/styles/marketing.css'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PUBLIC PAGES. THE ONLY PLACE IN THE PRODUCT WITH A DISPLAY FACE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The app loads Inter and nothing else, which is right for a dense financial
 * UI and wrong for the one page whose job is to not look like every other
 * page. One family and no display face is the single most-cited marker of a
 * generated landing page.
 *
 * Two faces, scoped to this route group so the dashboard's bundle is untouched:
 *
 *   PETRONA        a newspaper-weight serif. The headline voice, and the
 *                  ledger's own heading. Chosen over the usual suspects
 *                  because it was drawn for long-form text at small sizes and
 *                  holds up large — it reads as a broadsheet rather than as a
 *                  "statement font", which is the register this page wants:
 *                  a financial document, not a product launch.
 *   IBM PLEX MONO  every figure, and the ledger's chrome. Real tabular
 *                  figures, a humanist mono that reads as a printed statement
 *                  rather than a terminal, and its digits are the same width
 *                  as each other by design rather than by feature flag.
 *
 * Inter stays as the body face, so the page still feels like the app.
 *
 * Both are fetched at BUILD time and served from this origin, for the reasons
 * app/layout.tsx records at length: a render-blocking link to
 * fonts.googleapis.com is a blank page on any network that cannot reach
 * Google, and a third party learning a visitor's IP undoes the privacy
 * promise this page is making three sections down. The CSP has no
 * third-party origin in it and this does not add one.
 */
const petrona = Petrona({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-mono',
})

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${petrona.variable} ${plexMono.variable} marketing`}>{children}</div>
  )
}
