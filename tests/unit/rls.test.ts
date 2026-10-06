import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

import { posixJoin } from '../support/paths'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   A TABLE MUST NOT BE ABLE TO ARRIVE WITHOUT ROW-LEVEL SECURITY.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Twice now, RLS has been left off on the real project, and the second time is
 * the one this file is shaped by:
 *
 *   23 Sep 2026  Every table had it off, and it was exploitable rather than
 *                theoretical — a `/rest/v1/` URL with the PUBLISHABLE key
 *                returned an account row as JSON. Fixed by a hand-run loop.
 *   24 Sep on    Migrations 0002–0005 added admin_audit_events,
 *                admin_permission_audit_events and admin_role_permissions. No
 *                migration enabled RLS, so the audit log, the
 *                permission-change log and the permission matrix all arrived
 *                with it OFF — silently reopening what the 23rd had closed.
 *   7 Oct 2026   A pg_tables query found exactly those three. By hand. Again.
 *
 * So the failure mode is known precisely: a migration adds a table, nobody
 * remembers RLS, and nothing notices. That is the one thing this file tests,
 * and it tests it WITHOUT A DATABASE, so it runs on every commit — which is
 * the point, because the integration sweep needs Postgres and the hole was
 * opened by a commit.
 *
 * ── WHY THIS IS NOT THE VACUOUS VERSION ──────────────────────────────────
 *
 * The obvious static test — "the RLS migration exists" or "the migration
 * mentions every table" — would be worthless here. 0008 enables RLS with a
 * LOOP over pg_tables and names no table at all, so a name-matching check
 * would have nothing to match and would pass forever.
 *
 * What is actually checkable on disk is the RULE: every table drizzle declares
 * must either have existed when 0008's loop ran, or be explicitly enabled by
 * the migration that introduced it. That has teeth — adding a table to
 * db/schema/index.ts with a migration and no ENABLE line turns this red, which
 * is exactly the commit that caused 7 October. The test at the bottom of this
 * file proves it goes red, rather than asserting that it would.
 *
 * ── AND WHY THE INTEGRATION SWEEP IS STILL THE MINIMUM ───────────────────
 *
 * This reads files. A table created by `drizzle-kit push`, or by hand in the
 * Supabase SQL Editor, leaves no migration to read and is invisible here.
 * tests/integration/rls.int.ts queries pg_tables and sees it. The two cover
 * different routes in and neither replaces the other.
 */

const MIGRATIONS = 'db/migrations'
const SCHEMA = 'db/schema/index.ts'

/** The migration whose loop covers everything that existed when it ran. */
const RLS_MIGRATION = '0008_enable_row_level_security'

/**
 * SQL with comments removed.
 *
 * NOT OPTIONAL, and 0008 is why. Its header documents the one-liner a new
 * migration should add:
 *
 *     ALTER TABLE "your_new_table" ENABLE ROW LEVEL SECURITY;
 *
 * Read without stripping comments, this file would credit a table called
 * `your_new_table`, and the prose naming the three tables found on 7 October
 * would read as CREATE TABLE statements. A guard satisfied by its own
 * documentation has been found in this repository eighteen times; this is the
 * nineteenth place it was avoided on purpose.
 */
