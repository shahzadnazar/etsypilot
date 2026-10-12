'use client'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   WHAT A SELLER SEES WHILE A REFRESH RUNS, AND AFTER ONE FAILS.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Rendered only by components/sync/data-withheld.tsx, and only when the page
 * is already withholding its figures. Its job is to turn that withholding into
 * something that resolves itself, and to say out loud what is happening while
 * it does — "absent is not zero" applies to a spinner too: a screen that goes
 * quiet for two seconds and then fills in is indistinguishable from a screen
 * that was broken.
 *
 * ── IT DOES NOT RETRY ITSELF, AND THAT IS THE IMPORTANT PART ──────────────
 *
 * router.refresh() re-renders the server tree. If the refresh succeeded the
 * page is no longer withholding and this component is gone. If it FAILED, the
 * page is still withholding and this component renders again — and an
 * unguarded effect would post again, and again, every time, for as long as
 * Etsy keeps refusing. That is an accidental retry loop pointed at a 10,000
 * request-a-day budget shared by every seller of this app.
 *
 * So an attempt is recorded in a module-level set keyed by the aggregate AND
 * the staleness it was trying to fix. A second mount for the same stale
 * timestamp does nothing. A successful refresh changes the timestamp, so the
 * key changes with it and a genuinely new staleness is attempted normally. The
 * seller can always retry by hand, which is what the button is for, and that
 * path deliberately ignores the set.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type RefreshFailureCode =
  | 'TERMS_NOT_ACCEPTED'
  | 'TERMS_NOT_PUBLISHED'
  | 'NOT_CONNECTED'
  | 'NOT_CONFIGURED'
  | 'RATE_LIMITED'
  | 'ETSY_UNAVAILABLE'
  | 'UNKNOWN'

interface Outcome {
  kind: string
  aggregate?: string
  reason?: string
}

/** Attempts already made in this tab, by aggregate and the staleness attempted. */
const attempted = new Set<string>()

/**
 * What each failure means for the seller, and what they can do about it.
 *
 * rules.md §12: what happened, what to do next, and whether retry helps. No
 * message from the server is rendered here — the server sends a code, this
 * file owns the words, and a stack trace or an internal identifier therefore
 * cannot reach a screen by accident.
 */
const FAILURE_COPY: Record<RefreshFailureCode, { what: string; next: string; retry: boolean }> = {
  TERMS_NOT_ACCEPTED: {
    what: 'CobaltRank cannot read your shop until you accept the current Application Terms.',
    next: 'Open Settings → Shop connections to read and accept them. Nothing is read from Etsy until you do.',
    retry: false,
  },
  /*
   * The state of every deployment until the legal documents are finished, and
   * the one it would be easiest to word as the seller's fault. There is no
   * agreement for them to accept, so neither "accept the terms" nor "try
   * again" is true.
   */
  TERMS_NOT_PUBLISHED: {
    what: 'CobaltRank cannot read your shop yet: its Application Terms are not published.',
    next: 'Nothing is wrong with your shop or your connection, and this is not something you can fix — we cannot read Etsy data for anyone until the agreement is finished. Your previously read data is untouched.',
    retry: false,
  },
  NOT_CONNECTED: {
    what: 'Etsy no longer accepts this connection.',
    next: 'Reconnect the shop from Settings → Shop connections. Nothing in your shop was changed.',
    retry: false,
  },
  /*
   * Separate from NOT_CONNECTED on purpose. "Reconnect your shop" cannot fix a
   * server with no Etsy credentials, and sending a seller round that loop is
   * worse than telling them plainly that it is not theirs to fix. This is the
   * state every deployment is in until the API key arrives.
   */
  NOT_CONFIGURED: {
    what: 'CobaltRank cannot reach Etsy from this server.',
    next: 'Nothing is wrong with your shop or your connection, and this is not something you can fix — it is a configuration problem on our side. Your previously read data is untouched.',
    retry: false,
  },
  RATE_LIMITED: {
    what: 'Etsy is limiting how often CobaltRank may ask for data right now.',
    next: 'Nothing is wrong with your shop or your connection. Try again in a few minutes.',
    retry: true,
  },
  ETSY_UNAVAILABLE: {
    what: 'Etsy did not answer.',
    next: 'Your previously read data is untouched. Try again shortly.',
    retry: true,
  },
  UNKNOWN: {
    what: 'The re-read did not finish.',
    next: 'Nothing was changed, and your previously read data is untouched. Try again, and contact support if it keeps happening.',
    retry: true,
  },
}

