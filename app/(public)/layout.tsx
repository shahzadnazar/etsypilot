import type { ReactNode } from 'react'
import { ThemeScript } from '@/components/layout/theme-script'

/*
 * The public shell.
 *
 * Deliberately NOT the dashboard shell: no sidebar, no shop switcher, no
 * session read. A free tool that asks who you are before it will divide two
 * numbers is not a free tool.
 *
 * It also means these pages can be prerendered — unlike everything under
 * (dashboard), which reads a session and therefore cannot be (D47).
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <ThemeScript />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-content items-center gap-2.5 px-4 py-3 md:px-6">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-[8px] text-[11px] font-bold"
            // Literal, not a token: this chip stays dark in both themes (D23).
            style={{ background: '#241B12', color: '#F7F3ED' }}
          >
            EP
          </span>
          <span className="text-body font-semibold text-ink-1">EtsyPilot</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-content flex-1 px-4 py-6 md:px-6">{children}</main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-content px-4 py-4 text-caption leading-relaxed text-muted-1 md:px-6">
          The term “Etsy” is a trademark of Etsy, Inc. This Application uses Etsy’s API, but is not
          endorsed or certified by Etsy.
        </div>
      </footer>
    </div>
  )
}
