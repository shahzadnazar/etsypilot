import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  EDITABLE_ROLES,
  NON_DELEGATABLE,
  PERMISSION_LABELS,
  isEditableRole,
  parsePermissionKeys,
  resolvePermissions,
  sortPermissions,
} from '@/domain/admin/permissions'
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PLATFORM_ROLES,
  SUPER_ADMIN_ONLY,
} from '@/domain/admin/roles'
import { visibleOperatorNav } from '@/domain/admin/navigation'
import {
  describePermissionOutcome,
  flattenPermissionOutcome,
  mergeAuditEntries,
  rebuildPermissionOutcome,
} from '@/domain/admin/audit'
import { LIMITS, resetRateLimits } from '@/lib/security/rate-limit'

/*
 * THE EDITABLE MATRIX.
 *
 * A permission screen that changes nothing is worse than no permission screen,
 * so the tests are weighted towards two questions:
 *
 *   does the stored set actually decide?    (enforcement, in admin-gate)
 *   can this screen grant what it must not? (here)
 */

/** Source with comments stripped — a guard must not be satisfied by prose. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

/* ─────────────────── the seeded defaults match A1 exactly ────────────────── */

/**
 * Every permission key each migration grants to each role.
 *
 * A6 turned this from "read 0005" into "read them all", because a permission
 * added later is granted by a LATER migration and a guard pinned to the first
 * one would report the new key as ungranted. Reading every migration is also
 * the stricter question: it catches a later file quietly granting MANAGER
 * something, which pinning to 0005 never could.
 *
 * SPLIT BY STATEMENT, THEN BY ROLE, because 0005 grants ADMIN and MANAGER in
 * ONE insert — a statement-level split alone would credit ADMIN with MANAGER's
 * row and the MANAGER guard would stop meaning anything. Within a statement,
 * each role literal owns the text up to the next one; a statement naming a
 * single role owns all of it, which is how 0006's UPDATE is read.
 */
function grantsByRole(sql: string): Map<string, Set<string>> {
  const grants = new Map<string, Set<string>>()
  const statements = sql.replace(/--.*$/gm, '').split(';')

  for (const statement of statements) {
    const marks = [...statement.matchAll(/'(SUPER_ADMIN|ADMIN|MANAGER|USER)'/g)]
    marks.forEach((mark, index) => {
      const from = index === 0 ? 0 : (mark.index ?? 0)
      const to = marks[index + 1]?.index ?? statement.length
      const role = mark[1] as string
      const keys = statement.slice(from, to).match(/'[a-z]+(?:\.[a-z]+)+'/g) ?? []
      const set = grants.get(role) ?? new Set<string>()
      for (const key of keys) set.add(key.replaceAll("'", ''))
      grants.set(role, set)
    })
  }
  return grants
}

