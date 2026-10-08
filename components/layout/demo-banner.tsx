import Link from 'next/link'

/*
 * The persistent banner above the top bar (artboard 103b).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   TWO STATES, BECAUSE THIS BAR ANSWERS TWO DIFFERENT QUESTIONS AND WAS
 *   ONLY EVER WRITTEN FOR ONE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It rendered on `session.isDemo`, which is `shops.is_demo` — a fact about the
 * SHOP ROW: has this shop ever connected to Etsy. The sentence it rendered is
 * a claim about the DATA: "You are exploring Willow & Fern, a fictional shop."
 *
 * Those come apart in the state every new signup on a live deployment is in.
 * `ETSY_MODE=live`, nothing connected yet: the shop row is still a placeholder
 * so the banner appeared, while the mock was serving nothing and the chip
 * beside it read "My demo shop". One screen, one shop, two names, and a
 * sentence about a fictional catalogue nobody was being shown.
 *
 * domain/sync/source.ts drew this distinction already and recorded why:
 * `ETSY_MODE` describes the DEPLOYMENT, `is_demo` describes the SHOP, and they
 * disagree exactly here. The chrome did not get that fix. It has it now:
 *
 *   DEMO_DATA       the fictional catalogue is being served. Dark bar, the
 *                   fixture's own name, "nothing here is connected to Etsy".
 *   NOT_CONNECTED   real mode, real account, no Etsy connection yet. True
 *                   statement, same Connect call to action, no claim about
 *                   fictional data — because there is none.
 *
 * ── THE FIXTURE'S NAME IS PASSED IN, NOT HARDCODED ────────────────────────
 *
 * "Willow & Fern" was a literal in this file: a layout component naming a
 * specific demo fixture. It was unfalsifiable while the banner could render
 * for any shop — and it was already slightly wrong, because the chip reads
 * "Willow & Fern Studio" from the adapter while this said "Willow & Fern".
 * The name now comes from the same place the chip gets it, so the two cannot
 * disagree and a second fixture would not need this file edited.
 */
export type BannerKind = 'DEMO_DATA' | 'NOT_CONNECTED' | 'PUBLIC_DEMO'

export function ShopStateBanner({ kind, shopName }: { kind: BannerKind; shopName: string }) {
  if (kind === 'PUBLIC_DEMO') return <PublicDemoBanner shopName={shopName} />
  return kind === 'DEMO_DATA' ? <DemoBanner shopName={shopName} /> : <NotConnectedBanner />
}

/**
 * A visitor with no account, looking around the fixture.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   A THIRD STATE, BECAUSE THE OTHER TWO BOTH ADDRESS SOMEBODY WHO HAS AN
 *   ACCOUNT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * DEMO_DATA says "Connect my shop" and NOT_CONNECTED says the same. Both are
 * the right next step for a signed-in seller and neither is available to
 * somebody who has not signed up — a public visitor clicking Connect would
 * land in onboarding for an account that does not exist.
 *
 * It also has to be louder. A signed-in seller knows they are in their own
 * product; a visitor arrived from a marketing page and may not have registered
 * that the shop in front of them is invented. So this one names the fixture,
 * says nothing can be changed, and offers the two things a visitor can
 * actually do: join the waitlist, or leave.
 */
function PublicDemoBanner({ shopName }: { shopName: string }) {
  return (
    <div
      role="status"
      aria-label="Public demo"
      className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 md:px-[18px]"
      // Literal for the same reason the other two are: --ink-1 inverts between
      // themes and produced white-on-white in dark mode.
      style={{ background: '#241B12' }}
    >
      <span
        className="rounded-[5px] px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.07em] text-white"
        style={{ background: 'rgba(255,255,255,.14)' }}
      >
        Live demo
      </span>
      <span className="flex-1 text-[12px] leading-snug" style={{ color: '#F7F3ED' }}>
        You are looking at {shopName}, a fictional shop, with no account. Everything is read-only
        and nothing can be changed or sent to Etsy.
      </span>
      <Link
        href="/#waitlist"
        className="shrink-0 rounded-[7px] bg-white px-2.5 py-1.5 text-[11px] font-semibold"
        style={{ color: '#241B12' }}
      >
        Join the waitlist
      </Link>
      {/*
        * prefetch={false}, and this is not a formality. Next prefetches a
        * <Link> the moment it enters the viewport, and this one is in a banner
        * on every screen — so the visitor's demo cookie would be deleted by
        * the page merely rendering, and they would be thrown out of the demo
        * before clicking anything. tests/unit/links.test.ts caught it.
        */}
      <a href="/api/demo/exit"
        className="shrink-0 rounded-[7px] border px-2.5 py-1.5 text-[11px] font-semibold"
        style={{ borderColor: 'rgba(255,255,255,.3)', color: '#F7F3ED' }}
      >
        Leave the demo
      </a>
    </div>
  )
}

function DemoBanner({ shopName }: { shopName: string }) {
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
        You are exploring {shopName}, a fictional shop. Nothing here is connected to Etsy.
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

/**
 * Real mode, real account, no Etsy connection yet.
 *
 * ── WHAT THIS SAYS, AND WHAT IT CAREFULLY DOES NOT ────────────────────────
 *
 * It does not say the data is fictional, because none is being served: in this
 * state the screens read our own tables and those tables are empty, which is
 * why every one of them says "Not synced yet" rather than showing a figure.
 * It does not say "demo", because nothing about this account is a demo.
 *
 * It keeps the dark bar and the Connect call to action, which are the two
 * things the demo banner was doing usefully here — a seller in this state has
 * exactly one next step and the chrome should hold it on every screen.
 *
 * `role="status"` and the label match the demo variant, so a screen reader
 * announces which of the two states it is in rather than hearing "Demo mode"
 * for both.
 */
function NotConnectedBanner() {
  return (
    <div
      role="status"
      aria-label="Shop not connected"
      className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 md:px-[18px]"
      // Literal for the same reason the demo variant's is: --ink-1 inverts
      // between themes and produced white-on-white in dark mode.
      style={{ background: '#241B12' }}
    >
      <span
        className="rounded-[5px] px-2 py-[3px] text-[9.5px] font-semibold uppercase tracking-[0.07em] text-white"
        style={{ background: 'rgba(255,255,255,.14)' }}
      >
        Not connected
      </span>
      <span className="flex-1 text-[12px] leading-snug" style={{ color: '#F7F3ED' }}>
        This shop is not connected to Etsy yet, so there is nothing to show on these screens
        yet either. Connecting reads your listings and orders in.
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
