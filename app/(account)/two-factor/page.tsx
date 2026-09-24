import { TwoFactorSetup } from '@/components/auth/two-factor-setup'
import { getAdminAccess } from '@/domain/admin/access'
import { requiresTwoFactor, twoFactorOutcome } from '@/domain/auth/two-factor'
import { beginEnrollment } from '@/lib/auth/mfa-actions'
import { getMfaPosture } from '@/lib/auth/mfa'

/*
 * Set up an authenticator.
 *
 * Dynamic because it renders from the session and from a query parameter.
 * Prerendered, the first visitor's TOTP secret would be baked in and served to
 * everyone after them — which is the worst possible thing to cache.
 */
export const dynamic = 'force-dynamic'

/*
 * NO `metadata` EXPORT, AND THAT IS DELIBERATE rather than an omission. Next
 * resolves metadata in parallel with the page and emits it whether or not the
 * page renders, so a title here would appear in responses this screen never
 * produced. The operator console settled the same question the same way — see
 * components/admin/operator-title.tsx.
 */
export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string; codes?: string }>
}) {
  const { outcome, codes } = await searchParams
  const [posture, access] = await Promise.all([getMfaPosture(), getAdminAccess()])

  /*
   * The codes arrive in the query string, once, from verifyEnrollment(). They
   * are split here rather than passed around as a string so the component
   * cannot accidentally render "a b c" as one code.
   */
  const recoveryCodes = codes ? codes.split(' ').filter(Boolean) : []

  /*
   * Enrollment is begun ONLY when there is enrollment to begin. Calling it
   * unconditionally would mint a fresh unverified factor every time this page
   * loaded — including on the render that shows someone their recovery codes,
   * which would leave a stub behind on the way out.
   */
  const needsOffer = !posture.enrolled && recoveryCodes.length === 0
  const offer = needsOffer ? await beginEnrollment() : null

  return (
    <TwoFactorSetup
      offer={offer}
      outcome={twoFactorOutcome(outcome)}
      codes={recoveryCodes}
      required={access !== null && requiresTwoFactor(access.role)}
      alreadyEnrolled={posture.enrolled && recoveryCodes.length === 0}
    />
  )
}
