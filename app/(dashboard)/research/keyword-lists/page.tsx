import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { NotYet } from '@/components/settings/not-yet'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/states'
import { Numeric } from '@/components/ui/numeric'
import { getListsView } from '@/domain/research/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'
import { formatDate } from '@/lib/utils/format'
import { ModelledNotice } from '@/components/research/modelled-notice'
import { ResearchNotBuilt } from '@/components/research/not-built'

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
  /*
   * No store behind the lists, so there are no lists. See getListsView().
   */
  if (!lists) {
    return (
      <ResearchNotBuilt
        title="Keyword Lists"
        what="Keyword lists you can save and reuse"
        missing="store"
        figures={false}
        needs={
          <>
            A keyword list has to be stored somewhere, and there is no store behind this screen
            yet — which is what the &ldquo;New list&rdquo; button has always said. The lists in the
            demo are sample lists that nobody saved. There is nothing to save a term from either:
            the Keyword Explorer has no source behind it.
          </>
        }
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Keyword Lists"
        subtitle="Sample lists · no figures on this page, modelled or otherwise"
        actions={
          <NotYet
            label="New list"
            variant="primary"
            reason="Creating a list needs a store behind this page. These lists are read-only for now."
          />
        }
      />

      {lists.length === 0 ? (
        <EmptyState
          title="No lists yet"
          description="Saving a term is not built yet — these lists are read-only."
          action={<Link href="/research/keywords">Open the Keyword Explorer</Link>}
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
                  className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
                >
                  Apply to listings
                </Link>
                <NotYet
                  label="Export"
                  reason="There is no keyword-list export dataset yet. Transactions and the audit do export, from Data export."
                />
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

      <div className="mt-4">
        {/*
          * The one Research page whose provenance story is not "modelled":
          * it has no figures at all. It says what it IS rather than
          * borrowing the sentence from the other four, and it names the one
          * Etsy call this section makes — see getListsView() in
          * domain/research/service.ts.
          */}
        <ModelledNotice
          lead={
            <>
              <strong>There are no figures on this page.</strong> A keyword list is a set of
              terms, and the counts are of the terms in each list. Nothing here is Etsy data and
              nothing here is modelled — but nothing here was saved by you either: these are
              sample lists, because there is no store behind this screen yet.
            </>
          }
          sourceCategory="Sample lists"
          excludes="Search volume, competitor figures, and anything else this product does not have"
          limitations={[
            'Opening this page asks the Etsy adapter once whether your shop still exists, and throws the answer away. In the demo that adapter is the fictional catalogue, so nothing leaves this machine; on a connected shop it would be one call to the official API under your own authorisation, and no figure on this page would come from it.',
          ]}
          methodologyHref="/data/methodology"
        />
      </div>
    </>
  )
}
