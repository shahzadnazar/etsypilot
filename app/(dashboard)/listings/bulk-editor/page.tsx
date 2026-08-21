import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BulkEditorWizard } from '@/components/bulk-editor/bulk-editor-wizard'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/ui/states'
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

  /*
   * Nothing to edit.
   *
   * Without this the wizard opened on step 3 with two steps already ticked, a
   * "Validate 0 listings" button and a job summary reading "Listings 0 · Will
   * be written 0". Every control worked; none of them meant anything. A wizard
   * that reports progress through a job with no items in it is the same defect
   * as a health score over an empty catalogue — a number that is arithmetically
   * correct and says something false.
   */
  if (listings.length === 0) {
    return (
      <>
        <PageHeader
          title="Bulk editor"
          subtitle="Change many listings at once, with a diff you approve before anything is sent."
        />
        <EmptyState
          title="No listings to edit yet"
          description="The bulk editor works on listings you already have. Once your shop has synced, select listings from the audit and they arrive here with the change you chose — still unpublished until you confirm the exact before-and-after."
          action={
            <Link
              href="/listings/audit"
              className="text-caption font-semibold text-brand-strong underline underline-offset-2"
            >
              Go to the listing audit →
            </Link>
          }
        />
      </>
    )
  }

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
