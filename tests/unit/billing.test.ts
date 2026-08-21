import { beforeEach, describe, expect, it } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  CANCEL_FLOW,
  SUBSCRIBE_FLOW,
  addDays,
  assertRefundable,
  classifyChange,
  daysBetween,
  downgradeEffects,
  planCancellation,
  planChange,
  refundEligibility,
  trialState,
} from '@/domain/billing/lifecycle'
import { planOf, PLANS, REFUND_WINDOW_DAYS } from '@/domain/billing/plans'
import { buildMeters, enforce, pressureWarning } from '@/domain/billing/usage'
import { HANDLED_EVENTS, billingAuditEvent, handleWebhook } from '@/domain/billing/webhooks'
import { disclose } from '@/lib/billing/interface'
import type { Invoice, Subscription } from '@/lib/billing/interface'
import {
  BILLING_NOW,
  MockBillingProvider,
  mockTrialSubscription,
  resetMockBilling,
} from '@/lib/billing/mock'
import { verifyStripeSignature } from '@/lib/billing/signature'
import { AppError } from '@/lib/errors/types'

const SHOP = 'shop_test'

const SUB: Subscription = {
  id: 'sub_1',
  plan: 'SOLO',
  status: 'ACTIVE',
  currentPeriodStart: '2026-08-01',
  currentPeriodEnd: '2026-08-31',
  renewsOn: '2026-08-31',
  trialEndsOn: null,
  paymentMethod: { brand: 'Visa', last4: '4242' },
  cancelledOn: null,
}

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'in_1',
    date: '2026-08-12',
    description: 'Solo · monthly',
    amount: 15,
    kind: 'CHARGE',
    status: 'PAID',
    receiptUrl: '/r/in_1',
    currency: 'USD',
    ...over,
  }
}

beforeEach(() => {
  resetMockBilling()
})

/* ------------------------------------------------------------ dark patterns */

describe('leaving is never harder than joining', () => {
  it('cancels in no more steps than it takes to subscribe', () => {
    expect(CANCEL_FLOW.length).toBeLessThanOrEqual(SUBSCRIBE_FLOW.length)
    // One click, as the design promises.
    expect(CANCEL_FLOW).toHaveLength(1)
  })

  it('offers resume at the same cost as cancel', async () => {
    const provider = new MockBillingProvider()
    const cancelled = await provider.cancel(SHOP, { effectiveOn: '2026-09-12' })
    expect(cancelled.status).toBe('CANCELLING')
    // Not CANCELLED: the paid period is still the seller's.
    expect(cancelled.currentPeriodEnd).toBe('2026-09-12')

    const resumed = await provider.resume(SHOP)
    expect(resumed.status).toBe('ACTIVE')
    expect(resumed.cancelledOn).toBeNull()
  })

  it('keeps the paid period and deletes nothing', () => {
    const plan = planCancellation({ subscription: SUB, invoices: [invoice()], today: BILLING_NOW })
    expect(plan.accessUntil).toBe(SUB.currentPeriodEnd)
    expect(plan.effects.join(' ')).toContain('Nothing is deleted')
    expect(plan.effects.join(' ')).toContain('moves to Free')
  })
})

describe('no charge without disclosure', () => {
  it('refuses to build a charge that does not say what changes', () => {
    expect(() =>
      disclose({
        amountDue: 29,
        currency: 'USD',
        onDate: '2026-08-20',
        whatChanges: [],
        refundWindow: { days: 14, until: '2026-09-03' },
      }),
    ).toThrow(/what changes/)
  })

  it('refuses a negative charge rather than treating it as a refund', () => {
    expect(() =>
      disclose({
        amountDue: -5,
        currency: 'USD',
        onDate: '2026-08-20',
        whatChanges: ['x'],
        refundWindow: { days: 14, until: '2026-09-03' },
      }),
    ).toThrow(/negative/)
  })

  it('states the amount, the date, the proration and the refund window on an upgrade', () => {
    const change = planChange({
      from: 'SOLO',
      to: 'GROWTH',
      subscription: SUB,
      today: '2026-08-21',
      currency: 'USD',
    })

    expect(change.kind).toBe('UPGRADE')
    expect(change.charge).not.toBeNull()
    const charge = change.charge!

    // 10 days left of a 30-day period, $14/month difference.
    expect(charge.amountDue).toBeCloseTo((14 * 10) / 30, 2)
    expect(charge.onDate).toBe('2026-08-21')
    expect(charge.whatChanges.join(' ')).toContain('10 days left')
    expect(charge.whatChanges.join(' ')).toContain('not a full month')
    expect(charge.whatChanges.join(' ')).toContain('$29 on 2026-08-31')
    expect(charge.refundWindow.days).toBe(REFUND_WINDOW_DAYS)
  })

  it('charges nothing on a downgrade and says what happens instead', () => {
    const change = planChange({
      from: 'GROWTH',
      to: 'SOLO',
      subscription: { ...SUB, plan: 'GROWTH' },
      today: '2026-08-21',
      currency: 'USD',
    })

    expect(change.kind).toBe('DOWNGRADE')
    expect(change.charge).toBeNull()
    expect(change.effectiveOn).toBe(SUB.currentPeriodEnd)
    expect(change.note).toContain('nothing is refunded')
    expect(change.note).toContain('Your data stays')
  })
})

