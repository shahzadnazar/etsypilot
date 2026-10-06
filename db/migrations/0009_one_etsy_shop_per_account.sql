-- One Etsy shop belongs to one EtsyPilot account.
--
-- ── WHY A CONSTRAINT AND NOT A CHECK IN THE CALLBACK ──────────────────────
--
-- Two sellers connecting the same Etsy shop is a real case, not a contrived
-- one: a shop that changed hands, an agency and its client, one person with two
-- accounts. Without this, both connections succeed and the shop's data moves to
-- whoever connected last — the seller who connected first simply stops seeing
-- their own shop, with nothing anywhere saying why.
--
-- app/api/etsy/callback/route.ts also SELECTs for an existing owner, so it can
-- answer with its own outcome instead of surfacing a database error. That
-- SELECT is for the WORDING only. A SELECT followed by an INSERT is a race:
-- two callbacks interleaving between the two statements both see nothing and
-- both write. This index is the part that holds under concurrency.
--
-- ── PARTIAL, AND THAT IS NOT AN OPTIMISATION ──────────────────────────────
--
-- Every shop starts with etsy_shop_id NULL — one row per account from signup,
-- which is the point of the column. Postgres treats NULLs as distinct in a
-- unique index, so a plain one would already permit them; the predicate is
-- written out anyway so that reading this does not require remembering that
-- rule, and so the index holds only the connected shops.
--
-- ── NO NEW TABLE, SO NO NEW RLS ───────────────────────────────────────────
--
-- `shops` was created in 0000 and is inside the reach of
-- 0008_enable_row_level_security.sql's loop. tests/unit/rls.test.ts checks that
-- claim rather than taking it: a migration adding a TABLE after 0008 without
-- its own ENABLE line turns that suite red, and an index is not a table.
CREATE UNIQUE INDEX IF NOT EXISTS "shops_etsy_shop_id_idx"
  ON "shops" ("etsy_shop_id")
  WHERE "etsy_shop_id" IS NOT NULL;
--> statement-breakpoint
-- Refuse to succeed quietly, the same shape as 0008's self-check. A migration
-- that reports success while the constraint is absent is the failure this file
-- exists to prevent, arriving one level up.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'shops'
       AND indexname = 'shops_etsy_shop_id_idx'
  ) THEN
    RAISE EXCEPTION 'shops_etsy_shop_id_idx was not created. Two accounts could claim one Etsy shop.';
  END IF;
END
$$;
