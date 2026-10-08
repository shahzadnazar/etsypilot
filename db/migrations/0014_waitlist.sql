-- ══════════════════════════════════════════════════════════════════════════
--
--   THE WAITLIST. PRE-ACCOUNT DATA, SO THE USUAL PROTECTION DOES NOT APPLY.
--
-- ══════════════════════════════════════════════════════════════════════════
--
-- Every other table in this schema is protected by shop scoping: a row belongs
-- to a shop, a repository takes a ShopContext, and a seller cannot name
-- another seller's shop. None of that is available here. A waitlist row has no
-- shop, no user and no session — the whole point is that the person has not
-- signed up.
--
-- So what protects it is different and has to be stated:
--
--   NO PUBLIC READ.  Nothing in the product reads this table back to a
--                    browser. There is no "you are number 412 in the queue",
--                    no count on the landing page, and no lookup by email.
--                    lib/repositories/waitlist.ts exports no read-by-email,
--                    which is what stops the form becoming an oracle for
--                    "has this address signed up".
--   NO ENUMERATION.  The id is a random uuid, not a sequence. A sequential id
--                    would let anyone who signed up read the size of the list
--                    off their own row, and guess at others.
--   RLS ON.          Below, explicitly. Migration 0008 enables it with a loop
--                    over pg_tables, which covered what existed when it ran
--                    and can cover nothing added since.
--
-- ── ONE ADDRESS, ONE ROW ──────────────────────────────────────────────────
--
-- The unique index is on the LOWERCASED address, because Alice@x.com and
-- alice@x.com are one person and two rows would mean two emails when the
-- product finally has a sender. A second submission updates the row rather
-- than inserting beside it.

CREATE TABLE IF NOT EXISTS "waitlist_signups" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL,
  -- Optional. Somebody who gives it is telling us what shop they run, which is
  -- worth having; somebody who does not is still on the list.
  "shop_url" text,
  -- Where on the page they signed up, so the hero and the pricing section can
  -- be told apart later. No cookies, no identifiers, no third party.
  "source" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_signups_email_idx"
  ON "waitlist_signups" (lower("email"));

ALTER TABLE "waitlist_signups" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- An address with no @ is a typo, not a signup. Cheap, and it keeps the
  -- obviously-malformed out of a table nothing validates on read.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_signups_email_check') THEN
    ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_signups_email_check"
      CHECK (position('@' in "email") > 1 AND length("email") <= 320);
  END IF;
END $$;

-- ── SELF-CHECK ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'waitlist_signups' AND relrowsecurity) THEN
    RAISE EXCEPTION 'waitlist_signups exists without row-level security';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'waitlist_signups_email_idx') THEN
    RAISE EXCEPTION 'waitlist_signups has no unique index on the address; one person could get two emails';
  END IF;
  RAISE NOTICE 'APPLIED';
END $$;
