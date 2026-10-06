-- A listing that disappeared from Etsy is dated, not deleted.
--
-- ── THE DOMAIN HAD NO STATE FOR THIS, AND DELETING IS NOT AVAILABLE ───────
--
-- domain/listings/types.ts declares a closed list of statuses — ACTIVE,
-- EXPIRING, DRAFT, EXPIRED, INACTIVE — and all five describe a listing that is
-- PRESENT on Etsy. There is no DELETED, REMOVED or SOLD_OUT anywhere in the
-- codebase; grepped, not assumed. So the first instinct was to delete the row,
-- which lib/etsy/live.ts already implies by returning null for a listing Etsy
-- no longer has.
--
-- EIGHT FOREIGN KEYS SAY OTHERWISE, all ON DELETE NO ACTION:
--
--   ai_generations, audit_issues, bulk_operation_items, cost_rules,
--   events, experiments, listing_variations, order_items
--
-- So a delete fails the moment any of them has a row — and the two that matter
-- most are the ones that make deleting wrong rather than merely difficult.
-- `events` is this product's append-only history, and `order_items` records
-- that the listing SOLD. Removing a listing from Etsy does not unsell it, and a
-- cascade would quietly destroy the sales history of every listing a seller
-- ever took down.
--
-- ── SO: DATED, THE SAME SHAPE THIS CODEBASE ALREADY USES ──────────────────
--
-- etsy_connections.revoked_at exists for exactly this reason: "a revocation is
-- a fact worth keeping — this shop disconnected on this date and this shop was
-- never connected are different answers." A listing is the same. "Removed from
-- Etsy on the 6th" and "never existed" are different answers, and a seller
-- asking why a listing vanished from their catalogue deserves the first.
--
-- The seller's listing views filter `removed_at is null`, so no removed listing
-- reaches a ListingRow and the closed status list is untouched. A relisted
-- listing has the column cleared again by the next sync.
--
-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- A COLUMN, not a table. `listings` was created in 0000 and is inside the reach
-- of 0008_enable_row_level_security.sql's loop, so it is already protected and
-- a column inherits that. tests/unit/rls.test.ts checks that claim rather than
-- trusting it: its rule is about tables arriving after 0008, and an ALTER TABLE
-- ADD COLUMN adds none.
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "removed_at" timestamp with time zone;
--> statement-breakpoint
-- Refuse to succeed quietly, the same shape as 0008 and 0009.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'listings' AND column_name = 'removed_at'
  ) THEN
    RAISE EXCEPTION 'listings.removed_at was not created; the sync cannot record a disappearance.';
  END IF;
END
$$;