describe('the seeded matrix grants exactly what the code knows about', () => {
  const files = readdirSync('db/migrations')
    .filter((name) => name.endsWith('.sql'))
    .sort()

  const touching = files
    .map((name) => ({ name, sql: readFileSync(join('db/migrations', name), 'utf8') }))
    .filter((file) => file.sql.includes('admin_role_permissions'))

  /** The union across every migration, which is what a fresh database ends at. */
  const granted = new Map<string, Set<string>>()
  for (const file of touching) {
    for (const [role, keys] of grantsByRole(file.sql)) {
      const set = granted.get(role) ?? new Set<string>()
      for (const key of keys) set.add(key)
      granted.set(role, set)
    }
  }

  it('finds the migrations it is meant to be reading', () => {
    // A sweep over an empty file list passes perfectly.
    expect(touching.map((file) => file.name).length).toBeGreaterThanOrEqual(2)
  })

  it('GRANTS ADMIN EVERY KEY THE CODE KNOWS ABOUT', () => {
    /*
     * The check that catches a permission added to PERMISSIONS later with no
     * matching migration. Without it the new key would silently be absent from
     * ADMIN's row — a permission that exists in the type system and is granted
     * to nobody, which looks exactly like a deliberate revocation.
     *
     * Equality, not containment, so it also catches the other direction: a
     * migration granting a key the code has since removed leaves a row the
     * parser will reject in full (resolvePermissions filters through
     * PERMISSIONS), and the operator would see permissions vanish with nothing
     * to read that explained it.
     */
    expect(granted.get('ADMIN')).toEqual(new Set(PERMISSIONS))
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).toEqual([...PERMISSIONS])
  })

  it('GRANTS MANAGER users.view and nothing else, in any migration', () => {
    /*
     * Across every file, not just 0005. financials.view is the reason this is
     * worth its own assertion: a manager is a promoted seller, and the
     * migration that granted the key to ADMIN is exactly where it would have
     * been easiest to add MANAGER too.
     */
    expect(granted.get('MANAGER')).toEqual(new Set(['users.view']))
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).toEqual(['users.view'])
  })

  it('seeds NO row for SUPER_ADMIN, in any migration', () => {
    // Its set is never read from the store. A row would invite editing one.
    expect(granted.has('SUPER_ADMIN')).toBe(false)
    for (const file of touching) {
      expect(file.sql, file.name).not.toContain("('SUPER_ADMIN'")
    }
  })

  it('0005 still seeds the seven it shipped with, in declaration order', () => {
    /*
     * Pinned to the literal rather than to PERMISSIONS, which is the point: a
     * migration is a record of what a deployed database was told, and it does
     * not change when the code does. If this ever goes red, an existing
     * migration has been edited — which is the thing "additive only" forbids.
     */
    const a1 = [
      'users.view',
      'users.detail',
      'subscriptions.view',
      'usage.view',
      'ai.view',
      'etsy.view',
      'operations.view',
    ]
    const sql = readFileSync('db/migrations/0005_low_captain_universe.sql', 'utf8')
    expect(sql).toContain(`('ADMIN', ARRAY[${a1.map((key) => `'${key}'`).join(',')}])`)
    expect(sql).toContain("('MANAGER', ARRAY['users.view'])")
    // And they are still the first seven of PERMISSIONS, in the same order.
    expect([...PERMISSIONS].slice(0, a1.length)).toEqual(a1)
  })

  it('cannot overwrite a matrix an operator has since edited', () => {
    /*
     * A migration that reset permissions on every deploy would be a permission
     * screen that changes nothing, slowly. Every file that touches the table
     * has to say how it avoids that: the seed by ON CONFLICT DO NOTHING, a
     * later grant by refusing to append a key the row already holds.
     */
    for (const file of touching) {
      const guarded =
        file.sql.includes('ON CONFLICT ("role") DO NOTHING') ||
        /NOT \('[a-z.]+' = ANY\("permissions"\)\)/.test(file.sql)
      expect(guarded, file.name).toBe(true)
    }
  })

  it('adds only new tables, changing no existing column', () => {
    for (const file of touching) {
      expect(file.sql, file.name).not.toContain('ALTER TABLE')
      expect(file.sql, file.name).not.toContain('DROP')
    }
  })

  it('is listed in the drizzle journal, so it actually runs', () => {
    /*
     * A migration file that no journal entry names is a file that never
     * executes — a permission granted in a diff and in nobody's database.
     */
    const journal = readFileSync('db/migrations/meta/_journal.json', 'utf8')
    for (const file of touching) {
      expect(journal, file.name).toContain(`"${file.name.replace(/\.sql$/, '')}"`)
    }
  })
})

/* ──────────── the non-delegatable pair cannot enter the matrix ───────────── */

describe('audit.view and roles.write cannot be granted here', () => {
  it('are not in PERMISSIONS, so nothing that iterates it can render them', () => {
    for (const capability of SUPER_ADMIN_ONLY) {
      expect(PERMISSIONS as readonly string[], capability).not.toContain(capability)
    }
  })

  it('HAS NO LABEL, so a checkbox for one could not even be drawn', () => {
    /*
     * The matrix renders `PERMISSION_LABELS[permission].title`. That record is
     * keyed by Permission, so adding a checkbox for roles.write means adding a
     * label for it, and the type refuses. Stated as its own test because it is
     * the mechanical reason the screen cannot show them, as opposed to the
     * policy reason.
     */
    for (const capability of SUPER_ADMIN_ONLY) {
      expect(Object.keys(PERMISSION_LABELS), capability).not.toContain(capability)
    }
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...PERMISSIONS].sort())
  })

  it('is the SAME list the screens render as absent', () => {
    /*
     * The matrix names these two so their absence reads as a decision rather
     * than a gap. That list is re-exported from SUPER_ADMIN_ONLY rather than
     * retyped, so a third non-delegatable capability added later appears on
     * the screen automatically — a hand-written copy would silently stop
     * matching and the screen would quietly under-report.
     */
    expect([...NON_DELEGATABLE]).toEqual([...SUPER_ADMIN_ONLY])
  })

  it('is REFUSED by the parser, not quietly dropped', () => {
    /*
     * Dropping would answer a tampered request with a cheerful success and an
     * audit record that never mentioned the attempt. Refusing puts it in the
     * log as a refusal, which is the whole argument for recording refusals.
     */
    for (const capability of SUPER_ADMIN_ONLY) {
      expect(parsePermissionKeys([capability]), capability).toBeNull()
      expect(parsePermissionKeys(['users.view', capability]), capability).toBeNull()
    }
  })

  it('is filtered out on the way back from the store', () => {
    // The last of three barriers: holds even if a row acquires one by a direct
    // UPDATE or a bad migration.
    const resolved = resolvePermissions('MANAGER', ['users.view', 'roles.write', 'audit.view'])
    expect(resolved).toEqual(['users.view'])
  })

  it('appears in no checkbox on either permission screen', () => {
    /*
     * The screens are swept as well as the types, because a literal
     * <input value="roles.write"> would bypass the iteration entirely.
     */
    const files = [
      join('app', '(admin)', 'admin', 'permissions', 'page.tsx'),
      join('app', '(admin)', 'admin', 'permissions', '[role]', 'page.tsx'),
    ]
    for (const file of files) {
      /*
       * The GATE on both pages is `canSuperAdminOnly('roles.write')`, so a
       * bare search for the string matches the very check that keeps ADMINs
       * out — the first version of this test failed on exactly that, which is
       * the "guard matched its own guard" shape this area keeps producing.
       * What must not appear is either capability in a VALUE position.
       */
      const source = code(file).replace(/canSuperAdminOnly\([^)]*\)/g, 'GATE')
      for (const capability of SUPER_ADMIN_ONLY) {
        expect(source, `${file} value ${capability}`).not.toContain(`value="${capability}"`)
        expect(source, `${file} value ${capability}`).not.toContain(`value={'${capability}'}`)
        expect(source, `${file} literal ${capability}`).not.toContain(`'${capability}'`)
      }
      // And the checkbox list is PERMISSIONS, not something hand-written.
      if (file.includes('[role]')) {
        expect(source, file).toContain('PERMISSIONS.map(')
        expect(source, file).toContain("name=\"permissions\"")
        expect(source, file).toContain('value={permission}')
      }
    }
  })
})

