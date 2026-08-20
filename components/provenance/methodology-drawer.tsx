'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import type { Methodology } from '@/lib/provenance/methodology'
import { CONFIDENCE_LABEL, PROVENANCE_DEFINITION } from '@/lib/provenance/types'
import { formatRelative } from '@/lib/utils/format'
import { ProvenanceBadge } from './provenance-badge'

/*
 * The methodology drawer (artboard 93 content model).
 *
 * 420px on desktop, a full-screen sheet on mobile. Focus is trapped while open
 * and restored to the trigger on close; Escape closes it.
 *
 * Renders the seven fields in the order the Methodology page uses them, and
 * omits a row rather than printing an empty one - a blank "Confidence:" line
 * would imply we measured confidence and found none.
 */
export function MethodologyDrawer({
  methodology,
  demo,
  onClose,
}: {
  methodology: Methodology
  demo: boolean
  onClose: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return

      // Trap focus inside the panel while it is open.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="methodology-title"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-y-auto border-l border-line bg-surface shadow-overlay outline-none sm:w-drawer"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="flex flex-col gap-2">
            <h2 id="methodology-title" className="text-section text-ink-1">
              {methodology.metric}
            </h2>
            <div className="flex items-center gap-2">
              <ProvenanceBadge type={methodology.type} demo={demo} />
              <span className="text-caption text-muted-1">
                {PROVENANCE_DEFINITION[methodology.type]}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close methodology"
            className="rounded-control p-1.5 text-muted-1 hover:bg-canvas-soft"
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <dl className="flex flex-col gap-4 p-5">
          <Row label="Source">{methodology.source}</Row>
          <Row label="Method">{methodology.method}</Row>

          {methodology.freshness ? (
            <Row label="Freshness">
              <span className="tnum">Updated {formatRelative(methodology.freshness)}</span>
            </Row>
          ) : null}

          {methodology.confidence ? (
            <Row label="Confidence">{CONFIDENCE_LABEL[methodology.confidence]}</Row>
          ) : null}

          {/* The field the original tooltips lacked. */}
          {methodology.coverage !== undefined ? (
            <Row label="Coverage">
              <span className="tnum font-semibold text-ink-1">{methodology.coverage}%</span>{' '}
              {methodology.coverageLabel}
              <CoverageBar percent={methodology.coverage} />
            </Row>
          ) : null}

          {methodology.limitations?.length ? (
            <Row label="Limitations">
              <ul className="flex list-disc flex-col gap-1.5 pl-4">
                {methodology.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Row>
          ) : null}

          {methodology.exclusions?.length ? (
            <Row label="Exclusions">
              <ul className="flex list-disc flex-col gap-1.5 pl-4">
                {methodology.exclusions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </Row>
          ) : null}
        </dl>

        {methodology.readMoreHref ? (
          <div className="mt-auto border-t border-line p-5">
            <a
              href={methodology.readMoreHref}
              className="text-small font-semibold text-brand-strong underline underline-offset-2"
            >
              See the full methodology →
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="text-label uppercase tracking-[0.06em] text-muted-1">{label}</dt>
      <dd className="text-small leading-relaxed text-ink-2">{children}</dd>
    </div>
  )
}

/** Coverage shown as a proportion, not just a number. */
function CoverageBar({ percent }: { percent: number }) {
  const complete = percent >= 100
  return (
    <span
      aria-hidden
      className="mt-2 block h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--canvas-soft)' }}
    >
      <span
        className="block h-full rounded-full"
        style={{
          width: `${percent}%`,
          background: complete ? 'var(--success)' : 'var(--warning)',
        }}
      />
    </span>
  )
}
