import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Numeric } from '@/components/ui/numeric'
import { getListsView } from '@/domain/research/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate } from '@/lib/utils/format'

export const metadata: Metadata = { title: 'Keyword Lists' }

/*
 * Keyword lists.
 *
 * The join between research and editing. "Apply to listings" does not write
 * anything: it opens the Safe Bulk Editor with the terms pre-loaded, and the
 * seller still goes through validate, diff and confirm. The copy says so on the
 * screen, because a button called "Apply" that does not apply is the kind of
 * surprise this product exists to avoid.
 */
export default async function KeywordListsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const lists = await getListsView(ctx)

  return (
    <>
      <PageHeader
        title="Keyword Lists"
        subtitle="Save terms while researching, then apply them to listings with a reviewable diff."
        actions={<Button variant="primary">New list</Button>}
      />

      {lists.length === 0 ? (
        <EmptyState
          title="No lists yet"
          description="Save a term from the Keywords screen and it will appear here."
          action={<Link href="/research/keywords">Search a keyword</Link>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {lists.map((list) => (
            <Card key={list.id} className="flex flex-col gap-3 p-[18px]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-section text-ink-1">{list.name}</h2>
                  <Numeric className="text-caption text-muted-1">
                    {list.termCount} keyword{list.termCount === 1 ? '' : 's'} · updated{' '}
                    {formatDate(list.updatedAt)}
                    {list.sharedWith ? ` · shared with ${list.sharedWith}` : ''}
                  </Numeric>
                </div>
              </div>

              <ul className="flex flex-wrap gap-1.5">
                {list.preview.map((term) => (
                  <li
                    key={term}
                    className="rounded-control border border-line px-2 py-1 text-caption text-ink-2"
                  >
                    {term}
                  </li>
                ))}
                {list.termCount > list.preview.length ? (
                  <li className="rounded-control px-2 py-1 text-caption text-muted-1">
                    +{list.termCount - list.preview.length}
                  </li>
                ) : null}
              </ul>

              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Link
                  href={`/listings/bulk-editor?list=${list.id}`}
                  className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-white hover:bg-brand-strong md:h-[38px]"
                >
                  Apply to listings
                </Link>
                <Button variant="secondary">Export</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-4 max-w-[70ch] text-caption leading-relaxed text-muted-1">
        Applying a list opens the bulk editor with those terms loaded as tag additions. Nothing is
        published there either until you have seen the exact before-and-after for every listing and
        confirmed it — a keyword list is research until a human reviews the diff it produces.
      </p>
    </>
  )
}
