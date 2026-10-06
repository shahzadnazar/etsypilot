-- Enable row-level security on every table in `public`.
--
-- ═══════════════════════════════════════════════════════════════════════════
--   THIS HAS BEEN LEFT OFF BY ACCIDENT TWICE. THE SECOND TIME WAS FOUND BY
--   HAND, BECAUSE NOTHING IN THIS REPOSITORY WAS LOOKING.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 23 Sep 2026   Every table had RLS off, and it was exploitable rather than
--               theoretical: a `/rest/v1/` URL loaded with the PUBLISHABLE key
--               returned an account row as JSON. Closed by running an
--               `alter table … enable row level security` loop by hand in the
--               Supabase SQL Editor.
--
-- 24 Sep on     Migrations 0002–0005 added `admin_audit_events`,
--               `admin_permission_audit_events` and `admin_role_permissions`.
--               No migration enabled RLS, so all three arrived with it OFF —
--               the audit log, the permission-change log, and the permission
--               matrix itself.
--
-- 7 Oct 2026    A `pg_tables` query returned exactly those three as
--               `rowsecurity = false`. Found by hand again. Fixed by hand
--               again.
--
-- A fix that lives in a shell history closes today's hole and guarantees
-- tomorrow's. This migration is that fix written down; two tests keep it true
-- (see the bottom of this file).
--
-- ── NO POLICIES, AND THAT IS THE WHOLE POINT ──────────────────────────────
--
-- RLS with no policy means: every role except one holding BYPASSRLS sees
-- nothing. That is exactly right for every table here, because every row in
-- this database is reached through the application's own connection
-- (DATABASE_URL) and the application does its own authorisation —
-- `shopContext()` is the seller-isolation boundary, and `getAdminAccess()` the
-- operator one. There is no caller that should reach these rows directly, so
-- there is nothing for a policy to permit.
--
-- A policy granting `anon` or `authenticated` any access would hand back
-- exactly what 23 September proved was reachable. If some table ever genuinely
-- needs one, that is a change to argue for on its own, not a line to add here.
--
-- ── WHAT THIS DEPENDS ON, MEASURED RATHER THAN ASSUMED ────────────────────
--
-- The role in DATABASE_URL must hold BYPASSRLS. Supabase's `postgres` role
-- does; a custom role may not. Tested locally against a NON-superuser role to
-- match Supabase's, because a superuser bypasses RLS for reasons that would not
-- transfer:
--
--   nosuperuser bypassrls    select count(*) from users  ->  5
--   nosuperuser nobypassrls  select count(*) from users  ->  0
--
-- NOTE THE SECOND ROW. It is not an error — it is ZERO ROWS. A deployment whose
-- role lacks BYPASSRLS does not crash; it quietly reads an empty database, and
-- every screen says "no data" with nothing anywhere saying why. Before applying
-- this to a project, run:
--
--   select current_user,
--          (select rolbypassrls from pg_roles where rolname = current_user);
--
-- and only continue if the second column is `t`.
--
-- ── RE-RUNNABLE, AND NAMES NO TABLE ───────────────────────────────────────
--
-- `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is already idempotent in Postgres —
-- enabling it on a table that has it is accepted and changes nothing — so
-- re-running this whole block is harmless. The loop reads the catalogue rather
-- than a list, so it covers the 27 tables that exist today and anything added
-- before it runs, with no list to forget to update.
--
-- Views, materialised views, foreign tables and partitions are not included:
-- `pg_tables` lists ordinary tables, and RLS belongs on the table that holds
-- the rows. `drizzle.__drizzle_migrations` is in its own schema and is not
-- touched — it holds migration hashes, not data about anybody.
DO $$
DECLARE
  target text;
BEGIN
  FOR target IN
    SELECT quote_ident(schemaname) || '.' || quote_ident(tablename)
      FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename
  LOOP
    EXECUTE 'ALTER TABLE ' || target || ' ENABLE ROW LEVEL SECURITY';
  END LOOP;
END
$$;
--> statement-breakpoint
-- A migration that silently did nothing would be the same failure in a new
-- costume, so this one refuses to succeed unless it worked. `pg_tables` is read
-- back rather than trusted: if any table in `public` is still unprotected when
-- this block runs, the migration raises and the deploy stops.
DO $$
DECLARE
  unprotected text[];
BEGIN
  SELECT array_agg(tablename ORDER BY tablename) INTO unprotected
    FROM pg_tables
   WHERE schemaname = 'public' AND NOT rowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION
      'RLS is still disabled on: %. This migration did not do its job.',
      array_to_string(unprotected, ', ');
  END IF;
END
$$;
--> statement-breakpoint
-- ── WHAT KEEPS THIS TRUE AFTER TODAY ─────────────────────────────────────
--
-- This migration runs ONCE. A table added by a later migration is not covered
-- by the loop above, which is precisely how 0002–0005 reopened the hole the
-- 23 September fix had closed. Two tests exist for that, and they catch
-- different routes in:
--
--   tests/integration/rls.int.ts    Queries pg_tables against a real database
--                                   and fails if any table in `public` has
--                                   rowsecurity = false. Catches drift from
--                                   ANY source — a migration, a `drizzle-kit
--                                   push`, or a hand-run CREATE TABLE.
--
--   tests/unit/rls.test.ts          Reads every table in db/schema/index.ts
--                                   and every CREATE TABLE in db/migrations,
--                                   and fails if a table arrives in a
--                                   migration LATER than this one without its
--                                   own ENABLE ROW LEVEL SECURITY. Catches it
--                                   at commit time, with no database.
--
-- SO: IF YOU ADD A TABLE, ADD ONE LINE TO ITS MIGRATION.
--
--   ALTER TABLE "your_new_table" ENABLE ROW LEVEL SECURITY;
--
-- drizzle-kit does not generate that line. The unit test is what tells you.
SELECT 1;
