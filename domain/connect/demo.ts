import 'server-only'

/*
 * The demo shop's connection timestamps, or null.
 *
 * `connectedAt` was a literal 2 June 2026 on every shop and `lastSyncedAt`
 * fell back to DEMO_LAST_SYNCED whenever our own `shops` row held null — the
 * state a shop that has never synced is in. On /settings/shops, the page whose
 * single job is to say whether a shop is connected and when it last read.
 */

import { isDemoMode } from '@/lib/etsy'
import { DEMO_LAST_SYNCED } from '@/lib/etsy/demo-dataset'

export function demoConnectedAt(): string | null {
  return isDemoMode() ? '2026-06-02T09:14:00.000Z' : null
}

export function demoLastSynced(): string | null {
  return isDemoMode() ? DEMO_LAST_SYNCED : null
}
