'use client'

import { useEffect } from 'react'
import { makeReference } from '@/lib/errors/types'

/*
 * The 500 surface.
 *
 * Says what happened, what it means for the user's data, and gives a reference
 * they can quote. Never a stack trace (architecture.md section 10).
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const reference = error.digest ?? makeReference()

  useEffect(() => {
    // Sentry lands in Phase 12. Until then this keeps the failure visible in
    // the server log rather than swallowing it.
    console.error('[etsypilot]', reference, error.message)
  }, [error, reference])

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <p className="tnum text-metric text-muted-2">500</p>
      <h1 className="text-page text-ink-1">Something went wrong on our side</h1>
      <p className="text-body text-ink-2">
        This is an EtsyPilot error, not a problem with your shop or your Etsy data. Nothing was
        published.
      </p>
      <p className="tnum text-caption text-muted-1">Reference {reference}</p>
      <div>
        <button
          onClick={reset}
          className="rounded-control bg-brand px-3.5 py-2.5 text-[12.5px] font-semibold text-white"
        >
          Reload
        </button>
      </div>
    </main>
  )
}
