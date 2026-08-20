CREATE TABLE "actions" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"evidence" text NOT NULL,
	"destination_url" text NOT NULL,
	"destination_label" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"progress_current" integer,
	"progress_total" integer,
	"operation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"dismissed_at" timestamp with time zone,
	"dismissed_by" text,
	"dismissed_reason" text,
	"snoozed_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"actor_id" text,
	"listing_id" text,
	"kind" text NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" text NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_issues" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"listing_id" text,
	"rule_id" text NOT NULL,
	"severity" text NOT NULL,
	"suggested_value" text,
	"revenue_at_risk" numeric(12, 2),
	"detected_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baselines" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"metric" text NOT NULL,
	"window_days" integer DEFAULT 90 NOT NULL,
	"mean" numeric(14, 4) NOT NULL,
	"stddev" numeric(14, 4) NOT NULL,
	"coverage_percent" integer,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_operation_items" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"actor_id" text,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"listing_count" integer DEFAULT 0 NOT NULL,
	"approval_state" text,
	"rollback_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cost_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"actor_id" text,
	"scope" text NOT NULL,
	"listing_id" text,
	"variation_id" text,
	"value_type" text NOT NULL,
	"value" numeric(12, 4) NOT NULL,
	"cost_kind" text DEFAULT 'COGS' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "etsy_connections" (
	"shop_id" text PRIMARY KEY NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_ref" text,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"listing_id" text,
	"actor_id" text,
	"timestamp" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"field" text,
	"before_value" text,
	"after_value" text,
	"operation_id" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"actor_id" text,
	"listing_id" text,
	"hypothesis" text NOT NULL,
	"change_event_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"primary_metric" text DEFAULT 'orders' NOT NULL,
	"result" text,
	"confidence_note" text
);
--> statement-breakpoint
CREATE TABLE "keyword_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"list_id" text NOT NULL,
	"term" text NOT NULL,
	"locale" text DEFAULT 'US' NOT NULL,
	"demand_min" integer,
	"demand_max" integer,
	"competition" text,
	"opportunity" integer,
	"confidence" text,
	"observed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "keyword_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"actor_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_variations" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"listing_id" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2),
	"quantity" integer,
	"sku" text
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"etsy_listing_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'ACTIVE' NOT NULL,
	"section" text,
	"sku" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"required_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photo_count" integer DEFAULT 0 NOT NULL,
	"renews_at" timestamp with time zone,
	"last_changed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"role" text DEFAULT 'OWNER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_shop_id_pk" PRIMARY KEY("user_id","shop_id")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"order_id" text NOT NULL,
	"listing_id" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"cost_snapshot" numeric(12, 2)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"etsy_receipt_id" text NOT NULL,
	"placed_at" timestamp with time zone NOT NULL,
	"gross" numeric(12, 2) NOT NULL,
	"discounts" numeric(12, 2) DEFAULT '0' NOT NULL,
	"refunds" numeric(12, 2) DEFAULT '0' NOT NULL,
	"etsy_fees" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_processing" numeric(12, 2) DEFAULT '0' NOT NULL,
	"offsite_ads" numeric(12, 2) DEFAULT '0' NOT NULL,
	"country_code" text
);
--> statement-breakpoint
CREATE TABLE "profit_records" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_revenue" numeric(12, 2) NOT NULL,
	"etsy_fees" numeric(12, 2) DEFAULT '0' NOT NULL,
	"payment_processing" numeric(12, 2) DEFAULT '0' NOT NULL,
	"offsite_ads" numeric(12, 2) DEFAULT '0' NOT NULL,
	"shipping" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cogs" numeric(12, 2) DEFAULT '0' NOT NULL,
	"labour" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other_costs" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_profit" numeric(12, 2) NOT NULL,
	"coverage_percent" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profit_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"profit_record_id" text NOT NULL,
	"kind" text NOT NULL,
	"assumptions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"net_profit" numeric(12, 2) NOT NULL,
	"margin_percent" numeric(6, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pulse_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"shop_id" text NOT NULL,
	"metric" text NOT NULL,
	"deviation_percent" numeric(8, 2) NOT NULL,
	"diagnosis" text NOT NULL,
	"confidence" text,
	"evidence_event_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"detected_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" text PRIMARY KEY NOT NULL,
	"etsy_shop_id" text,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"connection_status" text DEFAULT 'DEMO' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"shop_id" text,
	"plan" text DEFAULT 'FREE' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"renews_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"subscription_id" text NOT NULL,
	"shop_id" text,
	"metric" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"limit" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"seller_type" text,
	"primary_goal" text,
	"onboarding_state" text DEFAULT 'NOT_STARTED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baselines" ADD CONSTRAINT "baselines_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operation_items" ADD CONSTRAINT "bulk_operation_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operation_items" ADD CONSTRAINT "bulk_operation_items_operation_id_bulk_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."bulk_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operation_items" ADD CONSTRAINT "bulk_operation_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_rules" ADD CONSTRAINT "cost_rules_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_rules" ADD CONSTRAINT "cost_rules_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_rules" ADD CONSTRAINT "cost_rules_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_rules" ADD CONSTRAINT "cost_rules_variation_id_listing_variations_id_fk" FOREIGN KEY ("variation_id") REFERENCES "public"."listing_variations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "etsy_connections" ADD CONSTRAINT "etsy_connections_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_list_items" ADD CONSTRAINT "keyword_list_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_list_items" ADD CONSTRAINT "keyword_list_items_list_id_keyword_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."keyword_lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_lists" ADD CONSTRAINT "keyword_lists_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_lists" ADD CONSTRAINT "keyword_lists_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_variations" ADD CONSTRAINT "listing_variations_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_variations" ADD CONSTRAINT "listing_variations_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profit_records" ADD CONSTRAINT "profit_records_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profit_scenarios" ADD CONSTRAINT "profit_scenarios_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profit_scenarios" ADD CONSTRAINT "profit_scenarios_profit_record_id_profit_records_id_fk" FOREIGN KEY ("profit_record_id") REFERENCES "public"."profit_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pulse_alerts" ADD CONSTRAINT "pulse_alerts_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_shop_status_idx" ON "actions" USING btree ("shop_id","status");--> statement-breakpoint
CREATE INDEX "bulk_items_operation_idx" ON "bulk_operation_items" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "bulk_ops_shop_idx" ON "bulk_operations" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "events_shop_time_idx" ON "events" USING btree ("shop_id","timestamp");--> statement-breakpoint
CREATE INDEX "events_listing_idx" ON "events" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "events_operation_idx" ON "events" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX "listings_shop_idx" ON "listings" USING btree ("shop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listings_shop_etsy_idx" ON "listings" USING btree ("shop_id","etsy_listing_id");--> statement-breakpoint
CREATE INDEX "orders_shop_placed_idx" ON "orders" USING btree ("shop_id","placed_at");--> statement-breakpoint
CREATE INDEX "pulse_alerts_shop_idx" ON "pulse_alerts" USING btree ("shop_id");