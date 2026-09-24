'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

/*
 * The one and only showing of a set of recovery codes.
 *
 * ── THE CODES ARE TEXT ON THE PAGE FIRST, AND A BUTTON SECOND ─────────────
 *
 * This component is the reason the copy button exists, not the other way
 * round. Every code is rendered as selectable text, so the screen is complete
 * with JavaScript disabled, with the clipboard API unavailable (it is, over
 * plain http on anything but localhost), and in the browser of someone who
 * simply prefers to write them down. The button is an accelerant for the
 * common case; it is never the only way out.
 *
 * That ordering is what this project's own history argues for. A control whose
 * behaviour lived entirely in a ref that was never attached shipped once, and
 * no unit test could see it because the defect was in whether the DOM ended up
 * wired. Here the failure mode is bounded: if the button does nothing, the
 * codes are still on the screen.
 *
 * ── THE COPY IS BLUNT ON PURPOSE ──────────────────────────────────────────
 *
 * "Save these somewhere safe" is the sentence everyone writes and nobody acts
 * on. The instruction that matters is WHERE NOT to save them — the phone being
 * enrolled — because a password manager on the same device that holds the
 * authenticator turns two factors back into one, and that is precisely the
 * habit a well-meaning person falls into.
 */
export function RecoveryCodes({ codes }: { codes: readonly string[] }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      /*
       * Swallowed, and the state is NOT set. A button that says "Copied" when
       * nothing reached the clipboard is worse than one that appears to do
       * nothing: the first sends someone away believing they have the codes.
       * The list above is still selectable either way.
       */
    }
  }

  return (
    <div className="rounded-card border border-line bg-canvas-soft p-4">
      <h2 className="text-[15px] font-semibold text-ink-1">Your recovery codes</h2>
      <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-2">
        These are shown once and cannot be retrieved again. Each one works a single time, and any
        one of them gets you in if you lose your phone.
      </p>
      <p
        className="mt-2 max-w-prose rounded-card border p-2.5 text-small leading-relaxed"
        style={{
          background: 'var(--warning-surface)',
          borderColor: 'var(--warning-border)',
          color: 'var(--warning-ink)',
        }}
      >
        <strong className="font-semibold">Do not save these on the phone you just enrolled.</strong>{' '}
        If the codes live on the same device as the authenticator, losing that device loses both —
        and you are back to a password being the only thing in the way. A printout, or a password
        manager you can reach from another device, is the point.
      </p>

      <ul
        className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-[13px] tabular-nums text-ink-1"
        data-recovery-codes
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <div className="mt-3 flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy all'}
        </Button>
        <span className="text-caption text-muted-1">
          {codes.length} codes. They are not stored anywhere you can read them again.
        </span>
      </div>
    </div>
  )
}