describe('a downgrade pauses, it never deletes', () => {
  it('describes every effect as a pause with the data kept', () => {
    const effects = downgradeEffects(planOf('GROWTH'), planOf('SOLO'))
    expect(effects.length).toBeGreaterThan(0)
    const text = effects.join(' ').toLowerCase()
    // Assert the claim, not a substring that also appears in its denial:
    // "nothing is removed for you" contains "removed for you".
    expect(text).not.toMatch(/we (remove|delete)|will be (removed|deleted)|are deleted/)
    expect(text).toContain('nothing is removed for you')
    expect(text).toContain('pause')
  })

  it('says who chooses what to remove at the listing cap', () => {
    const effects = downgradeEffects(planOf('GROWTH'), planOf('SOLO'))
    expect(effects.join(' ')).toContain('you choose what to remove')
  })

  it('never claims an effect that does not apply to the pair', () => {
    /*
     * Free -> Solo is an upgrade in every dimension, so nothing pauses. This
     * caught a real defect: Free's listing limit was null, null was read as
     * "unlimited", and moving UP from Free warned that bulk jobs would pause.
     */
    expect(downgradeEffects(planOf('FREE'), planOf('SOLO'))).toEqual([])
  })
})

/* ----------------------------------------------------------------- refunds */

describe('the refund window is computed, never stated', () => {
  it('offers a refund inside the window with the days left derived from the charge', () => {
    const eligibility = refundEligibility([invoice({ date: '2026-08-12' })], '2026-08-20')
    expect(eligibility).not.toBeNull()
    expect(eligibility!.daysLeft).toBe(REFUND_WINDOW_DAYS - 8)
    expect(eligibility!.until).toBe(addDays('2026-08-12', REFUND_WINDOW_DAYS))
  })

  it('returns null outside the window rather than zero days left', () => {
    // "Not refundable" and "refundable for zero more days" are different claims.
    expect(refundEligibility([invoice({ date: '2026-07-01' })], '2026-08-20')).toBeNull()
  })

  it('ignores a declined charge — no money moved, so none returns', () => {
    expect(refundEligibility([invoice({ status: 'DECLINED' })], '2026-08-13')).toBeNull()
  })

  it('does not offer the same charge twice', () => {
    const charge = invoice({ id: 'in_9', date: '2026-08-18' })
    const refunded = invoice({ id: 'rf_in_9', kind: 'REFUND', status: 'REFUNDED', date: '2026-08-19' })
    expect(refundEligibility([charge, refunded], '2026-08-20')).toBeNull()
  })

  it('refuses a refund outside the window and says what still works', () => {
    try {
      assertRefundable([invoice({ date: '2026-07-01' })], 'in_1', '2026-08-20')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).recovery).toContain('stops the next renewal')
    }
  })

  it('actually issues the refund through the provider', async () => {
    const provider = new MockBillingProvider()
    const refund = await provider.refund(SHOP, 'in_2026_08')
    expect(refund.kind).toBe('REFUND')
    expect(refund.amount).toBe(15)

    const ledger = await provider.listInvoices(SHOP)
    expect(ledger[0]?.id).toBe('rf_in_2026_08')
  })
})

/* ------------------------------------------------------------------- trial */

