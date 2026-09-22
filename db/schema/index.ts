/*
 * EtsyPilot database schema.
 *
 * Two invariants hold across this file:
 *
 *   1. `events` is append-only. Rollback writes a NEW event; it never edits
 *      history.
 *   2. Every table carries shopId, and everything a person can cause carries
 *      actorId (D20). Multi-user is out of MVP, but the seams are here from day
 *      one so it stays additive at no cost.
 */

import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const money = (name: string) => numeric(name, { precision: 12, scale: 2 })
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

/* ---------------------------------------------------------------- Identity */

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  /** Their full name, as entered at sign-up or on Settings → Profile. */
  name: text('name'),
  /**
   * The shorter name beside every action in the audit log.
   *
   * A second column rather than a derivation. Profile edits full name and
   * display name as separate fields, and the audit log reads THIS one — so
   * collapsing them would silently remove a capability the screen offers, and
   * deriving "first word of full name" would overwrite whatever a seller chose
   * the next time they corrected a typo in the other field.
   *
   * Nullable, because every row that exists predates it.
   */
  displayName: text('display_name'),
  /**
   * PLATFORM role — who may operate EtsyPilot itself. NOT a shop role.
   *
   * `memberships.role` is the other axis entirely: who may touch one seller's
   * listings. D20 parked that matrix deliberately, and the two must never be
   * conflated — a seller who is OWNER of their own shop gains nothing here, and
   * a MANAGER of the platform is not thereby a member of anyone's shop.
   *
   * ONLY 'MANAGER' and 'USER' are meaningful in this column. SUPER_ADMIN and
   * ADMIN come from environment variables and are never read from the database,
   * so a database compromise cannot mint one — see domain/admin/roles.ts. A row
   * that somehow contains 'SUPER_ADMIN' is treated as USER.
   */
  platformRole: text('platform_role').notNull().default('USER'),
  /** Role selected during onboarding: handmade / pod / digital / consultant. */
  sellerType: text('seller_type'),
  primaryGoal: text('primary_goal'),
  onboardingState: text('onboarding_state').notNull().default('NOT_STARTED'),
  createdAt: createdAt(),
})

export const shops = pgTable('shops', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').references(() => users.id),
  etsyShopId: text('etsy_shop_id'),
  name: text('name').notNull(),
  currency: text('currency').notNull().default('USD'),
  timezone: text('timezone').notNull().default('America/New_York'),
  connectionStatus: text('connection_status').notNull().default('DEMO'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  /** True for the Willow & Fern dataset. Drives the D11 provenance override. */
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: createdAt(),
})

/**
 * D20: single-owner membership. Needed regardless of multi-user, and the role
 * column means adding the four-role matrix later is data, not migration.
 */
export const memberships = pgTable(
  'memberships',
  {
    userId: text('user_id').notNull().references(() => users.id),
    shopId: text('shop_id').notNull().references(() => shops.id),
    role: text('role').notNull().default('OWNER'),
    createdAt: createdAt(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.shopId] }) }),
)

/**
 * Etsy tokens live server-side only. This table is never selected into a
 * client component; `tokenRef` is a reference into the secret store, never the
 * token itself.
 */
export const etsyConnections = pgTable('etsy_connections', {
  shopId: text('shop_id').primaryKey().references(() => shops.id),
  scopes: jsonb('scopes').$type<string[]>().notNull().default([]),
  tokenRef: text('token_ref'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
})

/* ---------------------------------------------------------------- Catalogue */

export const listings = pgTable(
  'listings',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull().references(() => shops.id),
    etsyListingId: text('etsy_listing_id').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    price: money('price').notNull(),
    quantity: integer('quantity').notNull().default(0),
    state: text('state').notNull().default('ACTIVE'),
    section: text('section'),
    sku: text('sku'),
    attributes: jsonb('attributes').$type<Record<string, string | null>>().notNull().default({}),
    requiredAttributes: jsonb('required_attributes').$type<string[]>().notNull().default([]),
    photoCount: integer('photo_count').notNull().default(0),
    renewsAt: timestamp('renews_at', { withTimezone: true }),
    lastChangedAt: timestamp('last_changed_at', { withTimezone: true }),
  },
  (t) => ({
    byShop: index('listings_shop_idx').on(t.shopId),
    uniqueEtsyId: uniqueIndex('listings_shop_etsy_idx').on(t.shopId, t.etsyListingId),
  }),
)

