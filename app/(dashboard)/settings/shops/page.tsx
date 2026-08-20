import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ScopeList } from '@/components/connect/scope-list'
import { SyncProgress } from '@/components/connect/sync-progress'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { demoSyncState, getConnectionState } from '@/domain/connect/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Shop connections' }

/*
 * Etsy Connect.
 *
 * Phase 11 replaces the "Continue to Etsy" link with a real OAuth redirect.
 * Everything the seller reads on this page — the scopes, what breaks without
 * each one, what EtsyPilot cannot do, the revoke path — is already true and
 * does not change when the redirect becomes real.
 *
 * `?sync=1` shows the staged import, so the state can be reviewed and tested
 * without waiting for a live connection to be mid-flight.
 */
export default async function ShopConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { sync } = await searchParams
  const ctx = shopContext(session, session.shopId)
  const state = await getConnectionState(ctx)
  const showSync = sync === '1'

  return (
    <>
      <PageHeader
        title="Shop connections"
        subtitle={
          state.shopName
            ? `${state.shopName} · connected ${state.connectedAt ? formatDateTime(state.connectedAt) : 'recently'} · last synced ${state.lastSyncedAt ? formatDateTime(state.lastSyncedAt) : 'never'}`
            : 'No shop connected'
        }
        actions={
          <>
            <Link
              href="/settings/shops?sync=1"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              View sync details
            </Link>
            <Button variant="secondary">Disconnect shop</Button>
          </>
        }
      />

      {state.notice ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">{state.notice}</Card>
      ) : null}

      {showSync ? (
        <div className="mb-4">
          <SyncProgress sync={demoSyncState(state.shopName ?? 'your shop')} />
        </div>
      ) : null}

      <ScopeList granted={state.grantedScopes} />

      <Card className="mt-4 p-[18px]">
        <h3 className="text-section text-ink-1">Revoking access</h3>
        <p className="mt-2 max-w-[75ch] text-small leading-relaxed text-ink-2">
          Revoke from here or from your Etsy account — both take effect immediately. Revoking stops
          EtsyPilot reading or writing anything. Your history in EtsyPilot stays readable, and you
          can export or delete it from{' '}
          <Link
            href="/settings/export"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Export &amp; deletion
          </Link>
          .
        </p>
      </Card>
    </>
  )
}
