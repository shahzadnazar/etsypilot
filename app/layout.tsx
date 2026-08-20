import type { Metadata } from 'next'
import { ThemeScript } from '@/components/layout/theme-script'
import '@/styles/globals.css'

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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
