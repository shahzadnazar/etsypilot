import type { ReactNode } from 'react'

/*
 * The public shell.
 *
 * Deliberately NOT the dashboard shell: no sidebar, no shop switcher, no
 * session read. A free tool that asks who you are before it will divide two
 * numbers is not a free tool.
 *
 * These pages read no session, so nothing HERE forces them to render per
 * request. The root layout does, because it reads the CSP nonce out of a
 * request header (D52) — measured at ~20ms TTFB, and the calculator's speed
 * guarantee (D49) is about client-side arithmetic, which is untouched.
 *
 * (This comment used to say these pages were prerendered. That stopped being
 * true the moment the root layout read a header, and a file that misdescribes
 * itself is the same defect as a figure that misdescribes its source.)
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/*
        * No ThemeScript here. The ROOT layout renders it, in <head>, where it
        * runs before paint — which is the whole point of it. A second copy in
        * the body ran after first paint and could only ever re-apply what had
        * already been applied. It was found by making the nonce a required
        * prop: the compile error pointed at a call site that should not have
        * existed at all.
        */}
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