/* ───────────────────────── SUPER_ADMIN is not editable ───────────────────── */

describe('SUPER_ADMIN cannot be edited, and cannot lock itself out', () => {
  it('offers exactly ADMIN and MANAGER', () => {
    expect([...EDITABLE_ROLES]).toEqual(['ADMIN', 'MANAGER'])
    expect(EDITABLE_ROLES as readonly string[]).not.toContain('SUPER_ADMIN')
    expect(EDITABLE_ROLES as readonly string[]).not.toContain('USER')
  })

  it('refuses to parse SUPER_ADMIN as an editable role', () => {
    for (const value of ['SUPER_ADMIN', 'USER', 'OWNER', 'admin', '', null, undefined, 7, ['ADMIN']]) {
      expect(isEditableRole(value), JSON.stringify(value)).toBe(false)
    }
    expect(isEditableRole('ADMIN')).toBe(true)
    expect(isEditableRole('MANAGER')).toBe(true)
  })

  it('gives SUPER_ADMIN every permission whatever the store says', () => {
    /*
     * The lock-out guard. If a stored empty set could apply to SUPER_ADMIN,
     * one save would remove the only account able to undo it — and the way
     * back would be editing an environment variable and restarting.
     */
    expect(resolvePermissions('SUPER_ADMIN', [])).toEqual([...PERMISSIONS])
    expect(resolvePermissions('SUPER_ADMIN', ['users.view'])).toEqual([...PERMISSIONS])
    expect(resolvePermissions('SUPER_ADMIN', null)).toEqual([...PERMISSIONS])
  })

  it('types the WRITE so SUPER_ADMIN does not compile', () => {
    /*
     * Scoped to applyRolePermissions. readStoredPermissions() legitimately
     * takes a PlatformRole — reading SUPER_ADMIN's (absent) row is harmless
     * and resolvePermissions ignores it. Asserting against the whole file
     * conflated the two and failed on the read.
     */
    const source = code('lib/repositories/admin-permissions.ts')
    const write = source.slice(source.indexOf('export async function applyRolePermissions'))
    expect(write).toContain('role: EditableRole')
    expect(write).not.toContain('role: PlatformRole')
    expect(write).not.toContain('role: string')
  })
})

/* ──────────────────── null row versus a deliberately empty set ───────────── */

describe('no row and an empty set are different answers', () => {
  it('uses the defaults when nobody has configured the role', () => {
    expect(resolvePermissions('ADMIN', null)).toEqual([...PERMISSIONS])
    expect(resolvePermissions('MANAGER', null)).toEqual(['users.view'])
  })

  it('honours a deliberately emptied set rather than refilling it', () => {
    /*
     * The difference that decides whether the screen works at all. Treating []
     * as "unconfigured" would make every revocation silently undo itself.
     */
    expect(resolvePermissions('ADMIN', [])).toEqual([])
    expect(resolvePermissions('MANAGER', [])).toEqual([])
  })

  it('gives USER nothing from any stored value', () => {
    expect(resolvePermissions('USER', [...PERMISSIONS])).toEqual([])
    expect(resolvePermissions('USER', null)).toEqual([])
  })

  it('classifies every role, so a new one cannot default to all-access', () => {
    for (const role of PLATFORM_ROLES) {
      const resolved = resolvePermissions(role, null)
      expect(Array.isArray(resolved), role).toBe(true)
      for (const permission of resolved) {
        expect(PERMISSIONS as readonly string[], `${role}:${permission}`).toContain(permission)
      }
    }
  })
})

