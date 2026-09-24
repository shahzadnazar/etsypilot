import { ProvenanceButton } from '@/components/provenance/provenance-button'
import { OperatorSection } from '@/components/admin/operator-section'
import { OperatorFigure } from '@/components/admin/operator-figure'
import { Numeric } from '@/components/ui/numeric'
import { EmptyState } from '@/components/ui/states'
import { OperatorTable } from '@/components/admin/operator-table'
import { Card, CardBody } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/page-header'
import { requireAdmin } from '@/domain/admin/access'
import type { AdminConnectionRow } from '@/lib/repositories/admin-reads-every-shop'
import {
  HEALTH_COPY,
  EXPIRING_SOON_DAYS,
  assess,
  expiringSoon,
  needsAttention,
  summarise,
  syncStatement,
  type AssessedConnection,
  type ConnectionHealth,
} from '@/domain/admin/etsy-health'
import { CONNECT_OUTCOMES } from '@/domain/connect/types'
import { adminListEtsyConnections } from '@/lib/repositories/admin-reads-every-shop'
import { formatDate, formatDateTime } from '@/lib/utils/format'

/*
 * Etsy connection health, across every shop. READ-ONLY.
 *
 * ── THERE IS NO RECONNECT BUTTON, AND THAT IS THE DESIGN ──────────────────
 *
 * Every state on this screen is one a SELLER resolves. The operator area holds
 * no EtsyService and may make no Etsy call at all, read or write (D94) — so
 * there is no reconnect, no refresh, no force-sync and no revoke. D94a
 * forecloses all four by construction.
 *
 * That absence is stated on the page rather than left to be read as unfinished
 * work. D70: a control that appears to work and does not is worse than no
 * control, and its quieter cousin is a screen whose missing control reads as a
 * to-do — an operator who thinks a fix is coming does not tell the seller to
 * do it themselves.
 *
 * ── AND IT CANNOT ASK ETSY EITHER ─────────────────────────────────────────
 *
 * Everything here is read from OUR tables. "Is this token actually still
 * good?" is a question this screen cannot answer, because answering it would
 * mean holding a service handle — and a handle that can fetch a listing can
 * also push one. The page says what was last recorded, and says that is what
 * it is saying.
 *
 * NO `export const metadata`: Next resolves static metadata independently of
 * whether the component renders, so it survives notFound() and lands in the
 * flight payload of a 404. React 19 hoists <title> from here instead, and a
 * refused request never reaches it.
 */
export const dynamic = 'force-dynamic'