describe('the trial says what happens at its end', () => {
  it('promises no charge when there is no card', () => {
    const sub = mockTrialSubscription(SHOP)
    const state = trialState(sub, '2026-08-13')
    expect(state).not.toBeNull()
    expect(state!.daysLeft).toBe(11)
    expect(state!.willCharge).toBe(false)
    expect(state!.message).toContain('Nothing is charged')
    expect(state!.message).toContain('your data stays')
  })

  it('says plainly that it WILL charge when a card is on file', () => {
    const withCard: Subscription = {
      ...mockTrialSubscription(SHOP),
      paymentMethod: { brand: 'Visa', last4: '4242' },
    }
    const state = trialState(withCard, '2026-08-13')
    expect(state!.willCharge).toBe(true)
    expect(state!.message).toContain('you will be charged')
    expect(state!.message).toContain('one click')
  })

  it('leaves renewsOn null while trialing without a card', () => {
    // A date that will not happen is worse than no date.
    expect(mockTrialSubscription(SHOP).renewsOn).toBeNull()
  })
})

/* ------------------------------------------------------------------ limits */

describe('a limit pauses work and says what continues', () => {
  const meters = buildMeters({
    plan: 'SOLO',
    activeListings: 412,
    aiGenerationsUsed: 42,
    aiResetsOn: '2026-09-01',
  })

  it('never reports only what stopped', () => {
    const decision = enforce({ plan: 'SOLO', metric: 'aiGenerations', used: 60 })
    expect(decision.allowed).toBe(false)
    expect(decision.blocked!.pauses.length).toBeGreaterThan(0)
    expect(decision.blocked!.continues.length).toBeGreaterThan(0)
    expect(decision.blocked!.continues).toContain('unaffected')
  })

  it('allows work below the limit', () => {
    const decision = enforce({ plan: 'SOLO', metric: 'aiGenerations', used: 59 })
    expect(decision.allowed).toBe(true)
    expect(decision.remaining).toBe(1)
    expect(decision.blocked).toBeNull()
  })

  it('warns only when a meter is actually close', () => {
    expect(pressureWarning(meters)).not.toBeNull() // 412 of 200 — over.
    const roomy = buildMeters({
      plan: 'GROWTH',
      activeListings: 412,
      aiGenerationsUsed: 42,
      aiResetsOn: '2026-09-01',
    })
    // A permanent "approaching your limit" strip at 20% is an advertisement.
    expect(pressureWarning(roomy)).toBeNull()
  })

  it('gives the listings meter no reset date, because it is a capacity', () => {
    expect(meters.find((m) => m.metric === 'listings')?.resetsOn).toBeNull()
    expect(meters.find((m) => m.metric === 'aiGenerations')?.resetsOn).toBe('2026-09-01')
  })
})

/* ---------------------------------------------------------------- webhooks */

