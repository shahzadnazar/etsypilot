import Link from 'next/link'
import { notFound } from 'next/navigation'
import { OperatorSection } from '@/components/admin/operator-section'
import { Numeric } from '@/components/ui/numeric'
import { EmptyState } from '@/components/ui/states'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardBody } from '@/components/ui/card'
import { OperatorFigure } from '@/components/admin/operator-figure'
import { requireAdmin } from '@/domain/admin/access'
import {
  detailReads,
  financialsFor,
  visibleSections,
  type AccountSectionKey,
} from '@/domain/admin/account-detail'
import { roleSource } from '@/domain/admin/roles'
import { FORECLOSED_BY_DESIGN } from '@/domain/admin/operator-writes'
import {
  adminReadAccountDetail,
  type AdminAccountDetail,
} from '@/lib/repositories/admin-reads-every-shop'
import { formatDate, formatDateTime, formatNumber } from '@/lib/utils/format'

/*
 * One seller account, in depth. READ-ONLY.
 *
 * ── THE ONLY INTERACTIVE THING HERE IS A LINK ─────────────────────────────
 *
 * No form, no button, no disabled control. D70: a control that appears to work
 * and does not is worse than no control, and on an operator screen the
 * argument is stronger again — an operator who clicks "Fix costs" and sees
 * nothing happen stops looking for the real answer while a seller waits. The
 * single link goes to the role editor, which is a separate page with its own
 * gate and its own password prompt.
 *
 * What this screen CANNOT do is listed on it, from the same constant the
 * write-boundary guard reads. A panel that silently lacks a capability looks
 * like a panel that has not got round to it; one that names its limits is
 * making a claim a reader can check.
 *
 * ── COMPOSED FROM THE VIEWER'S PERMISSIONS, NOT CENSORED AFTER ────────────
 *
 * visibleSections() decides which sections exist for this viewer, and
 * detailReads() turns that same answer into what the database is asked for. A
 * manager without financials.view causes no query against the seller's profit
 * record — not a query whose result is dropped, none at all.
 *
 * OMITTED, NEVER LOCKED (D91). A padlock tells someone what exists and that
 * they cannot have it, which is the reconnaissance the 404-instead-of-403 rule
 * exists to deny. A section the viewer may not see leaves no gap where it
 * would have been, and the section count in the summary line counts only what
 * they can see, so the number does not leak the total either.
 *
 * ── NO `export const metadata` ────────────────────────────────────────────
 *
 * Measured, not assumed: Next resolves static metadata independently of
 * whether the component renders, so it survives notFound() and lands in the
 * flight payload of a 404. On this route the title would carry the fact that
 * the operator panel exists. React 19 hoists <title> from the component, which
 * a refused request never reaches.
 */
