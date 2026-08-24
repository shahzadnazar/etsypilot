/*
 * Mock billing.
 *
 * Deterministic and credential-free, so the whole billing surface — trial,
 * history, a declined charge, cancel and resume — is walkable and
 * testable with nothing configured.
 *
 * State lives in a module-level map keyed by shop. That is enough for the demo
 * and for tests, and it is explicitly NOT a store: Phase 11 wires the real
 * repository, and StripeBillingProvider never touches this file.
 */

import { DEMO_PLAN } from '@/domain/billing/plans'
import type { PlanKey } from '@/domain/billing/plans'
import { Errors } from '@/lib/errors/types'
import type {
  BillingProvider,
  DisclosedCharge,
  Invoice,
  Subscription,
  WebhookEvent,
} from './interface'

/** Fixed clock (D24). A billing screen that changes by the hour cannot be tested. */
export const BILLING_NOW = '2026-08-20'

function baseSubscription(): Subscription {
  return {
    id: 'sub_demo_willow_fern',
    plan: DEMO_PLAN,
    status: 'ACTIVE',
    currentPeriodStart: '2026-08-12',
    currentPeriodEnd: '2026-09-12',
    renewsOn: '2026-09-12',
    trialEndsOn: null,
    paymentMethod: { brand: 'Visa', last4: '4242' },
    cancelledOn: null,
  }
}

function baseInvoices(): Invoice[] {
  return [
    {
      id: 'in_2026_08',
      date: '2026-08-12',
      description: 'Solo · monthly · Aug 12 – Sep 12',
      amount: 15,
      status: 'PAID',
      receiptUrl: '/api/billing/receipt/in_2026_08',
      currency: 'USD',
    },
    {
      id: 'in_2026_07',
      date: '2026-07-12',
      description: 'Solo · monthly · Jul 12 – Aug 12',
      amount: 15,
      status: 'PAID',
      receiptUrl: '/api/billing/receipt/in_2026_07',
      currency: 'USD',
    },
    {
      /*
       * A declined charge, kept in the history on purpose. Hiding a failure and
       * showing only successes is how a seller finds out about a lapsed card
       * from a paused job instead of from their billing page.
       */
      id: 'in_2026_06',
      date: '2026-06-12',
      description: 'Solo · monthly · Jun 12 – Jul 12',
      amount: 15,
      status: 'DECLINED',
      receiptUrl: null,
      currency: 'USD',
    },
    {
      id: 'in_2026_05',
      date: '2026-05-12',
      description: 'Solo · monthly · May 12 – Jun 12',
      amount: 15,
      status: 'PAID',
      receiptUrl: '/api/billing/receipt/in_2026_05',
      currency: 'USD',
    },
  ]
}

/*
 * State on globalThis, not in module scope.
 *
 * Next builds route handlers and pages into separate server bundles, so a
 * module-level Map is a DIFFERENT Map in each. Cancelling through the route
 * then re-rendering the page read two stores and the screen looked unchanged —
 * the flow appeared broken while every unit test passed, because a test imports
 * one module instance.
 *
 * A demo store has to outlive the bundle boundary to be walkable, and this is
 * the ordinary way to do that. It stays explicitly a demo store: Phase 11's
 * repository replaces it, and StripeBillingProvider never reads it.
 */
interface MockStore {
  subscriptions: Map<string, Subscription>
  invoices: Map<string, Invoice[]>
  /** Webhook ids already handled. Replaying one must change nothing. */
  seenEvents: Set<string>
}

const STORE_KEY = Symbol.for('etsypilot.billing.mock')

function store(): MockStore {
  const g = globalThis as unknown as Record<symbol, MockStore | undefined>
  const existing = g[STORE_KEY]
  if (existing) return existing
  const fresh: MockStore = { subscriptions: new Map(), invoices: new Map(), seenEvents: new Set() }
  g[STORE_KEY] = fresh
  return fresh
}

function stateFor(shopId: string): Subscription {
  const { subscriptions } = store()
  const existing = subscriptions.get(shopId)
  if (existing) return existing
  const fresh = baseSubscription()
  subscriptions.set(shopId, fresh)
  return fresh
}

