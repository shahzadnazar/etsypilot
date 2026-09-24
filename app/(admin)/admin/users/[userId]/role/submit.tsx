'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

/*
 * The submit control for the role form, which refuses to submit a no-op.
 *
 * ── WHY THIS IS A CLIENT COMPONENT AND THE REST OF THE FORM IS NOT ────────
 *
 * The page renders the radios on the server, and only the button is moved
 * across the boundary. That is deliberate: the form asks for a password, and a
 * password field that depends on a hydrated bundle is a password field that
 * fails on a slow connection. Everything that decides anything — the gate, the
 * parse, the step-up — is server-side, and this component is the last inch of
 * the interface.
 *
 * ── IT STARTS ENABLED, ON PURPOSE ─────────────────────────────────────────
 *
 * The server render has no idea which radio is checked, and the first client
 * render deliberately does not use its own guess either: `sameAsNow` is false
 * until the effect below runs. So the HTML that arrives contains an ENABLED
 * button.
 *
 * That is what keeps the form usable with JavaScript off. Radios work without
 * it; a button that server-rendered as disabled because the current role
 * happened to be pre-selected would leave a no-JS operator with a form they
 * could fill in and never submit. The disabling is an improvement layered on
 * top, and the server refuses nothing it would have accepted — a no-op
 * submitted anyway is still recorded, as a no-op.
 *
 * It listens to the FORM rather than owning the radios, for the same reason:
 * lifting the fieldset in here to hold its state would put the password field
 * inside a client component.
 */
export function ChangeRoleSubmit({ currentRole }: { currentRole: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [sameAsNow, setSameAsNow] = useState(false)

  useEffect(() => {
    const form = ref.current?.form
    if (!form) return
    const read = () => setSameAsNow(new FormData(form).get('role') === currentRole)
    read()
    form.addEventListener('change', read)
    return () => form.removeEventListener('change', read)
  }, [currentRole])

  const label = currentRole === 'MANAGER' ? 'a manager' : 'a user'

  return (
    <>
      <Button ref={ref} type="submit" variant="primary" disabled={sameAsNow}>
        Change role
      </Button>
      {/*
       * D70: a control that is off has to say why it is off. A greyed button
       * with nothing beside it reads as a bug, and the operator's next move is
       * to reload and try again.
       */}
      {sameAsNow ? (
        <span className="text-caption text-muted-1">
          Already {label}. Pick a different role to change anything.
        </span>
      ) : null}
    </>
  )
}
