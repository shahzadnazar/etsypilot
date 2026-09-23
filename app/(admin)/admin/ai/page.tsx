import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/layout/page-header'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { requireAdmin } from '@/domain/admin/access'
import {
  COST_STATEMENT,
  GENERATION_KINDS,
  GENERATION_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
  platformTotals,
  summariseByShop,
  type ShopActivity,
} from '@/domain/admin/ai-activity'
import { adminCountGenerations } from '@/lib/repositories/admin-reads-every-shop'
import { formatNumber } from '@/lib/utils/format'
import type { Provenanced } from '@/lib/provenance/types'

/*
 * AI activity across every shop. READ-ONLY.
 *
 * ── THE GENERATED TEXT IS NOT ON THIS SCREEN ──────────────────────────────
 *
 * `ai_generations.input` and `.output` hold a seller's own listing copy — the
 * words they sell with. Reading it is permitted by the read-only rule and it
 * is deliberately not read, for a reason that is not about permission: an
 * operator does not need somebody's product descriptions to understand volume
 * or cost, and a screen that shows them makes reading a seller's copy a
 * routine sight rather than a deliberate act.
 *
 * Said on the page as well as enforced in the query, because an absence
 * nobody explains reads as an omission somebody will helpfully fix.
 *
 * ── VOLUME, NOT MONEY ─────────────────────────────────────────────────────
 *
 * Nothing in this schema records a price, a token count or a model against a
 * generation. So there is no cost figure, and the screen says so rather than
 * multiplying a count by a rate typed in here — which would be a number that
 * looks precise and is invented (D34).
 *
 * NO `export const metadata`: static metadata survives notFound() and lands in
 * the flight payload of a 404.
 */
export const dynamic = 'force-dynamic'

/** How far back the screen counts. Stated on the page, never implied. */
const WINDOW_DAYS = 30

