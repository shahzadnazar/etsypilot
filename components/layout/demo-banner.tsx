import Link from 'next/link'

/*
 * The persistent demo banner (artboard 103b).
 *
 * Sits above the top bar on every screen while demo mode is active. Dark bar,
 * so it reads as chrome rather than as content, and it states plainly that
 * nothing here is connected to Etsy.
 */
export function DemoBanner() {
  return (
    <div
      /*
       * A labelled region, so it is reachable by landmark navigation, and
       * role="status" so a screen reader announces the mode rather than leaving
       * it to be discovered. It says nothing here can be published to Etsy,
       * which is the single most important sentence on the page.
       */
      role="status"
      aria-label="Demo mode"
      className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 md:px-[18px]"
      /*
       * Literal, not tokenised. --ink-1 inverts between themes, so using it here
       * produced white-on-white in dark mode. The banner is chrome that must
       * read as a dark bar in BOTH themes, so it carries its own colours - the
       * same reasoning that keeps the badge pill fills literal (D1/D10).
       */
      style={{ background: '#241B12' }}
    >
      <span
        className="rounded-[5px] px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.07em] text-white"
        style={{ background: 'rgba(255,255,255,.14)' }}
      >
        Demo mode
      </span>
      <span className="flex-1 text-[12px] leading-snug" style={{ color: '#F7F3ED' }}>
        You are exploring Willow &amp; Fern, a fictional shop. Nothing here is connected to Etsy.
      </span>
      <Link
        href="/onboarding?step=connect"
        className="shrink-0 rounded-[7px] bg-white px-2.5 py-1.5 text-[11px] font-semibold"
        style={{ color: '#241B12' }}
      >
        Connect my shop
      </Link>
    </div>
  )
}
