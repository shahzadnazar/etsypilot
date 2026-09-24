import { redirect } from 'next/navigation'
import { TwoFactorVerify } from '@/components/auth/two-factor-verify'
import { TWO_FACTOR_SETUP_PATH, twoFactorOutcome } from '@/domain/auth/two-factor'
import { getMfaPosture } from '@/lib/auth/mfa'

export const dynamic = 'force-dynamic'

/**
 * Step an enrolled session up from aal1 to aal2.
 *
 * Someone who has NOT enrolled is sent to the setup screen instead of being
 * shown a code field they cannot fill. Both redirects are one-way — there is
 * no path from here that reaches the console without a verified code, because
 * the console's own gate asks again.
 */
export default async function TwoFactorVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; next?: string }>
}) {
  const { outcome, next } = await searchParams
  const posture = await getMfaPosture()
  if (!posture.enrolled) redirect(TWO_FACTOR_SETUP_PATH)

  /*
   * Sanitised HERE as well as in the action, because this value is rendered
   * into a hidden input and a caller-supplied `next` must not be able to point
   * the button off this site. Two checks rather than one: the action's is
   * authoritative, this one keeps the markup honest.
   */
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/admin'

  return (
    <TwoFactorVerify
      outcome={twoFactorOutcome(outcome)}
      next={target}
      recoveryAvailable={posture.hasRecoveryCodes}
    />
  )
}
