'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/states'

/*
 * The error boundary for the operator console.
 *
 * ── WHY THE APP-WIDE ONE IS NOT ENOUGH ────────────────────────────────────
 *
 * There was no error.tsx anywhere under app/(admin), so a thrown error fell
 * through to app/error.tsx — a full-screen `min-h-screen` 500 page. The
 * operator lost the banner, their navigation and any sense of where they were,
 * and the only way back into the console was the browser's back button. With
 * a boundary HERE the layout above it survives, so the failure is one panel on
 * a screen that still says OPERATIONS across the top.
 *
 * It renders inside app/(admin)/layout.tsx, which is the same property the 404
 * boundary relies on: a refused visitor never reaches this file, because the
 * layout passes children through and the page's own requireAdmin() throws
 * notFound() first.
 *
 * ── NO STACK TRACE, NO DATABASE MESSAGE, NO SECOND REFERENCE ──────────────
 *
 * `error.message` is never rendered. In production Next has already replaced
 * it with a minified string, but the rule does not depend on that: this
 * component is handed the error and deliberately reads one field from it.
 *
 * The reference is Next's digest OR NOTHING. app/error.tsx used to invent one
 * with a random generator, and it was removed for a reason that applies here
 * exactly: a reference that appears in no log is worse than no reference,
 * because it sends an operator into a support conversation holding evidence
 * that does not exist. When the digest is present it is the same value the
 * server logged.
 */
export default function OperatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const reference = error.digest

  useEffect(() => {
    // The server already recorded this through instrumentation.ts, redacted
    // and structured. This is the browser's view of the same event, marked as
    // such so it cannot be mistaken for the record.
    if (reference) console.warn('[etsypilot] operator error boundary', reference)
  }, [reference])

  return (
    <ErrorState
      title="This screen could not be loaded"
      recovery="Nothing was changed. The operator console is read-only apart from role and permission changes, and neither of those is in progress here. Try again, or open another screen from the navigation."
      reference={reference}
      onRetry={reset}
    />
  )
}
