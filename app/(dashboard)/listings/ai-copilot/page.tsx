import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { EmptyState } from '@/components/ui/states'
import { DraftReview } from '@/components/ai/draft-review'
import { Button } from '@/components/ui/button'
import { NotYet } from '@/components/settings/not-yet'
import { Card } from '@/components/ui/card'
import { Numeric } from '@/components/ui/numeric'
import { getCopilotView } from '@/domain/ai/service'
import { quotaExhausted } from '@/domain/ai/types'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'

export const metadata: Metadata = { title: 'AI Copilot' }

/*
 * AI listing helper.
 *
 * The header states the rule before the draft is read, not after: nothing
 * publishes without approval. The quota is honest in both directions — it says
 * what is spent, when it resets, and what keeps working when it runs out.
 */
export default async function AiCopilotPage({
  searchParams,
}: {
  searchParams: Promise<{ listing?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { listing } = await searchParams
  const ctx = shopContext(session, session.shopId)
  const view = await getCopilotView(ctx, listing)
  if (!view) {
    return (
      <>
        <PageHeader
          title="AI Copilot"
          subtitle="Drafts titles, tags and descriptions for a listing you choose — and never publishes anything without you."
        />
        <EmptyState
          title="No listings to draft for yet"
          description="The Copilot rewrites a listing you already have, so it needs at least one. Once your shop has synced, open a listing from the audit and the Copilot will pick up the weakest one automatically."
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
  const demo = session.isDemo
  const exhausted = quotaExhausted(view.quota)
  const { draft, rejected, inputs } = view

  return (
    <>
      <PageHeader
        title="AI listing helper"
        subtitle={`${draft?.listingTitle ?? rejected?.listingTitle ?? ''} · AI draft — nothing publishes without your approval · ${view.provider}`}
        actions={
          <>
            <NotYet
              label="Discard draft"
              reason="Drafts are generated per request and nothing is stored, so there is nothing to discard yet."
            />
            <Link
              href={draft ? `/listings/bulk-editor?draft=${draft.id}` : '/listings/audit'}
              className="inline-flex h-11 items-center rounded-control bg-brand px-3 text-[12px] font-semibold text-brand-on hover:bg-brand-strong md:h-[38px]"
              aria-disabled={draft === null}
            >
              {draft ? 'Send to review' : 'No draft to review'}
            </Link>
          </>
        }
      />

      {/*
        A withheld draft is a designed state, not an error page. It names what
        the model did wrong, in the seller's terms, and says twice what did not
        happen: the listing was not touched and the generation was not counted.
      */}
      {rejected ? (
        <Card className="mb-4 p-[18px]">
          <h2 className="text-section text-ink-1">This draft was withheld</h2>
          <p className="mt-1 text-small leading-relaxed text-ink-2">
            EtsyPilot checks every draft before showing it. This one broke a rule, so you are not
            seeing it — a rewrite that gets one thing wrong is not trustworthy about the rest.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {rejected.reasons.map((r) => (
              <li key={r} className="text-small leading-relaxed text-ink-2">
                · {r}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption leading-relaxed text-muted-1">{rejected.note}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <NotYet
              label="Try again"
              variant="primary"
              reason="Re-running a refused draft needs the request kept. Reload the page to generate a new one."
            />
            <NotYet
              label="Edit manually"
              reason="In-place editing arrives with the listing editor. The bulk editor applies changes today."
            />
          </div>
        </Card>
      ) : null}

      {exhausted ? (
        <Card className="mb-4 p-4 text-small leading-relaxed text-ink-2">
          <strong className="font-semibold text-ink-1">
            {view.quota.used} of {view.quota.limit} AI generations used.
          </strong>{' '}
          Your allowance resets {view.quota.resetsOn}. Manual editing, audits and bulk edits are
          unaffected.
          {view.quota.nextTier ? (
            <>
              {' '}
              {view.quota.nextTier.name} includes{' '}
              {view.quota.nextTier.limit.toLocaleString('en-US')} generations per month.
            </>
          ) : null}{' '}
          <Link href="/billing" className="font-semibold text-brand-strong underline underline-offset-2">
            Compare plans
          </Link>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="flex flex-col gap-3">
          <Card className="flex flex-col gap-3 p-[18px]">
            <h2 className="text-section text-ink-1">Generation inputs</h2>

            <div className="flex flex-col gap-1">
              <span className="text-label text-muted-1">Keyword source</span>
              <span className="text-small text-ink-1">
                {inputs.keywordListName ? `List: ${inputs.keywordListName}` : 'Your current listing only'}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-label text-muted-1">Tone</span>
              <span className="text-small text-ink-1">
                {inputs.tone.charAt(0) + inputs.tone.slice(1).toLowerCase()}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-label text-muted-1">Locked terms</span>
              <ul className="flex flex-wrap gap-1.5">
                {inputs.lockedTerms.map((t) => (
                  <li
                    key={t}
                    className="rounded-control border border-line px-2 py-1 text-caption text-ink-2"
                  >
                    {t}
                  </li>
                ))}
              </ul>
              <span className="text-caption leading-snug text-muted-1">
                Locked terms are preserved exactly as written, even where they repeat.
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-label text-muted-1">Guardrails</span>
              <ul className="flex flex-col gap-1 text-caption text-ink-2">
                {inputs.guardrails.map((g) => (
                  <li key={g}>· {g}</li>
                ))}
              </ul>
            </div>

            <Button variant="secondary" disabled={exhausted}>
              Regenerate draft
            </Button>
            <p className="text-caption leading-relaxed text-muted-1">
              AI can be wrong. Check facts, materials and measurements before publishing. A draft
              that fails to generate is not counted against your allowance.
            </p>
          </Card>

          <Card className="flex flex-col gap-2 p-[18px]">
            <span className="text-label text-muted-1">Generations this month</span>
            <Numeric className="text-[19px] font-semibold text-ink-1">
              {view.quota.used} of {view.quota.limit}
            </Numeric>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (view.quota.used / view.quota.limit) * 100)}%`,
                  background: exhausted ? 'var(--danger)' : 'var(--brand)',
                }}
              />
            </div>
            <span className="text-caption text-muted-1">
              Resets {view.quota.resetsOn} · {view.quota.planName} plan
            </span>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {draft ? <DraftReview draft={draft} demo={demo} /> : null}

          {view.queue.length > 0 ? (
            <Card className="p-[18px]">
              <h2 className="text-section text-ink-1">
                Bulk AI drafts · {view.queue.length} listings queued
              </h2>
              <p className="mt-1 text-caption leading-relaxed text-muted-1">
                Each draft is approved individually. Bulk generation never publishes automatically,
                and a rejected draft leaves the live listing untouched.
              </p>
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {view.queue.map((q) => (
                  <li key={q.listingId} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-small text-ink-2">{q.title}</span>
                    <span className="shrink-0 text-caption text-muted-1">
                      {q.status === 'APPROVED' ? 'Approved' : 'Awaiting review'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  )
}
