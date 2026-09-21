import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getSession } from '@/lib/auth'
import { getEtsyService } from '@/lib/etsy'
import { shopContext } from '@/lib/permissions'
import { currentPlan } from '@/domain/billing/service'
import { getActions } from '@/domain/action-center/service'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const [shop, plan, actions] = await Promise.all([
    getEtsyService().getShop(ctx.shopId),
    // Read, not restated: the chip and the billing page share one source.
    currentPlan(ctx),
    // Same rule for the bell: the dot and the Action Center count one set.
    getActions(ctx),
  ])

  /*
   * Initials from whatever label the session has.
   *
   * `users.name` is null for every provisioned account, so session.name is the
   * local part of the email — one word, no space. Splitting on spaces and
   * taking first letters would then yield a SINGLE character, where the demo
   * user's "Salman R." gave two. Falling back to the first two characters
   * keeps the avatar the same shape for both.
   */
  const words = session.name.trim().split(/\s+/).filter(Boolean)
  const initials = (
    words.length > 1
      ? words.map((w) => w[0] ?? '').join('')
      : (words[0] ?? session.email).slice(0, 2)
  )
    .slice(0, 2)
    .toUpperCase()

  /*
   * Usage is passed structured, not pre-formatted, so the shell can render an
   * over-limit state. It read "412 / 200 listings" in flat grey before — 212
   * listings over the plan, and visually identical to a shop comfortably under.
   */
  return (
    <AppShell
      shopName={shop.name}
      lastSyncedAt={shop.lastSyncedAt}
      isDemo={session.isDemo}
      userInitials={initials}
      userName={session.name}
      /* The one identifier that is never derived — see UserMenu. */
      userEmail={session.email}
      plan={plan.name}
      /*
       * From the shop, not from DEMO_COUNTS.
       *
       * The constant was baked in, so the shell reported "450 / 2,000
       * listings" for a shop with none — a count that disagrees with the
       * catalogue it is counting, on every page. Exactly the defect the mock's
       * activeListingCount was fixed for (D57); this was the other end of it.
       */
      usage={{ used: shop.activeListingCount, limit: plan.limits.listings }}
      openActionCount={actions.counts.OPEN ?? 0}
      /*
       * One source for both. The sidebar chip and the bell used to disagree —
       * a literal '2' in navigation.ts beside a real count of 5.
       */
      counts={{ '/action-center': actions.counts.OPEN ?? 0 }}
    >
      {children}
    </AppShell>
  )
}
