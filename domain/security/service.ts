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
import { nowIso } from '@/domain/clock'
import { demoSecurity } from './demo'
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
  /** Null where no password is on file, which is every real account today. */
  passwordChangedOn: string | null
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
  const demo = demoSecurity()

  /*
   * ══════════════════════════════════════════════════════════════════════
   *   A SECURITY PAGE THAT INVENTS A SESSION IS THE WORST PLACE TO INVENT
   *   ANYTHING.
   * ══════════════════════════════════════════════════════════════════════
   *
   * Everything below used to be the literals now in ./demo.ts, returned for
   * every account. Measured in a browser on a live seller's own settings:
   * "Google sign-in — Connected as salman@willowandfern.com", two browser
   * sessions in Dhaka with Sign out buttons, and a failed sign-in — under a
   * page header reading "Everything below is a true description of this
   * account, and the controls that would change it are disabled rather than
   * pretending."
   *
   * EtsyPilot records none of these for a seller account. Not a password, not
   * a session, not a sign-in. So the live view returns nothing and the page
   * renders the absence, which is the honest answer and also the one that
   * makes the missing feature visible instead of looking finished.
   */
  return {
    now: nowIso(),
    passwordChangedOn: demo?.passwordChangedOn ?? null,
    /*
     * Off, and the page says why it matters rather than nagging. "This account
     * can change live listings" is the actual stake, and it is a stronger
     * argument than a red badge. (The badge itself reads the real Supabase
     * posture; this field is the fallback.)
     */
    twoStepEnabled: false,
    googleConnectedAs: demo?.googleConnectedAs ?? null,
    sessions: demo?.sessions ?? [],
    events: demo?.events ?? [],
    etsyConnection: { mode: etsy.mode, canWrite: etsy.canWrite },
  }
}
