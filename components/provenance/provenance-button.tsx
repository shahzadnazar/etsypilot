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
        /*
         * A ring on hover, not opacity.
         *
         * This used to fade the whole badge on hover, its text with it. The
         * Demo chip is 10px muted-1 on canvas-soft: 5.6:1 at rest, 3.66:1 once
         * something multiplies it by 0.8. So hovering the control put its own
         * label below AA, in both themes. Opacity is the wrong affordance for
         * anything containing text - it degrades contrast by construction.
         *
         * Every contrast sweep missed it for eleven phases, because a sweep
         * audits a page nobody is touching. It surfaced only because the mouse
         * happened to be resting on one of these after a click on the previous
         * route. tests/browser/rendered-output.py now reads the stylesheets for
         * any hover rule that lowers opacity, which is the deterministic
         * version of that accident.
         *
         * The offending utility class is deliberately NOT written out anywhere
         * in this file. Tailwind scans source text, not JSX, so naming it in a
         * comment re-emits the rule and fails that check - the fifth time a
         * comment promising the absence of a thing has recreated the thing.
         */
        className="rounded-full transition-shadow hover:ring-2 hover:ring-brand/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
