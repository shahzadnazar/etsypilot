CREATE TABLE "admin_permission_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"actor_role" text NOT NULL,
	"subject_role" text NOT NULL,
	"outcome_kind" text NOT NULL,
	"from_permissions" text[],
	"to_permissions" text[],
	"refusal_reason" text
);
--> statement-breakpoint
CREATE TABLE "admin_role_permissions" (
	"role" text PRIMARY KEY NOT NULL,
	"permissions" text[] NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_permission_audit_at_idx" ON "admin_permission_audit_events" USING btree ("at");--> statement-breakpoint
-- Seed the matrix with the A1 defaults, so behaviour is unchanged on first
-- deploy: ADMIN all seven, MANAGER users.view only. SUPER_ADMIN deliberately
-- has no row — its set is always all seven and is never read from this table.
--
-- ON CONFLICT DO NOTHING so re-running this migration cannot overwrite a
-- matrix an operator has since edited. A migration that resets permissions on
-- every deploy would be a permission screen that changes nothing, slowly.
INSERT INTO "admin_role_permissions" ("role", "permissions") VALUES
	('ADMIN', ARRAY['users.view','users.detail','subscriptions.view','usage.view','ai.view','etsy.view','operations.view']),
	('MANAGER', ARRAY['users.view'])
ON CONFLICT ("role") DO NOTHING;
