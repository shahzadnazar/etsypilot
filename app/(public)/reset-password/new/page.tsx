import { AuthNotice } from '@/components/auth/auth-notice'
import { Button } from '@/components/ui/button'
import { MIN_PASSWORD_LENGTH, resetOutcome } from '@/domain/auth/reset'
import { completeReset } from '@/lib/auth/reset-actions'

export const dynamic = 'force-dynamic'

/*
 * Step 3 of 3: the new password.
 *
 * NO GATE ON THIS PAGE, and that is a decision rather than an omission.
 * Reaching it without a verified code shows a form whose submit button
 * refuses: completeReset() has no session to update and Supabase rejects it.
 * Gating the render as well would be a second check to keep in step with the
 * first, and the one that matters is the one at the write.
 */
export default async function NewPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>
}) {
  const { outcome } = await searchParams
  const banner = resetOutcome(outcome)

  return (
    <div className="mx-auto w-full max-w-[420px] py-6">
      <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
        Choose a new password
      </h1>
      <p className="mt-1.5 max-w-prose text-small leading-relaxed text-muted-1">
        At least {MIN_PASSWORD_LENGTH} characters. A long ordinary phrase beats a short
        complicated one.
      </p>

      {banner ? (
        <div className="mt-4">
          <AuthNotice tone={banner.tone} title={banner.title}>
            {banner.detail}
          </AuthNotice>
        </div>
      ) : null}

      <form action={completeReset} className="mt-4 flex flex-col gap-3">
        <div>
          <label htmlFor="password" className="block text-label text-muted-1">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            autoFocus
            className="mt-1 h-11 w-full rounded-control border border-line bg-canvas px-3 text-[15px] text-ink-1"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="block text-label text-muted-1">
            Confirm new password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            className="mt-1 h-11 w-full rounded-control border border-line bg-canvas px-3 text-[15px] text-ink-1"
          />
        </div>
        <div>
          <Button type="submit" variant="primary" loadingLabel="Saving...">
            Set new password
          </Button>
        </div>
      </form>

      <p className="mt-4 max-w-prose text-caption leading-relaxed text-muted-1">
        Saving this signs out every other session for your account. If someone else had your old
        password, they lose their way in at that moment.
      </p>
    </div>
  )
}