export const listingVariations = pgTable('listing_variations', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  listingId: text('listing_id').notNull().references(() => listings.id),
  name: text('name').notNull(),
  price: money('price'),
  quantity: integer('quantity'),
  sku: text('sku'),
})

/* ------------------------------------------------------------------- Money */

export const orders = pgTable(
  'orders',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull().references(() => shops.id),
    etsyReceiptId: text('etsy_receipt_id').notNull(),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull(),
    gross: money('gross').notNull(),
    discounts: money('discounts').notNull().default('0'),
    refunds: money('refunds').notNull().default('0'),
    /* Verified fee lines, straight from the receipt. */
    etsyFees: money('etsy_fees').notNull().default('0'),
    paymentProcessing: money('payment_processing').notNull().default('0'),
    offsiteAds: money('offsite_ads').notNull().default('0'),
    /** Aggregated only. Never an individual buyer. */
    countryCode: text('country_code'),
  },
  (t) => ({
    byShopDate: index('orders_shop_placed_idx').on(t.shopId, t.placedAt),
  }),
)

export const orderItems = pgTable('order_items', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  orderId: text('order_id').notNull().references(() => orders.id),
  listingId: text('listing_id').references(() => listings.id),
  quantity: integer('quantity').notNull(),
  unitPrice: money('unit_price').notNull(),
  /** Cost at time of sale. Null means this order has no confirmed cost and is
   *  EXCLUDED from profit rather than given an assumed one. */
  costSnapshot: money('cost_snapshot'),
})

export const costRules = pgTable('cost_rules', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  actorId: text('actor_id').references(() => users.id),
  /** DEFAULT | LISTING | VARIATION */
  scope: text('scope').notNull(),
  listingId: text('listing_id').references(() => listings.id),
  variationId: text('variation_id').references(() => listingVariations.id),
  /** PERCENT | FIXED */
  valueType: text('value_type').notNull(),
  value: numeric('value', { precision: 12, scale: 4 }).notNull(),
  /** COGS | SHIPPING | LABOUR | OTHER */
  costKind: text('cost_kind').notNull().default('COGS'),
  createdAt: createdAt(),
})

/* ------------------------------------------------------------- Event store */

/**
 * Append-only. There is no update path to this table anywhere in the codebase.
 */
export const events = pgTable(
  'events',
  {
    eventId: text('event_id').primaryKey(),
    shopId: text('shop_id').notNull().references(() => shops.id),
    listingId: text('listing_id').references(() => listings.id),
    actorId: text('actor_id').references(() => users.id),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    type: text('type').notNull(),
    source: text('source').notNull(),
    field: text('field'),
    beforeValue: text('before_value'),
    afterValue: text('after_value'),
    operationId: text('operation_id'),
    reason: text('reason'),
  },
  (t) => ({
    byShopTime: index('events_shop_time_idx').on(t.shopId, t.timestamp),
    byListing: index('events_listing_idx').on(t.listingId),
    byOperation: index('events_operation_idx').on(t.operationId),
  }),
)

/* ------------------------------------------------------------ Bulk editing */

export const bulkOperations = pgTable(
  'bulk_operations',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull().references(() => shops.id),
    actorId: text('actor_id').references(() => users.id),
    /** DRAFT | VALIDATING | READY | APPLYING | PARTIAL_SUCCESS | COMPLETED |
     *  FAILED | ROLLBACK_AVAILABLE | ROLLED_BACK */
    state: text('state').notNull().default('DRAFT'),
    fields: jsonb('fields').$type<string[]>().notNull().default([]),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    listingCount: integer('listing_count').notNull().default(0),
    /** D20: nullable. Approvals are parked; adding them later is additive. */
    approvalState: text('approval_state'),
    rollbackExpiresAt: timestamp('rollback_expires_at', { withTimezone: true }),
    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({ byShop: index('bulk_ops_shop_idx').on(t.shopId) }),
)

