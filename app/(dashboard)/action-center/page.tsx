import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ActionList } from '@/components/action-center/action-list'
import { PageHeader } from '@/components/layout/page-header'
import { getActions } from '@/domain/action-center/service'
import { getSession } from '@/lib/auth'
import { shopContext } from '@/lib/permissions'

export const metadata: Metadata = { title: 'Action Center' }

export default async function ActionCenterPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const { actions, counts } = await getActions(ctx)

  return (
    <>
      <PageHeader
        title="Action Center"
        subtitle="What needs your attention, ordered by measured impact. Every card carries its evidence and a destination."
      />
      <ActionList actions={actions} counts={counts} demo={session.isDemo} />
    </>
  )
}
