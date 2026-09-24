import { AuthNotice } from '@/components/auth/auth-notice'
import { Button } from '@/components/ui/button'
import { resetOutcome } from '@/domain/auth/reset'
import { verifyResetCode } from '@/lib/auth/reset-actions'

export const dynamic = 'force-dynamic'

/*
 * Step 2 of 3: the code.
 *
 * The address is NOT a field here and NOT in the URL. It travels in the
 * short-lived httpOnly cookie the previous step set — see
 * domain/auth/reset.ts, which is careful about the difference between carrying
 * an address the person just typed and storing a reset code, which this
 * product does not do.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>
}) {
  const { outcome } = await searchParams
  const banner = resetOutcome(outcome)

  return (
    <div className="mx-auto w-full max-w-[420px] py-6">
      <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
        Enter your code
      </h1>
      <p className="mt-1.5 max-w-prose text-small leading-relaxed text-muted-1">
        Six digits, from the email we just sent.
      </p>

      {banner ? (
        <div className="mt-4">
          <AuthNotice tone={banner.tone} title={banner.title}>
            {banner.detail}
          </AuthNotice>
        </div>
      ) : null}

      <form action={verifyResetCode} className="mt-4 flex flex-col gap-3">
        <div>
          <label htmlFor="code" className="block text-label text-muted-1">
            Six-digit code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,9}"
            maxLength={9}
            required
            autoFocus
            className="mt-1 h-11 w-[180px] rounded-control border border-line bg-canvas px-3 font-mono text-[16px] tracking-[0.18em] text-ink-1"
          />
        </div>
        <div>
          <Button type="submit" variant="primary" loadingLabel="Checking...">
            Continue
          </Button>
        </div>
      </form>

      <p className="mt-4 text-small text-muted-1">
        <a href="/forgot-password" className="font-semibold text-ink-2 underline underline-offset-2">
          Send a new code
        </a>
      </p>
    </div>
  )
}
