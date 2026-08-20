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
    detail: 'Percentage, discount, margin, markup, break-even — with the formula shown.',
    needs: 'No shop needed',
    ready: false,
  },
  'Fee Calculator': {
    detail: 'Listing, transaction and processing fees against published rates, with the rule set and effective date stated.',
    needs: 'No shop needed',
    ready: false,
  },
  'Ads ROI Calculator': {
    detail: 'Spend against attributed revenue, from figures you enter — Etsy does not expose ads performance through the API.',
    needs: 'Your own figures',
    ready: false,
  },
  'Profit Calculator': {
    detail: 'One product, end to end: price, fees, cost, shipping and labour.',
    needs: 'No shop needed',
    ready: false,
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
                  <span className="text-caption text-muted-1">
                    Not built yet — the calculator engines land in Phase 10.
                  </span>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <p className="mt-4 max-w-[80ch] text-caption leading-relaxed text-muted-1">
        Every calculator shows its formula and the rule set it applied, with an effective date.
        Fee results are estimates against published rates: your actual charges can differ with
        currency conversion, regulatory operating fees, Offsite Ads eligibility and local taxes.
        Check your Etsy payment account for exact figures.
      </p>
    </>
  )
}
