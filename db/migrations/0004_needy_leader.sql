CREATE TABLE "admin_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"actor_role" text NOT NULL,
	"target_id" text,
	"target_email" text NOT NULL,
	"outcome_kind" text NOT NULL,
	"from_role" text,
	"to_role" text,
	"refusal_reason" text
);
--> statement-breakpoint
CREATE INDEX "admin_audit_at_idx" ON "admin_audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "admin_audit_target_idx" ON "admin_audit_events" USING btree ("target_id");