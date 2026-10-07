-- Fees that nobody has read are NULL, not zero. And sync state is per aggregate.
--
-- Three changes, one theme: a figure this product does not hold must not be
-- indistinguishable from a figure that is genuinely zero.
--
-- ══════════════════════════════════════════════════════════════════════════
--  1. orders.etsy_fees / payment_processing / offsite_ads BECOME NULLABLE
-- ══════════════════════════════════════════════════════════════════════════
--
-- They were `not null default '0'` under a comment reading "Verified fee
-- lines, straight from the receipt". They are not from the receipt. Etsy's fee
-- lines come from the payment-account ledger, and lib/etsy/live.ts's toOrder()
-- says so and leaves all three at 0 — so a sync writing what the adapter
-- returns would put 0 into a column claiming to hold a verified figure, and
-- that row would be identical to one for a shop whose fees genuinely were
-- zero.
--
-- ── WHAT THE PROFIT DOMAIN ACTUALLY DID WITH THOSE ZEROS ──────────────────
--
-- Measured before this migration was written, because toOrder()'s comment and
-- docs/ETSY-SETUP.md both assert a safeguard:
--
--   "the profit domain treats a period with no fee data as incomplete rather
--    than as fee-free — a shop whose fees read $0 would show a wildly
--    optimistic net profit."
--
-- IT DID NOT. domain/profit/waterfall.ts summed the three fields and labelled
-- every one of them `verified(null, 'Your Etsy order receipts')` — VERIFIED,
-- unconditionally — then computed `netProfit = grossRevenue - totalCosts`
-- with the fees contributing nothing. domain/profit/reconciliation.ts's
-- missingDataFrom() raises NO_PRODUCT_COST, NO_LABOUR and
-- UNMATCHED_TRANSACTIONS, and has no fee code at all.
--
-- So the product would have shown "Etsy fees −$0.00 ✓ Verified" above a net
-- profit overstated by the entire fee bill, in the direction that flatters.
-- The safeguard was documented, believed and absent. This migration makes the
-- column able to say "unknown"; the same change adds the branch to the profit
-- domain, because nullability alone would only move the lie into a `?? 0`.
--
-- ── NO BACKFILL, AND THAT IS CHECKED RATHER THAN ASSUMED ──────────────────
--
-- `select count(*) from orders where etsy_fees=0 or payment_processing=0 or
--  offsite_ads=0` returns 0. Every row present carries real non-zero fees, so
-- there is no stored 0 whose meaning is ambiguous and nothing to reinterpret.
-- The defaults are DROPPED so a future insert cannot acquire one silently.
--
-- ══════════════════════════════════════════════════════════════════════════
--  2. order_items GAINS etsy_listing_id, AND BOTH TABLES GAIN A NATURAL KEY
-- ══════════════════════════════════════════════════════════════════════════
--
-- A re-runnable sync needs to upsert, and an upsert needs a unique target.
--
--   orders       (shop_id, etsy_receipt_id)   — did not exist; only a
--                                               non-unique (shop_id, placed_at)
--   order_items  (order_id, etsy_listing_id)  — order_items had no way to say
--                                               WHICH Etsy listing sold
--
-- order_items.listing_id is a foreign key to our own listings.id, so it is
-- null for an order whose listing we do not hold — which is the ordinary case
-- when orders sync before listings do. Without etsy_listing_id such a row
-- recorded a sale of nothing identifiable, and there was no key to upsert on.
-- Added NOT NULL: the table is empty (checked), and a line with no listing id
-- is not a line.
--
-- ══════════════════════════════════════════════════════════════════════════
--  3. sync_state: ONE TIMESTAMP COULD NOT SAY WHICH AGGREGATE WAS READ
-- ══════════════════════════════════════════════════════════════════════════
--
-- The listings slice wrote shops.last_synced_at, which was correct while
-- listings were the only aggregate reading our own tables. Orders is the
-- second, and it breaks that column: after a listings sync, last_synced_at is
-- set, so an orders reader asking "has this shop been synced" is told YES and
-- finds an empty table. The Action Center — a screen whose whole job is to say
-- what needs attention — would then say "nothing needs your attention" when
-- the truthful answer is "nothing has been read yet".
--
-- So sync state is per aggregate, keyed (shop_id, aggregate). shops.
-- last_synced_at stays, and keeps its own meaning: the most recent sync of
-- ANYTHING, which is what the app shell's "Synced 7 min ago" wants. The two do
-- not disagree because each sync writes both and the shop column is the max.

ALTER TABLE "orders" ALTER COLUMN "etsy_fees" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "etsy_fees" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "payment_processing" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "payment_processing" DROP NOT NULL;
ALTER TABLE "orders" ALTER COLUMN "offsite_ads" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "offsite_ads" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_shop_receipt_idx"
  ON "orders" ("shop_id", "etsy_receipt_id");

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "etsy_listing_id" text;

-- Re-runnable, and it refuses rather than inventing an id. A populated table
-- with nulls here cannot be made NOT NULL without deciding what those rows
-- sold, which is not a decision a migration may make.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "order_items" WHERE "etsy_listing_id" IS NULL) THEN
    RAISE EXCEPTION
      'order_items has rows with no etsy_listing_id; backfill them before this migration can set NOT NULL';
  END IF;
  ALTER TABLE "order_items" ALTER COLUMN "etsy_listing_id" SET NOT NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "order_items_order_listing_idx"
  ON "order_items" ("order_id", "etsy_listing_id");

CREATE TABLE IF NOT EXISTS "sync_state" (
  "shop_id" text NOT NULL REFERENCES "shops"("id"),
  "aggregate" text NOT NULL,
  "last_synced_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("shop_id", "aggregate")
);

-- Migration 0008 enables RLS with a LOOP over pg_tables, so it covers every
-- table that existed when it ran and nothing that arrives afterwards. Three
-- tables have already reached the owner's real project with RLS off for
-- exactly this reason. tests/unit/rls.test.ts fails if this line is missing.
ALTER TABLE "sync_state" ENABLE ROW LEVEL SECURITY;

-- ── SELF-CHECK ────────────────────────────────────────────────────────────
--
-- A migration that silently did nothing is the failure this ends with.
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_name='orders' AND is_nullable='NO'
        AND column_name IN ('etsy_fees','payment_processing','offsite_ads')) > 0 THEN
    RAISE EXCEPTION 'a fee column is still NOT NULL; it cannot say "unknown"';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_name='orders' AND column_default IS NOT NULL
        AND column_name IN ('etsy_fees','payment_processing','offsite_ads')) > 0 THEN
    RAISE EXCEPTION 'a fee column still defaults; an insert could acquire a zero silently';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='orders_shop_receipt_idx') THEN
    RAISE EXCEPTION 'orders has no unique (shop_id, etsy_receipt_id); the sync cannot upsert';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='order_items_order_listing_idx') THEN
    RAISE EXCEPTION 'order_items has no unique (order_id, etsy_listing_id); the sync cannot upsert';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='sync_state' AND relrowsecurity) THEN
    RAISE EXCEPTION 'sync_state exists without row-level security';
  END IF;
  RAISE NOTICE 'APPLIED';
END $$;