/** Per-item rows are what make partial success and retry expressible. */
export const bulkOperationItems = pgTable(
  'bulk_operation_items',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull().references(() => shops.id),
    operationId: text('operation_id').notNull().references(() => bulkOperations.id),
    listingId: text('listing_id').notNull().references(() => listings.id),
    beforeValue: jsonb('before_value').$type<Record<string, unknown>>(),
    afterValue: jsonb('after_value').$type<Record<string, unknown>>(),
    /** PENDING | READY | WARNING | BLOCKED | SUCCEEDED | FAILED | SKIPPED */
    status: text('status').notNull().default('PENDING'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => ({ byOperation: index('bulk_items_operation_idx').on(t.operationId) }),
)

/* -------------------------------------------------------------- Shop Pulse */

export const baselines = pgTable('baselines', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  metric: text('metric').notNull(),
  windowDays: integer('window_days').notNull().default(90),
  mean: numeric('mean', { precision: 14, scale: 4 }).notNull(),
  stddev: numeric('stddev', { precision: 14, scale: 4 }).notNull(),
  coveragePercent: integer('coverage_percent'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
})

export const pulseAlerts = pgTable(
  'pulse_alerts',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull().references(() => shops.id),
    metric: text('metric').notNull(),
    deviationPercent: numeric('deviation_percent', { precision: 8, scale: 2 }).notNull(),
    /** CORRELATED | RULED_OUT | UNKNOWN. Never a claim of cause. */
    diagnosis: text('diagnosis').notNull(),
    confidence: text('confidence'),
    /** The events tested. A diagnosis is never stored without its evidence. */
    evidenceEventIds: jsonb('evidence_event_ids').$type<string[]>().notNull().default([]),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
  },
  (t) => ({ byShop: index('pulse_alerts_shop_idx').on(t.shopId) }),
)

/* ----------------------------------------------------------- Action Center */

export const actions = pgTable(
  'actions',
  {
    id: text('id').primaryKey(),
    shopId: text('shop_id').notNull().references(() => shops.id),
    /** Rank within the queue. Lower is more urgent. */
    priority: integer('priority').notNull().default(100),
    /** CRITICAL | ATTENTION | INFO */
    severity: text('severity').notNull(),
    title: text('title').notNull(),
    explanation: text('explanation').notNull(),
    evidence: text('evidence').notNull(),
    /** Every action leads somewhere useful. No dead-end alerts. */
    destinationUrl: text('destination_url').notNull(),
    destinationLabel: text('destination_label').notNull(),
    /** OPEN | IN_PROGRESS | COMPLETED | DISMISSED | SNOOZED */
    status: text('status').notNull().default('OPEN'),
    progressCurrent: integer('progress_current'),
    progressTotal: integer('progress_total'),
    operationId: text('operation_id'),
    createdAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: text('completed_by').references(() => users.id),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
    dismissedBy: text('dismissed_by').references(() => users.id),
    /** Dismissed items keep their reason and can be restored. */
    dismissedReason: text('dismissed_reason'),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  },
  (t) => ({ byShopStatus: index('actions_shop_status_idx').on(t.shopId, t.status) }),
)

/* ----------------------------------------------------- Audit & experiments */

export const auditIssues = pgTable('audit_issues', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  listingId: text('listing_id').references(() => listings.id),
  ruleId: text('rule_id').notNull(),
  severity: text('severity').notNull(),
  suggestedValue: text('suggested_value'),
  revenueAtRisk: money('revenue_at_risk'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).notNull(),
})

export const experiments = pgTable('experiments', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  actorId: text('actor_id').references(() => users.id),
  listingId: text('listing_id').references(() => listings.id),
  hypothesis: text('hypothesis').notNull(),
  changeEventId: text('change_event_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  primaryMetric: text('primary_metric').notNull().default('orders'),
  /** POSITIVE | NEUTRAL | NEGATIVE | INCONCLUSIVE */
  result: text('result'),
  /** Small samples and overlapping seasonality are stated, not hidden. */
  confidenceNote: text('confidence_note'),
})

/* ------------------------------------------------------------------- Money */

export const profitRecords = pgTable('profit_records', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  grossRevenue: money('gross_revenue').notNull(),
  etsyFees: money('etsy_fees').notNull().default('0'),
  paymentProcessing: money('payment_processing').notNull().default('0'),
  offsiteAds: money('offsite_ads').notNull().default('0'),
  shipping: money('shipping').notNull().default('0'),
  cogs: money('cogs').notNull().default('0'),
  labour: money('labour').notNull().default('0'),
  otherCosts: money('other_costs').notNull().default('0'),
  netProfit: money('net_profit').notNull(),
  /** Percent of order value with a confirmed cost. Never hidden. */
  coveragePercent: integer('coverage_percent').notNull().default(0),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
})

