import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ScopeList } from '@/components/connect/scope-list'
import { SyncProgress } from '@/components/connect/sync-progress'
import { NotYet } from '@/components/settings/not-yet'
import { Card } from '@/components/ui/card'
import { demoSyncState, getConnectionState } from '@/domain/connect/service'
import { CONNECT_OUTCOMES, connectOutcome, ETSY_SCOPES } from '@/domain/connect/types'
import { isDemoMode } from '@/lib/etsy'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Shop connections' }

/*
 * Etsy Connect.
 *
 * Phase 11 made "Connect a shop" a real OAuth redirect to /api/etsy/connect.
 * Everything else the seller reads on this page — the scopes, what breaks
 * without each one, what EtsyPilot cannot do, the revoke path — was already
 * true before the redirect became real and did not change with it.
 *
 * `?connect=<outcome>` reports how an attempt ended. The copy lives in
 * domain/connect/types.ts so the route and this page cannot describe different
 * outcomes.
 *
 * `?sync=1` shows the staged import, so the state can be reviewed and tested
 * without waiting for a live connection to be mid-flight.
 */
export default async function ShopConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; connect?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { sync, connect } = await searchParams
  const ctx = shopContext(session, session.shopId)
  const state = await getConnectionState(ctx)
  const showSync = sync === '1'
  const outcome = connectOutcome(connect)
  /*
   * Which scopes the "Connect a shop" link asks for. Everything the consent
   * screen marks REQUIRED or RECOMMENDED — the optional one is left to the
   * seller, because asking for a permission nobody chose is how a connect
   * screen becomes a checkbox people stop reading.
   */
  const defaultScopeKeys = ETSY_SCOPES.filter((s) => s.requirement !== 'OPTIONAL').map((s) => s.key)

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
            {/*
              * Disabled, not inert. This was a live-looking button with no
              * handler — the same defect Export & deletion refuses to ship a
              * delete button for. Revoking access genuinely works today, from
              * Etsy's own account page, and the panel below says so.
              */}
            <NotYet
              label="Disconnect shop"
              reason="Revoke from your Etsy account today — see below."
            />
            {/*
              * A plain link, not a button with a handler. Starting an OAuth
              * flow is a top-level navigation by nature, and one that works
              * with no JavaScript running is one that cannot fail to appear.
              */}
            <Link
              prefetch={false}
              href={`/api/etsy/connect?scopes=${defaultScopeKeys.join(',')}`}
              className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
            >
              Connect a shop
            </Link>
          </>
        }
      />

      {outcome ? (
        <Card className="mb-4 p-4">
          <h2 className="text-section text-ink-1">{CONNECT_OUTCOMES[outcome].title}</h2>
          <p className="mt-1 max-w-[75ch] text-small leading-relaxed text-ink-2">
            {CONNECT_OUTCOMES[outcome].detail}
          </p>
        </Card>
      ) : null}

      {state.notice ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">{state.notice}</Card>
      ) : null}

      {showSync ? (
        <div className="mb-4">
          <SyncProgress sync={demoSyncState(state.shopName ?? 'your shop', state.listingCount)} />
        </div>
      ) : null}

      <ScopeList granted={state.grantedScopes} />

      <Card className="mt-4 p-[18px]">
        <h3 className="text-section text-ink-1">What Etsy is asked for</h3>
        <p className="mt-2 max-w-[75ch] text-small leading-relaxed text-ink-2">
          Connecting sends you to Etsy to approve access. You type your Etsy password on etsy.com and
          never here — EtsyPilot has nowhere to put one. EtsyPilot receives a permission token, held
          on the server, encrypted, never in your browser, and revocable from either side.
          {isDemoMode()
            ? ' This server is running in demo mode with no Etsy credentials configured, so connecting will say so rather than sending you to Etsy.'
            : ''}
        </p>
      </Card>

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
