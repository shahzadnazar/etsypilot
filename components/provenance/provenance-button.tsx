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
         * A marker, so a check can tell an EXPLAINER from an ACTION.
         *
         * The operator console claims to be read-only, and a browser check
         * asserted it by counting buttons inside <main> and requiring zero.
         * That stopped being true the day provenance explainers landed — and
         * nobody noticed, because the check was reading a loading skeleton
         * that has no buttons in it. It passed for the wrong reason for as
         * long as the page lost that race.
         *
         * Zero is the wrong number now: this control opens a drawer and
         * changes nothing. The claim worth keeping is "every control on an
         * operator screen is an explainer", which needs the two to be
         * distinguishable from the outside.
         */
        data-provenance-explainer
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
        /*
         * p-1 is a TARGET-SIZE requirement, not padding for looks.
         *
         * The badge inside is 24px tall, which meets WCAG 2.2's minimum on
         * paper and failed it in practice: axe reported "partially obscured"
         * wherever a neighbour sat within the badge's own box — on
         * /admin/usage at 390 and /admin/ai at 768, measured. Four pixels of
         * padding gives the control its own clear space instead of borrowing
         * whatever the layout happens to leave.
         *
         * It is on the BUTTON, so only the clickable form grows. A static
         * badge is not a target and does not need it.
         */
        className="inline-flex rounded-full p-1 transition-shadow hover:ring-2 hover:ring-brand/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
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