export const profitScenarios = pgTable('profit_scenarios', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  profitRecordId: text('profit_record_id').notNull().references(() => profitRecords.id),
  /** CONSERVATIVE | BASE | OPTIMISTIC */
  kind: text('kind').notNull(),
  assumptions: jsonb('assumptions').$type<Record<string, number>>().notNull().default({}),
  netProfit: money('net_profit').notNull(),
  marginPercent: numeric('margin_percent', { precision: 6, scale: 2 }).notNull(),
})

/* ---------------------------------------------------------------- Research */

export const keywordLists = pgTable('keyword_lists', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  actorId: text('actor_id').references(() => users.id),
  name: text('name').notNull(),
  createdAt: createdAt(),
})

export const keywordListItems = pgTable('keyword_list_items', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  listId: text('list_id').notNull().references(() => keywordLists.id),
  term: text('term').notNull(),
  locale: text('locale').notNull().default('US'),
  /** Estimates are stored as a band. There is no single-value column. */
  demandMin: integer('demand_min'),
  demandMax: integer('demand_max'),
  competition: text('competition'),
  opportunity: integer('opportunity'),
  confidence: text('confidence'),
  observedAt: timestamp('observed_at', { withTimezone: true }),
})

/* -------------------------------------------------------------- Commercial */

export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  shopId: text('shop_id').references(() => shops.id),
  /** FREE | SOLO | GROWTH  (D22 - Agency is held until its features exist) */
  plan: text('plan').notNull().default('FREE'),
  status: text('status').notNull().default('ACTIVE'),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  renewsAt: timestamp('renews_at', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
})

export const usageRecords = pgTable('usage_records', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),
  shopId: text('shop_id').references(() => shops.id),
  /** listings | ai_generations */
  metric: text('metric').notNull(),
  used: integer('used').notNull().default(0),
  limit: integer('limit').notNull(),
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
})

/* ---------------------------------------------------------------------- AI */

