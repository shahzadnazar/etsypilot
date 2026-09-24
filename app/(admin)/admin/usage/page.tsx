import { EmptyState } from '@/components/ui/states'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/page-header'
import { requireAdmin } from '@/domain/admin/access'
import {
  BAND_COPY,
  NEAR_THRESHOLD,
  assessUsage,
  atOrOverLimit,
  countByBand,
  unmeasurable,
  type AssessedUsage,
  type UsageBand,
} from '@/domain/admin/usage'
import { adminListUsage } from '@/lib/repositories/admin-reads-every-shop'
import { formatNumber } from '@/lib/utils/format'

/*
 * Plan usage across every shop. READ-ONLY.
 *
 * ── COUNTED, NOT READ FROM A COUNTER ──────────────────────────────────────
 *
 * `usage_records` exists, with a `used` column, and nothing in the product
 * writes it — grepped, not assumed. A screen reading it would report figures
 * that are not usage: stale where rows exist, blank where they do not, and a
 * blank indistinguishable from a shop that has genuinely used nothing. Both
 * meters are counted from the rows that ARE the usage, and the page says so.
 *
 * ── D37: A QUOTA IS A BOUNDARY, NOT A PENALTY ─────────────────────────────
 *
 * Every meter renders what PAUSES and what CONTINUES, from the seller's own
 * usage model rather than from a harsher paraphrase written here. An operator
 * looking at a shop over its cap should be reading the same sentence the
 * seller is: new bulk jobs pause, nothing is deleted, everything else works.
 * A limit that only says what stopped reads as a fault, and an operator who
 * believes the product is broken tells the seller so.
 *
 * ── AND NOTHING HERE RESETS ANYTHING ──────────────────────────────────────
 *
 * Resetting a seller's quota is the first entry on D94a's foreclosed list. It
 * is a plausible support request, which is exactly why it needs its own
 * decision and its own audit trail rather than arriving as a side effect of an
 * operator screen that already had a database handle in scope.
 *
 * NO `export const metadata`: static metadata survives notFound() and lands in
 * the flight payload of a 404.
 */
export const dynamic = 'force-dynamic'

