import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { getSession } from '@/lib/auth'
import { isDemoMode } from '@/lib/etsy'

export const metadata: Metadata = { title: 'Export & deletion' }

/*
 * Export & deletion.
 *
 * This page existed as a PROMISE before it existed as a page. Settings → Shop
 * connections told the seller, in the paragraph about revoking access, that
 * "you can export or delete it from Export & deletion" — and the link 404'd.
 *
 * That is worse than a missing feature. The sentence is a data-rights claim,
 * sitting next to the control that makes people think about their data, and it
 * was not true. A link audit found it along with three others, including the
 * 404 page's own recovery link, which was itself a 404.
 *
 * What this page will not do:
 *
 *   - It will not offer a button that does nothing. Deletion is described,
 *     with the exact route to request it, rather than mocked with a dialog
 *     that pretends.
 *   - It will not claim to export what it cannot. Two datasets are wired
 *     (transactions, audit); the page lists those two and says what each
 *     leaves out, because /api/export refuses anything else by design.
 */

interface Dataset {
  key: string
  label: string
  detail: string
  excludes: string
}

const DATASETS: Dataset[] = [
  {
    key: 'transactions',
    label: 'Orders & reconciliation',
    detail:
      'Every order in the current period with its gross, discounts, refunds and fee lines, plus how each one was costed.',
    excludes:
      'Buyer names, emails and addresses — EtsyPilot never receives them, so they cannot be in the file.',
  },
  {
    key: 'audit',
    label: 'Listing audit findings',
    detail:
      'Every rule that fired, the listing it fired on, and the severity — the same rows the audit screen shows.',
    excludes: 'Listing photos and descriptions. Export those from Etsy directly.',
  },
]

export default async function ExportPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const demo = isDemoMode()

  return (
    <>
      <PageHeader
        title="Export & deletion"
        subtitle="Your data, in a file you keep, and a way to have it removed."
      />

      {demo ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">
          This is the demo shop. The exports below are real files built from the demo data — the
          same code path a connected shop uses — so you can see exactly what you would get.
        </Card>
      ) : null}

      <h2 className="text-section text-ink-1">Export</h2>
      <p className="mb-3 mt-1 max-w-[80ch] text-small leading-relaxed text-ink-2">
        CSV, opened by any spreadsheet. Every value column is followed by its own source column,
        because a badge on a screen does not survive being pasted into a spreadsheet — and a figure
        whose origin is unknown is worse than no figure. An unknown value is an empty cell, never a
        zero: a spreadsheet will sum zeros happily and give an answer that looks right.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {DATASETS.map((dataset) => (
          <Card key={dataset.key} className="flex flex-col gap-2 p-[18px]">
            <h3 className="text-section text-ink-1">{dataset.label}</h3>
            <p className="text-small leading-relaxed text-ink-2">{dataset.detail}</p>
            <p className="text-caption leading-relaxed text-muted-1">
              Not included: {dataset.excludes}
            </p>
            <div className="mt-auto pt-2">
              {/*
                * A plain link to the API route, not a fetch-and-blob dance. The
                * browser downloads it, it works with no JavaScript, and the URL
                * is inspectable — which for a file about your own money is the
                * right property.
                */}
              <a
                href={`/api/export/${dataset.key}`}
                className="text-caption font-semibold text-brand-strong underline underline-offset-2"
              >
                Download CSV →
              </a>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4 p-[18px]">
        <h2 className="text-section text-ink-1">Deletion</h2>
        <p className="mt-2 max-w-[80ch] text-small leading-relaxed text-ink-2">
          Deleting your EtsyPilot data removes the synced copy of your shop, your cost setup, your
          audit history and your bulk-edit records. It does not touch your Etsy shop, your listings
          or your orders — EtsyPilot deletes its own copy, never yours.
        </p>
        <p className="mt-2 max-w-[80ch] text-small leading-relaxed text-ink-2">
          Export first if you want to keep anything. Deletion cannot be undone, and support cannot
          recover it afterwards.
        </p>
        <p className="mt-2 max-w-[80ch] text-small leading-relaxed text-ink-2">
          {/*
            * No delete button, deliberately. There is no repository behind it
            * yet (DATABASE_URL is unset), and a button that appears to delete
            * your data while doing nothing is the single worst thing this page
            * could contain. It says what to do instead, which is true today.
            */}
          To request deletion, email{' '}
          <span className="font-semibold text-ink-1">privacy@etsypilot.app</span> from the address on
          your account. It is actioned within 30 days, and you get written confirmation of what was
          removed.
        </p>
        <p className="mt-2 max-w-[80ch] text-caption leading-relaxed text-muted-1">
          Revoking EtsyPilot&rsquo;s access on Etsy stops all reading and writing immediately, and is
          separate from deletion — do it from{' '}
          <Link
            href="/settings/shops"
            className="font-semibold text-brand-strong underline underline-offset-2"
          >
            Shop connections
          </Link>{' '}
          or from your Etsy account. Your history here stays readable until you ask for it to be
          deleted.
        </p>
      </Card>
    </>
  )
}
