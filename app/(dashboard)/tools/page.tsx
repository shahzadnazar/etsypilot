import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { NAV_GROUPS } from '@/components/layout/navigation'

export const metadata: Metadata = { title: 'Tools' }

/*
 * Free tool hub.
 *
 * Every tool here works before a shop is connected, which is the whole point of
 * the Free tier — and the reason each card says what the tool needs. A tool
 * that silently requires a connection is a paywall wearing a tool's clothes.
 *
 * The calculators themselves are Phase 10. The hub lists them with an honest
 * status rather than linking to pages that do not exist yet.
 */
const TOOL_DETAIL: Record<string, { detail: string; needs: string; ready: boolean }> = {
  'Simple Calculator': {
    detail:
      'Percentage, discount, profit, margin, markup, fee, net revenue and break-even — with the formula shown every time.',
    needs: 'No shop needed',
    ready: true,
  },
  'Fee Calculator': {
    detail:
      'Listing, transaction and processing fees against published rates, with the rule set and effective date stated — and every rate editable, because Etsy changes them and they differ by country.',
    needs: 'No shop needed',
    ready: true,
  },
  'Ads ROI Calculator': {
    detail:
      'Spend against attributed revenue, from figures you enter — Etsy does not expose ads performance through the API. Leads with money kept, not the ROAS that flatters.',
    needs: 'Your own figures',
    ready: true,
  },
  'Profit Calculator': {
    detail:
      'One product, end to end: price, fees, materials, postage and your time — costed as a line, not an option.',
    needs: 'No shop needed',
    ready: true,
  },
  'Category Finder': {
    detail: 'Find the Etsy category and its required attributes before you list.',
    needs: 'No shop needed',
    ready: false,
  },
  'Seasonal Calendar': {
    detail: 'When demand for a category historically moves, modelled from public signals.',
    needs: 'No shop needed',
    ready: false,
  },
  'Trademark Screening': {
    detail: 'Check a term against public trademark registers before you use it in a title.',
    needs: 'No shop needed',
    ready: false,
  },
}

/*
 * Why each unbuilt tool is unbuilt.
 *
 * Two of these are waiting on data this product does not have, and one of them
 * cannot be built honestly at all without a source. Saying "coming soon" for
 * all three would hide a real difference between "not yet" and "not without
 * something we do not have".
 */
const BLOCKED_BY: Record<string, string> = {
  'Category Finder':
    'Needs Etsy’s category taxonomy and its per-category required attributes. Etsy publishes these through the API only for a connected shop, so this arrives with live mode.',
  'Seasonal Calendar':
    'Needs several years of category demand history. EtsyPilot models demand from public signals sampled weekly and has been sampling for months, not years — a seasonal claim on this much data would be a guess with a chart around it.',
  'Trademark Screening':
    'Needs a trademark register. Not a matter of build time: a screening tool that guessed would let a seller read a clear result and use a registered mark, which is worse than having no tool at all.',
}

export default function ToolsPage() {
  const tools = NAV_GROUPS.find((g) => g.label === 'Tools')?.items ?? []

  return (
    <>
      <PageHeader
        title="Tools"
        subtitle="Every tool here works before you connect a shop. Nothing on this page needs your Etsy account."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => {
          const detail = TOOL_DETAIL[tool.label]
          return (
            <Card key={tool.href} className="flex flex-col gap-2 p-[18px]">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-section text-ink-1">{tool.label}</h2>
                <span className="shrink-0 text-caption text-muted-1">{detail?.needs}</span>
              </div>
              <p className="text-small leading-relaxed text-ink-2">{detail?.detail}</p>
              <div className="mt-auto pt-2">
                {detail?.ready ? (
                  <Link
                    href={tool.href}
                    className="text-caption font-semibold text-brand-strong underline underline-offset-2"
                  >
                    Open →
                  </Link>
                ) : (
                  /*
                   * Not built yet, and it says so. A link into an empty page
                   * would be the "looks built" problem D21 removed from the
                   * navigation, reintroduced one card at a time.
                   */
                  /*
                    * Says WHY, per tool, rather than one blanket line.
                    *
                    * Trademark screening in particular is not a matter of
                    * finding time: it needs a trademark register, and a tool
                    * that guessed at one would be worse than no tool — a
                    * seller could read a clear result and use a mark that is
                    * registered.
                    */
                  <span className="text-caption leading-relaxed text-muted-1">
                    {BLOCKED_BY[tool.label] ?? 'Not built yet.'}
                  </span>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <p className="mt-4 max-w-[80ch] text-caption leading-relaxed text-muted-1">
        The Simple Calculator is also published without a login at{' '}
        <Link
          href="/tools/etsy-seller-calculator"
          className="font-semibold text-brand-strong underline underline-offset-2"
        >
          /tools/etsy-seller-calculator
        </Link>{' '}
        — the same component, so the two cannot give different answers.
      </p>

      <p className="mt-3 max-w-[80ch] text-caption leading-relaxed text-muted-1">
        Every calculator shows its formula and the rule set it applied, with an effective date.
        Fee results are estimates against published rates: your actual charges can differ with
        currency conversion, regulatory operating fees, Offsite Ads eligibility and local taxes.
        Check your Etsy payment account for exact figures.
      </p>
    </>
  )
}
