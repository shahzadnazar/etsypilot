import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { getOperatorIdentity } from '@/lib/auth/operator-identity'
import { isLiveAuth } from '@/lib/auth/supabase-config'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE ROUTE GROUP THAT DEFUSES THE ORDERING TRAP.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Turning the aal2 requirement on locks out every operator who has not yet
 * enrolled — including the person who turned it on. If the enrollment screen
 * lived under app/(admin), reaching it would need aal2, and getting aal2 would
 * need the screen: a super admin with no factor would have no way in short of
 * an intervention in the Supabase dashboard.
 *
 * So these screens are HERE, in their own group, outside the operator gate
 * entirely. Any signed-in account can reach them — operator or seller, aal1 or
 * aal2, enrolled or not. That is a fact about where the files sit, which means
 * it cannot be undone by editing the gate, and it is the first thing
 * tests/browser/two-factor.py walks.
 *
 * ── AND NOT UNDER (dashboard) EITHER, WHICH WOULD HAVE BEEN THE EASY PLACE ─
 *
 * That layout resolves the caller's SHOP through getSession(), which REPAIRS a
 * missing one by writing three seller tables. An operator locked out of the
 * console would then have their enrollment screen gated behind provisioning
 * that has nothing to do with enrolling — and a super admin whose own shop row
 * was broken would be locked out of the fix by a table this flow never reads.
 * That exact failure is why getOperatorIdentity() exists (D94), and it is what
 * is used here: a user id and an address, from a module that cannot write.
 *
 * getOperatorIdentity() is not operator-specific despite its name; it answers
 * "who is signed in" for anybody. The name describes where it was needed
 * first, not who it serves.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  /*
   * Demo mode has no second factor to enrol, because it has no account to
   * enrol one against — the session is fixed and shared by everyone who can
   * reach the deployment. notFound() rather than a redirect: the feature does
   * not exist in this mode, and bouncing to /login would loop, since demo mode
   * never asks anyone to sign in.
   */
  if (!isLiveAuth()) notFound()

  const identity = await getOperatorIdentity()
  if (!identity) redirect('/login')

  return <div className="mx-auto w-full max-w-[880px] px-6">{children}</div>
}