describe('webhooks are verified, idempotent and allow-listed', () => {
  const secret = 'whsec_test'
  const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { status: 'paid' } })

  function sign(payload: string, timestamp: number, key = secret): string {
    const mac = createHmac('sha256', key).update(`${timestamp}.${payload}`, 'utf8').digest('hex')
    return `t=${timestamp},v1=${mac}`
  }

  it('accepts a correctly signed, fresh payload', () => {
    const now = 1_800_000_000
    const event = verifyStripeSignature({
      rawBody: body,
      signatureHeader: sign(body, now),
      signingSecret: secret,
      nowSeconds: now,
    })
    expect(event.id).toBe('evt_1')
    expect(event.type).toBe('invoice.paid')
  })

  it('rejects a signature made with the wrong secret', () => {
    const now = 1_800_000_000
    expect(() =>
      verifyStripeSignature({
        rawBody: body,
        signatureHeader: sign(body, now, 'whsec_wrong'),
        signingSecret: secret,
        nowSeconds: now,
      }),
    ).toThrow(/does not match/)
  })

  it('rejects a valid signature over a different body', () => {
    const now = 1_800_000_000
    const header = sign(body, now)
    const tampered = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.deleted', data: {} })
    expect(() =>
      verifyStripeSignature({
        rawBody: tampered,
        signatureHeader: header,
        signingSecret: secret,
        nowSeconds: now,
      }),
    ).toThrow(/does not match/)
  })

  it('rejects a replay of a genuine signature', () => {
    const signedAt = 1_800_000_000
    expect(() =>
      verifyStripeSignature({
        rawBody: body,
        signatureHeader: sign(body, signedAt),
        signingSecret: secret,
        // An hour later. The signature is still valid; the age is the defence.
        nowSeconds: signedAt + 3600,
      }),
    ).toThrow(/too old/)
  })

  it('rejects an unsigned request', () => {
    expect(() =>
      verifyStripeSignature({
        rawBody: body,
        signatureHeader: null,
        signingSecret: secret,
        nowSeconds: 1_800_000_000,
      }),
    ).toThrow(/Missing webhook signature/)
  })

  it('applies a known event once and treats the retry as a duplicate', () => {
    const event = { id: 'evt_paid_1', type: 'invoice.paid', payload: {}, receivedAt: BILLING_NOW }
    expect(handleWebhook(event, SHOP).kind).toBe('APPLIED')
    expect(handleWebhook(event, SHOP).kind).toBe('DUPLICATE')
  })

  it('acknowledges an unknown type without interpreting it', () => {
    const outcome = handleWebhook(
      { id: 'evt_odd', type: 'coupon.created', payload: { cancel: true }, receivedAt: BILLING_NOW },
      SHOP,
    )
    expect(outcome.kind).toBe('IGNORED')
    if (outcome.kind === 'IGNORED') expect(outcome.reason).toContain('applied to nothing')
  })

  it('tells the seller about a declined payment, and says nothing was cancelled', () => {
    const outcome = handleWebhook(
      { id: 'evt_failed', type: 'invoice.payment_failed', payload: {}, receivedAt: BILLING_NOW },
      SHOP,
    )
    expect(outcome.kind).toBe('APPLIED')
    if (outcome.kind !== 'APPLIED') return
    expect(outcome.notify?.severity).toBe('ACTION_NEEDED')
    expect(outcome.notify?.body).toContain('Nothing has been cancelled')
    expect(outcome.notify?.action?.href).toBe('/billing')
  })

  it('never notifies about a successful charge the seller already agreed to', () => {
    const outcome = handleWebhook(
      { id: 'evt_paid_2', type: 'invoice.paid', payload: {}, receivedAt: BILLING_NOW },
      SHOP,
    )
    expect(outcome.kind === 'APPLIED' && outcome.notify).toBeNull()
  })

  it('writes an audit line for anything it applied, with no invented actor', () => {
    const outcome = handleWebhook(
      { id: 'evt_ref', type: 'charge.refunded', payload: {}, receivedAt: BILLING_NOW },
      SHOP,
    )
    const audit = billingAuditEvent({ eventId: 'evt_ref', shopId: SHOP, outcome, now: '2026-08-20T00:00:00.000Z' })
    expect(audit).not.toBeNull()
    expect(audit!.actorId).toBeNull()
    expect(audit!.source).toBe('SYSTEM')
  })

  it('acts on exactly the five event types it lists', () => {
    expect(HANDLED_EVENTS).toHaveLength(5)
  })
})

/* -------------------------------------------------------------- arithmetic */

describe('calendar arithmetic stays calendar arithmetic', () => {
  it('counts whole days without a zone', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30)
    expect(addDays('2026-08-20', 14)).toBe('2026-09-03')
  })

  it('classifies a change by price, not by name', () => {
    expect(classifyChange('FREE', 'GROWTH')).toBe('UPGRADE')
    expect(classifyChange('GROWTH', 'FREE')).toBe('DOWNGRADE')
    expect(classifyChange('SOLO', 'SOLO')).toBe('SAME')
  })

  it('prices every plan pair without throwing', () => {
    for (const from of PLANS) {
      for (const to of PLANS) {
        const change = planChange({
          from: from.key,
          to: to.key,
          subscription: { ...SUB, plan: from.key },
          today: '2026-08-21',
          currency: 'USD',
        })
        expect(change.note.length).toBeGreaterThan(0)
        if (change.charge) expect(change.charge.amountDue).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

/* ------------------------------------------------------------ one source */

describe('one plan, read everywhere', () => {
  it('gives the AI copilot the plan’s own generation limit', async () => {
    const { getCopilotView } = await import('@/domain/ai/service')
    const { getBillingView } = await import('@/domain/billing/service')
    const ctx = { shopId: 'demo-willow-fern', actorId: 'demo-user-salman', readOnly: true }

    const [copilot, billing] = await Promise.all([getCopilotView(ctx), getBillingView(ctx)])
    if (!copilot) throw new Error('expected a view for the demo shop')
    const meter = billing.meters.find((m) => m.metric === 'aiGenerations')!

    // The copilot said 60 while billing said 500, and a seller reads both.
    expect(copilot.quota.limit).toBe(meter.limit)
    expect(copilot.quota.planName).toBe(billing.currentPlan.name)
    expect(copilot.quota.used).toBe(meter.used)
  })
})
