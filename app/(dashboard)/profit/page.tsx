import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProfitTabs } from '@/components/profit/profit-tabs'
import { getProfitView } from '@/domain/profit/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Profit Reality' }

export default async function ProfitPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const view = await getProfitView(ctx)
  const period = `${formatDate(view.periodStart)} – ${formatDate(view.periodEnd)}`

  return (
    <>
      <PageHeader
        title="Profit Reality"
        subtitle={`${period} UTC · ${view.currency} · verified revenue and fees, your cost inputs`}
        actions={
          <Link
            href="/api/export/transactions"
            className="inline-flex h-11 items-center rounded-control border border-line px-3 text-[12px] font-semibold text-ink-2 hover:bg-canvas-soft md:h-[38px]"
          >
            Export CSV
          </Link>
        }
      />
      <ProfitTabs view={view} demo={session.isDemo} />
    </>
  )
}
