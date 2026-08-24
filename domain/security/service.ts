/*
 * Security (artboard 111).
 *
 * The closing note is the load-bearing part of this screen: the Etsy password
 * is never involved, and the shop connection is a revocable OAuth token. A
 * seller who believes EtsyPilot holds their Etsy password behaves differently —
 * more anxiously and less safely — than one who knows it holds a token they can
 * revoke from either end.
 *
 * The extension appears in Active sessions as a READ-ONLY entry that can be
 * revoked. It is a session in the sense that matters to the person reading the
 * list — something with access, in a place, that can be taken away — and
 * leaving it out of the list because it is a different kind of credential would
 * hide the one entry most people forget they granted.
 */

import { getEtsyService } from '@/lib/etsy'
import { DEMO_NOW } from '@/lib/etsy/demo-dataset'
import type { ShopContext } from '@/lib/permissions'

export type SessionKind = 'BROWSER' | 'EXTENSION'

export interface ActiveSession {
  id: string
  kind: SessionKind
  label: string
  /** Masked session reference, or the scope for the extension. */
  detail: string
  location: string
  lastSeen: string
  current: boolean
  /** True for the extension. Named, not implied by the kind. */
  readOnly: boolean
}

export type SecurityEventOutcome = 'SUCCEEDED' | 'FAILED' | 'INFORMATIONAL'

export interface SecurityEvent {
  at: string
  label: string
  outcome: SecurityEventOutcome
}

export interface SecurityView {
  /*
   * The reference point for "6 minutes ago".
   *
   * Returned rather than left to the component, which was calling
   * formatRelative(lastSeen, new Date(lastSeen)) — every session, including one
   * last seen two days ago, rendered "just now". A relative time needs two
   * instants, and a component that has only one will always find them equal.
   */
  now: string
  passwordChangedOn: string
  twoStepEnabled: boolean
  googleConnectedAs: string | null
  sessions: ActiveSession[]
  events: SecurityEvent[]
  /** The Etsy connection, stated as what it actually is. */
  etsyConnection: {
    mode: 'mock' | 'live'
    canWrite: boolean
  }
}

/*
 * `ctx` is unused today and is still in the signature. A real implementation
 * reads this account's sessions and events, and a function that took no context
 * would be one a caller could invoke without proving which account it is for.
 */
export async function getSecurityView(ctx: ShopContext): Promise<SecurityView> {
  void ctx
  const etsy = getEtsyService()

  return {
    now: DEMO_NOW,
    passwordChangedOn: '2026-05-18',
    /*
     * Off, and the page says why it matters rather than nagging. "This account
     * can change live listings" is the actual stake, and it is a stronger
     * argument than a red badge.
     */
    twoStepEnabled: false,
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
    etsyConnection: { mode: etsy.mode, canWrite: etsy.canWrite },
  }
}
