import { AuthNotice } from '@/components/auth/auth-notice'
import { RecoveryCodes } from '@/components/auth/recovery-codes'
import { Button } from '@/components/ui/button'
import { verifyEnrollment } from '@/lib/auth/mfa-actions'
import {
  NO_OPERATOR_RESET_NOTICE,
  type TwoFactorOutcome,
} from '@/domain/auth/two-factor'
import type { EnrollmentOffer } from '@/lib/auth/mfa-actions'

/*
 * Setting up an authenticator.
 *
 * A Server Component with a plain <form action={…}>. No 'use client' on the
 * form, no hydration needed to submit, and the typed code never lives in
 * client state. Same reasoning as auth-form.tsx: an enrollment screen that
 * needs a hydrated bundle to accept six digits is a screen that locks an
 * operator out on a slow connection.
 *
 * ── THE SECRET IS ON THE SCREEN AS TEXT, NEXT TO THE QR CODE ─────────────
 *
 * Not a fallback grudgingly offered behind a "can't scan?" link. A QR code is
 * unusable if the authenticator is on the same device as the browser, if the
 * camera is broken, or if the person is using a screen reader — and in every
 * one of those cases the text secret is the ONLY route through. It is the same
 * secret either way; hiding it buys nothing.
 *
 * ── THE TYPED CODE IS NOT A FORMALITY ────────────────────────────────────
 *
 * Enrollment is not finished until a code this server accepts comes back.
 * Without that step someone can complete setup having scanned into an app on a
 * phone whose clock is wrong, and they find out at the moment they are locked
 * out rather than at the moment they can still fix it.
 */
export function TwoFactorSetup({
  offer,
  outcome,
  codes,
  required,
  alreadyEnrolled,
}: {
  /** Null when Supabase could not be reached; the screen says so. */
  offer: EnrollmentOffer | null
  outcome: TwoFactorOutcome | null
  /** Shown exactly once, straight after a successful enrollment. */
  codes: readonly string[]
  /** This account is an operator, so this is not optional. */
  required: boolean
  alreadyEnrolled: boolean
}) {
  return (
    <div className="mx-auto w-full max-w-[560px] py-6">
      <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink-1">
        Two-factor authentication
      </h1>
      <p className="mt-1.5 max-w-prose text-small leading-relaxed text-muted-1">
        An app on your phone generates a six-digit code that changes every 30 seconds. Signing in
        needs your password and that code, so a stolen password on its own is not enough.
      </p>

      {outcome ? (
        <div className="mt-4">
          <AuthNotice tone={outcome.tone} title={outcome.title}>
            {outcome.detail}
          </AuthNotice>
        </div>
      ) : null}

      {codes.length > 0 ? (
        <div className="mt-4">
          <RecoveryCodes codes={codes} />
          <div className="mt-4">
            {/*
              * Where "continue" goes depends on who enrolled. An operator was
              * sent here from the console and wants to get back to it; a
              * seller came from their own settings and would land on a 404.
              */}
            <a
              href={required ? '/admin' : '/settings/security'}
              className="inline-flex h-11 items-center justify-center rounded-control bg-brand px-3.5 text-[12.5px] font-semibold text-brand-on"
            >
              I have saved them — continue
            </a>
          </div>
        </div>
      ) : alreadyEnrolled ? (
        /*
         * Already enrolled and landing here anyway — usually by typing the URL,
         * or by following a stale redirect. Showing a fresh QR code would
         * invite a second enrollment that replaces a working one, so the screen
         * says what the state is and offers the only thing that is useful from
         * here.
         */
        <div className="mt-4 rounded-card border border-line bg-canvas-soft p-4">
          <h2 className="text-[15px] font-semibold text-ink-1">
            This account already has an authenticator
          </h2>
          <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-2">
            Nothing to set up. If this session has not used it yet, enter a code to continue.
          </p>
          <a
            href={required ? '/two-factor/verify' : '/two-factor/verify?next=/dashboard'}
            className="mt-3 inline-flex h-11 items-center justify-center rounded-control bg-brand px-3.5 text-[12.5px] font-semibold text-brand-on"
          >
            Enter a code
          </a>
        </div>
      ) : offer ? (
        <form action={verifyEnrollment} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="factorId" value={offer.factorId} />

          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-ink-1">1. Add it to your app</h2>
            <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-2">
              Scan this with Google Authenticator, 1Password, Authy, or any app that does TOTP.
            </p>

            <div className="mt-3 flex flex-wrap items-start gap-5">
              {offer.qrCode ? (
                <img
                  src={offer.qrCode}
                  /*
                   * The alt text does not describe the picture, because a
                   * description of a QR code helps nobody. It points at the
                   * thing that IS usable without sight: the text secret below.
                   */
                  alt="QR code for enrolling your authenticator app. If you cannot scan it, use the setup key below."
                  width={176}
                  height={176}
                  className="rounded-card border border-line bg-white p-2"
                />
              ) : null}

              <div className="min-w-[220px] flex-1">
                <p className="text-label text-muted-1">Or enter this setup key by hand</p>
                <p
                  className="mt-1 select-all break-all font-mono text-[13px] leading-relaxed text-ink-1"
                  data-totp-secret
                >
                  {offer.secret}
                </p>
                <p className="mt-2 text-caption leading-relaxed text-muted-1">
                  Same secret as the QR code. Use whichever suits the app you have.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="text-[15px] font-semibold text-ink-1">2. Prove it is working</h2>
            <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-2">
              Type the six digits your app is showing now. Nothing is switched on until this
              matches — so you cannot finish setup with an app that is not actually producing the
              right codes.
            </p>
            <label htmlFor="code" className="mt-3 block text-label text-muted-1">
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
              Turn on two-factor authentication
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <AuthNotice tone="danger" title="We could not start enrollment">
            The authentication service did not answer. Nothing was changed — reload the page and
            try again.
          </AuthNotice>
        </div>
      )}

      <div className="mt-6 rounded-card border border-line p-4">
        <h2 className="text-[15px] font-semibold text-ink-1">If you lose your phone</h2>
        <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-2">
          {NO_OPERATOR_RESET_NOTICE}
        </p>
        {required ? (
          <p className="mt-2 max-w-prose text-small leading-relaxed text-ink-2">
            Operator accounts cannot turn this off. That is the same rule read from the other side:
            a switch that removed your second factor would be a switch anyone who took your session
            could use.
          </p>
        ) : null}
      </div>
    </div>
  )
}