/* ────────────────────────────── parsing the form ─────────────────────────── */

describe('the single door from a form to a permission set', () => {
  it('accepts every known key, in canonical order whatever order they arrive in', () => {
    const scrambled = ['operations.view', 'users.view', 'ai.view']
    expect(parsePermissionKeys(scrambled)).toEqual(['users.view', 'ai.view', 'operations.view'])
  })

  it('accepts an empty submission, because revoking everything is a real thing to say', () => {
    // A checkbox group submits nothing at all when every box is cleared.
    expect(parsePermissionKeys([])).toEqual([])
  })

  it('collapses duplicates rather than storing a key twice', () => {
    expect(parsePermissionKeys(['users.view', 'users.view'])).toEqual(['users.view'])
  })

  it('refuses anything else a request could carry', () => {
    for (const values of [
      ['users.View'],
      [' users.view '],
      ['users.view', 'nonsense'],
      [42],
      [null],
      [['users.view']],
      [{ permission: 'users.view' }],
    ]) {
      expect(parsePermissionKeys(values as unknown[]), JSON.stringify(values)).toBeNull()
    }
  })

  it('sorts into PERMISSIONS order, not alphabetical', () => {
    // So a stored set and an audit record never differ merely by the order the
    // browser happened to submit the boxes in.
    expect(sortPermissions(['operations.view', 'users.view'])).toEqual([
      'users.view',
      'operations.view',
    ])
  })
})

/* ──────────────────────── the permission audit record ────────────────────── */

describe('a permission record carries its own before and after', () => {
  it('round-trips an applied change', () => {
    const flat = flattenPermissionOutcome({
      kind: 'APPLIED',
      from: ['users.view'],
      to: ['users.view', 'ai.view'],
    })
    expect(flat.outcomeKind).toBe('APPLIED')
    expect(rebuildPermissionOutcome(flat)).toEqual({
      kind: 'APPLIED',
      from: ['users.view'],
      to: ['users.view', 'ai.view'],
    })
  })

  it('round-trips a refusal, keeping what was attempted', () => {
    const flat = flattenPermissionOutcome({
      kind: 'REFUSED',
      reason: 'WRONG_PASSWORD',
      attempted: ['users.view'],
    })
    expect(flat.fromPermissions).toBeNull()
    expect(rebuildPermissionOutcome(flat)).toEqual({
      kind: 'REFUSED',
      reason: 'WRONG_PASSWORD',
      attempted: ['users.view'],
    })
  })

  it('distinguishes an APPLIED empty set from a corrupt row', () => {
    /*
     * "Revoked everything" is a real record and must survive the round trip;
     * a row with no `to` at all is unreadable. Both look like absence in SQL,
     * which is why one is [] and the other is NULL.
     */
    const emptied = flattenPermissionOutcome({ kind: 'APPLIED', from: ['users.view'], to: [] })
    expect(rebuildPermissionOutcome(emptied)).toEqual({
      kind: 'APPLIED',
      from: ['users.view'],
      to: [],
    })
    expect(
      rebuildPermissionOutcome({
        outcomeKind: 'APPLIED',
        fromPermissions: ['users.view'],
        toPermissions: null,
        refusalReason: null,
      }),
    ).toBeNull()
  })

  it('never renders a non-delegatable capability as though it had been granted', () => {
    const rebuilt = rebuildPermissionOutcome({
      outcomeKind: 'APPLIED',
      fromPermissions: [],
      toPermissions: ['users.view', 'roles.write'],
      refusalReason: null,
    })
    expect(rebuilt).toEqual({ kind: 'APPLIED', from: [], to: ['users.view'] })
  })

  it('derives the sentence from the two sets', () => {
    expect(describePermissionOutcome({ kind: 'APPLIED', from: [], to: ['users.view'] })).toBe(
      'Granted 1 permission',
    )
    expect(describePermissionOutcome({ kind: 'APPLIED', from: ['users.view'], to: [] })).toBe(
      'Revoked 1 permission',
    )
    expect(
      describePermissionOutcome({ kind: 'APPLIED', from: ['users.view'], to: ['ai.view'] }),
    ).toBe('Granted 1, revoked 1')
    expect(
      describePermissionOutcome({ kind: 'APPLIED', from: ['users.view'], to: ['users.view'] }),
    ).toBe('No change')
  })
})