function ledgerFor(shopId: string): Invoice[] {
  const { invoices } = store()
  const existing = invoices.get(shopId)
  if (existing) return existing
  const fresh = baseInvoices()
  invoices.set(shopId, fresh)
  return fresh
}

/** Test helper. Not exported through lib/billing/index. */
export function resetMockBilling(): void {
  const s = store()
  s.subscriptions.clear()
  s.invoices.clear()
  s.seenEvents.clear()
}

/** Put the demo shop into the no-card trial state from artboard 107. */
export function mockTrialSubscription(shopId: string): Subscription {
  const trialing: Subscription = {
    id: 'sub_demo_trial',
    plan: 'GROWTH',
    status: 'TRIALING',
    currentPeriodStart: '2026-08-10',
    currentPeriodEnd: '2026-08-24',
    // No card, so nothing renews. Null rather than a date that will not happen.
    renewsOn: null,
    trialEndsOn: '2026-08-24',
    paymentMethod: null,
    cancelledOn: null,
  }
  store().subscriptions.set(shopId, trialing)
  return trialing
}

export class MockBillingProvider implements BillingProvider {
  readonly mode = 'MOCK' as const

  async getSubscription(shopId: string): Promise<Subscription> {
    return { ...stateFor(shopId) }
  }

  async listInvoices(shopId: string): Promise<Invoice[]> {
    return ledgerFor(shopId).map((i) => ({ ...i }))
  }

  async chargeDisclosed(shopId: string, charge: DisclosedCharge): Promise<Invoice> {
    const invoice: Invoice = {
      id: `in_${charge.onDate.replace(/-/g, '')}`,
      date: charge.onDate,
      description: charge.whatChanges[0] ?? 'Plan change',
      amount: charge.amountDue,
      status: 'PAID',
      receiptUrl: `/api/billing/receipt/in_${charge.onDate.replace(/-/g, '')}`,
      currency: charge.currency,
    }
    ledgerFor(shopId).unshift(invoice)
    return { ...invoice }
  }

  async cancel(shopId: string, args: { effectiveOn: string }): Promise<Subscription> {
    const current = stateFor(shopId)
    /*
     * CANCELLING, not CANCELLED. Access continues to the end of the period the
     * seller paid for, and the status says so rather than reading as if the
     * product had already been taken away.
     */
    const next: Subscription = {
      ...current,
      status: 'CANCELLING',
      cancelledOn: BILLING_NOW,
      renewsOn: null,
      currentPeriodEnd: args.effectiveOn,
    }
    store().subscriptions.set(shopId, next)
    return { ...next }
  }

  async resume(shopId: string): Promise<Subscription> {
    const current = stateFor(shopId)
    const next: Subscription = {
      ...current,
      status: current.trialEndsOn ? 'TRIALING' : 'ACTIVE',
      cancelledOn: null,
      renewsOn: current.paymentMethod ? current.currentPeriodEnd : null,
    }
    store().subscriptions.set(shopId, next)
    return { ...next }
  }

  async changePlan(shopId: string, plan: PlanKey, charge: DisclosedCharge | null): Promise<Subscription> {
    if (charge) await this.chargeDisclosed(shopId, charge)
    const next: Subscription = { ...stateFor(shopId), plan }
    store().subscriptions.set(shopId, next)
    return { ...next }
  }

  verifyWebhook(rawBody: string, signatureHeader: string | null): WebhookEvent {
    if (!signatureHeader) throw Errors.validation('Missing webhook signature.', 'The request was not signed.')
    const parsed = JSON.parse(rawBody) as { id?: string; type?: string; data?: Record<string, unknown> }
    if (!parsed.id || !parsed.type) {
      throw Errors.validation('Webhook payload is not an event.', 'Nothing was applied.')
    }
    return {
      id: parsed.id,
      type: parsed.type,
      payload: parsed.data ?? {},
      receivedAt: BILLING_NOW,
    }
  }
}

/** Idempotency, shared by both providers' handlers. */
export function alreadyHandled(eventId: string): boolean {
  return store().seenEvents.has(eventId)
}

export function markHandled(eventId: string): void {
  store().seenEvents.add(eventId)
}
