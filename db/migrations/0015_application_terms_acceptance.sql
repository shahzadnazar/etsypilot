-- ══════════════════════════════════════════════════════════════════════════
--
--   PER-SELLER ACCEPTANCE OF THE APPLICATION TERMS. ETSY'S API TERMS §4
--   REQUIRES IT; A FOOTER LINK IS NOT IT.
--
-- ══════════════════════════════════════════════════════════════════════════
--
-- Etsy's API Terms of Use, section 4:
--
--   "You represent and warrant that you have executed Application Terms with
--    each Etsy seller that comply with all applicable privacy laws…"
--   "Failure to maintain transparent and sufficient Application Terms may
--    result in your Etsy API access being suspended or terminated."
--
-- "Executed with each seller" is a per-seller record, not a page on a website.
-- This table is that record.
--
-- ── WHY THE VERSION IS A CONTENT HASH AND NOT A NUMBER ────────────────────
--
-- A version number has to be bumped by whoever edits the document, and the
-- whole reason these documents are version-controlled beside the code is that
-- the thing nobody remembers to do is the thing that breaks. A lawyer fixing a
-- clause has no reason to think about a constant in a TypeScript file.
--
-- `version` is sha256 over the Terms and the Privacy Policy as published.
-- Change a comma in either and every seller's acceptance stops matching, which
-- is the behaviour §4 actually wants: a material change means asking again,
-- and the system errs towards asking.
--
-- ── APPEND-ONLY, AND WHAT THAT MEANS HERE ─────────────────────────────────
--
-- An acceptance is evidence. Editing one would be editing the record of what a
-- seller agreed to, which is the only thing this table is for, so:
--
--   * lib/repositories/terms-acceptances.ts exports one append and two reads.
--     It has no update and no delete, and tests/unit/legal-claims.test.ts
--     sweeps domain/, app/ and lib/ to keep it that way.
--   * Re-accepting the same version is ON CONFLICT DO NOTHING against the
--     unique index below — an insert that no-ops, never an UPDATE. A seller who
--     double-clicks Accept does not get two rows, and the first row's timestamp
--     survives, which is the one that matters.
--
-- ── WHY BOTH shop_id AND user_id ──────────────────────────────────────────
--
-- Etsy's requirement is per SELLER. The gate is on connecting and syncing an
-- Etsy shop, so the shop is what the record has to be attached to. The user is
-- recorded as well because a person accepted it, and "which human clicked" is
-- the question an acceptance record exists to answer.
--
-- ── RLS ───────────────────────────────────────────────────────────────────
--
-- Enabled explicitly, below. Migration 0008 enables RLS with a loop over
-- pg_tables, which covered what existed when it ran and can cover nothing
-- added since — that is exactly how three tables arrived unprotected in
-- September. tests/unit/rls.test.ts fails on a declared table whose creating
-- migration has no ENABLE line.

CREATE TABLE IF NOT EXISTS "terms_acceptances" (
  "id" text PRIMARY KEY,
  "shop_id" text NOT NULL REFERENCES "shops"("id"),
  "user_id" text NOT NULL REFERENCES "users"("id"),
  -- sha256 over the published Terms and Privacy Policy, hex.
  "version" text NOT NULL,
  -- Which documents that hash covered, so a record stays readable after the
  -- set of documents changes. Names and their individual hashes.
  "documents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "accepted_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- One acceptance per shop, per user, per version. Makes a repeat accept a
-- no-op insert rather than a second row or an update.
CREATE UNIQUE INDEX IF NOT EXISTS "terms_acceptances_shop_user_version_idx"
  ON "terms_acceptances" ("shop_id", "user_id", "version");

-- The gate reads "has this shop accepted this version", on every connect and
-- every sync.
CREATE INDEX IF NOT EXISTS "terms_acceptances_shop_version_idx"
  ON "terms_acceptances" ("shop_id", "version");

ALTER TABLE "terms_acceptances" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- A hash is 64 hex characters. A row with something else in it is not an
  -- acceptance of anything identifiable, and the point of this table is that
  -- the version is a fact rather than a label.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terms_acceptances_version_check') THEN
    ALTER TABLE "terms_acceptances" ADD CONSTRAINT "terms_acceptances_version_check"
      CHECK ("version" ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

-- ── SELF-CHECK ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'terms_acceptances' AND relrowsecurity) THEN
    RAISE EXCEPTION 'terms_acceptances exists without row-level security';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'terms_acceptances_shop_user_version_idx'
  ) THEN
    RAISE EXCEPTION 'terms_acceptances has no unique index; one seller could hold two acceptances of one version';
  END IF;
  RAISE NOTICE 'APPLIED';
END $$;
