import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ActionList } from '@/components/action-center/action-list'
import { AssistedNote } from '@/components/ai/assisted-note'
import { PageHeader } from '@/components/layout/page-header'
import { Card } from '@/components/ui/card'
import { getActions } from '@/domain/action-center/service'
import { recommendForAction } from '@/domain/ai/explain'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Action Center' }

export default async function ActionCenterPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const { actions, counts } = await getActions(ctx)

  /*
   * One recommendation, for the top action only. Same reasoning as the audit
   * page: with a live provider this is a real cost, and the cards already carry
   * their own explanation and evidence. The assistant adds a sentence about
   * what to do first — and if it is withheld, the card is unchanged.
   */
  const top = actions.find((a) => a.status === 'OPEN') ?? actions[0]
  const recommendation = top ? await recommendForAction(top) : null

  return (
    <>
      <PageHeader
        title="Action Center"
        subtitle="What needs your attention, ordered by measured impact. Every card carries its evidence and a destination."
      />
      {recommendation && top ? (
        <Card className="mb-4 p-[18px]">
          <AssistedNote
            explanation={recommendation}
            demo={session.isDemo}
            label={`Where to start · ${top.title}`}
          />
          <p className="mt-2 text-caption leading-relaxed text-muted-1">
            Advice, not instruction. It rests only on the evidence shown on the card below — the
            assistant is given your screen and nothing else, and anything it wrote that did not
            trace back to that evidence was withheld.
          </p>
        </Card>
      ) : null}

      <ActionList actions={actions} counts={counts} demo={session.isDemo} />
    </>
  )
}
