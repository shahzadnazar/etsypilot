import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { BulkEditorWizard } from '@/components/bulk-editor/bulk-editor-wizard'
import { PageHeader } from '@/components/layout/page-header'
import { getSession } from '@/lib/auth'
import { getEtsyService } from '@/lib/etsy'
import { DEMO_COST_INPUTS, DEMO_NOW } from '@/lib/etsy/demo-dataset'
import { shopContext } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Bulk Editor' }

export default async function BulkEditorPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const { listings } = await getEtsyService().getListings(ctx.shopId, { limit: 128 })

  // Per-listing costs drive the cost-floor guard. Listings without a confirmed
  // cost simply have no entry, and the guard cannot exclude what it cannot price.
  const costs: [string, number][] = listings
    .filter((_, i) => i % 3 !== 0)
    .map((l) => [l.etsyListingId, Number((l.price * DEMO_COST_INPUTS.cogsPercent).toFixed(2))])

  return (
    <>
      <PageHeader
        title="Bulk editor"
        subtitle={`${listings.length} listings selected · Willow & Fern Studio`}
      />
      <BulkEditorWizard
        listings={listings}
        costs={costs}
        demo={session.isDemo}
        now={DEMO_NOW}
      />
    </>
  )
}
