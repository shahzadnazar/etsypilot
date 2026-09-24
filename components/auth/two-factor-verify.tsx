import { AuthNotice } from '@/components/auth/auth-notice'
import { Button } from '@/components/ui/button'
import { verifyRecoveryCode, verifyStepUp } from '@/lib/auth/mfa-actions'
import { NO_OPERATOR_RESET_NOTICE, type TwoFactorOutcome } from '@/domain/auth/two-factor'

/*
 * The code screen: an enrolled account, on a session that has not used the
 * factor yet.
 *
 * ── BOTH WAYS IN ARE ON THE SAME SCREEN ──────────────────────────────────
 *
 * The recovery-code form is not behind a link. Someone reaching for it has
 * lost their phone, which is the worst possible moment to make them hunt for
 * the control — and a "lost your device?" link on a separate page is how
 * people end up emailing support for a reset that, by design, nobody can
 * perform.
 *
 * Two separate <form>s, two separate server actions. A single form with a mode
 * flag would mean one action deciding which credential it had been given, and
 * a six-digit TOTP code and a recovery code failing for different reasons need
 * to say different things.
 */
export function TwoFactorVerify({
  outcome,
  next,
  recoveryAvailable,
}: {
  outcome: TwoFactorOutcome | null
  /** Where to land afterwards. Sanitised again in the action. */
  next: string
  /** False when this project's Supabase has no recovery-code endpoint. */
  recoveryAvailable: boolean
}) {
  return (
    <div className="mx-auto w-full max-w-[460px] py-6">
      <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
        Enter your code
      </h1>
      <p className="mt-1.5 max-w-prose text-small leading-relaxed text-muted-1">
        You are signed in, but this session has not used your authenticator yet.
      </p>

      {outcome ? (
        <div className="mt-4">
          <AuthNotice tone={outcome.tone} title={outcome.title}>
            {outcome.detail}
          </AuthNotice>
        </div>
      ) : null}

      <form action={verifyStepUp} className="mt-4 rounded-card border border-line bg-surface p-4">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="code" className="block text-label text-muted-1">
          Six-digit code from your app
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
        <div className="mt-3">
          <Button type="submit" variant="primary" loadingLabel="Checking...">
            Continue
          </Button>
        </div>
      </form>

      {recoveryAvailable ? (
        <form
          action={verifyRecoveryCode}
          className="mt-4 rounded-card border border-line bg-canvas-soft p-4"
        >
          <input type="hidden" name="next" value={next} />
          <h2 className="text-[15px] font-semibold text-ink-1">Lost your phone?</h2>
          <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-2">
            Use one of the recovery codes you saved when you set this up. Each one works once.
          </p>
          <label htmlFor="recoveryCode" className="mt-3 block text-label text-muted-1">
            Recovery code
          </label>
          <input
            id="recoveryCode"
            name="recoveryCode"
            type="text"
            autoComplete="off"
            required
            className="mt-1 h-11 w-full max-w-[280px] rounded-control border border-line bg-canvas px-3 font-mono text-[14px] text-ink-1"
          />
          <div className="mt-3">
            <Button type="submit" variant="secondary" loadingLabel="Checking...">
              Use recovery code
            </Button>
          </div>
        </form>
      ) : null}

      <p className="mt-5 max-w-prose text-caption leading-relaxed text-muted-1">
        {NO_OPERATOR_RESET_NOTICE}
      </p>
    </div>
  )
}