export default async function EtsyConnectionsPage() {
  const access = await requireAdmin('etsy.view')
  const rows = await adminListEtsyConnections()

  /*
   * The owner's address is gated on users.view, separately.
   *
   * `etsy.view` is about connections, not about people. A viewer granted only
   * this one gets shop names and connection states — enough to answer "is
   * anything broken" — and no roll of who the sellers are. Composed from the
   * viewer's permissions, in the small as well as in the large.
   */
  const mayNameOwners = access.can('users.view')

  const now = new Date()
  const assessed = rows.map((row) => assess(row, now))
  const summary = summarise(assessed)
  const attention = needsAttention(assessed)
  const expiring = expiringSoon(assessed)
  const disagreeing = assessed.filter((entry) => entry.columnDisagrees)

  return (
    <>
      <title>Etsy connections · Operations · EtsyPilot</title>
      <PageHeader
        title="Etsy connections"
        subtitle={`${rows.length === 1 ? '1 shop' : `${rows.length} shops`} · read from our own records, not from Etsy · read-only`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No shops yet"
          description="Rows appear here as accounts are provisioned. This screen is not seeded and shows nothing that is not really in the database."
        />
      ) : (
        <>
          {/*
            * Every state, including the ones at zero.
            *
            * D34 rather than tidiness: a summary that hides "Token expired"
            * when the count is nought reads exactly like a summary rendered
            * before that state was implemented. A visible zero is a
            * measurement; an absent row is not.
            */}
          <section aria-labelledby="summary-heading" className="mb-4">
            {/*
              * The heading stays sr-only and the methodology button does not.
              * One clickable explanation for the row rather than one per tile
              * — see the note in components/admin/operator-section.tsx.
              */}
            <div className="mb-2 flex justify-end">
              <h2 id="summary-heading" className="sr-only">
                Connections by state
              </h2>
              <ProvenanceButton metricKey="operatorConnectionHealth" type="VERIFIED" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {summary.map(({ health, count, copy }) => (
                <Card key={health} className="p-3">
                  <OperatorFigure
                    frame="bare"
                    label={copy.label}
                    figure={count}
                    valueClassName={`text-[22px] font-semibold leading-none ${toneInk(copy.tone)}`}
                  />
                </Card>
              ))}
            </div>
          </section>

          {disagreeing.length > 0 ? (
            <Card
              role="status"
              className="mb-3 p-[14px] text-small leading-relaxed"
              style={{
                background: 'var(--warning-surface)',
                borderColor: 'var(--warning-border)',
                color: 'var(--warning-ink)',
              }}
            >
              <strong className="font-semibold">
                {disagreeing.length === 1
                  ? '1 shop’s stored status disagrees with its connection record.'
                  : `${disagreeing.length} shops’ stored statuses disagree with their connection records.`}
              </strong>{' '}
              The state column and the authorisation row say different things. Both are shown
              below rather than one being picked — a row reading “connected” beside a revocation
              date is usually the whole answer to “why is nothing importing”.
            </Card>
          ) : null}

          <OperatorSection
            title="Needs attention"
            blurb="Everything that is not healthy, most urgent first. Every one of these is resolved by the seller."
          >
            {attention.length === 0 ? (
              <EmptyState
                quiet
                title="Nothing needs attention"
                description="Every connected shop is authorised, not expiring this week, and synced within the last week. A shop appears here when one of those stops being true — this is a measured state, not a screen that has not loaded."
              />
            ) : (
              <ConnectionTable rows={attention} mayNameOwners={mayNameOwners} />
            )}
          </OperatorSection>

          <OperatorSection
            title={`Expiring within ${EXPIRING_SOON_DAYS} days`}
            blurb="Authorisations that lapse soon and can still be saved by the seller opening the app. Already-expired shops are in the table above, not here."
          >
            {expiring.length === 0 ? (
              <EmptyState
                quiet
                title={`No authorisation lapses in the next ${EXPIRING_SOON_DAYS} days`}
                description="A shop appears here as its grant approaches expiry. Shops with no expiry on record are not counted — an absent expiry is not a distant one."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {expiring.map((entry) => (
                  <li
                    key={entry.row.shopId}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-small font-medium text-ink-1">{entry.row.shopName}</span>
                    <Numeric className="text-small" style={{ color: 'var(--warning-ink)' }}>
                      {entry.daysToExpiry === 0
                        ? 'Lapses today'
                        : entry.daysToExpiry === 1
                          ? 'Lapses tomorrow'
                          : `Lapses in ${entry.daysToExpiry} days`}
                    </Numeric>
                    <span className="w-full text-caption text-muted-1">
                      {entry.row.expiresAt ? formatDateTime(entry.row.expiresAt.toISOString()) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </OperatorSection>

          <OperatorSection
            title="Every shop"
            blurb="Alphabetical. Demo shops are listed and marked — a demo shop is not a broken connection."
          >
            <ConnectionTable rows={assessed} mayNameOwners={mayNameOwners} />
          </OperatorSection>
        </>
      )}

      {/*
        * The seller's own words, not ours.
        *
        * D50c: CONNECT_OUTCOMES holds the ways a connection attempt can end
        * and the sentence a seller reads for each, and the OAuth routes' type
        * is keyed off it so an outcome with no copy does not compile. Rendering
        * it here rather than paraphrasing means an operator quotes the seller
        * the same sentence the seller will see — and D46: the copy is written
        * once and read everywhere.
        */}
      <OperatorSection
        title="What the seller sees when a reconnection ends"
        blurb="Verbatim from the same constant the OAuth routes use, so nothing here is a paraphrase that can drift from what they are actually shown."
      >
        <ul className="flex flex-col gap-2.5">
          {Object.entries(CONNECT_OUTCOMES).map(([key, outcome]) => (
            <li key={key} className="flex flex-col gap-0.5">
              <span className="text-small font-semibold text-ink-1">{outcome.title}</span>
              <span className="max-w-prose text-caption leading-relaxed text-muted-1">
                {outcome.detail}
              </span>
            </li>
          ))}
        </ul>
      </OperatorSection>

      <Card className="mt-4">
        <CardBody>
          <h2 className="text-small font-semibold text-ink-1">What this screen cannot do</h2>
          <p className="mt-1 max-w-prose text-caption leading-relaxed text-muted-1">
            Not a list of things not built yet. The operator area holds no Etsy connection of its
            own and can make no call to Etsy, read or write — so there is no reconnect, no token
            refresh, no force-sync and no revoke here, for anyone, including a super admin. A test
            walks every module reachable from this page and fails if one could obtain an Etsy
            service at all.
          </p>
          <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
            It also means this page cannot tell you whether a token still works — only what we last
            recorded about it. A grant the seller revoked on Etsy this morning still reads as
            authorised here until something tries to use it.
          </p>
        </CardBody>
      </Card>
    </>
  )
}



/** Tone to a token pair (D1). Never a literal, and never colour alone. */
function toneInk(tone: HealthCopy['tone']): string {
  switch (tone) {
    case 'ok':
      return 'text-success-strong'
    case 'warn':
      return 'text-warning-strong'
    case 'danger':
      return 'text-danger-strong'
    default:
      return 'text-ink-1'
  }
}

type HealthCopy = (typeof HEALTH_COPY)[ConnectionHealth]

function HealthChip({ health }: { health: ConnectionHealth }) {
  const copy = HEALTH_COPY[health]
  const style =
    copy.tone === 'ok'
      ? {
          background: 'var(--success-surface)',
          borderColor: 'var(--success-border)',
          color: 'var(--success-ink)',
        }
      : copy.tone === 'danger'
        ? {
            background: 'var(--danger-surface)',
            borderColor: 'var(--danger-border)',
            color: 'var(--danger-ink)',
          }
        : copy.tone === 'warn'
          ? {
              background: 'var(--warning-surface)',
              borderColor: 'var(--warning-border)',
              color: 'var(--warning-ink)',
            }
          : {
              background: 'var(--canvas-soft)',
              borderColor: 'var(--border)',
              color: 'var(--muted-1)',
            }

  return (
    <span
      className="inline-flex items-center rounded-[6px] border px-2 py-0.5 text-[11px] font-semibold"
      style={style}
    >
      {/* A word, never colour alone (artboard 89). */}
      {copy.label}
    </span>
  )
}

function ConnectionTable({
  rows,
  mayNameOwners,
}: {
  rows: readonly AssessedConnection<AdminConnectionRow>[]
  mayNameOwners: boolean
}) {
  return (
    <OperatorTable
      label="Etsy connections"
      minWidth={860}
      borderless
      caption="Every shop with its derived connection state, granted scopes, last sync and token expiry."
    >
        <thead>
          <tr className="bg-canvas-soft text-left text-label text-muted-1">
            <th scope="col" className="px-4 py-2.5 font-semibold">Shop</th>
            {mayNameOwners ? (
              <th scope="col" className="px-3 py-2.5 font-semibold">Owner</th>
            ) : null}
            <th scope="col" className="px-3 py-2.5 font-semibold">State</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Last sync</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Token expires</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Scopes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.row.shopId} className="border-t border-line align-top">
              <td className="px-4 py-3 text-small text-ink-1">
                <span className="flex flex-col gap-0.5">
                  <span>{entry.row.shopName}</span>
                  {entry.row.isDemo ? (
                    <span className="text-caption text-muted-1">Demo shop</span>
                  ) : null}
                </span>
              </td>
              {mayNameOwners ? (
                <td className="px-3 py-3 text-small text-ink-2">
                  {entry.row.ownerEmail ?? (
                    <Absent reason="No owner on this shop — provisioning did not finish" />
                  )}
                </td>
              ) : null}
              <td className="px-3 py-3">
                <span className="flex flex-col items-start gap-1">
                  <HealthChip health={entry.health} />
                  {entry.columnDisagrees ? (
                    <span className="text-caption" style={{ color: 'var(--warning-ink)' }}>
                      Stored status says {entry.row.connectionStatus.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  ) : null}
                  {entry.row.lastSyncFailure && entry.health === 'SYNC_FAILING' ? (
                    <span className="max-w-[26ch] text-caption leading-snug text-muted-1">
                      {entry.row.lastSyncFailure.reason ?? 'No reason was recorded with the failure.'}
                    </span>
                  ) : null}
                </span>
              </td>
              {/*
                * "Never synced" and "synced a long time ago" are different
                * facts and do not share a cell shape here (D34): one is a
                * sentence with no date in it, the other is a count of days.
                * There is no formatting option that could collapse them into
                * the same dash.
                */}
              <td className="px-3 py-3 text-small text-ink-2">{syncStatement(entry)}</td>
              <td className="px-3 py-3 text-small text-ink-2">
                {entry.row.expiresAt ? (
                  <Numeric>{formatDate(entry.row.expiresAt.toISOString())}</Numeric>
                ) : (
                  <Absent reason="No expiry on record — not the same as an expiry far in the future" />
                )}
              </td>
              <td className="px-4 py-3 text-small text-ink-2">
                {entry.row.scopes === null ? (
                  <Absent reason="No authorisation row at all — this shop has never been connected" />
                ) : entry.row.scopes.length === 0 ? (
                  <span style={{ color: 'var(--warning-ink)' }}>
                    Authorised with no scopes — a broken grant, not a restrictive one
                  </span>
                ) : (
                  <Numeric className="text-caption">{entry.row.scopes.join(' · ')}</Numeric>
                )}
              </td>
            </tr>
          ))}
        </tbody>
    </OperatorTable>
  )
}

/**
 * The absent value.
 *
 * D34: an em dash on its own is a value nobody can interpret, and absent must
 * not look like zero or like "far away". The reason is in screen-reader text
 * as well as the tooltip, so hover is not the only way to it.
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
