import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ScopeList } from '@/components/connect/scope-list'
import { SyncProgress } from '@/components/connect/sync-progress'
import { NotYet } from '@/components/settings/not-yet'
import { AcceptTerms } from '@/components/legal/accept-terms'
import { TermsOutcome } from '@/components/legal/terms-outcome'
import { Card } from '@/components/ui/card'
import { demoSyncState, getConnectionState } from '@/domain/connect/service'
import { CONNECT_OUTCOMES, connectOutcome, ETSY_SCOPES } from '@/domain/connect/types'
import { isDemoMode } from '@/lib/etsy'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { acceptanceStatus, termsAreOfferable } from '@/domain/legal/acceptance'
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
  searchParams: Promise<{ sync?: string; connect?: string; terms?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { sync, connect, terms } = await searchParams
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

  /*
   * ── THE AGREEMENT, AND WHY IT IS NOT READ IN DEMO MODE ─────────────────
   *
   * Etsy's API Terms §4 requires Application Terms executed with each Etsy
   * SELLER. A demo shop has no Etsy connection, no OAuth token and no seller:
   * there is nobody for an agreement to be with, the callback refuses in demo
   * mode before it reaches the gate, and `acceptanceStatus` would hit a
   * database that a demo deployment does not have.
   *
   * So this screen looks exactly as it did in demo mode, which is the
   * constraint — and the acceptance panel appears for a live seller, who is
   * the only person who can connect anything.
   */
  const acceptance = isDemoMode() ? null : await acceptanceStatus(session.shopId)
  const canConnect = acceptance ? acceptance.current : true

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
            {/*
              * Disabled when the gate will refuse, so the page does not offer
              * an action that bounces. The gate itself is server-side — see
              * domain/legal/acceptance.ts — and this is only the honest
              * rendering of it, the same way the Disconnect button above is
              * disabled rather than mocked.
              */}
            {canConnect ? (
              <Link
                prefetch={false}
                href={`/api/etsy/connect?scopes=${defaultScopeKeys.join(',')}`}
                className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
              >
                Connect a shop
              </Link>
            ) : (
              <NotYet
                label="Connect a shop"
                reason={
                  termsAreOfferable()
                    ? 'Accept the Terms and Privacy Policy below first — Etsy requires an accepted agreement with each seller.'
                    : 'The Terms and Privacy Policy are still drafts, so there is nothing to accept and no shop can be connected yet.'
                }
              />
            )}
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

      {terms ? <TermsOutcome outcome={terms} /> : null}

      {/*
        * The agreement goes ABOVE the scope list, because it is the thing that
        * has to happen first: a seller reading what each Etsy permission does
        * is reading about a connection they cannot start yet.
        */}
      {acceptance ? <AcceptTerms status={acceptance} /> : null}

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
          {/*
            * This paragraph said "revoke from here or from your Etsy account
            * — both take effect immediately", three lines below a Disconnect
            * button that is a disabled NotYet. The page contradicted itself
            * about a data-rights control, which is the worst place to do it.
            * It now says what is true: revoking happens on Etsy today.
            */}
          Revoke from your Etsy account, under Account settings → Apps. It takes effect immediately
          and stops EtsyPilot reading or writing anything. There is no Disconnect button here yet —
          the one above is disabled rather than mocked. Your history in EtsyPilot stays readable, and
          you can export it, or request its deletion, from{' '}
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
