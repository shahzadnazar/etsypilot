import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProvenanceButton } from '@/components/provenance/provenance-button'
import { RuleGroup } from '@/components/audit/rule-group'
import { NotYet } from '@/components/settings/not-yet'
import { Card } from '@/components/ui/card'
import { Money, Numeric } from '@/components/ui/numeric'
import { AssistedNote } from '@/components/ai/assisted-note'
import { getAuditView } from '@/domain/audit/service'
import { explainRule } from '@/domain/ai/explain'
import { getSession } from '@/lib/auth'
import { getEtsyService } from '@/lib/etsy'
import { shopContext } from '@/lib/permissions'
import { formatDateTime } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Listing Audit' }

/*
 * Listing Audit.
 *
 * The health score is weighted by money, not by count, and the page says so
 * next to the number rather than in a help article. A shop with 300 clean
 * listings and 4 broken ones that earn most of the revenue is not healthy, and
 * a score that counted listings would tell it that it was.
 */
export default async function ListingAuditPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const [view, shop] = await Promise.all([getAuditView(ctx), getEtsyService().getShop(ctx.shopId)])
  const demo = session.isDemo

  /*
   * One explanation, for the worst rule — not one per rule.
   *
   * With a live provider, explaining every rule would be a dozen API calls on
   * every page load, spending the seller's allowance on text they may not read.
   * The rules explain themselves already; this adds a sentence where it is worth
   * the most.
   */
  const worst = view.results[0]
  const explanation = worst ? await explainRule(worst) : null

  return (
    <>
      <PageHeader
        title="Listing audit"
        subtitle={`${view.listingsChecked} listings checked against ${view.ruleCount} rules · ${view.errors} errors, ${view.warnings} warnings, ${view.passing} pass · last run ${formatDateTime(view.lastRunAt)}`}
        actions={
          <>
            <NotYet
              label="Audit settings"
              reason="Thresholds are EtsyPilot's defaults and are not editable yet."
            />
            {/*
              * A real link, because the audit runs on every request. Loading
              * this page IS re-running it — the button was doing nothing while
              * describing the one thing the page already does.
              */}
            <Link href="/listings/audit" className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]">
              Re-run audit
            </Link>
            <Link
              href="/api/export/audit"
              className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
            >
              Export CSV
            </Link>
            <Link
              href="/listings/bulk-editor"
              className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
            >
              Fix {view.bulkFixable} in bulk
            </Link>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col gap-2 p-[18px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label text-muted-1">Health score</span>
              {/*
                * The badge must follow the value, not be written next to it. A
                * score that is UNAVAILABLE was still labelled "Calculated"
                * because the type was hard-coded here — the badge described the
                * code path rather than the number that came out of it.
                */}
              <ProvenanceButton
                metricKey="listingHealth"
                type={view.healthScore.provenance.type}
                demo={demo}
              />
            </div>
            {/*
              * "/ 100" belongs to a score, so it renders only when there is
              * one. With the value absent it printed on its own — a card whose
              * headline read "/ 100" above a sentence explaining there was
              * nothing to score.
              */}
            {view.healthScore.value === null ? (
              <Numeric className="text-metric text-muted-1">
                <span title="No health score yet" aria-hidden>
                  —
                </span>
                <span className="sr-only">No health score yet</span>
              </Numeric>
            ) : (
              <Numeric className="text-metric text-ink-1">
                {view.healthScore.value}
                <span className="text-body font-normal text-muted-1"> / 100</span>
              </Numeric>
            )}
            <p className="text-caption leading-relaxed text-muted-1">
              {view.healthScore.provenance.methodology}
            </p>
            {view.healthScore.provenance.coverage !== undefined ? (
              <p className="text-caption leading-relaxed text-muted-1">
                Covers {view.healthScore.provenance.coverage}% of your listings — the rest had no
                orders in this period, so they carry no weight.
              </p>
            ) : null}
          </Card>

          <Card className="p-[18px]">
            <h2 className="text-section text-ink-1">Issues by rule</h2>
            <ul className="mt-3 flex flex-col gap-3">
              {view.results.map((r) => (
                <li key={r.rule.code} className="flex items-center justify-between gap-3">
                  {/*
                    * min-h-[24px] because this is a jump link in a list of
                    * controls, not a link inside a sentence — WCAG 2.2's
                    * target-size applies and the inline exemption does not. It
                    * measured 19.5px. Only visible at a mobile viewport, which
                    * is why a desktop-only accessibility sweep passed it.
                    */}
                  <a
                    href={`#${r.rule.code}`}
                    className="inline-flex min-h-[28px] items-center text-small text-ink-2 underline-offset-2 hover:underline"
                  >
                    {r.rule.label}
                  </a>
                  <Numeric className="text-small font-semibold text-ink-1">{r.count}</Numeric>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-caption leading-relaxed text-muted-1">
              Rules follow Etsy’s documented listing requirements plus your own thresholds. Nothing
              here models Etsy’s ranking — no one outside Etsy can.
            </p>
            <span className="mt-3 inline-block">
              <NotYet
                label="Edit thresholds"
                reason="The thresholds above are EtsyPilot's defaults. Editing them needs somewhere to keep yours."
              />
            </span>
          </Card>

          <Card className="flex flex-col gap-1.5 p-[18px]">
            <span className="text-label text-muted-1">Revenue on listings with issues</span>
            <Money
              value={view.revenueOnListings}
              currency={shop.currency}
              className="text-[19px] font-semibold text-ink-1"
            />
            <span className="text-caption leading-snug text-muted-1">
              What this is: revenue that {view.errors + view.warnings} flagged listings{' '}
              <strong className="font-semibold text-ink-2">earned</strong> in this period, summed
              from their own receipt lines. What it is not: money at risk. A missing attribute on a
              listing that earned well does not endanger what it already took.
            </span>
            <span className="text-caption leading-snug text-muted-1">
              Each listing is counted once, so the per-rule figures above do not add up to this —
              a listing failing three rules appears in three of them and once here.
            </span>
            <span className="text-caption leading-snug text-muted-1">
              Item revenue, before order-level discounts: spreading a discount across an order’s
              items would be a transform, and a transform demotes a verified figure.
            </span>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {explanation && worst ? (
            <Card className="p-[18px]">
              <AssistedNote
                explanation={explanation}
                demo={demo}
                label={`Where to start · ${worst.rule.label}`}
              />
            </Card>
          ) : null}

          {view.results.map((r) => (
            <div key={r.rule.code} id={r.rule.code}>
              <RuleGroup result={r} currency={shop.currency} demo={demo} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
