import { ThemeToggle } from '@/components/layout/theme-toggle'
import { UserMenu } from '@/components/layout/user-menu'

/*
 * The operator top bar: 64px, per Foundations 06, matching the seller app's.
 *
 * ── WHAT IT DOES NOT CARRY, AND WHY ───────────────────────────────────────
 *
 * The seller bar holds a shop chip, a command palette and an extension link.
 * None of the three belongs here:
 *
 *   the shop chip       there is no "your shop" on an operator screen. A chip
 *                       showing the operator's OWN shop beside another
 *                       seller's data is the exact confusion the banner above
 *                       exists to prevent.
 *   the palette         it is not built in the seller app either, where it
 *                       renders disabled with the reason on it. Carrying a
 *                       disabled control across to a new surface would be
 *                       copying a debt.
 *   the extension       a seller's tool. An operator has no listings to edit.
 *
 * So what is left is the two things an operator genuinely needs in that
 * corner: the theme, and the way out. Both are the seller app's own
 * components rather than copies — a second sign-out is a second thing to keep
 * correct, and sign-out is the control that must work in the least capable
 * case (no JavaScript, POST not GET).
 *
 * The left of the bar states the screen's context rather than the product's
 * name, which the sidebar already carries two inches away.
 */
export function OperatorTopBar({
  userInitials,
  userName,
  userEmail,
}: {
  userInitials: string
  userName: string | null
  userEmail: string
}) {
  return (
    <header className="hidden h-topbar shrink-0 items-center gap-3.5 border-b border-line bg-surface px-4 md:px-[26px] lg:flex">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold leading-none text-ink-1">
          Platform operations
        </span>
        <span className="truncate text-[11px] leading-none text-muted-1">
          Every shop, read-only
        </span>
      </div>

      <div className="ml-auto">
        <ThemeToggle />
      </div>

      {/*
        * prefetch={false} on the menu's links, for the D94 reason rather than
        * a performance one. MEASURED in A4: a default-prefetched link to a
        * SELLER route re-created the operator's own shop and membership rows,
        * because /dashboard repairs a missing shop by provisioning it. The
        * account menu points at /settings/profile, which resolves a session the
        * same way. Opening an operator screen must not execute a seller route.
        */}
      <UserMenu
        userInitials={userInitials}
        userName={userName}
        userEmail={userEmail}
        prefetch={false}
      />
    </header>
  )
}
