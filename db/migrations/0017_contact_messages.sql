-- ══════════════════════════════════════════════════════════════════════════
--
--   CONTACT MESSAGES. THE SECOND TABLE A STRANGER MAY WRITE TO.
--
-- ══════════════════════════════════════════════════════════════════════════
--
-- The same shape as `waitlist_signups` and for the same reason: a person
-- asking a question about the plans has no shop, no user and no session, so
-- the shop-scoping that protects every other table in this schema is simply
-- unavailable. What replaces it is written out rather than assumed.
--
--   NO READ PATH.    lib/repositories/contact.ts exports one write and one
--                    count. There is no find-by-email and no list, so the form
--                    cannot be turned into an oracle for "has this person
--                    written to them", and nothing renders a message back to
--                    any browser.
--   NO ENUMERATION.  Random uuid, not a sequence.
--   RLS ON.          Explicitly, below. Migration 0008 enables row-level
--                    security with a loop over pg_tables, which covered what
--                    existed when it ran and can cover nothing added since.
--   NO UNIQUENESS.   Deliberately unlike the waitlist. One person may ask two
--                    questions, and collapsing the second onto the first would
--                    silently discard it.
--
-- ── AND IT SAYS WHETHER ANYBODY HAS READ IT ──────────────────────────────
--
-- `handled_at` is null on arrival. It exists so that an operator surface — or
-- a person with psql, which is what there is today — can mark a message dealt
-- with without deleting it. A support table with no such column grows into a
-- list nobody can tell the state of.
--
-- NOTHING IS EMAILED. There is no email sender configured in this product
-- (domain/billing/trial.ts names the two variables it would need), so this
-- table IS the delivery mechanism, and the page says exactly that rather than
-- "we will be in touch shortly".

CREATE TABLE IF NOT EXISTS "contact_messages" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "subject" text NOT NULL,
  "message" text NOT NULL,
  -- Which page the question came from, so "Need help choosing?" on /pricing
  -- can be told from a question asked anywhere else. No cookies, no
  -- identifiers, no third party.
  "source" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  -- Null until somebody has dealt with it. Never used to delete the row.
  "handled_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "contact_messages_unhandled_idx"
  ON "contact_messages" ("created_at") WHERE "handled_at" IS NULL;

ALTER TABLE "contact_messages" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- The same bounds the route enforces, so the page's refusal and the
  -- database's agree rather than one being stricter than the other.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_email_check') THEN
    ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_email_check"
      CHECK (position('@' in "email") > 1 AND length("email") <= 320);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_body_check') THEN
    ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_body_check"
      CHECK (
        length("name") BETWEEN 1 AND 200
        AND length("subject") BETWEEN 1 AND 200
        AND length("message") BETWEEN 1 AND 5000
      );
  END IF;
END $$;

-- ── SELF-CHECK ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'contact_messages' AND relrowsecurity) THEN
    RAISE EXCEPTION 'contact_messages exists without row-level security';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_body_check') THEN
    RAISE EXCEPTION 'contact_messages accepts an unbounded message body';
  END IF;
  RAISE NOTICE 'APPLIED';
END $$;
