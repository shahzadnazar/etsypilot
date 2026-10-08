import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/app-shell'
import { Suspense } from 'react'
import { PublicDemoNotice } from '@/components/layout/public-demo-notice'
import { getSession, isPublicDemo } from '@/lib/auth'
import { initialsFor } from '@/lib/utils/name'
import { isDemoMode } from '@/lib/etsy'
import { shopContext } from '@/lib/permissions'
import { shopHeader } from '@/domain/sync/source'
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
    /*
     * OUR OWN ROW IN LIVE MODE, THE ADAPTER IN DEMO MODE.
     *
     * This was `getEtsyService().getShop(ctx.shopId)` on every seller page,
     * and in a live deployment without an ETSY_API_KEY that throws — so every
     * screen 500'd in the shell before reaching its own data. Measured in a
     * browser against a live-mode server while building the listings slice.
     *
     * The shell needs a name and a sync time. Both are columns on `shops`:
     * the connection writes the name, and the listings sync writes
     * `last_synced_at`, which is what retires the shell's permanent
     * "Static data · no sync". domain/sync/source.ts has the argument.
     */
    shopHeader(ctx),
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
      /*
       * `shop` is null only when the session names a shop row that is gone.
       * "Shop not found" rather than an empty header, which would read as a
       * shop with no name. The listings table says the same thing in its own
       * words for the same case.
       */
      shopName={shop?.name ?? 'Shop not found'}
      lastSyncedAt={shop?.lastSyncedAt ?? null}
      /*
       * TWO QUESTIONS, TWO ANSWERS, AND THEY COME FROM DIFFERENT PLACES.
       *
       * `demoData` is the MODE: is the fictional catalogue being served. That
       * is what the banner's wording and the "· demo" chip are claims about,
       * and both were driven by `session.isDemo` — the shop row — so a live
       * deployment told every new signup it was "exploring Willow & Fern"
       * while serving them nothing.
       *
       * `connected` is the SHOP ROW: has this shop an Etsy connection. That is
       * what the green dot, the solid border and the sync line are about, and
       * it stays exactly as it was.
       *
       * domain/sync/source.ts drew this line for the data path and recorded
       * why; this is the same line through the chrome.
       */
      demoData={isDemoMode()}
      /*
       * Who is asking, not what is being served. A public visitor is served
       * the fixture exactly as the demo seller is, so `demoData` cannot tell
       * them apart — and the two want different chrome, because one of them
       * has no account to connect a shop to.
       */
      publicDemo={isPublicDemo(session)}
      connected={!session.isDemo}
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
      usage={{ used: shop?.activeListingCount ?? null, limit: plan.limits.listings }}
      /* A boolean, not the access object: see TopBar. */
      isOperator={operator !== null}
      openActionCount={actions.counts.OPEN ?? 0}
      /*
       * One source for both. The sidebar chip and the bell used to disagree —
       * a literal '2' in navigation.ts beside a real count of 5.
       */
      counts={{ '/action-center': actions.counts.OPEN ?? 0 }}
    >
      {/*
        * Mounted once, above every page. See the component for why the refusal
        * is shown rather than the button disabled.
        *
        * Suspense because it reads searchParams, which makes its subtree
        * dynamic; without the boundary that property climbs to the layout and
        * opts every seller screen out of static rendering.
        */}
      <Suspense fallback={null}>
        <PublicDemoNotice />
      </Suspense>
      {children}
    </AppShell>
  )
}
