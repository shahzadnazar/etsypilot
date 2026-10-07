import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BulkEditorWizard } from '@/components/bulk-editor/bulk-editor-wizard'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/ui/states'
import { getSession } from '@/lib/auth'
import { isDemoMode } from '@/lib/etsy'
import { nowIso } from '@/domain/clock'
import { loadListings } from '@/domain/listings/load'
import { shopContext } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Bulk Editor' }

export default async function BulkEditorPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  /*
   * D11 ASKS THE MODE, NOT THE SHOP ROW.
 *
   * The provenance badge's demo override exists so "a screenshot taken in demo
   * mode can never be mistaken for a real shop's figures" — a statement about
   * whether the FIGURES are the fictional catalogue. That is `ETSY_MODE`.
 *
   * It was `session.isDemo`, which is `shops.is_demo`: whether this shop has
   * ever connected. On a live deployment every new signup carries it, so every
   * figure on every screen was stamped Demo while the mock was serving none of
   * them — and the stamp would then disappear the moment the shop connected,
   * which is precisely when it would start to matter if it were true.
   */
  const demoData = isDemoMode()
  /*
   * Through the loader, like every other screen. This called getListings on
   * the adapter directly, which is ETSY_NOT_CONFIGURED in a live deployment.
   */
  const catalogue = await loadListings(ctx)
  const listings = catalogue.listings.slice(0, 128)

  /*
   * ── THE COST FLOOR NOW USES REAL COSTS, OR PROTECTS NOTHING ─────────────
   *
   * Per-listing costs drive the cost-floor guard: it refuses a price change
   * that would take a listing below what it costs to make. This built them by
   * multiplying each price by DEMO_COST_INPUTS.cogsPercent and skipping every
   * third listing — a fixture's ratio, applied to a real seller's catalogue,
   * deciding whether their price change was safe.
   *
   * The loader's map is the seller's own confirmed per-listing costs. A
   * listing without one has no entry, and the guard cannot exclude what it
   * cannot price — which is the honest behaviour and was already documented
   * here. What changes is that the absence is now real.
   */
  const costs: [string, number][] = listings
    .filter((l) => catalogue.costs.has(l.etsyListingId))
    .map((l) => [l.etsyListingId, catalogue.costs.get(l.etsyListingId)!])

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
        demo={demoData}
        now={nowIso()}
      />
    </>
  )
}