describe('the two logs merge into one', () => {
  const role = {
    id: 'r1',
    at: new Date('2026-01-02T00:00:00Z'),
    actorId: 'a',
    actorEmail: 'a@x.com',
    actorRole: 'SUPER_ADMIN' as const,
    targetId: 't',
    targetEmail: 't@x.com',
    outcome: { kind: 'APPLIED' as const, from: 'USER' as const, to: 'MANAGER' as const },
  }
  const permission = {
    id: 'p1',
    at: new Date('2026-01-03T00:00:00Z'),
    actorId: 'a',
    actorEmail: 'a@x.com',
    actorRole: 'SUPER_ADMIN' as const,
    subjectRole: 'MANAGER' as const,
    outcome: { kind: 'APPLIED' as const, from: [], to: ['users.view' as const] },
  }

  it('interleaves both stores newest first', () => {
    const merged = mergeAuditEntries([role], [permission])
    expect(merged.map((entry) => entry.kind)).toEqual(['PERMISSIONS', 'ROLE'])
  })

  it('keeps each entry distinguishable rather than flattening one into the other', () => {
    const merged = mergeAuditEntries([role], [permission])
    const first = merged[0]
    expect(first?.kind).toBe('PERMISSIONS')
    if (first?.kind === 'PERMISSIONS') expect(first.event.subjectRole).toBe('MANAGER')
  })

  it('is stable when two records share a timestamp', () => {
    // Otherwise the order would depend on how the two queries happened to
    // interleave, and the log would reshuffle between renders.
    const same = { ...permission, at: role.at }
    const once = mergeAuditEntries([role], [same]).map((entry) => entry.id)
    const twice = mergeAuditEntries([role], [same]).map((entry) => entry.id)
    expect(once).toEqual(twice)
  })
})

/* ──────────────── the write path: gates, order, and the transaction ──────── */

const calls = vi.hoisted(() => ({
  access: null as null | { userId: string; email: string; role: string },
  stored: { ADMIN: [] as string[], MANAGER: [] as string[] },
  verify: [] as { email: string; password: string }[],
  writes: [] as { role: string; permissions: string[] }[],
  audit: [] as Record<string, unknown>[],
  writeThrows: false,
  verifyResult: { ok: true } as { ok: boolean; reason?: string },
  order: [] as string[],
}))

vi.mock('@/domain/admin/access', () => ({
  requireAdmin: async () => {
    if (!calls.access) throw new Error('NEXT_NOT_FOUND')
    const role = calls.access.role
    return {
      ...calls.access,
      permissions: [],
      can: () => true,
      canSuperAdminOnly: () => role === 'SUPER_ADMIN',
    }
  },
}))
vi.mock('@/lib/repositories/admin-permissions', () => ({
  /*
   * ONE call does the read, the write and the audit insert, because in the
   * real thing they are one transaction. The mock mirrors that: when it
   * throws it records neither, the way a rollback looks from out here.
   */
  applyRolePermissions: async (input: { role: 'ADMIN' | 'MANAGER'; permissions: string[]; actor: Record<string, string> }) => {
    if (calls.writeThrows) {
      calls.order.push('write-rolled-back')
      throw new Error('audit insert failed; transaction rolled back')
    }
    const from = [...calls.stored[input.role]]
    calls.order.push('write')
    calls.writes.push({ role: input.role, permissions: [...input.permissions] })
    calls.stored[input.role] = [...input.permissions]
    calls.order.push('audit')
    calls.audit.push({
      actor: input.actor,
      subjectRole: input.role,
      outcome: { kind: 'APPLIED', from, to: [...input.permissions] },
    })
    return { from }
  },
  appendPermissionAuditEvent: async (input: Record<string, unknown>) => {
    calls.order.push('audit')
    calls.audit.push(input)
  },
}))
vi.mock('@/lib/auth/step-up', () => ({
  verifyPassword: async (email: string, password: string) => {
    calls.order.push('verify')
    calls.verify.push({ email, password })
    return calls.verifyResult
  },
}))

const { changeRolePermissions } = await import('@/domain/admin/permission-change')

function fresh(): void {
  resetRateLimits()
  calls.stored = { ADMIN: [...PERMISSIONS], MANAGER: ['users.view'] }
  calls.verify = []
  calls.writes = []
  calls.audit = []
  calls.order = []
  calls.writeThrows = false
  calls.verifyResult = { ok: true }
  calls.access = { userId: 'u-actor', email: 'actor@x.com', role: 'SUPER_ADMIN' }
}

const SAVE = { role: 'MANAGER', permissions: ['users.view', 'ai.view'], password: 'correct' }

