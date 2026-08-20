'use client'

import { useState } from 'react'
import { getMethodology } from '@/lib/provenance/methodology'
import { PROVENANCE_LABEL, type ProvenanceType } from '@/lib/provenance/types'
import { MethodologyDrawer } from './methodology-drawer'
import { ProvenanceBadge } from './provenance-badge'

/*
 * A provenance badge that opens its methodology.
 *
 * The badge promises an explanation; this is what makes the promise clickable.
 * If no methodology is registered for the metric the badge renders as a plain
 * static badge rather than a button that does nothing - a dead control is worse
 * than no control.
 */
export function ProvenanceButton({
  metricKey,
  type,
  demo = false,
}: {
  metricKey: string
  type: ProvenanceType
  demo?: boolean
}) {
  const [open, setOpen] = useState(false)
  const methodology = getMethodology(metricKey)

  if (!methodology) return <ProvenanceBadge type={type} demo={demo} />

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="rounded-full transition-opacity hover:opacity-80"
      >
        <ProvenanceBadge type={type} demo={demo} />
        <span className="sr-only">
          {PROVENANCE_LABEL[type]} — see how {methodology.metric} is calculated
        </span>
      </button>

      {open ? (
        <MethodologyDrawer
          methodology={methodology}
          demo={demo}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}
