import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getSession } from '@/lib/auth'
import { initialsFor } from '@/lib/utils/name'
import { getEtsyService } from '@/lib/etsy'
import { shopContext } from '@/lib/permissions'
import { currentPlan } from '@/domain/billing/service'
import { getActions } from '@/domain/action-center/service'
import { getAdminAccess } from '@/domain/admin/access'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const ctx = shopContext(session, session.shopId)
  const [shop, plan, actions, operator] = await Promise.all([
    getEtsyService().getShop(ctx.shopId),
    // Read, not restated: the chip and the billing page share one source.
    currentPlan(ctx),
    // Same rule for the bell: the dot and the Action Center count one set.
    getActions(ctx),
    /*
     * Whether this viewer may open the operator console.
     *
     * THE SAME FUNCTION THE CONSOLE GATES ON, not a cheaper approximation
     * built from the session we already hold. A second way of deciding who is
     * an operator is a second thing to keep in step, and this one would be
     * deciding it in the seller app — the last place that should have its own
     * opinion.
     *
     * It returns null immediately in demo mode, so the shared demo session
     * costs nothing and can never be shown the link. In live mode it is one
     * more round trip on a layout that already makes several, in parallel
     * with them rather than after them.
     */
    getAdminAccess(),
  ])

  /*
   * One helper, shared with the greeting, so the avatar and the header cannot
   * disagree about where a name ends. See lib/utils/name.ts for the two defects
   * that came out of running it over real shapes.
   */
  /*
   * The avatar still falls back to the address, and that is not the thing
   * lib/auth/index.ts stopped doing. Two letters in a circle is a swatch, not
   * a claim about what someone is called; the alternative is a blank circle.
   */
  const initials = initialsFor(session.name ?? '', session.email)

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
      /* A boolean, not the access object: see TopBar. */
      isOperator={operator !== null}
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