export default async function UsagePage() {
  const access = await requireAdmin('usage.view')

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const rows = await adminListUsage(monthStart)

  const mayNameOwners = access.can('users.view')

  const assessed = rows.map((row) => assessUsage(row, now))
  const listingBands = countByBand(assessed, 'listings')
  const aiBands = countByBand(assessed, 'aiGenerations')
  const pressing = atOrOverLimit(assessed)
  const unknownPlan = unmeasurable(assessed)

  return (
    <>
      <title>Usage &amp; quota · Operations · EtsyPilot</title>
      <PageHeader
        title="Usage &amp; quota"
        subtitle={`${rows.length === 1 ? '1 shop' : `${rows.length} shops`} · counted from each shop’s own rows, not from a stored counter · read-only`}
      />

      <Card
        role="note"
        className="mb-3 p-[14px] text-caption leading-relaxed text-muted-1"
      >
        <strong className="font-semibold text-ink-2">These figures are counts.</strong> Active
        listings are counted from the shop; AI generations are counted from the generations
        recorded this calendar month. The <code className="tnum">usage_records</code> table has a
        stored counter and nothing in the product writes it, so reading that would have reported a
        number that is not usage — stale where rows exist and blank where they do not.
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          title="No shops yet"
          description="Rows appear here as accounts are provisioned. This screen is not seeded and shows nothing that is not really in the database."
        />
      ) : (
        <>
          <div className="mb-3 grid gap-3 lg:grid-cols-2">
            <BandSummary title="Listings" bands={listingBands} />
            <BandSummary title="AI generations this month" bands={aiBands} />
          </div>

          <Section
            title="At, over, or near a limit"
            blurb={`Anything past its cap, exactly at it, or within ${Math.round(NEAR_THRESHOLD * 100)}% of it. Worst first.`}
          >
            {pressing.length === 0 ? (
              <EmptyState
                quiet
                title="No shop is at, over, or near a limit"
                description={
                  <>
                    A shop appears here once a meter reaches its cap, passes it, or comes within
                    the threshold above. Measured across{' '}
                    {rows.length === 1 ? 'the one shop' : `all ${rows.length} shops`}, not a
                    section that failed to load.
                  </>
                }
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {pressing.map((entry) => (
                  <li key={entry.row.shopId} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <ShopMeters entry={entry} mayNameOwners={mayNameOwners} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {unknownPlan.length > 0 ? (
            <Section
              title="Nothing to measure against"
              blurb="Shops whose owner has no billing record at all. They are not on the free tier — they have never been through billing — so there is no limit to compare a count with."
            >
              <ul className="flex flex-col gap-2">
                {unknownPlan.map((entry) => (
                  <li
                    key={entry.row.shopId}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2 last:border-0 last:pb-0"
                  >
                    <span className="text-small font-medium text-ink-1">{entry.row.shopName}</span>
                    <span className="tnum text-caption text-muted-1">
                      {formatNumber(entry.row.activeListings)} active listings ·{' '}
                      {formatNumber(entry.row.aiGenerationsThisMonth)} generations this month
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Every shop" blurb="Alphabetical. Demo shops are counted and marked.">
            <ul className="flex flex-col gap-3">
              {assessed.map((entry) => (
                <li key={entry.row.shopId} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <ShopMeters entry={entry} mayNameOwners={mayNameOwners} />
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      <Card className="mt-4 p-[18px]">
        <h2 className="text-small font-semibold text-ink-1">What this screen cannot do</h2>
        <p className="mt-1 max-w-prose text-caption leading-relaxed text-muted-1">
          No quota reset, no top-up, no grant of extra generations and no exemption.{' '}
          <code className="tnum">usage_records</code> and <code className="tnum">subscriptions</code>{' '}
          are not on the operator write allowlist, so any of those from here is refused by
          construction rather than by policy.
        </p>
        <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
          A failed AI generation is never counted, and that is structural rather than filtered:
          the generation record has no failure state, so a generation that failed leaves no row.
          A rejected draft does count — the seller declined something that was produced, and it
          spent the allowance.
        </p>
      </Card>
    </>
  )
}

/* ------------------------------------------------------------------ pieces */

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb: string
  children: React.ReactNode
}) {
  return (
    <Card className="mb-3 p-[18px]">
      <h2 className="text-small font-semibold text-ink-1">{title}</h2>
      <p className="mt-0.5 max-w-prose text-caption leading-relaxed text-muted-1">{blurb}</p>
      <div className="mt-3">{children}</div>
    </Card>
  )
}


function toneInk(tone: 'ok' | 'info' | 'warn' | 'danger'): string {
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

/*
 * Every band, including the ones at zero.
 *
 * D34: a summary that hides "Over" when nobody is over reads exactly like a
 * summary rendered before the band existed, and a reader cannot tell which
 * they are looking at.
 */
function BandSummary({
  title,
  bands,
}: {
  title: string
  bands: { band: UsageBand; count: number }[]
}) {
  return (
    <Card className="p-[18px]">
      <h2 className="text-small font-semibold text-ink-1">{title}</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {bands.map(({ band, count }) => (
          <div key={band} className="flex flex-col gap-1">
            <span className="text-label leading-snug text-muted-1">{BAND_COPY[band].label}</span>
            <span className={`tnum text-[20px] font-semibold leading-none ${toneInk(BAND_COPY[band].tone)}`}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function BandChip({ band }: { band: UsageBand }) {
  const copy = BAND_COPY[band]
  const style =
    copy.tone === 'ok'
      ? { background: 'var(--success-surface)', borderColor: 'var(--success-border)', color: 'var(--success-ink)' }
      : copy.tone === 'danger'
        ? { background: 'var(--danger-surface)', borderColor: 'var(--danger-border)', color: 'var(--danger-ink)' }
        : copy.tone === 'warn'
          ? { background: 'var(--warning-surface)', borderColor: 'var(--warning-border)', color: 'var(--warning-ink)' }
          : { background: 'var(--canvas-soft)', borderColor: 'var(--border)', color: 'var(--muted-1)' }
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

function ShopMeters({
  entry,
  mayNameOwners,
}: {
  entry: AssessedUsage
  mayNameOwners: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-small font-medium text-ink-1">{entry.row.shopName}</span>
        {entry.row.isDemo ? <span className="text-caption text-muted-1">Demo shop</span> : null}
        {mayNameOwners && entry.row.ownerEmail ? (
          <span className="text-caption text-muted-1">{entry.row.ownerEmail}</span>
        ) : null}
        <span className="text-caption text-muted-1">
          {entry.plan ? entry.plan.toLowerCase() : 'no billing record'}
        </span>
      </div>

      {entry.plan === null ? (
        /*
         * No plan, so no limit, so no meter. Rendering a bar against the free
         * tier would measure this shop against an allowance nobody gave it —
         * and "never been through billing" is not "chose the free tier" (D34).
         */
        <p className="max-w-prose text-caption leading-relaxed text-muted-1">
          No billing record, so there is no limit to measure against. Counted:{' '}
          {formatNumber(entry.row.activeListings)} active listings and{' '}
          {formatNumber(entry.row.aiGenerationsThisMonth)} generations this month.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entry.meters.map(({ meter, band, percent }) => (
            <li key={meter.metric} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-caption text-muted-1">{meter.label}</span>
                <span className="flex items-center gap-2">
                  <span className="tnum text-small text-ink-2">
                    {/*
                      * A limit of 0 means "not offered on this plan" rather
                      * than "none allowed", so it renders as a count with no
                      * denominator — the same rule the seller's own sidebar
                      * meter follows. "0 / 0" would read as a shop sitting
                      * exactly at its cap.
                      */}
                    {meter.limit === 0
                      ? formatNumber(meter.used)
                      : `${formatNumber(meter.used)} / ${formatNumber(meter.limit)}`}
                  </span>
                  <BandChip band={band} />
                </span>
              </div>

              {meter.limit > 0 ? (
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft"
                  role="img"
                  aria-label={`${meter.label}: ${meter.used} of ${meter.limit}, ${BAND_COPY[band].label.toLowerCase()}`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${percent}%`,
                      background:
                        band === 'OVER' || band === 'AT_LIMIT'
                          ? 'var(--danger)'
                          : band === 'NEAR'
                            ? 'var(--warning)'
                            : 'var(--success)',
                    }}
                  />
                </div>
              ) : null}

              {/*
                * BOTH HALVES, always. D37: a quota is a boundary, not a
                * penalty, and a limit that only says what stopped reads as a
                * fault. The sentences are the seller's own — an operator
                * quoting them is quoting what the seller is being told.
                */}
              {band === 'OVER' || band === 'AT_LIMIT' ? (
                <p className="max-w-prose text-caption leading-relaxed text-muted-1">
                  <strong className="font-semibold">{meter.pauses}</strong> {meter.continues}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
