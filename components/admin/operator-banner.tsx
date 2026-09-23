import Link from 'next/link'

/*
 * THE OPERATOR MARKER.
 *
 * The one piece of the old hand-built shell that is kept exactly as it was,
 * and made more prominent rather than less. Same rationale as demo mode's
 * banner (D11): the marker exists so a screenshot cannot be misread. An
 * operator panel that looks like your own shop is one where a glance leads to
 * a wrong conclusion — and here the wrong conclusion is about somebody else's
 * business, in a support conversation, with their money on the screen.
 *
 * It sits ABOVE the sidebar and the top bar, spanning the full width, so there
 * is no scroll position and no breakpoint at which it is off screen. It also
 * names WHO you are signed in as: two operator accounts on one machine is the
 * ordinary case, and "which of my logins is this" is the question the banner
 * has to answer before it answers anything else.
 *
 * COLOURS ARE A LITERAL PAIR, not tokens, and that is the D1/D10 convention
 * rather than an exception to it. A token background with a literal foreground
 * breaks on theme flip — `--ink-2` inverts to #CBD5E1 in dark, which would put
 * near-white text on a light surface. The demo banner and the user-menu avatar
 * use the same fixed pair for the same reason: this strip must look identical
 * in both themes, because its whole job is to be unmistakable.
 */
export function OperatorBanner({ email, role }: { email: string; role: string }) {
  return (
    <div
      role="status"
      aria-label="Operator console"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-4 py-2.5 md:px-[18px]"
      style={{ background: '#241B12' }}
    >
      <span
        className="shrink-0 rounded-[5px] px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.07em] text-white"
        style={{ background: 'rgba(255,255,255,.14)' }}
      >
        Operator
      </span>
      <span className="min-w-0 flex-1 text-[12px] leading-snug" style={{ color: '#F7F3ED' }}>
        EtsyPilot operations — not a seller account. You are looking at every shop on the
        platform, read-only.
      </span>
      <span className="tnum truncate text-[11px]" style={{ color: '#C9BCA9' }}>
        {email} · {role.replace('_', ' ').toLowerCase()}
      </span>
      {/*
        * The way back to the seller app. An operator console with no exit is a
        * console people leave by editing the URL.
        *
        * prefetch={false}, and it is a D94 line rather than a performance one.
        * MEASURED: with the default prefetch, loading /admin/users in a browser
        * re-created the operator's own shop and membership rows. The operator
        * page had written nothing — Next had speculatively rendered /dashboard,
        * and the SELLER route repairs a missing shop by provisioning it.
        * Correct behaviour in the wrong place: opening an operator screen
        * should not execute a seller route, and "the operator area wrote no
        * seller data" is a much harder claim to make when merely looking at the
        * panel can trigger one.
        */}
      <Link
        href="/dashboard"
        prefetch={false}
        className="flex h-11 shrink-0 items-center rounded-[7px] bg-white px-3 text-[11px] font-semibold md:h-7"
        style={{ color: '#241B12' }}
      >
        My shop
      </Link>
    </div>
  )
}
