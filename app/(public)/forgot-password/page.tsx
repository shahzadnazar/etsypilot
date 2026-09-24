import { AuthNotice } from '@/components/auth/auth-notice'
import { Button } from '@/components/ui/button'
import { resetOutcome } from '@/domain/auth/reset'
import { requestReset } from '@/lib/auth/reset-actions'

export const dynamic = 'force-dynamic'

/*
 * Step 1 of 3: ask for a code.
 *
 * Under (public), which reads no session — a person who has forgotten their
 * password is by definition not signed in, and putting this under a layout
 * that redirects the signed-out to /login would make the reset screen require
 * the thing it exists to restore.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ outcome?: string }>
}) {
  const { outcome } = await searchParams
  const banner = resetOutcome(outcome)

  return (
    <div className="mx-auto w-full max-w-[420px] py-6">
      <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
        Reset your password
      </h1>
      <p className="mt-1.5 max-w-prose text-small leading-relaxed text-muted-1">
        Enter your email address and we will send you a six-digit code.
      </p>

      {banner ? (
        <div className="mt-4">
          <AuthNotice tone={banner.tone} title={banner.title}>
            {banner.detail}
          </AuthNotice>
        </div>
      ) : null}

      <form action={requestReset} className="mt-4 flex flex-col gap-3">
        <div>
          <label htmlFor="email" className="block text-label text-muted-1">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            className="mt-1 h-11 w-full rounded-control border border-line bg-canvas px-3 text-[15px] text-ink-1"
          />
        </div>
        <div>
          <Button type="submit" variant="primary" loadingLabel="Sending...">
            Send me a code
          </Button>
        </div>
      </form>

      {/*
        * SAID OUT LOUD, on the form itself, rather than only being true.
        *
        * The identical-answer rule is a security property the person cannot
        * see working — and its visible effect is a screen that seems unsure
        * whether it did anything. Naming the reason turns "this is vague" into
        * "this is vague on purpose", which is the difference between a form
        * that looks broken and one that looks careful.
        */}
      <p className="mt-4 max-w-prose text-caption leading-relaxed text-muted-1">
        The answer is the same whether or not that address has an account. Otherwise this form
        would be a way to find out which sellers are on EtsyPilot.
      </p>

      <p className="mt-4 text-small text-muted-1">
        <a href="/login" className="font-semibold text-ink-2 underline underline-offset-2">
          Back to sign in
        </a>
      </p>
    </div>
  )
}
