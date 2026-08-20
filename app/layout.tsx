import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeScript } from '@/components/layout/theme-script'
import '@/styles/globals.css'

/*
 * The font is fetched at BUILD time and served from this origin.
 *
 * It used to be a plain <link rel="stylesheet"> to fonts.googleapis.com, which
 * is render-blocking: the browser will not paint until that stylesheet
 * resolves. That is fine on a fast network and terrible on any network that
 * cannot reach Google — a corporate proxy, an aggressive blocker, a bad mobile
 * connection. The seller gets a blank page for as long as their browser takes
 * to give up.
 *
 * It was measured here, not theorised: in this sandbox the browser cannot
 * egress, so every page load blocked for 12.6s and then failed with
 * ERR_CONNECTION_RESET. `main` stayed empty that whole time, which is what made
 * the billing cancel check look like a broken mutation — the mutation had
 * committed in 3ms and the page had been served in 18ms.
 *
 * Two other things this buys, both of which matter for this product:
 *   - No third party learns a seller's IP address and which page they opened.
 *     A privacy promise undone by a font link is not a privacy promise.
 *   - `display: 'swap'` plus Next's generated fallback metrics means text is
 *     readable immediately and does not jump when the face loads.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: {
    default: 'EtsyPilot',
    template: '%s · EtsyPilot',
  },
  description:
    'Make smarter Etsy decisions with data you can trust. EtsyPilot is an Etsy seller decision and operations intelligence platform.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={inter.variable}>{children}</body>
    </html>
  )
}