describe('who may change permissions', () => {
  beforeEach(fresh)

  it('lets a SUPER_ADMIN save, and records before and after', async () => {
    const result = await changeRolePermissions(SAVE)

    expect(result).toEqual({
      ok: true,
      role: 'MANAGER',
      from: ['users.view'],
      to: ['users.view', 'ai.view'],
    })
    expect(calls.writes).toEqual([{ role: 'MANAGER', permissions: ['users.view', 'ai.view'] }])
    expect(calls.audit[0]).toMatchObject({
      subjectRole: 'MANAGER',
      outcome: { kind: 'APPLIED', from: ['users.view'], to: ['users.view', 'ai.view'] },
    })
    // Verified, then written and recorded together.
    expect(calls.order).toEqual(['verify', 'write', 'audit'])
  })

  it('lets a SUPER_ADMIN revoke everything', async () => {
    const result = await changeRolePermissions({ role: 'MANAGER', permissions: [], password: 'p' })
    expect(result).toMatchObject({ ok: true, to: [] })
    expect(calls.writes).toEqual([{ role: 'MANAGER', permissions: [] }])
  })

  for (const role of ['ADMIN', 'MANAGER'] as const) {
    it(`refuses a ${role}, writes nothing, and never checks their password`, async () => {
      calls.access = { userId: 'u', email: 'other@x.com', role }
      const result = await changeRolePermissions(SAVE)

      expect(result).toEqual({ ok: false, reason: 'NOT_PERMITTED' })
      expect(calls.writes).toEqual([])
      // The oracle property: a refused operator must not learn whether they
      // typed their own password correctly.
      expect(calls.verify).toEqual([])
      expect(calls.audit[0]).toMatchObject({
        outcome: { kind: 'REFUSED', reason: 'NOT_PERMITTED' },
      })
    })
  }

  it('refuses a caller with no admin access, and writes no audit row', async () => {
    calls.access = null
    await expect(changeRolePermissions(SAVE)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(calls.audit).toEqual([])
    expect(calls.writes).toEqual([])
  })

  it('refuses SUPER_ADMIN as a subject, before any network call', async () => {
    const result = await changeRolePermissions({
      role: 'SUPER_ADMIN',
      permissions: [],
      password: 'p',
    })
    expect(result).toEqual({ ok: false, reason: 'ROLE_NOT_EDITABLE' })
    expect(calls.writes).toEqual([])
    expect(calls.verify).toEqual([])
  })

  it('refuses a non-delegatable key, and records the attempt', async () => {
    const result = await changeRolePermissions({
      role: 'MANAGER',
      permissions: ['users.view', 'roles.write'],
      password: 'p',
    })
    expect(result).toEqual({ ok: false, reason: 'INVALID_PERMISSION' })
    expect(calls.writes).toEqual([])
    expect(calls.verify).toEqual([])
    expect(calls.audit[0]).toMatchObject({
      subjectRole: 'MANAGER',
      outcome: { kind: 'REFUSED', reason: 'INVALID_PERMISSION' },
    })
  })
})

describe('a wrong password changes no permission and is recorded', () => {
  beforeEach(fresh)

  it('does not write, and leaves a WRONG_PASSWORD record naming what was attempted', async () => {
    calls.verifyResult = { ok: false, reason: 'WRONG_PASSWORD' }
    const result = await changeRolePermissions(SAVE)

    expect(result).toEqual({ ok: false, reason: 'WRONG_PASSWORD' })
    expect(calls.writes).toEqual([])
    expect(calls.stored.MANAGER).toEqual(['users.view'])
    expect(calls.audit[0]).toMatchObject({
      subjectRole: 'MANAGER',
      outcome: {
        kind: 'REFUSED',
        reason: 'WRONG_PASSWORD',
        attempted: ['users.view', 'ai.view'],
      },
    })
  })

  it('verifies the SESSION email even when the form supplies one', async () => {
    const hostile = { ...SAVE, email: 'victim@example.com' } as unknown as typeof SAVE
    await changeRolePermissions(hostile)
    expect(calls.verify).toEqual([{ email: 'actor@x.com', password: 'correct' }])
  })

  it('does not report an outage as a wrong password', async () => {
    calls.verifyResult = { ok: false, reason: 'UNAVAILABLE' }
    expect(await changeRolePermissions(SAVE)).toEqual({ ok: false, reason: 'AUTH_UNAVAILABLE' })
  })

  it('shares the step-up budget with role changes', async () => {
    /*
     * One budget, because the attacker at an unlocked laptop does not care
     * which of the two forms they guess through. Two separate allowances would
     * double what they get.
     */
    calls.verifyResult = { ok: false, reason: 'WRONG_PASSWORD' }
    for (let attempt = 0; attempt < LIMITS.stepUp.limit; attempt += 1) {
      await changeRolePermissions(SAVE)
    }
    expect(calls.verify).toHaveLength(LIMITS.stepUp.limit)

    const result = await changeRolePermissions(SAVE)
    expect(result).toEqual({ ok: false, reason: 'RATE_LIMITED' })
    expect(calls.verify).toHaveLength(LIMITS.stepUp.limit)
    expect(calls.audit.at(-1)).toMatchObject({ outcome: { reason: 'RATE_LIMITED' } })
  })
})

describe('a failed record rolls the permission change back', () => {
  beforeEach(fresh)

  it('reports NOT_RECORDED and leaves the set alone', async () => {
    calls.writeThrows = true
    const result = await changeRolePermissions(SAVE)

    expect(result).toEqual({ ok: false, reason: 'NOT_RECORDED' })
    expect(calls.writes).toEqual([])
    expect(calls.stored.MANAGER).toEqual(['users.view'])
    expect(calls.order).toContain('write-rolled-back')
    expect(calls.audit.at(-1)).toMatchObject({
      outcome: { kind: 'REFUSED', reason: 'NOT_RECORDED' },
    })
  })

  it('never reports success without an APPLIED record beside it', async () => {
    calls.writeThrows = true
    const result = await changeRolePermissions(SAVE)
    expect(result.ok).toBe(false)
    expect(
      calls.audit.filter((row) => (row.outcome as { kind: string }).kind === 'APPLIED'),
    ).toEqual([])
  })
})

/* ──────────────── enforcement does not consult the constants ─────────────── */

describe('nothing enforces from DEFAULT_ROLE_PERMISSIONS', () => {
  it('builds AdminAccess from the store, not the constant', () => {
    /*
     * access.ts is the ONLY place an AdminAccess is built, and every check in
     * the panel goes through the object it returns. So this one file decides
     * whether the matrix is enforced at all.
     */
    const source = code('domain/admin/access.ts')
    expect(source).toContain('readStoredPermissions')
    expect(source).toContain('resolvePermissions(')
    expect(source).not.toContain('DEFAULT_ROLE_PERMISSIONS')
    expect(source).not.toContain('hasAnyAdminAccess')
    // can() from ./roles is a defaults query; the gate must not use it.
    expect(source).not.toContain('can(role,')
  })

  it('is the only place an AdminAccess is constructed', () => {
    // A second construction site is a second set of rules to keep in step.
    const roots = ['app', 'components', 'domain', 'lib']
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next') continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(path)) files.push(path)
      }
    }
    roots.forEach(walk)
    const builders = files.filter(
      (file) =>
        file !== join('domain', 'admin', 'access.ts') &&
        code(file).includes('canSuperAdminOnly: ('),
    )
    expect(builders).toEqual([])
  })

  it('reaches the defaults from exactly two places', () => {
    /*
     * The seed and the no-row fallback. Anything else reading them is a path
     * that would ignore the matrix — the failure this whole step exists to
     * prevent.
     */
    const roots = ['app', 'components', 'domain', 'lib']
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next') continue
        const path = join(dir, entry)
        if (statSync(path).isDirectory()) walk(path)
        else if (/\.tsx?$/.test(path)) files.push(path)
      }
    }
    roots.forEach(walk)
    const readers = files.filter(
      (file) =>
        !file.endsWith(join('domain', 'admin', 'roles.ts')) &&
        code(file).includes('DEFAULT_ROLE_PERMISSIONS'),
    )
    expect(readers).toEqual([join('domain', 'admin', 'permissions.ts')])
  })
})

