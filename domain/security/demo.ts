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
       * ── THE DEMO NO LONGER HAS AN EXTENSION SESSION ──────────────────────
       *
       * There was a third row here: `ext-chrome`, "CobaltRank extension ·
       * Chrome", read-only, last seen on etsy.com. It was the one entry in
       * this fixture that advertised a feature — a demo visitor reading the
       * security page would conclude an extension exists and that they could
       * install one.
       *
       * D95 removed the extension, so the row is an authored claim about
       * something that is not there, which is exactly what a demo fixture may
       * not be. The CODE PATH stays: `SessionKind` still has 'EXTENSION',
       * /settings/security still renders such a row with its read-only note
       * and a working Revoke, and the page explains it — because a live
       * deployment may still hold a real extension session granted before the
       * removal, and hiding access that exists is the opposite of what a
       * security page is for.
       *
       * So: nothing invented in the demo, nothing hidden in live.
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
