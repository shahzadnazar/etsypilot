'use client'

import { useEffect } from 'react'

/*
 * The browser-tab title for an operator screen, set after hydration.
 *
 * ── WHY NOT metadata, AND WHY NOT AN INLINE <title> EITHER ────────────────
 *
 * Not `export const metadata`, and not `generateMetadata`. Next resolves BOTH
 * whether or not the page component renders, and it resolves them in parallel
 * with the layout — so the layout's notFound() does not stop them. MEASURED,
 * with a probe title on /admin/audit, after the gate moved into the layout:
 *
 *   seller                 404   probe string in the response: true
 *   manager (no audit.view) 404   probe string in the response: true
 *
 * and the refused browser tab read "PROBE-AUDIT-TITLE · EtsyPilot". A refused
 * request must not carry the name of the screen it was refused. That premise
 * predates this component and was re-measured rather than inherited, because
 * one other premise in this file's neighbourhood had already expired.
 *
 * An inline <title> closed that — React 19 hoists it into the head only when
 * the component actually renders — and opened two smaller things, both
 * measured:
 *
 *   TWO TITLES IN THE HEAD. The root layout's metadata emits <title>EtsyPilot
 *   </title>, the hoisted one is a second, and `document.title` is the FIRST
 *   in document order. On /admin/users the root's landed first and the tab
 *   read "EtsyPilot" on a plain server render — the operator title was in the
 *   head and ignored.
 *
 *   A NODE THAT OUTLIVES ITS PAGE. React hoists a COPY; the original element
 *   stays in the body tree. After navigating /admin/audit -> /dashboard the
 *   head was correct and the body still held
 *   <title>Audit log · Operations · EtsyPilot</title>. Head nodes that
 *   accumulate across navigations go on accumulating.
 *
 * A LAYOUT's metadata leaks too — measured on the same gated layout that
 * returns the 404, with the same result. All three routes Next offers are
 * closed, so the title cannot come from metadata at all.
 *
 * ── SO THE TITLE IS SET, NOT RENDERED — AND RE-ASSERTED ───────────────────
 *
 * This renders nothing. It assigns document.title, which means the server's
 * response carries <title>EtsyPilot</title> for everyone, refused or not;
 * there is exactly one title node; and nothing is left behind on navigation,
 * because nothing was inserted.
 *
 * THE OBSERVER IS NOT BELT AND BRACES. It is there because a single
 * assignment LOSES A RACE, measured with the effect instrumented:
 *
 *   /admin/users   effect ran once, set 'Accounts · Operations · EtsyPilot',
 *                  read it back correctly — and 2.5s later the tab read
 *                  'EtsyPilot'
 *   /admin/ai      same code, same load, correct
 *
 * Operator pages export no metadata, so the title Next resolves for them is
 * the root layout's default, 'EtsyPilot' — and Next applies it when the
 * route's payload completes, which on a streamed page can be after hydration.
 * Whichever lands second wins, and which lands second varies with how much
 * the page had to fetch.
 *
 * So the component re-asserts while it is mounted, and stops the moment it
 * unmounts. It cannot fight the NEXT page's title, because by then it is
 * gone. Setting document.title to a value it already holds is not a mutation,
 * so the observer does not feed itself.
 *
 * THE COST, stated: with JavaScript off the tab reads "EtsyPilot" rather than
 * the screen's name. That is the trade — a generic tab title against a
 * refused request naming the screen — and the page's own h1 says where you
 * are either way.
 */
export function OperatorTitle({ page }: { page: string }) {
  useEffect(() => {
    const wanted = `${page} · Operations · EtsyPilot`
    const apply = () => {
      /*
       * ONLY EDIT A TITLE THAT EXISTS; never bring one into being.
       *
       * Assigning document.title when the head has no <title> CREATES one, and
       * that cost a node on the way out: navigating /admin/audit -> /dashboard
       * left TWO in the head. Next removes the old element as part of the
       * transition, this observer saw that removal, re-asserted into the gap
       * and minted a replacement — a moment before unmounting and
       * disconnecting. Next then added the seller's, and the operator's stray
       * stayed.
       *
       * Measured as 2 title nodes on that one navigation and 1 everywhere
       * else, which is what made the teardown the place to look.
       */
      if (!document.head.querySelector('title')) return
      if (document.title !== wanted) document.title = wanted
    }
    apply()

    /*
     * The head, not the <title> node: Next replaces the element rather than
     * editing its text, so watching the node alone would stop watching the
     * moment it was swapped.
     */
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [page])

  return null
}
