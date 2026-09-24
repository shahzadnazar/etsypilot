import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { getSession } from '@/lib/auth'
import { initialsFor } from '@/lib/utils/name'
import { getEtsyService } from '@/lib/etsy'
import { shopContext } from '@/lib/permissions'
import { currentPlan } from '@/domain/billing/service'
import { getActions } from '@/domain/action-center/service'
import { getAdminAccess } from '@/domain/admin/access'
import { getMfaPosture } from '@/lib/auth/mfa'
import { TWO_FACTOR_VERIFY_PATH } from '@/domain/auth/two-factor'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  /*
   * ── A SELLER WHO TURNED 2FA ON IS ASKED FOR IT ──────────────────────────
   *
   * Optional means optional to ENROL, not optional to honour. An account with
   * a verified factor on an aal1 session is asked for a code here, exactly as
   * an operator is asked at the console's door.
   *
   * Without this, a seller could enrol, sign out, sign back in with a password
   * alone, and land on their dashboard — and the switch in Settings would have
   * changed nothing except a badge. "Optional second factor" would mean "a
   * second factor that is never checked", which is a worse lie than not
   * offering one.
   *
   * NOT `requiresTwoFactor(role)` HERE, and the difference matters: this asks
   * whether the ACCOUNT has a factor, not whether its role must have one.
   * Operators are covered by both this and the console's own gate, which is
   * correct — the console's is the one that also refuses an operator who has
   * not enrolled at all.
   *
   * No redirect loop is possible: the code screen lives in app/(account),
   * under a different layout, and is reachable at aal1 by design.
   */
  const posture = await getMfaPosture()
  /*
   * `resolved` is required before acting, and the asymmetry with the operator
   * console is deliberate — lib/auth/mfa.ts sets out why. In short: an
   * unresolved posture here means Supabase did not answer, and sending every
   * seller to a code screen during a provider blip costs more than the window
   * it closes. The console makes the opposite call, because the console is the
   * privileged surface.
   */
  if (posture.resolved && posture.enrolled && !posture.satisfied) {
    // `next` is explicit because the code screen's default destination is the
    // operator console — right for the gate that sends most people there,
    // wrong for a seller, who would land on a 404 having done everything
    // asked of them.
    redirect(`${TWO_FACTOR_VERIFY_PATH}?next=/dashboard`)
  }

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
