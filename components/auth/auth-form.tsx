import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AUTH_OUTCOMES, type AuthOutcomeKey, type Tone } from '@/domain/auth/outcomes'

/*
 * The sign-in / sign-up form.
 *
 * One component for both, because they differ in four strings and a server
 * action. Two near-identical files would drift, and the thing that would drift
 * first is the security-relevant part — autocomplete hints, the minimum length,
 * whether the outcome banner renders at all.
 *
 * A Server Component with a plain <form action={...}>: no 'use client', no
 * hydration needed to submit, and no client state holding a password. It works
 * with JavaScript disabled, which for a sign-in screen is the difference
 * between a slow connection being slow and being locked out.
 *
 * Every colour is a token (D1). The banner's three tones map onto the same
 * --success / --warning / --danger surfaces the rest of the product uses.
 */

const TONE_STYLE: Record<Tone, { background: string; borderColor: string; color: string }> = {
  info: {
    background: 'var(--canvas-soft)',
    borderColor: 'var(--border)',
    color: 'var(--ink-2)',
  },
  warn: {
    background: 'var(--warning-surface)',
    borderColor: 'var(--warning-border)',
    color: 'var(--warning-ink)',
  },
  danger: {
    background: 'var(--danger-surface)',
    borderColor: 'var(--danger-border)',
    color: 'var(--danger-ink)',
  },
}

export function AuthForm({
  mode,
  action,
  outcome,
}: {
  mode: 'signin' | 'signup'
  action: (form: FormData) => Promise<void>
  outcome: AuthOutcomeKey | null
}) {
  const isSignUp = mode === 'signup'
  const banner = outcome ? AUTH_OUTCOMES[outcome] : null
  /*
   * A finished sign-up REPLACES the form; it does not sit above it.
   *
   * Observed: "Check your email" rendered over a still-populated form with its
   * Create account button intact, so a successful sign-up read as a failed one
   * — the screen was simultaneously saying "done" and "try again". An outcome
   * that ends the flow has to end the screen too.
   *
   * Only check_email. Every other outcome is something to correct and retry, so
   * those keep the form, with the message above it.
   */
  const isTerminal = outcome === 'check_email'

  return (
    <div className="mx-auto w-full max-w-[420px] py-6">
      <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
        {isSignUp ? 'Create your EtsyPilot account' : 'Sign in to EtsyPilot'}
      </h1>
      <p className="mt-1.5 max-w-prose text-small leading-relaxed text-muted-1">
        {isSignUp
          ? 'An email address and a password. We never ask for your Etsy password — connecting a shop happens later, on Etsy, and you can revoke it any time.'
          : 'EtsyPilot never asks for your Etsy password. Your shop is connected through Etsy itself.'}
      </p>

      {banner ? (
        /*
         * role="status" rather than "alert" for the informational tone: a
         * screen reader should announce "check your email" politely, not
         * interrupt with it. A wrong password is assertive and does interrupt.
         */
        <div
          role={banner.tone === 'info' ? 'status' : 'alert'}
          className="mt-4 flex flex-col gap-1 rounded-card border p-3.5"
          style={TONE_STYLE[banner.tone]}
        >
          <strong className="text-small font-semibold">{banner.title}</strong>
          <span className="text-small leading-relaxed">{banner.detail}</span>
        </div>
      ) : null}

      {isTerminal ? null : (
      <Card className="mt-4 p-[18px]">
        <form action={action} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-2">Email</span>
            <span className="flex items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                // Browsers volunteer this; the field is the seller's own
                // address, so there is nothing gained by suppressing it.
                className="h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
              />
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-2">Password</span>
            <span className="flex items-center rounded-control border border-line bg-surface px-2.5 focus-within:border-brand">
              <input
                name="password"
                type="password"
                required
                /*
                 * The correct hint for each screen. "new-password" tells a
                 * password manager to OFFER a generated one; "current-password"
                 * tells it to fill the saved one. Getting these the wrong way
                 * round is why some sign-in forms fight the manager.
                 */
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={isSignUp ? 8 : undefined}
                className="h-11 w-full bg-transparent text-body text-ink-1 outline-none md:h-[38px]"
              />
            </span>
            {isSignUp ? (
              <span className="text-caption text-muted-1">
                At least 8 characters. A long ordinary phrase beats a short complicated one.
              </span>
            ) : null}
          </label>

          <Button type="submit" variant="primary" className="mt-0.5 w-full">
            {isSignUp ? 'Create account' : 'Sign in'}
          </Button>
        </form>
      </Card>
      )}

      <p className="mt-3.5 text-small text-ink-2">
        {isTerminal
          ? 'Once your email is confirmed, '
          : isSignUp
            ? 'Already have an account? '
            : 'No account yet? '}
        <Link
          href={isTerminal || isSignUp ? '/login' : '/signup'}
          className="font-semibold text-brand-strong underline underline-offset-2"
        >
          {isTerminal ? 'sign in here' : isSignUp ? 'Sign in' : 'Create one'}
        </Link>
      </p>

      <p className="mt-2 max-w-prose text-caption leading-relaxed text-muted-1">
        Exploring first is free — the{' '}
        <Link
          href="/tools/etsy-seller-calculator"
          className="font-semibold text-brand-strong underline underline-offset-2"
        >
          fee calculator
        </Link>{' '}
        needs no account at all.
      </p>
    </div>
  )
}