export default async function AiActivityPage() {
  const access = await requireAdmin('ai.view')

  const now = new Date()
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const { tallies, shops } = await adminCountGenerations(since)

  const mayNameOwners = access.can('users.view')

  const activity = summariseByShop(tallies, shops)
  const totals = platformTotals(activity)
  const used = activity.filter((shop) => shop.total > 0)

  return (
    <>
      <title>AI activity · Operations · EtsyPilot</title>
      <PageHeader
        title="AI activity"
        subtitle={`Last ${WINDOW_DAYS} days · ${formatNumber(totals.total)} generations across ${formatNumber(totals.activeShops)} ${totals.activeShops === 1 ? 'shop' : 'shops'} · read-only`}
      />

      <Card role="note" className="mb-3 p-[14px] text-caption leading-relaxed text-muted-1">
        <strong className="font-semibold text-ink-2">
          The generated text is deliberately not shown.
        </strong>{' '}
        What the AI was given and what it wrote back are the seller&rsquo;s own listing copy.
        Nothing on this screen needs them to answer how much the feature is being used, and a
        screen that displayed them would make reading a seller&rsquo;s words a routine sight
        rather than a deliberate act. The query does not select those columns and this page has
        no field they could arrive in.
      </Card>

      {totals.total === 0 ? (
        <Card className="p-[18px] text-small leading-relaxed text-ink-2">
          No generations in the last {WINDOW_DAYS} days. That is a measured zero over a known
          window — not an empty screen, and not a claim about any longer period.
        </Card>
      ) : (
        <>
          <div className="mb-3 grid gap-3 lg:grid-cols-2">
            <Section title="By kind" blurb="Every kind the product can generate, including the ones at zero.">
              <ul className="flex flex-col gap-2">
                {GENERATION_KINDS.map((kind) => (
                  <Bar
                    key={kind}
                    label={KIND_LABEL[kind]}
                    value={totals.byKind[kind]}
                    total={totals.total}
                  />
                ))}
              </ul>
            </Section>

            <Section
              title="By status"
              blurb="A draft is undecided — not a rejection. There is no failure state, because a generation that failed leaves no record."
            >
              <ul className="flex flex-col gap-2">
                {GENERATION_STATUSES.map((status) => (
                  <Bar
                    key={status}
                    label={STATUS_LABEL[status]}
                    value={totals.byStatus[status]}
                    total={totals.total}
                  />
                ))}
              </ul>
            </Section>
          </div>

          <Section
            title="Acceptance"
            blurb="Accepted as a share of the generations a seller has actually decided on."
          >
            <Figure label="Acceptance rate" figure={totals.acceptance} suffix="%" />
          </Section>

          {totals.unrecognised > 0 ? (
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
                {formatNumber(totals.unrecognised)} generations have a kind or status the code does
                not recognise.
              </strong>{' '}
              They are counted in the total and not in the breakdowns, which is why those do not
              add up. The gap is the finding.
            </Card>
          ) : null}

          <Section
            title="By shop"
            blurb="Busiest first. Only shops that generated something in the window appear."
          >
            {used.length === 0 ? (
              <Nothing>
                No shop generated anything in the last {WINDOW_DAYS} days.
              </Nothing>
            ) : (
              <ul className="flex flex-col gap-3">
                {used.map((shop) => (
                  <li key={shop.shopId} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <ShopRow shop={shop} mayNameOwners={mayNameOwners} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <Card className="mt-4 p-[18px]">
        <h2 className="text-small font-semibold text-ink-1">What these figures are, and are not</h2>
        <p className="mt-1 max-w-prose text-caption leading-relaxed text-muted-1">
          {COST_STATEMENT}
        </p>
        <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
          Nothing on this screen changes anything. There is no way to retry a generation, approve
          a draft on a seller&rsquo;s behalf, or clear their history — AI drafts reach Etsy through
          the bulk editor&rsquo;s confirmation gate or not at all, and the operator area is outside
          that gate by construction.
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

function Nothing({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-small leading-relaxed text-ink-2">{children}</p>
}

/**
 * A count with a proportion bar.
 *
 * A bar rather than a chart, and a number rather than either where the number
 * says the same thing: four categories do not need a plotting library, and the
 * figure is the thing being reported. The bar carries an accessible name with
 * the real count in it, so it is never the only way to the value.
 */
function Bar({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100)
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-caption text-muted-1">{label}</span>
        <span className="tnum text-small text-ink-1">
          {formatNumber(value)}
          <span className="ml-1.5 text-caption text-muted-1">{percent}%</span>
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft"
        role="img"
        aria-label={`${label}: ${formatNumber(value)} of ${formatNumber(total)}`}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, background: 'var(--accent-ai)' }}
        />
      </div>
    </li>
  )
}

/**
 * One figure with the provenance that produced it.
 *
 * An UNAVAILABLE figure renders its reason and its remedy instead of a
 * numeral, so there is no way to show a blank where a number is expected and
 * let the reader fill it in. A shop with only drafts has no acceptance rate,
 * and 0% would be the most misleading number this screen could carry.
 */
function Figure({
  label,
  figure,
  suffix,
}: {
  label: string
  figure: Provenanced<number>
  suffix?: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line bg-canvas-soft p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-label text-muted-1">{label}</span>
        <ProvenanceBadge
          type={figure.provenance.type}
          srDetail={`${label}: ${figure.provenance.methodology}`}
        />
      </div>
      {figure.value === null ? (
        <>
          <span aria-hidden className="tnum text-[18px] font-semibold text-muted-2">
            —
          </span>
          <p className="text-caption leading-relaxed text-ink-2">{figure.provenance.methodology}</p>
        </>
      ) : (
        <>
          <span className="tnum text-[18px] font-semibold text-ink-1">
            {figure.value}
            {suffix}
          </span>
          {figure.provenance.coverage !== undefined && figure.provenance.coverage < 100 ? (
            <p className="text-caption leading-relaxed text-muted-1">
              Decided on {figure.provenance.coverage}% of generations.
            </p>
          ) : null}
        </>
      )}
      {figure.provenance.limitations?.map((limitation) => (
        <p key={limitation} className="text-caption leading-relaxed text-muted-1">
          {limitation}
        </p>
      ))}
    </div>
  )
}

function ShopRow({ shop, mayNameOwners }: { shop: ShopActivity; mayNameOwners: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-small font-medium text-ink-1">{shop.shopName}</span>
        {shop.isDemo ? <span className="text-caption text-muted-1">Demo shop</span> : null}
        {mayNameOwners && shop.ownerEmail ? (
          <span className="text-caption text-muted-1">{shop.ownerEmail}</span>
        ) : null}
        <span className="tnum ml-auto text-small text-ink-2">
          {formatNumber(shop.total)} generations
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {GENERATION_KINDS.map((kind) => (
          <span key={kind} className="tnum text-caption text-muted-1">
            {KIND_LABEL[kind]} {formatNumber(shop.byKind[kind])}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {GENERATION_STATUSES.map((status) => (
          <span key={status} className="tnum text-caption text-muted-1">
            {STATUS_LABEL[status]} {formatNumber(shop.byStatus[status])}
          </span>
        ))}
        <span className="tnum text-caption font-semibold text-ink-2">
          {/*
            * UNAVAILABLE, not 0%. A shop with only drafts has no acceptance
            * rate; rendering nought would report the seller not having got to
            * them as a verdict on the AI.
            */}
          {shop.acceptance.value === null
            ? 'No rate yet'
            : `${shop.acceptance.value}% accepted`}
        </span>
      </div>
    </div>
  )
}
