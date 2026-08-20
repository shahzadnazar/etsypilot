import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getSession } from '@/lib/auth'
import { getEtsyService } from '@/lib/etsy'
import { shopContext } from '@/lib/permissions'
import { DEMO_COUNTS } from '@/lib/etsy/demo-dataset'
import { DEMO_PLAN, planOf } from '@/domain/billing/plans'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const shop = await getEtsyService().getShop(ctx.shopId)

  const plan = planOf(DEMO_PLAN)

  const initials = session.name
    .split(' ')
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <AppShell
      shopName={shop.name}
      lastSyncedAt={shop.lastSyncedAt}
      isDemo={session.isDemo}
      userInitials={initials}
      plan={plan.name}
      listingUsage={`${DEMO_COUNTS.activeListings} / ${plan.limits.listings?.toLocaleString('en-US') ?? '—'} listings`}
    >
      {children}
    </AppShell>
  )
}
