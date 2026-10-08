import 'server-only'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE TRIAL TAKES A CARD, SO IT MAY NOT START UNTIL IT CAN KEEP ITS
 *   PROMISE.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The trial terms say, in the owner's words and on the pricing page:
 *
 *     "7-day free trial. Full access. We'll email you before it ends."
 *
 * "We'll email you before it ends" is a promise, and this repository cannot
 * keep it. There is no SMTP provider, no sender, no mail module and no
 * template — grep for `nodemailer`, `resend`, `postmark`, `sendgrid` or
 * `EMAIL_FROM` and the result is this file. A trial that takes a card on day
 * zero and charges it on day seven without the warning it promised is the
 * single behaviour that fills competitors' review pages, usually phrased
 * "automatically charged full price without any notification".
 *
 * ── WHY THE CHECK IS HERE AND NOT IN THE UI OR THE WEBHOOK ────────────────
 *
 * The promise is made at the moment the card is taken, so the check has to
 * gate the taking of the card — the first instruction of the flow, before a
 * provider is contacted and before a seller enters a number.
 *
 *   NOT IN THE UI. A disabled button is a decision one API call goes around,
 *   and the trial will eventually be startable from a provider's hosted
 *   checkout that never renders our markup.
 *
 *   NOT IN THE WEBHOOK. By then the card is on file and the subscription
 *   exists. A refusal there is a refund conversation, not a gate.
 *
 *   NOT A CONFIG VALIDATOR AT BOOT. The rest of the product must keep working
 *   without a mail sender; only this one flow depends on it. Refusing to boot
 *   would be a bigger claim than the facts support.
 *
 * It is modelled on the Etsy adapter, which refuses when ETSY_API_KEY is
 * absent rather than quietly serving demo data: one named check, failing
 * loudly, naming the configuration that is missing.
 *
 * ── THE REFUND SEAM, DELIBERATELY LEFT OPEN ───────────────────────────────
 *
 * Whatever provider is chosen is likely to be a merchant of record — Paddle,
 * Lemon Squeezy — whose own refund policy overrides the seller's and whose
 * support desk, not ours, answers the request. So there is NO refund logic in
 * this file and none anywhere else, and `CANCELLATION_TERMS` in ./plans.ts
 * states the policy without claiming to execute it.
 *
 * When a provider lands, the seam is `BillingProvider` in lib/billing: a
 * `refund()` method on that interface, implemented by the adapter, is where
 * the merchant of record's rules get to be authoritative. Nothing above it
 * should ever decide whether a refund is owed.
 */

import { Errors } from '@/lib/errors/types'

/**
 * The environment variables a transactional sender needs, whichever it is.
 *
 * Both, not either. An API key with no From address cannot address a message,
 * and a From address with no key cannot send one — so "partly configured" is
 * the state most likely to be mistaken for ready, and it fails here.
 */
export const EMAIL_SENDER_VARS = ['EMAIL_PROVIDER_API_KEY', 'EMAIL_FROM'] as const

/** Which of them are missing. Empty means a sender is configured. */
export function missingEmailSenderConfig(): string[] {
  return EMAIL_SENDER_VARS.filter((name) => !(process.env[name] ?? '').trim())
}

/** Can this deployment send the email the trial promises? */
export function emailSenderConfigured(): boolean {
  return missingEmailSenderConfig().length === 0
}

/**
 * The one gate on starting a card-required trial.
 *
 * Throws with the names of the absent variables, because the person who hits
 * this is a developer and the useful message is the one that says what to set.
 */
export function assertTrialCanStart(): void {
  const missing = missingEmailSenderConfig()
  if (missing.length === 0) return

  throw Errors.trialNotConfigured(missing)
}

export interface TrialStart {
  startedAt: string
  endsAt: string
  /** When the warning the terms promise must go out. */
  warnAt: string
}

/**
 * Begin a card-required trial.
 *
 * The entry point, so that "the trial flow" is a thing with a name that can be
 * tested rather than a sequence somebody assembles at a call site. It does not
 * take a card yet — no provider is wired up — and it refuses before it would,
 * which is the whole point: the refusal has to be the first instruction, not a
 * step somebody adds once the provider arrives.
 */
export function startTrial(now: Date = new Date()): TrialStart {
  assertTrialCanStart()

  const day = 86_400_000
  const endsAt = new Date(now.getTime() + TRIAL_DAYS * day)
  return {
    startedAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    /*
     * Two days before the charge, not two hours. "We'll email you before it
     * ends" is only kept if there is time to act on it — a warning that lands
     * the morning of the charge is a receipt.
     */
    warnAt: new Date(endsAt.getTime() - 2 * day).toISOString(),
  }
}

export const TRIAL_DAYS = 7
