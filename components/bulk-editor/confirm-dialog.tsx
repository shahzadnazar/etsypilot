'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ROLLBACK_WINDOW_DAYS } from '@/domain/bulk-editor/plan'

/*
 * The confirmation gate, made visible (artboard 42).
 *
 * The publish button stays disabled until the acknowledgement is ticked. That
 * is a courtesy, not the guarantee — `confirm()` refuses an unacknowledged
 * operation regardless of what the UI allowed. The dialog states the count, the
 * fact that these are live listings, and the rollback window, because a
 * confirmation that hides its consequences is not consent.
 */
export function ConfirmDialog({
  count,
  onCancel,
  onPublish,
}: {
  count: number
  onCancel: () => void
  onPublish: (acknowledged: boolean) => void
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused.current?.focus()
    }
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} aria-hidden />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        tabIndex={-1}
        className="relative w-full max-w-lg rounded-panel border border-line bg-surface p-6 shadow-overlay outline-none"
      >
        <h2 id="confirm-title" className="text-section text-ink-1">
          Publish to <span className="tnum">{count}</span> listing{count === 1 ? '' : 's'}?
        </h2>

        <p className="mt-2.5 text-body leading-relaxed text-ink-2">
          This updates <span className="tnum font-semibold">{count}</span> live listing
          {count === 1 ? '' : 's'} on Etsy. A rollback point is created automatically and stays
          available for {ROLLBACK_WINDOW_DAYS} days.
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-control border border-line p-3">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-6 w-6 accent-[var(--brand)]"
          />
          <span className="text-small text-ink-2">
            I understand this updates {count} live Etsy listing{count === 1 ? '' : 's'}.
          </span>
        </label>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
          {/*
            * "Schedule instead" is gone from this dialog entirely, and that is
            * the fix rather than an omission.
            *
            * Its handler was `() => setConfirmOpen(false)` — it closed the
            * dialog and did nothing else. So a seller who chose it believed
            * their job was queued, and it was not: worse than the dead button
            * on the step behind it, because a dead button at least fails
            * visibly. This is a confirm dialog for a write to live listings,
            * which is the last place to leave a control that lies about what it
            * did.
            *
            * The unbuilt state is stated once, on the review step, by NotYet.
            */}
          <Button
            variant="primary"
            disabled={!acknowledged}
            onClick={() => onPublish(acknowledged)}
          >
            Publish to {count}
          </Button>
        </div>
      </div>
    </div>
  )
}
