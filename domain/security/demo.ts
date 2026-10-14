import 'server-only'

/*
 * The one place the demo account's security picture is allowed to exist.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *   MEASURED ON A LIVE ACCOUNT, ON THE PAGE THAT SAYS "EVERYTHING BELOW IS A
 *   TRUE DESCRIPTION OF THIS ACCOUNT".
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     Google sign-in     Connected as salman@willowandfern.com   [Disconnect]
 *     Active sessions    Chrome · macOS   THIS DEVICE   Dhaka, BD · just now
 *                        Safari · iPhone  Dhaka, BD · 2 days ago  [Sign out]
 *                        CobaltRank extension · Chrome  Dhaka, BD · 6 min ago
 *     Recent activity    Failed sign-in · wrong password
 *
 * A stranger's Google account and a stranger's devices, on the screen a seller
 * goes to when they are worried someone else is in their account — with a page
 * header asserting its own truthfulness. Of everything the fixture reached,
 * this is the one that would make a seller act: sign out a session that is not
 * theirs, or trust that the two they can see are all there are.
 *
 * None of it is derivable yet. CobaltRank does not record sessions, sign-ins or
 * a password for seller accounts, so the live view says so instead.
 */

import { isDemoMode } from '@/lib/etsy'
import { DEMO_NOW } from '@/lib/etsy/demo-dataset'
import type { ActiveSession, SecurityEvent } from './service'

export interface DemoSecurity {
  passwordChangedOn: string
  googleConnectedAs: string
  sessions: ActiveSession[]
  events: SecurityEvent[]
}

export function demoSecurity(): DemoSecurity | null {
  if (!isDemoMode()) return null
  return {
    passwordChangedOn: '2026-05-18',
    googleConnectedAs: 'salman@willowandfern.com',
    sessions: [
      {
        id: 'sess-2a-f1',
        kind: 'BROWSER',
        label: 'Chrome · macOS',
        detail: 'Session 2a··f1',
        location: 'Dhaka, BD',
        lastSeen: DEMO_NOW,
        current: true,
        readOnly: false,
      },
      {
        id: 'sess-7c-b9',
        kind: 'BROWSER',
        label: 'Safari · iPhone',
        detail: 'Session 7c··b9',
        location: 'Dhaka, BD',
        lastSeen: '2026-08-10T09:12:00.000Z',
        current: false,
        readOnly: false,
      },
      /*
       * ── A THIRD SESSION ROW WAS HERE, AND IT ADVERTISED A FEATURE ────────
       *
       * `ext-chrome`, read-only, last seen on etsy.com. It was the one entry
       * in this fixture that told a demo visitor the product had a capability
       * it does not have — and a demo exists to show what the product does.
       *
       * D95 removed the capability; the fixture row went with it, and the
       * type that described it has one member now (../security/service.ts).
       * In live mode this list is empty anyway: nothing in this product
       * records a session yet, which is what the page says rather than
       * filling the space.
       */
    ],
    events: [
      { at: '2026-08-12T08:41:00.000Z', label: 'Signed in · Chrome, macOS', outcome: 'SUCCEEDED' },
      {
        at: '2026-08-09T22:17:00.000Z',
        label: 'Failed sign-in · wrong password',
        outcome: 'FAILED',
      },
      {
        at: '2026-08-01T10:03:00.000Z',
        label: 'Etsy connection re-authorised',
        outcome: 'INFORMATIONAL',
      },
    ],
  }
}
