-- cost_rules becomes the cost model, append-only, and a cleared rule can say so.
--
-- ══════════════════════════════════════════════════════════════════════════
--  WHY THIS TABLE AND NOT A FLAT SETTINGS ROW
-- ══════════════════════════════════════════════════════════════════════════
--
-- domain/costs/store.ts held five scalars in a module-level Map and its own
-- header named the replacement: "The Drizzle `shop_cost_settings` row replaces
-- it." That table was never built, and it should not be: it cannot express
-- what the product already says out loud.
--
-- /profit renders "52 listings without a product cost" and "Costs are
-- confirmed for 83% of order value". Both are claims about PER-LISTING costs,
-- and five shop-wide scalars cannot carry one. cost_rules already can —
-- scope DEFAULT | LISTING | VARIATION, a listing_id, a variation_id — and it
-- carries actor_id and created_at, which five scalars in a Map do not.
--
-- So cost_rules is the model and CostSettings becomes a VIEW over its
-- DEFAULT-scope rows. lib/repositories/costs.ts has the field mapping.
--
-- ══════════════════════════════════════════════════════════════════════════
--  1. APPEND-ONLY, WHICH IS WHAT MAKES actor_id WORTH HAVING
-- ══════════════════════════════════════════════════════════════════════════
--
-- Every save INSERTS. The rule in force is the newest row for its key, and the
-- rows behind it are the history of who changed what and when. An UPDATE in
-- place would leave actor_id describing only the last writer and throw away
-- the trail — and the trail is the point of a seller-authored aggregate.
--
-- It is also the shape this schema already prefers: `events` is append-only
-- and says so, and etsy_connections dates a revocation rather than deleting
-- the row. The index below is what makes "newest row per key" cheap.
--
-- ══════════════════════════════════════════════════════════════════════════
--  2. `value` BECOMES NULLABLE: A CLEARED RULE IS NOT A RULE OF ZERO
-- ══════════════════════════════════════════════════════════════════════════
--
-- Append-only needs a way to say "this rule no longer applies". With value NOT
-- NULL the only way to retract a cost was to write 0 — which is a COST OF
-- ZERO, a figure, and the opposite of what the seller meant. The same
-- distinction orders.etsy_fees needed in 0011, and the one CostSettings.adSpend
-- already drew in the type system: "the honest states are 'the seller typed a
-- figure' and 'nobody knows' — not zero, which would silently improve the
-- profit waterfall."
--
-- So NULL means retracted or never known. There is no stored zero that means
-- absent, anywhere in this table.
--
-- No backfill: the table is empty (checked, 0 rows), so nothing existing is
-- being reinterpreted.
--
-- ══════════════════════════════════════════════════════════════════════════
--  3. cost_kind GAINS 'ADS'
-- ══════════════════════════════════════════════════════════════════════════
--
-- The column's comment lists COGS | SHIPPING | LABOUR | OTHER. CostSettings
-- carries a fifth figure, `adSpend`, which is NOT "other costs": Etsy exposes
-- no ads endpoint, so it is the one cost line that is routinely unknown rather
-- than zero, and folding it into OTHER would lose that.
--
-- It is a text column with a default, so no type change is needed — this is a
-- documentation change plus the CHECK below, which is what makes the set of
-- values a fact about the database rather than a comment.

ALTER TABLE "cost_rules" ALTER COLUMN "value" DROP NOT NULL;

-- The newest-row-per-key read. `listing_id` is in the key because a LISTING
-- rule and the DEFAULT rule for the same cost_kind are different rules.
CREATE INDEX IF NOT EXISTS "cost_rules_current_idx"
  ON "cost_rules" ("shop_id", "scope", "cost_kind", "listing_id", "created_at" DESC);

-- The vocabulary, enforced rather than described. A typo'd cost_kind would
-- otherwise insert happily and then be invisible to every read.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_rules_cost_kind_check') THEN
    ALTER TABLE "cost_rules" ADD CONSTRAINT "cost_rules_cost_kind_check"
      CHECK ("cost_kind" IN ('COGS', 'SHIPPING', 'LABOUR', 'OTHER', 'ADS'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_rules_scope_check') THEN
    ALTER TABLE "cost_rules" ADD CONSTRAINT "cost_rules_scope_check"
      CHECK ("scope" IN ('DEFAULT', 'LISTING', 'VARIATION'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_rules_value_type_check') THEN
    ALTER TABLE "cost_rules" ADD CONSTRAINT "cost_rules_value_type_check"
      CHECK ("value_type" IN ('PERCENT', 'FIXED'));
  END IF;
  -- A LISTING rule without a listing is not a listing rule.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_rules_scope_target_check') THEN
    ALTER TABLE "cost_rules" ADD CONSTRAINT "cost_rules_scope_target_check"
      CHECK (
        ("scope" = 'DEFAULT' AND "listing_id" IS NULL AND "variation_id" IS NULL)
        OR ("scope" = 'LISTING' AND "listing_id" IS NOT NULL)
        OR ("scope" = 'VARIATION' AND "variation_id" IS NOT NULL)
      );
  END IF;
END $$;

-- cost_rules existed when migration 0008's pg_tables loop ran, so RLS is
-- already on it; this migration adds no table. Verified below rather than
-- assumed, because that is the check this project has been bitten by twice.

-- ── SELF-CHECK ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'cost_rules' AND column_name = 'value') <> 'YES' THEN
    RAISE EXCEPTION 'cost_rules.value is still NOT NULL; a retracted rule cannot say so';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'cost_rules_current_idx') THEN
    RAISE EXCEPTION 'cost_rules has no newest-per-key index';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cost_rules_cost_kind_check') THEN
    RAISE EXCEPTION 'cost_kind is not constrained; a typo would insert and vanish';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'cost_rules' AND relrowsecurity) THEN
    RAISE EXCEPTION 'cost_rules exists without row-level security';
  END IF;
  RAISE NOTICE 'APPLIED';
END $$;