/* ──────────────────────── the store cannot rewrite history ───────────────── */

describe('the permission store', () => {
  const FILE = 'lib/repositories/admin-permissions.ts'

  it('has no delete, so a row cannot be removed to restore the defaults', () => {
    /*
     * Deleting a row means "never configured", which resolves to the DEFAULTS
     * — so a delete is a way of silently restoring permissions somebody
     * revoked. There is no function here that does it.
     */
    expect(code(FILE)).not.toContain('.delete(')
  })

  it('runs the permission write and its audit insert in ONE transaction', () => {
    const source = code(FILE)
    expect(source).toContain('getDb().transaction(')
    const begin = source.indexOf('transaction(')
    expect(source.indexOf('.insert(schema.adminRolePermissions)')).toBeGreaterThan(begin)
    expect(source.indexOf('.insert(schema.adminPermissionAuditEvents)')).toBeGreaterThan(begin)
  })

  it('reads the before-set INSIDE the transaction, through the tx handle', () => {
    /*
     * Read outside, the `from` in the audit record would be whatever some
     * earlier request happened to see rather than what was actually replaced.
     *
     * BOUNDED AT BOTH ENDS, after two wrong versions of this assertion. The
     * first searched from the top of the file and matched
     * readStoredPermissions(); the second ran to the end and matched
     * appendPermissionAuditEvent(), which uses the pooled connection quite
     * correctly because a refusal has nothing to roll back. Only the body of
     * applyRolePermissions is the subject here.
     */
    const source = code(FILE)
    const body = source.slice(
      source.indexOf('export async function applyRolePermissions'),
      source.indexOf('export async function appendPermissionAuditEvent'),
    )
    expect(body).toContain('getDb().transaction(')

    const read = body.indexOf('.from(schema.adminRolePermissions)')
    expect(read).toBeGreaterThan(-1)
    expect(read).toBeLessThan(body.indexOf('.insert(schema.adminRolePermissions)'))
    expect(body.indexOf('.insert(schema.adminRolePermissions)')).toBeLessThan(
      body.indexOf('.insert(schema.adminPermissionAuditEvents)'),
    )

    // Every statement in the body goes through the transaction handle. One
    // that reached for getDb() again would run outside the transaction and
    // would not roll back with it.
    const inside = body.slice(body.indexOf('async (tx) =>'))
    expect(inside).not.toContain('getDb()')
    expect(inside.match(/await tx/g) ?? []).toHaveLength(3)
  })

  it('touches no seller data and no secret', () => {
    const source = code(FILE)
    for (const forbidden of ['schema.orders', 'schema.listings', 'tokenRef', 'SERVICE_ROLE']) {
      expect(source, forbidden).not.toContain(forbidden)
    }
  })
})

