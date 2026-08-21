'use client'

/*
 * The last boundary.
 *
 * app/error.tsx handles a failure inside a page. It cannot handle a failure in
 * the ROOT layout, because it renders inside it — if the layout throws, the
 * boundary that would catch it never mounts, and the user gets whatever the
 * browser shows for a blank document.
 *
 * global-error replaces the whole document, which is why it carries its own
 * <html> and <body>. It is also why it uses inline styles and no design
 * tokens: this file must render correctly when the stylesheet is exactly what
 * failed to load. A recovery page that depends on the thing that broke is not a
 * recovery page.
 *
 * Colours are literal and light-only for the same reason — the theme script
 * lives in the layout that just failed, so there is no data-theme to respond to
 * and no CSS variable that resolves.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#FBF8F3', color: '#4A4234', fontFamily: 'system-ui, sans-serif' }}>
        <main
          style={{
            maxWidth: '36rem',
            margin: '0 auto',
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '1rem',
            padding: '0 1.5rem',
          }}
        >
          <p style={{ fontSize: '2.5rem', fontWeight: 700, color: '#8C7F6C', margin: 0 }}>500</p>
          <h1 style={{ fontSize: '1.5rem', color: '#241B12', margin: 0 }}>
            EtsyPilot failed to load
          </h1>
          <p style={{ lineHeight: 1.6, margin: 0 }}>
            This is an EtsyPilot error, not a problem with your shop or your Etsy data. Nothing was
            published to Etsy, and nothing in your shop was changed.
          </p>
          {/*
            * The reference is printed only when Next actually produced one.
            *
            * app/error.tsx used to fall back to makeReference() when the digest
            * was absent — a fresh random string, shown to the user as something
            * to quote, that appears in no log anywhere. A reference that
            * corresponds to nothing is worse than no reference: it sends
            * someone into a support conversation holding evidence that does not
            * exist.
            */}
          {error.digest ? (
            <p style={{ fontSize: '0.8rem', color: '#6B6152', margin: 0 }}>
              Reference {error.digest}
            </p>
          ) : null}
          <div>
            <button
              onClick={reset}
              style={{
                background: '#B4472A',
                color: '#FFFFFF',
                border: 0,
                borderRadius: '8px',
                padding: '0.7rem 1rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
