import { LogOut, User } from 'lucide-react'
import Link from 'next/link'

/*
 * The account menu behind the avatar.
 *
 * This is the ONLY way out of the application. Before it, a signed-in seller
 * had no sign-out at all — the avatar was a link to Profile, and the session
 * ended when the cookie expired or never. That makes it load-bearing rather
 * than polish, which is why it is built to work in the least capable case.
 *
 * <details>/<summary>, not a click handler. It opens, closes, takes focus and
 * responds to Enter and Escape with no JavaScript whatsoever — the same
 * reasoning as the sign-in form. A dropdown that needs hydration to let someone
 * sign out is a dropdown that traps them on a slow connection.
 *
 * Sign-out is a FORM POST, never a link. A GET sign-out fires on anything that
 * fetches a URL: a link prefetch, a chat client unfurling a preview, an <img>
 * on a hostile page. Each of those would silently end the session. The POST
 * also passes through middleware's CSRF check like every other mutation.
 *
 * Colours on the avatar are literal, not tokenised: pairing a token background
 * with a literal foreground breaks on theme flip — --ink-2 inverts to #CBD5E1
 * in dark, which put white text on light grey. Same convention as the demo
 * banner (D1/D10).
 */
export function UserMenu({
  userInitials,
  userName,
  userEmail,
  prefetch,
}: {
  userInitials: string
  /** A display label. May be derived from the email when no name is set. */
  userName: string
  /** Always shown in full, so the label above it is never the only identifier. */
  userEmail: string
  /**
   * Passed through to the Profile link. Defaults to Next's behaviour, which is
   * what the seller app wants.
   *
   * The OPERATOR shell passes false, and the reason is D94 rather than
   * performance: a prefetched link to a SELLER route renders that route, and
   * /settings/profile resolves a session the same way /dashboard does — which
   * was measured in A4 to re-create the operator's own shop and membership
   * rows. Opening an operator screen must not execute a seller route.
   */
  prefetch?: false
}) {
  return (
    <details className="relative shrink-0 [&_summary::-webkit-details-marker]:hidden">
      <summary
        title={`${userName} — account menu`}
        className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-control text-[11px] font-semibold transition-shadow hover:shadow-[0_0_0_2px_var(--brand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        style={{ background: '#241B12', color: '#F7F3ED' }}
      >
        <span aria-hidden>{userInitials}</span>
        <span className="sr-only">Account menu for {userEmail}</span>
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-[260px] overflow-hidden rounded-card border border-line bg-surface shadow-[0_8px_24px_rgba(0,0,0,.12)]">
        <div className="flex flex-col gap-0.5 border-b border-line px-3.5 py-3">
          <span className="truncate text-small font-semibold text-ink-1">{userName}</span>
          {/*
            * The full address, never truncated away to nothing. The label above
            * is derived from it when no name is set, so this is the line that
            * actually tells a seller which account they are in — which matters
            * most to anyone who keeps a second one.
            */}
          <span className="truncate text-caption text-muted-1" title={userEmail}>
            {userEmail}
          </span>
        </div>

        <Link
          href="/settings/profile"
          prefetch={prefetch}
          className="flex items-center gap-2 px-3.5 py-2.5 text-small text-ink-2 hover:bg-canvas-soft"
        >
          <User size={14} aria-hidden />
          Profile &amp; settings
        </Link>

        <form action="/api/auth/signout" method="post" className="border-t border-line">
          <button
            type="submit"
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-small hover:bg-canvas-soft"
            style={{ color: 'var(--danger-ink)' }}
          >
            <LogOut size={14} aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </details>
  )
}
