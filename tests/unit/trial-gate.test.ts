import { afterEach, describe, expect, it } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { posixJoin } from '../support/paths'
import { code } from '../support/shop-scoping'
import {
  EMAIL_SENDER_VARS,
  assertTrialCanStart,
  emailSenderConfigured,
  missingEmailSenderConfig,
  startTrial,
} from '@/domain/billing/trial'
import { TRIAL_TERMS } from '@/domain/billing/plans'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   A TRIAL THAT TAKES A CARD MAY NOT START UNTIL IT CAN WARN BEFORE IT
 *   CHARGES.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The owner's terms, verbatim on the pricing page: "7-day free trial. Full
 * access. We'll email you before it ends."
 *
 * This repository has no SMTP provider, no sender and no mail module, so that
 * sentence is a promise it cannot keep. A trial that takes a card on day zero
 * and charges it on day seven with no warning is the behaviour that fills
 * competitors' review pages. The gate exists so the flow cannot ship ahead of
 * the thing that makes it honest, and this file exists so the gate cannot be
 * removed by accident.
 */

const ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ENV }
})

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = posixJoin(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('the trial refuses to start without a configured sender', () => {
  it('names what is missing, because a developer is the one who hits it', () => {
    for (const name of EMAIL_SENDER_VARS) delete process.env[name]

    expect(emailSenderConfigured()).toBe(false)
    expect(missingEmailSenderConfig()).toEqual([...EMAIL_SENDER_VARS])

    try {
      assertTrialCanStart()
      throw new Error('the trial started with no email sender')
    } catch (error) {
      const app = error as { code?: string; context?: { missing?: string[] } }
      expect(app.code).toBe('TRIAL_SENDER_NOT_CONFIGURED')
      expect(app.context?.missing).toEqual([...EMAIL_SENDER_VARS])
    }
  })

  it('and refuses on the first instruction, before anything else runs', () => {
    /*
     * `startTrial` must not compute dates, contact a provider or touch a card
     * and THEN refuse. The assertion is the first statement in the function,
     * asserted on the source because the observable behaviour of "threw
     * early" and "threw late" is identical from outside.
     */
    const source = code('domain/billing/trial.ts')
    const body = source.slice(source.indexOf('export function startTrial'))
    const assertAt = body.indexOf('assertTrialCanStart()')
    const firstOther = body.indexOf('const day =')
    expect(assertAt, 'startTrial does not call the gate').toBeGreaterThan(-1)
    expect(assertAt, 'the gate is not the first thing startTrial does').toBeLessThan(firstOther)
  })

  it('refuses a half-configured sender, which is the state most likely to be missed', () => {
    for (const name of EMAIL_SENDER_VARS) delete process.env[name]
    process.env.EMAIL_FROM = 'hello@etsypilot.app'

    // An address with no key cannot send; a key with no address cannot address.
    expect(emailSenderConfigured()).toBe(false)
    expect(missingEmailSenderConfig()).toEqual(['EMAIL_PROVIDER_API_KEY'])
    expect(() => assertTrialCanStart()).toThrow()
  })

  it('and starts once a sender is configured', () => {
    /*
     * THE POSITIVE CONTROL. Without it, every assertion above is satisfied by
     * a trial flow that refuses unconditionally — which would pass the guard
     * and ship a product nobody can subscribe to.
     */
    process.env.EMAIL_PROVIDER_API_KEY = 'test-key'
    process.env.EMAIL_FROM = 'hello@etsypilot.app'

    expect(emailSenderConfigured()).toBe(true)
    const trial = startTrial(new Date('2026-10-08T00:00:00.000Z'))
    expect(trial.endsAt).toBe('2026-10-15T00:00:00.000Z')
    // The warning goes out with time to act on it, not on the morning of the charge.
    expect(trial.warnAt).toBe('2026-10-13T00:00:00.000Z')
    expect(Date.parse(trial.warnAt)).toBeLessThan(Date.parse(trial.endsAt))
  })
})

describe('nothing else can start a trial around the gate', () => {
  it('is the only producer of a trial start', () => {
    /*
     * The gate is worth nothing if a second code path begins a trial. There is
     * exactly one entry point, and anything that wants to start one has to go
     * through the file that refuses.
     */
    const offenders = [...walk('domain'), ...walk('app'), ...walk('lib')]
      .filter((f) => f !== 'domain/billing/trial.ts')
      /*
       * Calls and writes, not mentions. The operator console READS
       * `trialEndsAt` off a subscription row to show how many days are left on
       * accounts that are already trialling — that is a report, and an earlier
       * version of this sweep flagged all four of its files. What must not
       * exist is a second place that BEGINS one.
       */
      .filter((f) => /\b(startTrial|beginTrial)\s*\(|trialEndsAt\s*:\s*(new Date|Date\.)/.test(code(f)))
      .filter((f) => !code(f).includes("from '@/domain/billing/trial'"))

    expect(offenders, 'something starts a trial without the gate').toEqual([])
  })

  it('and the terms the page prints are the terms the code holds', () => {
    /*
     * The pricing copy and the flow must not drift. If somebody shortens the
     * trial in plans.ts, the page says the new number because it reads it.
     */
    expect(TRIAL_TERMS.days).toBe(7)
    expect(TRIAL_TERMS.cardRequired).toBe(true)
    expect(TRIAL_TERMS.terms).toContain("We'll email you before it ends")
    expect(TRIAL_TERMS.terms).toContain('No refunds on partial periods')
  })

  it('and no refund logic has been written, because the provider will own it', () => {
    /*
     * A merchant of record — Paddle, Lemon Squeezy — has its own refund policy
     * that overrides the seller's, and its own support desk answers the
     * request. Deciding above the provider that a refund is owed would be a
     * claim this product cannot honour. The seam is a `refund()` on
     * BillingProvider when one is needed; until then there is nothing.
     */
    const deciders = [...walk('domain'), ...walk('app')].filter((f) =>
      /\brefund(Amount|Owed|Policy|Eligib)/i.test(code(f)),
    )
    expect(deciders, 'something above the provider decides a refund').toEqual([])
  })
})
