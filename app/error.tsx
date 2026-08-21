'use client'

import { useEffect } from 'react'

/*
 * The 500 surface.
 *
 * Says what happened, what it means for the user's data, and — when there is
 * one — a reference they can quote. Never a stack trace (architecture.md
 * section 10).
 *
 * Verified rather than assumed: a page throwing
 * `Error('... sk_live_51ABCDEF... at /home/user/.../tokens.ts:42')` renders
 * this screen with none of that string anywhere in the HTML or the DOM. Next
 * strips error detail in production; this component never had access to it.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  /*
   * Next's digest, or nothing.
   *
   * This used to fall back to makeReference() — a fresh random string, shown to
   * the user as something to quote, that appears in NO log anywhere. Verified:
   * when the digest exists it is the same value the server logged
   * (`digest: '3664705723'`), so it genuinely joins the two. When it does not,
   * an invented one is worse than none: it sends someone into a support
   * conversation holding evidence that does not exist.
   */
  const reference = error.digest

  useEffect(() => {
    /*
     * The server already recorded this through instrumentation.ts, redacted and
     * structured. This line is the CLIENT's view — it fires in the browser, and
     * `error.message` here is React's minified production message, never the
     * server's. Keeping it short and marked as such stops it being mistaken for
     * the real record.
     */
    if (reference) console.warn('[etsypilot] client error boundary', reference)
  }, [reference])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <p className="tnum text-metric text-muted-2">500</p>
      <h1 className="text-page text-ink-1">Something went wrong on our side</h1>
      <p className="text-body text-ink-2">
        This is an EtsyPilot error, not a problem with your shop or your Etsy data. Nothing was
        published.
      </p>
      {reference ? (
        <p className="tnum text-caption text-muted-1">Reference {reference}</p>
      ) : null}
      <div>
        <button
          onClick={reset}
          className="rounded-control bg-brand px-3.5 py-2.5 text-[12.5px] font-semibold text-brand-on"
        >
          Reload
        </button>
      </div>
    </main>
  )
}
