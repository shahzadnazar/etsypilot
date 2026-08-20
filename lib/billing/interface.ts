/*
 * The billing provider seam.
 *
 * Same shape as the Etsy adapter: one interface, a mock that runs with no
 * credentials, and a Stripe implementation selected by env. Nothing above this
 * file knows which is running.
 *
 * Two absences are deliberate and load-bearing:
 *
 *   1. There is no `charge()` that takes an amount. The only charging method
 *      takes a DisclosedCharge — a branded type produced solely by disclosing
 *      the exact figure, the exact date and what changes, to the seller. A
 *      surprise charge is therefore not a policy this product follows; it is a
 *      call that does not compile.
 *
 *   2. There is no `deleteShopData()` and no delete of any kind on a plan
 *      change. Downgrading keeps your data. A function that could remove it
 *      would make that promise a convention rather than a fact.
 *
 * Secrets never leave the server. The Stripe implementation reads its key from
 * process.env at call time and this interface has no field that could carry one
 * into a view model or a response body.
 */

import type { PlanKey } from '@/domain/billing/plans'

export type SubscriptionStatus =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELLED'
  /** Cancelled but still inside the period the seller paid for. */
  | 'CANCELLING'

export interface Subscription {
  id: string
  plan: PlanKey
  status: SubscriptionStatus
  /** Calendar date, YYYY-MM-DD. Never zoned (D24). */
  currentPeriodStart: string
  currentPeriodEnd: string
  /** Null while trialing without a card — the honest state, not a fake date. */
  renewsOn: string | null
  trialEndsOn: string | null
  /** Last four and brand only. Never a token, never a PAN. */
  paymentMethod: { brand: string; last4: string } | null
  cancelledOn: string | null
}

export type InvoiceStatus = 'PAID' | 'REFUNDED' | 'DECLINED' | 'OPEN'

export interface Invoice {
  id: string
  date: string
  description: string
  /** Always positive. `kind` says which direction it went. */
  amount: number
  kind: 'CHARGE' | 'REFUND'
  status: InvoiceStatus
  /** Null where no receipt exists — a declined charge has none. */
  receiptUrl: string | null
  currency: string
}

/**
 * A charge that has been shown to the seller before it happens.
 *
 * The brand is the point: `chargeDisclosed()` is the only method that moves
 * money, and this is the only type it accepts. `disclose()` is the only
 * producer, and it cannot be called without the three things the seller has to
 * see first.
 */
declare const disclosed: unique symbol

export interface ChargeDisclosure {
  amountDue: number
  currency: string
  /** The date it will be taken. Not "soon", not "at renewal". */
  onDate: string
  /** Plain-language account of what changes, shown verbatim. */
  whatChanges: string[]
  /** What the seller gets back if they change their mind, and by when. */
  refundWindow: { days: number; until: string }
}

export type DisclosedCharge = ChargeDisclosure & { readonly [disclosed]: true }

export function disclose(args: ChargeDisclosure): DisclosedCharge {
  if (args.amountDue < 0) throw new Error('A charge cannot be negative. Refunds go through refund().')
  if (args.whatChanges.length === 0) {
    throw new Error('A charge must state what changes. An unexplained charge is not disclosed.')
  }
  return args as DisclosedCharge
}

export interface WebhookEvent {
  id: string
  type: string
  /** Already verified by the provider before this is returned. */
  payload: Record<string, unknown>
  receivedAt: string
}

export interface BillingProvider {
  readonly mode: 'MOCK' | 'STRIPE'

  getSubscription(shopId: string): Promise<Subscription>
  listInvoices(shopId: string): Promise<Invoice[]>

  /** Moves money. Accepts only a charge the seller has already been shown. */
  chargeDisclosed(shopId: string, charge: DisclosedCharge): Promise<Invoice>

  /** Self-serve, from the billing page. No email, no retention call. */
  cancel(shopId: string, args: { effectiveOn: string }): Promise<Subscription>
  /** Undo a cancellation before the period ends. Symmetry with cancel(). */
  resume(shopId: string): Promise<Subscription>

  changePlan(shopId: string, plan: PlanKey, charge: DisclosedCharge | null): Promise<Subscription>

  /** Self-serve within the refund window. Returns the refund invoice line. */
  refund(shopId: string, invoiceId: string): Promise<Invoice>

  /**
   * Verify a webhook signature and parse the event.
   *
   * Takes the raw body, because a parsed body cannot be verified — the
   * signature covers the exact bytes Stripe sent.
   */
  verifyWebhook(rawBody: string, signatureHeader: string | null): WebhookEvent
}