export const aiGenerations = pgTable('ai_generations', {
  id: text('id').primaryKey(),
  shopId: text('shop_id').notNull().references(() => shops.id),
  actorId: text('actor_id').references(() => users.id),
  listingId: text('listing_id').references(() => listings.id),
  /** TITLE | TAGS | DESCRIPTION | EXPLANATION */
  kind: text('kind').notNull(),
  input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
  output: text('output').notNull(),
  /** DRAFT | ACCEPTED | REJECTED. Approval is a state transition, never a
   *  UI convention - nothing reaches Etsy from DRAFT. */
  status: text('status').notNull().default('DRAFT'),
  approvedBy: text('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: createdAt(),
})

/* ------------------------------------------------------------- Relations */

export const shopsRelations = relations(shops, ({ many, one }) => ({
  memberships: many(memberships),
  listings: many(listings),
  orders: many(orders),
  events: many(events),
  actions: many(actions),
  connection: one(etsyConnections, {
    fields: [shops.id],
    references: [etsyConnections.shopId],
  }),
}))

export const listingsRelations = relations(listings, ({ many, one }) => ({
  shop: one(shops, { fields: [listings.shopId], references: [shops.id] }),
  variations: many(listingVariations),
  events: many(events),
}))

export const ordersRelations = relations(orders, ({ many, one }) => ({
  shop: one(shops, { fields: [orders.shopId], references: [shops.id] }),
  items: many(orderItems),
}))

/* ------------------------------------------------- operator audit trail */

/**
 * Every attempt to change a PLATFORM role. Successes AND refusals.
 *
 * APPEND-ONLY, and not only by convention: lib/repositories/admin-audit-log.ts
 * exports an append and two reads and has no update or delete, so "this record
 * cannot be edited or removed" describes the code (D66).
 *
 * NO shopId, deliberately, and it is the only table here without one. The
 * invariant at the top of this file — every table carries shopId — describes
 * SELLER data, scoped by shopContext(). A platform role belongs to no shop:
 * writing one is an act of EtsyPilot's operators upon EtsyPilot, and giving it
 * a shop column would invite someone to scope it to a shop and conclude that
 * seller isolation covers it. It does not, and this table is not seller data.
 *
 * The emails are SNAPSHOTS, not joins. A log that resolves its actor through a
 * foreign key says nothing once the account is renamed or deleted, which is
 * exactly when a dispute is likeliest to need it.
 *
 * The outcome is flattened from a discriminated union (domain/admin/audit.ts)
 * and rebuilt on read. A row that cannot be rebuilt renders as unreadable
 * rather than as a plausible guess.
 */
export const adminAuditEvents = pgTable(
  'admin_audit_events',
  {
    id: text('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),

    /** Who acted. Not a foreign key: see the snapshot note above. */
    actorId: text('actor_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    /** Their role AT THE TIME. A later demotion must not rewrite history. */
    actorRole: text('actor_role').notNull(),

    /** Whose role was to change. Null only when it could not be resolved. */
    targetId: text('target_id'),
    targetEmail: text('target_email').notNull(),

    /** 'APPLIED' | 'REFUSED'. The union's discriminant. */
    outcomeKind: text('outcome_kind').notNull(),
    /** Set on APPLIED only. */
    fromRole: text('from_role'),
    /** The new role on APPLIED, the attempted one on REFUSED. */
    toRole: text('to_role'),
    /** Set on REFUSED only. A closed list, never free text. */
    refusalReason: text('refusal_reason'),
  },
  (table) => [
    // The log is read newest-first and filtered by actor when investigating.
    index('admin_audit_at_idx').on(table.at),
    index('admin_audit_target_idx').on(table.targetId),
  ],
)

/* --------------------------------------------- editable permission matrix */

/**
 * What each editable platform role may do. One row per role.
 *
 * SUPER_ADMIN HAS NO ROW AND MUST NEVER GET ONE. Its set is always all seven
 * and is never read from here (domain/admin/permissions.ts). A super admin who
 * could remove their own capabilities could lock themselves out of the only
 * screen that would restore them, and there is no second super admin to undo
 * it — the way back is editing an environment variable and restarting.
 *
 * NO ROW AT ALL means "never configured" and resolves to the defaults, which
 * is what keeps first deploy behaving as it did. A row holding an EMPTY array
 * means "configured to nothing" and resolves to nothing. Those are different
 * answers on purpose; see resolvePermissions().
 *
 * No updatedBy or updatedAt column, deliberately. Who changed this and when is
 * in admin_permission_audit_events, which cannot be edited — storing it here
 * as well would be the same fact in two places, and the copy without the
 * actor's role and the before-set is the one that would go stale (D92).
 */
export const adminRolePermissions = pgTable('admin_role_permissions', {
  /** 'ADMIN' | 'MANAGER'. Primary key: one row per role, no duplicates. */
  role: text('role').primaryKey(),
  /**
   * The granted keys. Filtered through PERMISSIONS on read, so a row that
   * somehow contains a non-delegatable capability grants nothing by it.
   */
  permissions: text('permissions').array().notNull(),
})

/**
 * Every attempt to change the permission matrix. Successes AND refusals.
 *
 * A SECOND TABLE rather than more columns on admin_audit_events, and the
 * reason is the honesty rule this codebase keeps applying to figures. That
 * table's subject is an ACCOUNT: `target_email` is NOT NULL and means a
 * person. A permission change has no account — its subject is a ROLE — and
 * putting "ADMIN" in a column called target_email would be a value that
 * misdescribes its own source. Relaxing that column to nullable is not an
 * option either: existing columns are not modified.
 *
 * So the two logs are separate stores with the same shape of guarantee, merged
 * by timestamp when the audit page renders them. Append-only by construction
 * here too: one insert, no update, no delete.
 */
export const adminPermissionAuditEvents = pgTable(
  'admin_permission_audit_events',
  {
    id: text('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),

    actorId: text('actor_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    /** Their role AT THE TIME. A later demotion must not rewrite history. */
    actorRole: text('actor_role').notNull(),

    /** Whose permissions were to change. A ROLE, not a person. */
    subjectRole: text('subject_role').notNull(),

    /** 'APPLIED' | 'REFUSED'. The union's discriminant. */
    outcomeKind: text('outcome_kind').notNull(),
    /** Set on APPLIED only: the set as it was. */
    fromPermissions: text('from_permissions').array(),
    /** The new set on APPLIED, the attempted one on REFUSED. */
    toPermissions: text('to_permissions').array(),
    /** Set on REFUSED only. A closed list, never free text. */
    refusalReason: text('refusal_reason'),
  },
  (table) => [index('admin_permission_audit_at_idx').on(table.at)],
)

export const bulkOperationsRelations = relations(bulkOperations, ({ many }) => ({
  items: many(bulkOperationItems),
}))