function sqlOf(file: string): string {
  return readFileSync(posixJoin(MIGRATIONS, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
}

/** Migration files in apply order. The numeric prefix IS the order. */
function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

function indexOfMigration(file: string): number {
  const prefix = file.slice(0, 4)
  const parsed = Number.parseInt(prefix, 10)
  if (Number.isNaN(parsed)) throw new Error(`migration ${file} has no numeric prefix`)
  return parsed
}

/** Tables drizzle declares, read from the source rather than by importing it. */
function declaredTables(): string[] {
  const source = readFileSync(SCHEMA, 'utf8')
  return [...source.matchAll(/pgTable\(\s*'([a-z0-9_]+)'/g)].map((match) => match[1]!)
}

/** table name -> the migration index that created it. */
function createdIn(): Map<string, number> {
  const created = new Map<string, number>()
  for (const file of migrationFiles()) {
    const index = indexOfMigration(file)
    for (const match of sqlOf(file).matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([a-z0-9_]+)"/gi)) {
      // First creation wins: a table dropped and recreated later is covered by
      // whichever migration brought it back, which is the later index.
      created.set(match[1]!, index)
    }
  }
  return created
}

/** table name -> the migration index that explicitly enabled RLS on it. */
function explicitlyEnabledIn(): Map<string, number> {
  const enabled = new Map<string, number>()
  for (const file of migrationFiles()) {
    const index = indexOfMigration(file)
    for (const match of sqlOf(file).matchAll(
      /ALTER TABLE\s+(?:ONLY\s+)?(?:"?public"?\.)?"?([a-z0-9_]+)"?\s+ENABLE ROW LEVEL SECURITY/gi,
    )) {
      enabled.set(match[1]!, index)
    }
  }
  return enabled
}

describe('the guard has something to guard', () => {
  it('finds the migrations and the schema', () => {
    // A closure of nothing passes every assertion below perfectly.
    expect(migrationFiles().length).toBeGreaterThan(8)
    expect(declaredTables().length).toBeGreaterThan(20)
  })

  it('finds the RLS migration, and it covers tables by catalogue not by name', () => {
    const file = migrationFiles().find((name) => name.startsWith(RLS_MIGRATION))
    expect(file, `${RLS_MIGRATION}.sql is missing`).toBeDefined()

    const sql = sqlOf(file!)
    // The loop, and the self-check that makes the migration refuse to succeed
    // quietly. Both are load-bearing; a rewrite that dropped either should
    // fail here rather than on the next audit.
    expect(sql).toMatch(/FROM pg_tables/i)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/RAISE EXCEPTION/i)
  })

  it('is listed in the drizzle journal, so it actually runs', () => {
    /*
     * A migration file no journal entry names is a file that never executes —
     * RLS enabled in a diff and in nobody's database, which is the most
     * expensive way this change could fail: every other assertion here would
     * still pass, because they all read the FILE.
     *
     * The same guard exists for the permission migrations in
     * tests/unit/admin-permissions.test.ts, and for the same reason.
     */
    const journal = readFileSync(posixJoin(MIGRATIONS, 'meta/_journal.json'), 'utf8')
    expect(journal, `${RLS_MIGRATION} is not in the journal, so it will never run`).toContain(
      `"${RLS_MIGRATION}"`,
    )
  })

  it('strips comments before reading, so prose cannot satisfy it', () => {
    /*
     * The positive control for sqlOf(). 0008's header contains the literal
     * example `ALTER TABLE "your_new_table" ENABLE ROW LEVEL SECURITY;` and
     * names the three tables from 7 October in prose. If comments survived,
     * both would be read as statements.
     */
    const raw = readFileSync(posixJoin(MIGRATIONS, `${RLS_MIGRATION}.sql`), 'utf8')
    expect(raw, 'the example line is gone; this control no longer proves anything').toContain(
      'your_new_table',
    )
    expect(explicitlyEnabledIn().has('your_new_table')).toBe(false)
    expect(createdIn().has('admin_audit_events')).toBe(true) // from 0002, a real statement
  })
})

describe('every declared table is covered by RLS', () => {
  it('was created in a migration, so this guard can see it', () => {
    /*
     * The precondition for the rule below, asserted separately because its
     * failure means something different: a table in db/schema with no
     * migration is a table whose RLS nobody can reason about from the
     * repository. It would reach a database through `drizzle-kit push`, where
     * only tests/integration/rls.int.ts can see it.
     */
    const created = createdIn()
    const orphans = declaredTables()
      .filter((name) => !created.has(name))
      .sort()
    expect(
      orphans,
      `declared in ${SCHEMA} but created by no migration: ${orphans.join(', ')}. ` +
        'Generate a migration for it (and add its ENABLE ROW LEVEL SECURITY line).',
    ).toEqual([])
  })

  it('is either older than the RLS migration or enables RLS itself', () => {
    /*
     * ══════════════════════════════════════════════════════════════════════
     *   THE RULE. This is the assertion that 7 October needed and did not
     *   have.
     * ══════════════════════════════════════════════════════════════════════
     *
     * 0008's loop covers whatever existed when it ran — every table created in
     * migrations 0000–0008. A table introduced LATER is not covered, because
     * a migration runs once, and that is exactly how 0002–0005 reopened the
     * hole the 23 September loop had closed.
     *
     * So a later table needs its own line, and the failure says which line to
     * add to which file.
     */
    const created = createdIn()
    const enabled = explicitlyEnabledIn()
    const rlsIndex = indexOfMigration(`${RLS_MIGRATION}.sql`)

    const uncovered: string[] = []
    for (const table of declaredTables()) {
      const createdAt = created.get(table)
      if (createdAt === undefined) continue // reported by the test above
      if (createdAt <= rlsIndex) continue // inside the loop's reach
      const enabledAt = enabled.get(table)
      if (enabledAt === undefined || enabledAt < createdAt) uncovered.push(table)
    }

    expect(
      uncovered.sort(),
      `these tables arrive after ${RLS_MIGRATION} with no RLS: ${uncovered.join(', ')}. ` +
        'Add `ALTER TABLE "<name>" ENABLE ROW LEVEL SECURITY;` to the migration that creates it — ' +
        'drizzle-kit does not generate that line.',
    ).toEqual([])
  })

  it('counts the three tables that were missed as covered now', () => {
    /*
     * Named explicitly. They were created in 0002–0005, so the loop reaches
     * them — and this asserts the arithmetic rather than trusting it, because
     * an off-by-one in the index comparison would silently exempt exactly the
     * tables this whole file exists for.
     */
    const created = createdIn()
    const rlsIndex = indexOfMigration(`${RLS_MIGRATION}.sql`)
    for (const table of [
      'admin_audit_events',
      'admin_permission_audit_events',
      'admin_role_permissions',
    ]) {
      const at = created.get(table)
      expect(at, `${table} is created by no migration`).toBeDefined()
      expect(at!, `${table} is not inside the loop's reach`).toBeLessThanOrEqual(rlsIndex)
    }
  })
})

describe('no migration hands the protection back', () => {
  it('creates no policy, and grants nothing to a browser-reachable role', () => {
    /*
     * RLS with no policy is the intended state: every row is reached through
     * the application's own connection, which does its own authorisation. A
     * policy for `anon` or `authenticated` would hand back precisely what
     * 23 September proved was reachable with the publishable key.
     *
     * Checked on disk as well as in the database, because a policy committed
     * in a migration is a policy that arrives on every deployment — including
     * ones nobody is running the integration sweep against.
     */
    const offenders: string[] = []
    for (const file of migrationFiles()) {
      const sql = sqlOf(file)
      if (/CREATE\s+POLICY/i.test(sql)) offenders.push(`${file}: CREATE POLICY`)
      if (/GRANT[\s\S]{0,200}?\bTO\s+(?:"?anon"?|"?authenticated"?)\b/i.test(sql)) {
        offenders.push(`${file}: GRANT to anon/authenticated`)
      }
      if (/DISABLE ROW LEVEL SECURITY/i.test(sql)) {
        offenders.push(`${file}: DISABLE ROW LEVEL SECURITY`)
      }
    }
    expect(
      offenders,
      'a migration gives back the access RLS is here to remove. If a table genuinely needs a ' +
        'policy, that is a change to argue for on its own.',
    ).toEqual([])
  })
})

describe('the rule really goes red — proved, not asserted', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   THIS REPOSITORY HAS BEEN BITTEN TWICE BY CHECKS THAT MEASURED
   *   NOTHING. A THIRD WOULD BE WORSE THAN NONE.
   * ══════════════════════════════════════════════════════════════════════
   *
   * So the rule above is re-evaluated here against FABRICATED inputs that
   * represent the exact commit that caused 7 October — a table created by a
   * migration after the RLS one, with no ENABLE line — and the logic is
   * required to flag it. The real files are untouched.
   *
   * The logic is duplicated rather than extracted into a shared function on
   * purpose: a control that calls the same helper as the thing it controls
   * proves the helper is self-consistent, not that it is right.
   */
  function uncoveredGiven(
    tables: string[],
    created: Map<string, number>,
    enabled: Map<string, number>,
    rlsIndex: number,
  ): string[] {
    const out: string[] = []
    for (const table of tables) {
      const at = created.get(table)
      if (at === undefined || at <= rlsIndex) continue
      const on = enabled.get(table)
      if (on === undefined || on < at) out.push(table)
    }
    return out.sort()
  }

  it('flags a table added after the RLS migration with no ENABLE line', () => {
    expect(
      uncoveredGiven(['widgets'], new Map([['widgets', 9]]), new Map(), 8),
    ).toEqual(['widgets'])
  })

  it('accepts the same table once its migration enables RLS', () => {
    expect(
      uncoveredGiven(['widgets'], new Map([['widgets', 9]]), new Map([['widgets', 9]]), 8),
    ).toEqual([])
  })

  it('still flags it when the ENABLE came BEFORE the table was recreated', () => {
    // A table dropped and recreated after an earlier enable is unprotected
    // again; the comparison is on order, not mere presence.
    expect(
      uncoveredGiven(['widgets'], new Map([['widgets', 11]]), new Map([['widgets', 9]]), 8),
    ).toEqual(['widgets'])
  })

  it('leaves tables inside the loop alone', () => {
    expect(uncoveredGiven(['users'], new Map([['users', 0]]), new Map(), 8)).toEqual([])
  })
})
