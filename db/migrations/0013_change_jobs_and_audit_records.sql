-- ══════════════════════════════════════════════════════════════════════════
--
--   THE TWO IMMUTABLE TRAILS, IN A TABLE RATHER THAN IN A Map.
--
-- ══════════════════════════════════════════════════════════════════════════
--
-- domain/change-history/store.ts and domain/audit-log/store.ts were both
-- module-level Maps on a global Symbol, seeded from the demo fixture. Measured
-- in a browser on a live account, before this migration:
--
--   /settings/audit-log   "Every action taken on this shop through EtsyPilot...
--                         Records are immutable and cannot be edited or deleted
--                         from this page." Then eight records by "Salman",
--                         including "AI draft accepted, then published ·
--                         Linen table runner · Reached Etsy: Yes · 1 of 1".
--                         A log claiming immutability, asserting that writes
--                         were made to a shop that has never connected.
--
--   /listings/change-history   HTTP 500, because the service asked the Etsy
--                         adapter for a catalogue it has no key for. Had it
--                         rendered, demoChangeJobs() would have built jobs out
--                         of that seller's own listings.
--
-- Both pages promise a record that cannot be edited or removed. A Map that
-- dies with the process cannot keep that promise, and on a host running more
-- than one instance the record a POST appends is invisible to the page that
-- renders it — the same defect cost settings had, on the two surfaces where
-- the promise is the entire point.
--
-- ── WHY JSONB FOR THE PAYLOAD ─────────────────────────────────────────────
--
-- An AuditRecord carries an actor, a sequence of steps and a would-have-changed
-- diff; a ChangeJob carries its items. Both are written whole and read whole,
-- and nothing queries inside them — the filters are on source, on shop and on
-- the refusal verdict, all of which are derived from top-level fields. Columns
-- that exist to be filtered are columns here; the rest is one document.
--
-- The exception is `reached_kind`. "Refused only" is the filter the audit log
-- exists for, so the verdict is a column and a CHECK, not a path expression
-- into a document.

CREATE TABLE IF NOT EXISTS "change_jobs" (
  "id" text PRIMARY KEY,
  "shop_id" text NOT NULL REFERENCES "shops"("id"),
  -- Who ran it. Null for a job with no signed-in actor (a scheduled one).
  "actor_id" text REFERENCES "users"("id"),
  -- The name shown in the row. Resolved at write time from the actor, because
  -- a job's record of who ran it must not change when somebody renames
  -- themselves two years later.
  "actor_name" text NOT NULL,
  "at" timestamp with time zone NOT NULL,
  "source" text NOT NULL,
  "summary" text NOT NULL,
  -- ChangeItem[]: listing, field, before, after, status.
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "linked_experiment" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "change_jobs_shop_at_idx"
  ON "change_jobs" ("shop_id", "at" DESC);

-- ── THE AUDIT LOG ─────────────────────────────────────────────────────────
--
-- `seq` is part of the record's address and the reason this table has a
-- composite primary key rather than a surrogate one. domain/audit-log/types.ts
-- records why it exists at all: `id@at` collided, because "two rollback
-- refusals a moment apart carried the same operation id and the same
-- millisecond, so the log's drawer could only ever open the first of them".
--
-- It is assigned by the INSERT, from max(seq) + 1 within the shop, never by a
-- caller — a caller that could choose one could choose a duplicate. The
-- primary key makes a concurrent race fail loudly instead of silently
-- producing two records at the same address.
CREATE TABLE IF NOT EXISTS "audit_records" (
  "shop_id" text NOT NULL REFERENCES "shops"("id"),
  "seq" bigint NOT NULL,
  -- The operation id (BE-2288, OP-9102). NOT unique: one operation produces
  -- several records, which is the point of the sequence column.
  "operation_id" text NOT NULL,
  "at" timestamp with time zone NOT NULL,
  "actor_id" text REFERENCES "users"("id"),
  "source" text NOT NULL,
  -- SENT | NOTHING_SENT | NOT_APPLICABLE. A column because "Refused only" is
  -- the filter this log exists for, and a filter reading a different field
  -- from the column beside it is what makes a log unusable in a dispute.
  "reached_kind" text NOT NULL,
  "record" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("shop_id", "seq")
);

CREATE INDEX IF NOT EXISTS "audit_records_shop_at_idx"
  ON "audit_records" ("shop_id", "at" DESC, "seq" DESC);

-- ── RLS, EXPLICITLY ───────────────────────────────────────────────────────
--
-- Migration 0008 enables row-level security with a LOOP over pg_tables, which
-- covered everything that existed when it ran and can cover nothing added
-- afterwards. Three tables arrived without it in September and were found by
-- hand on 7 October. tests/unit/rls.test.ts turns red for a new table whose
-- migration has no ENABLE line; these are those lines.
ALTER TABLE "change_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_records" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- A source the UI cannot label is a row that renders as blank.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'change_jobs_source_check') THEN
    ALTER TABLE "change_jobs" ADD CONSTRAINT "change_jobs_source_check"
      CHECK ("source" IN ('BULK_EDIT', 'SCHEDULED', 'AI_ASSISTED', 'MANUAL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_records_source_check') THEN
    ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_source_check"
      CHECK ("source" IN ('MANUAL', 'BULK_JOB', 'SYNC', 'AI_ASSISTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_records_reached_check') THEN
    ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_reached_check"
      CHECK ("reached_kind" IN ('SENT', 'NOTHING_SENT', 'NOT_APPLICABLE'));
  END IF;
  -- Sequences start at zero and never go backwards.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_records_seq_check') THEN
    ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_seq_check" CHECK ("seq" >= 0);
  END IF;
END $$;

-- ── SELF-CHECK ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'change_jobs' AND relrowsecurity) THEN
    RAISE EXCEPTION 'change_jobs exists without row-level security';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'audit_records' AND relrowsecurity) THEN
    RAISE EXCEPTION 'audit_records exists without row-level security';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'audit_records_shop_at_idx') THEN
    RAISE EXCEPTION 'audit_records has no newest-first index';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_records_reached_check') THEN
    RAISE EXCEPTION 'reached_kind is not constrained; the refusal filter would silently miss rows';
  END IF;
  RAISE NOTICE 'APPLIED';
END $$;
