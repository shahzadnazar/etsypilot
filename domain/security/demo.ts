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
 *                        EtsyPilot extension · Chrome  Dhaka, BD · 6 min ago
 *     Recent activity    Failed sign-in · wrong password
 *
 * A stranger's Google account and a stranger's devices, on the screen a seller
 * goes to when they are worried someone else is in their account — with a page
 * header asserting its own truthfulness. Of everything the fixture reached,
 * this is the one that would make a seller act: sign out a session that is not
 * theirs, or trust that the two they can see are all there are.
 *
 * None of it is derivable yet. EtsyPilot does not record sessions, sign-ins or
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
      {
        id: 'ext-chrome',
        kind: 'EXTENSION',
        label: 'EtsyPilot extension · Chrome',
        detail: 'Read-only · etsy.com',
        location: 'Dhaka, BD',
        lastSeen: '2026-08-12T14:00:00.000Z',
        current: false,
        /*
         * The extension holds no privileged Etsy credential and cannot write.
         * That is a property of what it was built as, not a setting, so it is
         * stated on the row rather than shown as a toggle somebody could
         * mistake for something they can change.
         */
        readOnly: true,
      },
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
