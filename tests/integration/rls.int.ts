import { beforeAll, describe, expect, it } from 'vitest'
import { getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'

import { getDb, schema } from '@/lib/db'

/**
 * Row-level security is on, everywhere, and nothing grants it away.
 *
 *     DATABASE_URL=postgres://... npm run test:integration
 *
 * ── WHY THIS TEST EXISTS, AND IT IS NOT A HYPOTHETICAL ───────────────────
 *
 * RLS has been left off by accident twice on the real project.
 *
 *   23 Sep 2026  Every table had it off, and it was exploitable rather than
 *                theoretical: a `/rest/v1/` URL loaded with the PUBLISHABLE
 *                key returned an account row as JSON. Fixed by hand.
 *   24 Sep on    Migrations 0002–0005 added three tables. No migration
 *                enabled RLS, so the audit log, the permission-change log and
 *                the permission matrix all arrived with it off.
 *   7 Oct 2026   A pg_tables query found exactly those three. By hand. Again.
 *
 * Both times the fix lived in a shell history. This is the check that was not
 * looking, and it is the LAST line of the three: db/migrations/0008 fixes the
 * tables that exist, tests/unit/rls.test.ts fails at commit time when a
 * migration adds one without RLS, and this one fails against a real database
 * whatever the route in — a migration, a `drizzle-kit push`, or somebody
 * running CREATE TABLE in the SQL Editor.
 *
 * That last route is why the static test cannot replace this one: a table
 * created outside the migration folder is invisible to a file reader and plain
 * as day to pg_tables.
 */

/** Rows of pg_tables for the schema that matters. */
interface TableRow {
  tablename: string
  rowsecurity: boolean
  /* db.execute<T> requires an index signature; the two fields above are the
   * ones this file reads. */
  [column: string]: unknown
}

let tables: TableRow[] = []
let bypassesRls: boolean | null = null

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'This test needs DATABASE_URL pointing at a migrated database. It is excluded from ' +
        '`npm test` for that reason — see the note at the top of this file.',
    )
  }

  const db = getDb()
  const listed = await db.execute<TableRow>(
    sql`select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
  )
  tables = [...listed] as unknown as TableRow[]

  const role = await db.execute<{ bypass: boolean | null }>(
    sql`select (select rolbypassrls from pg_roles where rolname = current_user) as bypass`,
  )
  bypassesRls = ([...role] as unknown as { bypass: boolean | null }[])[0]?.bypass ?? null
})

describe('the connecting role can still see its own data', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   WITHOUT BYPASSRLS, RLS WITH NO POLICY DOES NOT ERROR. IT RETURNS
   *   ZERO ROWS.
   * ══════════════════════════════════════════════════════════════════════
   *
   * Measured against a NON-superuser role, because a superuser bypasses RLS
   * for reasons that do not transfer to Supabase's `postgres`:
   *
   *   nosuperuser bypassrls    select count(*) from users  ->  5
   *   nosuperuser nobypassrls  select count(*) from users  ->  0
   *
   * Zero rows, silently. A deployment whose role lacks BYPASSRLS does not
   * crash — every screen says "no data" and nothing says why. So this is
   * asserted FIRST, and the row-count control below exists because a suite
   * reading an empty database would otherwise sail through most of its
   * assertions.
   */
  it('holds BYPASSRLS', () => {
    expect(
      bypassesRls,
      'the role in DATABASE_URL does not bypass RLS, so every query reads zero rows — ' +
        'do not apply db/migrations/0008 to this database until that is fixed',
    ).toBe(true)
  })

  it('reads rows through an RLS-enabled table, not an empty set', async () => {
    /*
     * THE POSITIVE CONTROL, and it is the assertion that stops this file
     * being self-satisfying. "Every table has RLS on" is also true of a
     * database the application can no longer read at all. One real SELECT,
     * against a table RLS is enabled on, returning something.
     */
    const rows = await getDb().select({ id: schema.users.id }).from(schema.users).limit(1)
    const usersRls = tables.find((t) => t.tablename === 'users')
    expect(usersRls?.rowsecurity, 'users has no RLS, so this control proves nothing').toBe(true)
    expect(rows.length, 'no rows readable from users — is BYPASSRLS missing?').toBeGreaterThan(0)
  })
})

describe('every table in public has row-level security enabled', () => {
  it('found tables to check', () => {
    // A check that runs against an empty catalogue passes perfectly and means
    // nothing. This repository has removed several of those.
    expect(tables.length, 'no tables in public — is this database migrated?').toBeGreaterThan(20)
  })

  it('leaves none of them unprotected', () => {
    const unprotected = tables.filter((t) => !t.rowsecurity).map((t) => t.tablename)
    /*
     * The failure NAMES the tables, because that is what makes it actionable.
     * On 7 October the answer was exactly three — admin_audit_events,
     * admin_permission_audit_events, admin_role_permissions — and knowing
     * which three is what identified the migrations that had introduced them.
     */
    expect(
      unprotected,
      `RLS is off on: ${unprotected.join(', ')}. ` +
        'Add `ALTER TABLE "<name>" ENABLE ROW LEVEL SECURITY;` to the migration that creates it, ' +
        'or re-run db/migrations/0008_enable_row_level_security.sql.',
    ).toEqual([])
  })

  it('covers the three tables that were missed on 7 October', () => {
    /*
     * Named explicitly as a regression guard. The general assertion above
     * subsumes these — and if somebody ever narrows it to a subset, or the
     * catalogue query drifts, these three are the ones whose absence has
     * actually cost something.
     */
    for (const name of [
      'admin_audit_events',
      'admin_permission_audit_events',
      'admin_role_permissions',
    ]) {
      const row = tables.find((t) => t.tablename === name)
      expect(row, `${name} is not in public at all`).toBeDefined()
      expect(row?.rowsecurity, `${name} is the table this was found on; RLS is off again`).toBe(
        true,
      )
    }
  })
})

describe('no policy gives the protection back', () => {
  /*
   * RLS with no policy means only a BYPASSRLS role reads anything, which is
   * the intended state: every row here is reached through the application's
   * own connection, and the application does its own authorisation. A policy
   * granting `anon` or `authenticated` would hand back precisely what
   * 23 September proved was reachable with the publishable key.
   */
  it('has no policies at all', async () => {
    const found = await getDb().execute<{ tablename: string; policyname: string; roles: string }>(
      sql`select tablename, policyname, roles::text as roles from pg_policies where schemaname = 'public' order by tablename, policyname`,
    )
    const policies = [...found] as unknown as { tablename: string; policyname: string }[]
    expect(
      policies.map((p) => `${p.tablename}.${p.policyname}`),
      'a policy exists. If some table genuinely needs one, that is a change to argue for ' +
        'on its own — and this test is where the argument has to be made.',
    ).toEqual([])
  })

  it('and specifically none that names anon, authenticated or public', async () => {
    /*
     * The converse of the above, kept separate on purpose. If a deliberate
     * policy is ever added for a privileged role, the assertion above becomes
     * a judgement call — this one never does. These three role names are the
     * ones reachable from a browser with a key that is public by design.
     */
    const found = await getDb().execute<{ tablename: string; policyname: string; roles: string }>(
      sql`select tablename, policyname, roles::text as roles from pg_policies
            where schemaname = 'public'
              and (roles::text[] && array['anon','authenticated','public'])`,
    )
    const exposed = [...found] as unknown as { tablename: string; policyname: string }[]
    expect(
      exposed.map((p) => `${p.tablename}.${p.policyname}`),
      'a policy grants a browser-reachable role access to these rows',
    ).toEqual([])
  })
})

describe('the schema and the catalogue agree', () => {
  it('every table drizzle declares exists in the database', async () => {
    /*
     * Not strictly an RLS assertion, and it is here because it is what makes
     * the RLS one trustworthy. A table declared in db/schema but absent from
     * the database is a table this file cannot check — the sweep would report
     * green while the application, on a database where that table DID exist,
     * read it unprotected.
     */
    /*
     * Drizzle's own `is(value, PgTable)` and getTableName(), rather than
     * reaching into the internal `_` property. The exported schema object also
     * holds relations() results, which are not tables and have no name — a
     * duck-typed filter would either include them or quietly drop a table the
     * day drizzle renames an internal field.
     */
    const declared = Object.values(schema).flatMap((value) =>
      is(value, PgTable) ? [getTableName(value)] : [],
    )

    const present = new Set(tables.map((t) => t.tablename))
    const missing = [...new Set(declared)].filter((name) => !present.has(name)).sort()
    expect(missing, `declared in db/schema but not in the database: ${missing.join(', ')}`).toEqual(
      [],
    )
  })
})