function failureCode(outcomes: Outcome[]): RefreshFailureCode | null {
  const failed = outcomes.find((o) => o.kind === 'FAILED')
  if (!failed) return null
  const reason = failed.reason
  return reason !== undefined && reason in FAILURE_COPY ? (reason as RefreshFailureCode) : 'UNKNOWN'
}

export function RefreshTrigger({
  aggregates,
  /** The staleness this mount is trying to fix. Null when nothing has synced. */
  staleAt,
}: {
  aggregates: string[]
  staleAt: string | null
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'running' | 'busy' | 'skipped' | 'failed'>('idle')
  const [failure, setFailure] = useState<RefreshFailureCode | null>(null)
  const running = useRef(false)

  const run = useCallback(
    async (manual: boolean) => {
      if (running.current) return
      const key = `${aggregates.join(',')}@${staleAt ?? 'never'}`
      if (!manual && attempted.has(key)) return
      attempted.add(key)
      running.current = true
      setState('running')
      setFailure(null)
      try {
        const response = await fetch('/api/sync/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ aggregates }),
        })
        if (!response.ok) {
          setState('failed')
          setFailure('UNKNOWN')
          return
        }
        const body = (await response.json()) as { outcomes?: Outcome[] }
        const outcomes = body.outcomes ?? []
        const code = failureCode(outcomes)
        if (code) {
          setState('failed')
          setFailure(code)
          return
        }
        if (outcomes.length > 0 && outcomes.every((o) => o.kind === 'SKIPPED')) {
          /*
           * Nothing to re-read: the shop is not connected to Etsy, or its row
           * is gone. Not a failure, and above all not something to keep saying
           * "re-reading now" about — a control that claims an action is in
           * progress when none was started is the same defect as a figure
           * that claims a measurement nobody took.
           */
          setState('skipped')
          return
        }

        if (outcomes.some((o) => o.kind === 'BUSY')) {
          /*
           * Another process holds the lock for this shop. Not a failure and
           * not something to retry in a loop: the winner is doing the work,
           * and refreshing the page is how this one finds out it finished.
           */
          setState('busy')
          router.refresh()
          return
        }
        setState('idle')
        router.refresh()
      } catch {
        setState('failed')
        setFailure('UNKNOWN')
      } finally {
        running.current = false
      }
    },
    [aggregates, router, staleAt],
  )

  useEffect(() => {
    void run(false)
  }, [run])

  if (state === 'skipped') {
    return (
      <p role="status" className="max-w-prose text-small text-ink-2">
        This shop is not connected to Etsy, so there is nothing to re-read.
      </p>
    )
  }

  if (state === 'failed' && failure) {
    const copy = FAILURE_COPY[failure]
    return (
      <div role="status" className="max-w-prose rounded-control border border-line bg-canvas-soft p-3">
        <p className="text-small font-semibold text-ink-1">{copy.what}</p>
        <p className="mt-1 text-small leading-relaxed text-ink-2">{copy.next}</p>
        {copy.retry ? (
          <button
            type="button"
            onClick={() => void run(true)}
            className="mt-3 inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-1 hover:bg-canvas md:h-[38px]"
          >
            Try again
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <p role="status" aria-live="polite" className="max-w-prose text-small text-ink-2">
      {state === 'busy'
        ? 'Another session is already re-reading this shop. This page will update when it finishes.'
        : 'Re-reading your shop from Etsy now…'}
    </p>
  )
}