export const dynamic = 'force-dynamic'

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  /*
   * users.detail, and requireAdmin() 404s rather than 403s. Called here rather
   * than inherited from the layout: the layout passes children through for a
   * refused request, so the page is what refuses. A sweep asserts every
   * operator page does this.
   */
  const access = await requireAdmin('users.detail')
  const { userId } = await params

  const sections = visibleSections(access.can)
  const detail = await adminReadAccountDetail(userId, detailReads(sections))
  if (!detail) notFound()

  const mayChangeRole =
    access.canSuperAdminOnly('roles.write') && roleSource(detail.resolvedRole) !== 'ENVIRONMENT'

  return (
    <div className="mx-auto w-full max-w-[860px]">
      <title>Account · Operations · EtsyPilot</title>

      <PageHeader
        back={{ href: '/admin/users', label: 'Accounts' }}
        title={detail.email}
        subtitle={
          <>
            {sections.length === 1 ? '1 section' : `${sections.length} sections`} · read-only.
            Nothing on this page changes anything, and no buyer of this shop appears anywhere
            on it.
          </>
        }
      />

      <div className="mt-4 flex flex-col gap-3">
        {sections.map((section) => (
          <OperatorSection spaced={false} key={section.key} title={section.title} blurb={section.blurb}>
            <SectionBody
              section={section.key}
              detail={detail}
              mayChangeRole={mayChangeRole}
            />
          </OperatorSection>
        ))}
      </div>

      <Card className="mt-4">
        <CardBody>
          <h2 className="text-small font-semibold text-ink-1">What this panel cannot do</h2>
          <p className="mt-1 max-w-prose text-caption leading-relaxed text-muted-1">
            Not a list of things not built yet. The operator area can write four things — a platform
            role and three audit logs — and a test walks every module reachable from here to prove
            it. These are refused by construction, for every operator including a super admin:
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {FORECLOSED_BY_DESIGN.map((item) => (
              <li
                key={item}
                className="rounded-[6px] border border-line bg-canvas-soft px-2 py-0.5 text-caption text-muted-1"
              >
                {item}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ shell */

/**
 * One label and one value.
 *
 * A <dl> rather than a table: these are pairs, not rows, and a screen reader
 * announcing "Signed up, 4 March 2026" is the reading a support person needs.
 */
function Facts({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">{children}</dl>
}

function Fact({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label text-muted-1">{label}</dt>
      <dd className="text-small leading-relaxed text-ink-1">{children}</dd>
      {hint ? <p className="text-caption leading-relaxed text-muted-1">{hint}</p> : null}
    </div>
  )
}

/**
 * The absent value.
 *
 * D34: a figure that is absent and a figure that is zero must not look alike,
 * and an em dash on its own is a value nobody can interpret. The reason is
 * carried in screen-reader text as well as the tooltip, so it is not colour
 * or hover alone that conveys it.
 */
function Absent({ reason }: { reason: string }) {
  return (
    <>
      <span aria-hidden title={reason} className="text-muted-2">
        —
      </span>
      <span className="sr-only">{reason}</span>
    </>
  )
}

/* ------------------------------------------------------------- the bodies */

function SectionBody({
  section,
  detail,
  mayChangeRole,
}: {
  section: AccountSectionKey
  detail: AdminAccountDetail
  mayChangeRole: boolean
}) {
  /*
   * Exhaustive over AccountSectionKey, which is derived from ACCOUNT_SECTIONS.
   *
   * The `never` assignment in the default branch is what makes that a TYPE
   * error rather than a blank card on a support call. Written first without
   * it, on the assumption that a missing case would widen the return type to
   * `| undefined` and be rejected — measured, and it was not: React accepts an
   * undefined return, so a new section compiled cleanly and rendered nothing.
   */
  switch (section) {
    case 'identity':
      return <Identity detail={detail} mayChangeRole={mayChangeRole} />
    case 'shop':
      return <Shop detail={detail} />
    case 'connection':
      return <Connection detail={detail} />
    case 'plan':
      return <Plan detail={detail} />
    case 'usage':
      return <Usage detail={detail} />
    case 'financials':
      return <Financials detail={detail} />
    default: {
      const unhandled: never = section
      return unhandled
    }
  }
}

function Identity({
  detail,
  mayChangeRole,
}: {
  detail: AdminAccountDetail
  mayChangeRole: boolean
}) {
  const fromEnvironment = roleSource(detail.resolvedRole) === 'ENVIRONMENT'
  return (
    <>
      <Facts>
        <Fact label="Email">{detail.email}</Fact>
        <Fact label="Name">
          {detail.name ?? <Absent reason="No name set on this account" />}
        </Fact>
        <Fact label="Display name">
          {detail.displayName ?? <Absent reason="No display name set" />}
        </Fact>
        <Fact
          label="Platform role"
          hint={
            fromEnvironment
              ? 'From an environment variable. The database column is not consulted, and writing it would change nothing.'
              : 'From the database column, which is what the role editor writes.'
          }
        >
          {detail.resolvedRole.replace('_', ' ').toLowerCase()}
          {detail.storedRole !== detail.resolvedRole ? (
            <span className="ml-1.5 text-caption text-muted-1">
              (column says {detail.storedRole.replace('_', ' ').toLowerCase()})
            </span>
          ) : null}
        </Fact>
        <Fact label="Onboarding">{detail.onboardingState.replace(/_/g, ' ').toLowerCase()}</Fact>
        <Fact label="Signed up">{formatDate(detail.signedUpAt.toISOString())}</Fact>
      </Facts>

      {mayChangeRole ? (
        /*
         * The only interactive element on the page, and it is a link to a
         * separate screen rather than a control here. That screen asks for a
         * password, and a password field belongs on a page that explains why
         * it is being asked for.
         *
         * Absent — not disabled — for anyone without roles.write, and absent
         * for an env-derived role where the write would succeed and change
         * nothing. Both are enforced again on the target page.
         */
        <p className="mt-3 text-small">
          <Link
            href={`/admin/users/${encodeURIComponent(detail.id)}/role`}
            className="font-semibold text-brand underline underline-offset-2"
          >
            Change platform role
            <span className="sr-only"> for {detail.email}</span>
          </Link>
        </p>
      ) : null}
    </>
  )
}

function Shop({ detail }: { detail: AdminAccountDetail }) {
  if (!detail.shop) {
    return (
      <EmptyState
        quiet
        title="No shop — setup unfinished"
        description="This account signed up but provisioning never completed, so there is nothing for it to look at in the app. That is a real state, not a gap in this page."
      />
    )
  }
  return (
    <Facts>
      <Fact label="Shop">{detail.shop.name}</Fact>
      <Fact label="Kind">{detail.shop.isDemo ? 'Demo shop' : 'Real shop'}</Fact>
      <Fact label="Membership">
        {detail.shop.membershipRole ? (
          detail.shop.membershipRole.toLowerCase()
        ) : (
          <Absent reason="No membership row — this account does not appear on its own shop" />
        )}
      </Fact>
      <Fact
        label="Member since"
        hint="A shop role, not a platform role. Every seller owns their own shop and none of them is an operator."
      >
        {detail.shop.membershipSince ? (
          formatDate(detail.shop.membershipSince.toISOString())
        ) : (
          <Absent reason="No membership row" />
        )}
      </Fact>
      <Fact label="Created">{formatDate(detail.shop.createdAt.toISOString())}</Fact>
      <Fact label="Last synced">
        {detail.shop.lastSyncedAt ? (
          formatDateTime(detail.shop.lastSyncedAt.toISOString())
        ) : (
          <Absent reason="Never synced — no data has been pulled from Etsy for this shop" />
        )}
      </Fact>
    </Facts>
  )
}

function Connection({ detail }: { detail: AdminAccountDetail }) {
  if (!detail.connection.read) return <NotRead />
  const connection = detail.connection.value

  if (!connection) {
    return (
      <EmptyState
        quiet
        title="Never connected to Etsy"
        description="The shop exists in EtsyPilot and has no grant behind it, which is different from a grant that has since been revoked — that would show below with the date it happened."
      />
    )
  }

  const revoked = connection.revokedAt !== null
  const expired = connection.expiresAt !== null && connection.expiresAt.getTime() < Date.now()

  return (
    <>
      <Facts>
        <Fact
          label="Status"
          hint={
            revoked
              ? 'The seller took the grant back. Reconnecting is theirs to do and there is no control here for it.'
              : expired
                ? 'The stored grant is past its expiry. The app refreshes it on the seller’s next visit.'
                : undefined
          }
        >
          {revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}
        </Fact>
        <Fact label="Shop connection state">
          {detail.shop?.connectionStatus.replace(/_/g, ' ').toLowerCase() ?? (
            <Absent reason="No shop" />
          )}
        </Fact>
        <Fact label="Expires">
          {connection.expiresAt ? (
            formatDateTime(connection.expiresAt.toISOString())
          ) : (
            <Absent reason="No expiry recorded on this grant" />
          )}
        </Fact>
        <Fact label="Revoked">
          {connection.revokedAt ? (
            formatDateTime(connection.revokedAt.toISOString())
          ) : (
            <Absent reason="Not revoked" />
          )}
        </Fact>
      </Facts>

      <p className="mt-3 text-label text-muted-1">Scopes Etsy granted</p>
      {connection.scopes.length === 0 ? (
        <EmptyState
          quiet
          title="The grant records no scopes"
          description="That is a broken connection rather than a restrictive one — worth noticing, because the app will behave as though nothing were connected."
        />
      ) : (
        <ul className="mt-1 flex flex-wrap gap-1.5">
          {connection.scopes.map((scope) => (
            <li
              key={scope}
              className="rounded-[6px] border border-line bg-canvas-soft px-2 py-0.5 text-caption text-ink-2"
            >
              {scope}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
        Etsy&rsquo;s own scope strings, so the grant is inspectable rather than summarised. The
        token itself is not read by this screen and is not readable from the operator area at all.
      </p>
    </>
  )
}

function Plan({ detail }: { detail: AdminAccountDetail }) {
  if (!detail.subscription.read) return <NotRead />
  const subscription = detail.subscription.value

  if (!subscription) {
    return (
      <EmptyState
        quiet
        title="No subscription record"
        description="Not the same as a free plan and not the same as a cancelled one — this account has never had a row, so there is nothing to renew, cancel or refund."
      />
    )
  }

  return (
    <Facts>
      <Fact label="Plan">{subscription.plan.toLowerCase()}</Fact>
      <Fact label="Status">{subscription.status.replace(/_/g, ' ').toLowerCase()}</Fact>
      <Fact label="Renews">
        {subscription.renewsAt ? (
          formatDate(subscription.renewsAt.toISOString())
        ) : (
          <Absent reason="No renewal date — this plan does not renew" />
        )}
      </Fact>
      <Fact label="Trial ends">
        {subscription.trialEndsAt ? (
          formatDate(subscription.trialEndsAt.toISOString())
        ) : (
          <Absent reason="Not on a trial" />
        )}
      </Fact>
      <Fact
        label="Cancelled"
        hint="Cancelling, refunding and changing a plan all happen through billing, not here."
      >
        {subscription.cancelledAt ? (
          formatDate(subscription.cancelledAt.toISOString())
        ) : (
          <Absent reason="Not cancelled" />
        )}
      </Fact>
    </Facts>
  )
}

function Usage({ detail }: { detail: AdminAccountDetail }) {
  if (!detail.usage.read) return <NotRead />
  const usage = detail.usage.value

  if (usage.length === 0) {
    return (
      <EmptyState
        quiet
        title="No usage records"
        description="Nothing has been metered for this account — which is not the same as every meter reading zero. A quota that has genuinely not been touched still has a row saying so."
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {usage.map((record) => (
        <li
          key={`${record.metric}-${record.periodEnd.toISOString()}`}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2 last:border-0 last:pb-0"
        >
          <span className="text-small text-ink-1">{record.metric.replace(/_/g, ' ').toLowerCase()}</span>
          <Numeric className="text-small text-ink-2">
            {formatNumber(record.used)} of {formatNumber(record.limit)}
          </Numeric>
          <span className="w-full text-caption text-muted-1">
            {formatDate(record.periodStart.toISOString())} –{' '}
            {formatDate(record.periodEnd.toISOString())}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The seller's own money.
 *
 * Every figure carries its provenance, which is what makes "an estimate shown
 * as verified" a type error rather than a design slip. Nothing here is
 * VERIFIED: a sum over rows is a formula over inputs, so it is CALCULATED, and
 * the coverage is stated in words rather than left for the reader to infer
 * from a percentage in a corner.
 *
 * NO BUYER APPEARS. Not a country, not a receipt, not a line item — the
 * repository aggregates in SQL so no order row reaches this process at all
 * (D77: a country with one order in it is a person).
 */
function Financials({ detail }: { detail: AdminAccountDetail }) {
  const view = financialsFor(detail)

  if (view.kind === 'NOT_READ') return <NotRead />

  if (view.kind === 'NEVER_COMPUTED') {
    return (
      <EmptyState
        quiet
        title="Profit has never been computed for this shop"
        description="That is not a profit of zero and it is not a shop with no sales — it means no reconciliation has run, so there is no figure to show and none should be inferred from the absence of one."
      />
    )
  }

  const { summary } = view
  return (
    <>
      <p className="text-caption leading-relaxed text-muted-1">
        Period {formatDate(summary.periodStart.toISOString())} –{' '}
        {formatDate(summary.periodEnd.toISOString())} · computed{' '}
        {formatDateTime(summary.computedAt.toISOString())}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <OperatorFigure label="Gross revenue" figure={summary.grossRevenue} />
        <OperatorFigure label="Fees" figure={summary.fees} />
        <OperatorFigure label="Orders" figure={summary.orderCount} />
        <OperatorFigure label="Net profit" figure={summary.netProfit} />
      </div>

      <p
        className="mt-3 max-w-prose rounded-card border px-3 py-2 text-caption leading-relaxed"
        style={{
          background: summary.coveragePercent >= 100 ? 'var(--canvas-soft)' : 'var(--warning-surface)',
          borderColor: summary.coveragePercent >= 100 ? 'var(--border)' : 'var(--warning-border)',
          color: summary.coveragePercent >= 100 ? 'var(--muted-1)' : 'var(--warning-ink)',
        }}
      >
        <strong className="font-semibold">Cost coverage {summary.coveragePercent}%.</strong>{' '}
        {summary.coverageStatement}
      </p>

      <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
        Totals over the period, never individual orders. No buyer, country or receipt is read to
        build this section, and nothing here can be edited from the operator area — a figure that
        looks wrong is fixed by fixing the seller&rsquo;s costs, with them.
      </p>
    </>
  )
}


/**
 * The branch that should never render.
 *
 * A section is only drawn when visibleSections() said the viewer may see it,
 * and detailReads() derives the query flags from that same answer — so a
 * section whose data was not read cannot be on screen. This exists because the
 * type forces the branch to be handled, and the honest handling of "we did not
 * fetch this" is to say so rather than to render an empty state that would
 * read as a fact about the seller.
 */
function NotRead() {
  return (
    <EmptyState
      quiet
      title="Not read for this view"
      description="Nothing is being hidden from you here — this section was not fetched, so there is no figure to show and none should be inferred."
    />
  )
}