/* ──────────────────────── the new pages gate themselves ──────────────────── */

describe('both permission screens are SUPER_ADMIN only', () => {
  const matrix = join('app', '(admin)', 'admin', 'permissions', 'page.tsx')
  const editor = join('app', '(admin)', 'admin', 'permissions', '[role]', 'page.tsx')

  it('404s an ADMIN rather than showing a read-only view', () => {
    for (const file of [matrix, editor]) {
      const source = code(file)
      expect(source, file).toContain("canSuperAdminOnly('roles.write')")
      expect(source, file).toContain('notFound()')
      expect(source, file).not.toContain("can('roles.write')")
    }
  })

  it('checks before it reads the matrix', () => {
    for (const file of [matrix, editor]) {
      const source = code(file)
      expect(source.indexOf('canSuperAdminOnly'), file).toBeLessThan(
        source.indexOf('readPermissionMatrix('),
      )
    }
  })

  it('404s the editor for a role that has no editable set', () => {
    /*
     * FOUND BY MUTATION: deleting this check broke nothing in the suite.
     *
     * The submit would still be refused — changeRolePermissions() checks
     * isEditableRole() itself — so it was never an escalation. What it was is
     * worse in a quieter way: /admin/permissions/SUPER_ADMIN would render a
     * full set of checkboxes and a Save button that could only ever refuse.
     * That is D70's control that appears to work and does not, on the one
     * screen where the reader is deciding who may do what.
     */
    const source = code(join('app', '(admin)', 'admin', 'permissions', '[role]', 'page.tsx'))
    expect(source).toContain('isEditableRole(role)')
    const guard = source.indexOf('if (!isEditableRole(role)) notFound()')
    expect(guard).toBeGreaterThan(-1)
    // Before the matrix is read and before anything is rendered.
    expect(guard).toBeLessThan(source.indexOf('readPermissionMatrix('))
  })

  it('OFFERS NO NAV ENTRY for the matrix without the capability', () => {
    /*
     * Asked of the function rather than of the layout's source, which is what
     * this used to grep. The gate moved into domain/admin/navigation.ts when
     * the shell was built, and a substring check would have followed it and
     * kept testing a string; this tests the answer. A viewer who is refused
     * the page is offered no route to it, and one who holds it is — the
     * second half matters, because a nav that offers nothing to anybody would
     * satisfy the first.
     */
    const refused = visibleOperatorNav({ can: () => true, canSuperAdminOnly: () => false })
    expect(refused.flatMap((group) => group.items.map((item) => item.href))).not.toContain(
      '/admin/permissions',
    )

    const allowed = visibleOperatorNav({
      can: () => true,
      canSuperAdminOnly: (capability) => capability === 'roles.write',
    })
    expect(allowed.flatMap((group) => group.items.map((item) => item.href))).toContain(
      '/admin/permissions',
    )
  })

  it('leaves every decision to the domain, not the action', () => {
    const source = code(join('app', '(admin)', 'admin', 'permissions', 'actions.ts'))
    expect(source).toContain('changeRolePermissions(')
    expect(source).not.toContain('canSuperAdminOnly')
    expect(source).not.toContain('verifyPassword')
    expect(source).not.toContain('applyRolePermissions')
    // getAll, not get: a cleared checkbox group submits nothing, and `get`
    // would report that as a malformed request rather than "revoke all".
    expect(source).toContain("form.getAll('permissions')")
  })
})
