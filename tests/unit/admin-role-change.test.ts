import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ASSIGNABLE_ROLES,
  PLATFORM_ROLES,
  parseAssignableRole,
  roleSource,
} from '@/domain/admin/roles'
import {
  describeOutcome,
  flattenOutcome,
  isRefusal,
  rebuildOutcome,
  REFUSAL_COPY,
  REFUSAL_REASONS,
  type AdminAuditEvent,
} from '@/domain/admin/audit'
import { LIMITS, limitFor, resetRateLimits, stepUpKey, STEP_UP_PATH } from '@/lib/security/rate-limit'
import { visibleOperatorNav } from '@/domain/admin/navigation'

/*
 * THE FIRST WRITE PATH IN THE OPERATOR AREA.
 *
 * Everything the panel could previously do was read-only, so the worst a bug
 * could do was show the wrong thing. From here a bug can GRANT SOMETHING. The
 * checks below are in the order the threat matters:
 *
 *   who may do it       ADMIN and MANAGER must be refused, not merely un-linked
 *   what may be granted SUPER_ADMIN and ADMIN must be unreachable BY TYPE
 *   proving it is you   a wrong password changes nothing and is recorded
 *   the record          append-only by construction, refusals included
 *   who may read it     audit.view is SUPER_ADMIN only
 */

/* ───────────────────── what the panel may ever assign ───────────────────── */

describe('SUPER_ADMIN and ADMIN cannot be granted from the panel', () => {
  it('offers exactly two roles, and neither is elevated', () => {
    expect([...ASSIGNABLE_ROLES]).toEqual(['MANAGER', 'USER'])
    expect(ASSIGNABLE_ROLES as readonly string[]).not.toContain('SUPER_ADMIN')
    expect(ASSIGNABLE_ROLES as readonly string[]).not.toContain('ADMIN')
  })

  it('refuses to parse the two env-only roles out of a form', () => {
    /*
     * The runtime half. The type stops a DEVELOPER writing 'SUPER_ADMIN'; this
     * stops a REQUEST carrying it. Form data is a string, so exactly one
     * function turns a string into an AssignableRole and everything downstream
     * is built on its output.
     */
    for (const role of ['SUPER_ADMIN', 'ADMIN']) {
      expect(parseAssignableRole(role), role).toBeNull()
    }
  })

  it('refuses anything else a request could carry', () => {
    for (const value of [
      'manager', // case matters: the <select> we render emits upper case
      'OWNER',
      '',
      '  MANAGER  ',
      null,
      undefined,
      42,
      ['MANAGER'],
      { role: 'MANAGER' },
    ]) {
      expect(parseAssignableRole(value), JSON.stringify(value)).toBeNull()
    }
  })

  it('accepts the two it should', () => {
    expect(parseAssignableRole('MANAGER')).toBe('MANAGER')
    expect(parseAssignableRole('USER')).toBe('USER')
  })

  it('types the write so an elevated role does not compile', () => {
    /*
     * The structural guarantee, asserted on the source because a type error
     * cannot be observed at runtime — the test would simply not build.
     *
     * What is checked: the repository's one function takes AssignableRole.
     * Widening it to PlatformRole or string is the change that would make
     * setStoredPlatformRole(id, 'SUPER_ADMIN') compile, and it fails here.
     */
    const source = code('lib/repositories/admin-writes-platform-role.ts')
    expect(source).toContain('to: AssignableRole')
    expect(source).not.toContain('to: PlatformRole')
    expect(source).not.toContain('to: string')
    // And the elevated names appear nowhere in the write path's code at all.
    expect(source).not.toContain('SUPER_ADMIN')
    expect(source).not.toContain("'ADMIN'")
  })

  it('cannot even DESCRIBE granting one in the audit log', () => {
    // AdminAuditOutcome's `to` is AssignableRole, so there is no record shape
    // that claims SUPER_ADMIN was granted. Asserted on the source for the same
    // reason as above.
    const source = code('domain/admin/audit.ts')
    expect(source).toContain("kind: 'APPLIED'; from: PlatformRole; to: AssignableRole")
  })
})

/* ──────────────────────── env-derived roles are inert ─────────────────────── */

describe('a role that comes from the environment is not the column to change', () => {
  it('reports the source of every role', () => {
    expect(roleSource('SUPER_ADMIN')).toBe('ENVIRONMENT')
    expect(roleSource('ADMIN')).toBe('ENVIRONMENT')
    expect(roleSource('MANAGER')).toBe('DATABASE')
    expect(roleSource('USER')).toBe('DATABASE')
  })

  it('classifies every role, so a new one cannot default to editable', () => {
    for (const role of PLATFORM_ROLES) {
      expect(['ENVIRONMENT', 'DATABASE'], role).toContain(roleSource(role))
    }
  })
})

/* ───────────────────────────── the audit record ──────────────────────────── */

describe('the audit record carries its own outcome', () => {
  it('round-trips an applied change', () => {
    const flat = flattenOutcome({ kind: 'APPLIED', from: 'USER', to: 'MANAGER' })
    expect(flat).toEqual({
      outcomeKind: 'APPLIED',
      fromRole: 'USER',
      toRole: 'MANAGER',
      refusalReason: null,
    })
    expect(rebuildOutcome(flat)).toEqual({ kind: 'APPLIED', from: 'USER', to: 'MANAGER' })
  })

  it('round-trips a refusal, keeping what was attempted', () => {
    const flat = flattenOutcome({
      kind: 'REFUSED',
      reason: 'WRONG_PASSWORD',
      attempted: 'MANAGER',
    })
    expect(flat.outcomeKind).toBe('REFUSED')
    expect(flat.fromRole).toBeNull()
    expect(rebuildOutcome(flat)).toEqual({
      kind: 'REFUSED',
      reason: 'WRONG_PASSWORD',
      attempted: 'MANAGER',
    })
  })

  it('refuses to rebuild a corrupt row rather than guessing at it', () => {
    /*
     * D66's lesson, in its sharpest form. A row marked APPLIED with no target
     * role is not a promotion whose destination we should invent — it is a
     * record that cannot be read, and an audit trail that fills in blanks is
     * worse than one with a visible gap.
     */
    expect(
      rebuildOutcome({ outcomeKind: 'APPLIED', fromRole: 'USER', toRole: null, refusalReason: null }),
    ).toBeNull()
    expect(
      rebuildOutcome({ outcomeKind: 'APPLIED', fromRole: null, toRole: 'MANAGER', refusalReason: null }),
    ).toBeNull()
    // APPLIED claiming an elevated grant is unreadable too, not rendered.
    expect(
      rebuildOutcome({
        outcomeKind: 'APPLIED',
        fromRole: 'USER',
        toRole: 'SUPER_ADMIN',
        refusalReason: null,
      }),
    ).toBeNull()
    expect(
      rebuildOutcome({ outcomeKind: 'REFUSED', fromRole: null, toRole: null, refusalReason: null }),
    ).toBeNull()
    expect(
      rebuildOutcome({ outcomeKind: 'REFUSED', fromRole: null, toRole: null, refusalReason: 'nope' }),
    ).toBeNull()
    expect(
      rebuildOutcome({ outcomeKind: 'WHATEVER', fromRole: null, toRole: null, refusalReason: null }),
    ).toBeNull()
  })

  it('derives the sentence rather than storing one', () => {
    // "Promoted to manager" cannot be written over a record that says
    // something else, because it is computed from `from` and `to`.
    expect(describeOutcome({ kind: 'APPLIED', from: 'USER', to: 'MANAGER' })).toBe(
      'Promoted to manager',
    )
    expect(describeOutcome({ kind: 'APPLIED', from: 'MANAGER', to: 'USER' })).toBe(
      'Demoted to user',
    )
    expect(
      describeOutcome({ kind: 'REFUSED', reason: 'WRONG_PASSWORD', attempted: 'MANAGER' }),
    ).toBe(REFUSAL_COPY.WRONG_PASSWORD)
  })

  it('answers "was this refused" from one field', () => {
    const base = {
      id: 'e1',
      at: new Date(),
      actorId: 'a',
      actorEmail: 'a@x.com',
      actorRole: 'SUPER_ADMIN' as const,
      targetId: 't',
      targetEmail: 't@x.com',
    }
    const applied: AdminAuditEvent = {
      ...base,
      outcome: { kind: 'APPLIED', from: 'USER', to: 'MANAGER' },
    }
    const refused: AdminAuditEvent = {
      ...base,
      outcome: { kind: 'REFUSED', reason: 'RATE_LIMITED', attempted: 'MANAGER' },
    }
    expect(isRefusal(applied)).toBe(false)
    expect(isRefusal(refused)).toBe(true)
  })

  it('has copy for every refusal reason, so none can reach a page as raw text', () => {
    for (const reason of REFUSAL_REASONS) {
      expect(REFUSAL_COPY[reason], reason).toBeTruthy()
    }
  })
})

/* ───────────────────────── the store is append-only ──────────────────────── */

describe('the audit store has no way to change history', () => {
  const FILE = 'lib/repositories/admin-audit-log.ts'

  it('exports no update and no delete', () => {
    /*
     * D66: "this record cannot be edited or removed" has to describe the code.
     * The file is read with comments stripped, because its own banner NAMES
     * update and delete in order to say there are none — matching the prose
     * would mean the rule could only be obeyed by deleting the rule. That
     * mistake has now been made twice in this area, which is why it is written
     * down here as well.
     */
    const source = code(FILE)
    for (const forbidden of ['.update(', '.delete(', 'export function update', 'export async function delete']) {
      expect(source, forbidden).not.toContain(forbidden)
    }
  })

  it('has exactly one write, and it is an insert', () => {
    const source = code(FILE)
    expect(source.match(/\.insert\(/g) ?? []).toHaveLength(1)
  })

  it('assigns the id and the timestamp itself', () => {
    // A caller that could choose `at` could place a record before the one it
    // was hiding; one that could choose `id` could collide and have the insert
    // silently do nothing.
    const source = code(FILE)
    expect(source).toContain('id: crypto.randomUUID()')
    expect(source).toContain('at: new Date()')
    expect(source).not.toContain('id: draft.id')
    expect(source).not.toContain('at: draft.at')
  })

  it('touches no seller data', () => {
    const source = code(FILE)
    for (const forbidden of ['schema.orders', 'schema.listings', 'tokenRef', 'SERVICE_ROLE']) {
      expect(source, forbidden).not.toContain(forbidden)
    }
  })
})

describe('the role write touches one column, and carries its own audit record', () => {
  const FILE = 'lib/repositories/admin-writes-platform-role.ts'

  it('exports exactly one write, so there is no unaudited way in', () => {
    /*
     * A2 exported a bare setStoredPlatformRole() beside the audited path. It
     * was deleted rather than left unused: an exported function that changes a
     * privilege without recording it is what the next person reaches for, and
     * "remember to write the audit row too" is not a guarantee.
     */
    const source = code(FILE)
    expect(source.match(/export async function/g) ?? []).toHaveLength(1)
    expect(source).toContain('export async function applyPlatformRoleChange')
    expect(source).not.toContain('export async function setStoredPlatformRole')
  })

  it('runs the role change and the audit insert in ONE transaction', () => {
    /*
     * THE GAP A2 LEFT. Two separate awaits meant a database that accepted the
     * UPDATE and rejected the INSERT left a privilege change nobody recorded.
     * Both writes must be inside the same transaction callback.
     */
    const source = code(FILE)
    expect(source).toContain('getDb().transaction(')
    const begin = source.indexOf('transaction(')
    expect(source.indexOf('.update(schema.users)')).toBeGreaterThan(begin)
    expect(source.indexOf('.insert(schema.adminAuditEvents)')).toBeGreaterThan(begin)
    // Every write in the file goes through the transaction handle, never the
    // pooled connection, or it would not be in the transaction at all.
    expect(source).not.toContain('getDb().update(')
    expect(source).not.toContain('getDb().insert(')
  })

  it('cannot insert or delete an account', () => {
    const source = code(FILE)
    expect(source).not.toContain('insert(schema.users)')
    expect(source).not.toContain('.delete(')
  })

  it('sets platformRole and nothing else', () => {
    const source = code(FILE)
    expect(source).toContain('.set({ platformRole: input.to })')
    expect(source.match(/\.set\(/g) ?? []).toHaveLength(1)
    for (const forbidden of ['schema.orders', 'schema.listings', 'schema.shops', 'schema.memberships']) {
      expect(source, forbidden).not.toContain(forbidden)
    }
  })

  it('writes no audit record when the update matched no row', () => {
    // "Promoted to manager" for a row that was never touched is exactly the
    // false record this log must not hold.
    const source = code(FILE)
    const guard = source.indexOf('if (updated.length !== 1) return false')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(source.indexOf('.insert(schema.adminAuditEvents)'))
  })
})

/* ─────────────────── step-up cannot touch the live session ────────────────── */

describe('password re-confirmation leaves the caller’s session alone', () => {
  const FILE = 'lib/auth/step-up.ts'

  it('uses an isolated client that has nowhere to persist a session', () => {
    const source = code(FILE)
    expect(source).toContain('persistSession: false')
    expect(source).toContain('autoRefreshToken: false')
    expect(source).toContain("from '@supabase/supabase-js'")
  })

  it('imports nothing that could hand it the request’s cookies', () => {
    /*
     * THE GUARANTEE, and it is structural rather than careful. The obvious
     * implementation — signInWithPassword on the @supabase/ssr client — mints a
     * new session and writes it straight over the operator's cookies, turning
     * "confirm it is you" into "sign in again" as a side effect. None of these
     * can appear in this file, and verifyPassword takes no cookie parameter, so
     * there is no argument through which a jar could be threaded in either.
     */
    const source = code(FILE)
    for (const forbidden of ['@supabase/ssr', 'next/headers', 'cookies', './supabase\'', 'createServerClient']) {
      expect(source, forbidden).not.toContain(forbidden)
    }
    expect(source).toContain('export async function verifyPassword(email: string, password: string)')
  })

  it('revokes only the throwaway session, never every session', () => {
    /*
     * scope: 'global' would revoke every session the operator has — confirming
     * a password would sign them out of their own browser and every other
     * device. The scope is the whole point of the line.
     */
    const source = code(FILE)
    expect(source).toContain("signOut({ scope: 'local' })")
    expect(source).not.toContain("scope: 'global'")
  })

  it('separates "wrong password" from "could not ask"', () => {
    // Collapsing them would fill the audit log with a brute-force signature
    // every time Supabase had an outage.
    const source = code(FILE)
    expect(source).toContain("reason: 'UNAVAILABLE'")
    expect(source).toContain("reason: 'WRONG_PASSWORD'")
  })
})

/* ───────────────────────────── the rate limit ────────────────────────────── */

describe('step-up is rate limited through the existing mechanism', () => {
  beforeEach(() => resetRateLimits())

  it('has its own budget, far tighter than the API one', () => {
    expect(limitFor(STEP_UP_PATH)).toEqual(LIMITS.stepUp)
    expect(LIMITS.stepUp.limit).toBeLessThan(LIMITS.api.limit)
    expect(LIMITS.stepUp.windowMs).toBeGreaterThan(LIMITS.api.windowMs)
  })

  it('does not change the budget for anything that already had one', () => {
    // A regression here would silently loosen or tighten the API limits.
    expect(limitFor('/api/export/orders')).toEqual(LIMITS.export)
    expect(limitFor('/api/anything')).toEqual(LIMITS.api)
    expect(limitFor('/admin/users')).toEqual(LIMITS.api)
  })

  it('counts per operator, not per IP', () => {
    // The attacker is at the operator's own desk, so their IP is the
    // operator's. Throttling it would throttle the wrong thing.
    expect(stepUpKey('u-1')).not.toBe(stepUpKey('u-2'))
    expect(stepUpKey('u-1')).toContain('u-1')
  })

  it('refuses after the limit, and one operator cannot lock out another', async () => {
    const { rateLimit } = await import('@/lib/security/rate-limit')
    const now = Date.now()
    for (let attempt = 0; attempt < LIMITS.stepUp.limit; attempt += 1) {
      expect(rateLimit(stepUpKey('u-1'), STEP_UP_PATH, now).allowed, `attempt ${attempt}`).toBe(true)
    }
    expect(rateLimit(stepUpKey('u-1'), STEP_UP_PATH, now).allowed).toBe(false)
    // A second operator still has their whole budget.
    expect(rateLimit(stepUpKey('u-2'), STEP_UP_PATH, now).allowed).toBe(true)
  })

  it('does not drain the API budget it shares a store with', async () => {
    /*
     * The windows live in ONE map keyed by KEY — the path only chooses the
     * limit. So a step-up key that collided with a caller key would let ten
     * password attempts eat an IP's whole API allowance, or let ordinary page
     * traffic exhaust the password budget. The prefix is what keeps them
     * apart, and this runs both directions to prove it.
     */
    const { rateLimit } = await import('@/lib/security/rate-limit')
    const now = Date.now()
    const ip = '1.2.3.4'

    // Spend the entire step-up budget for an operator whose id IS that IP.
    for (let attempt = 0; attempt < LIMITS.stepUp.limit + 1; attempt += 1) {
      rateLimit(stepUpKey(ip), STEP_UP_PATH, now)
    }
    expect(rateLimit(stepUpKey(ip), STEP_UP_PATH, now).allowed).toBe(false)

    // The same string as a plain caller key still has its full API budget.
    expect(rateLimit(ip, '/api/anything', now).allowed).toBe(true)
    expect(rateLimit(ip, '/api/anything', now).remaining).toBe(LIMITS.api.limit - 2)
  })
})
/* ──────────────────── who may change a role, and who may look ─────────────── */

/*
 * BEHAVIOUR, not source-reading, for everything that can be observed.
 *
 * An earlier draft of this block asserted the gates by grepping
 * role-change.ts. It failed the moment a refusal moved into a ternary — and,
 * worse, it would have gone on PASSING if the refusal had been deleted and
 * replaced by anything that merely mentioned the name. Same defect as the
 * sweeps that matched a guard's own comment: a test that reads prose about the
 * rule instead of running the rule.
 *
 * The repositories and the password check are mocked, so what is under test is
 * the DECISION — which of them get called, in what order, with what. The two
 * properties that matter most are only visible this way:
 *
 *   - a refused caller never reaches verifyPassword, so the form is not a
 *     credential oracle for someone who is already inside;
 *   - a wrong password never reaches setStoredPlatformRole, and still leaves
 *     an audit row behind.
 */

const calls = vi.hoisted(() => ({
  access: null as null | { userId: string; email: string; role: string },
  account: null as null | { id: string; email: string; storedRole: string; resolvedRole: string },
  verify: [] as { email: string; password: string }[],
  writes: [] as { userId: string; role: string }[],
  audit: [] as Record<string, unknown>[],
  writeSucceeds: true,
  writeThrows: false,
  verifyResult: { ok: true } as { ok: boolean; reason?: string },
  order: [] as string[],
}))

vi.mock('@/domain/admin/access', () => ({
  requireAdmin: async () => {
    // requireAdmin() throws for anyone without admin access; the mock mirrors
    // that, because "does a plain seller get a record written" is a real test.
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
vi.mock('@/lib/repositories/admin-reads-every-shop', () => ({
  adminReadAccount: async () => calls.account,
}))
vi.mock('@/lib/repositories/admin-writes-platform-role', () => ({
  /*
   * ONE call now does both writes, because in the real thing they are one
   * transaction. The mock mirrors that: it records a write AND the audit
   * record together, and when it throws it records neither — which is what a
   * rollback looks like from the caller's side.
   */
  applyPlatformRoleChange: async (input: {
    target: { id: string; email: string }
    from: string
    to: string
    actor: { id: string; email: string; role: string }
  }) => {
    if (calls.writeThrows) {
      calls.order.push('write-rolled-back')
      throw new Error('audit insert failed; transaction rolled back')
    }
    calls.order.push('write')
    calls.writes.push({ userId: input.target.id, role: input.to })
    if (!calls.writeSucceeds) return false
    calls.order.push('audit')
    calls.audit.push({
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      targetId: input.target.id,
      targetEmail: input.target.email,
      outcome: { kind: 'APPLIED', from: input.from, to: input.to },
    })
    return true
  },
}))
vi.mock('@/lib/repositories/admin-audit-log', () => ({
  appendAdminAuditEvent: async (draft: Record<string, unknown>) => {
    calls.order.push('audit')
    calls.audit.push(draft)
  },
}))
vi.mock('@/lib/auth/step-up', () => ({
  verifyPassword: async (email: string, password: string) => {
    calls.order.push('verify')
    calls.verify.push({ email, password })
    return calls.verifyResult
  },
}))

const { changePlatformRole } = await import('@/domain/admin/role-change')

const TARGET = { id: 'u-target', email: 'target@x.com', storedRole: 'USER', resolvedRole: 'USER' }

function asRole(role: string): void {
  calls.access = { userId: 'u-actor', email: 'actor@x.com', role }
}

function freshState(): void {
  resetRateLimits()
  calls.account = { ...TARGET }
  calls.verify = []
  calls.writes = []
  calls.audit = []
  calls.order = []
  calls.writeSucceeds = true
  calls.writeThrows = false
  calls.verifyResult = { ok: true }
  asRole('SUPER_ADMIN')
}

const PROMOTE = { targetUserId: 'u-target', role: 'MANAGER', password: 'correct-horse' }

describe('who may change a platform role', () => {
  beforeEach(freshState)

  it('lets a SUPER_ADMIN promote, and records what changed', async () => {
    const result = await changePlatformRole(PROMOTE)

    expect(result).toEqual({ ok: true, to: 'MANAGER', targetEmail: 'target@x.com' })
    expect(calls.writes).toEqual([{ userId: 'u-target', role: 'MANAGER' }])
    expect(calls.audit).toHaveLength(1)
    expect(calls.audit[0]).toMatchObject({
      actorId: 'u-actor',
      actorEmail: 'actor@x.com',
      actorRole: 'SUPER_ADMIN',
      targetId: 'u-target',
      targetEmail: 'target@x.com',
      outcome: { kind: 'APPLIED', from: 'USER', to: 'MANAGER' },
    })
    /*
     * Verified, then written and recorded IN ONE STEP. The write and the audit
     * insert are a single transaction now, so there is no window in which one
     * has happened and the other has not.
     */
    expect(calls.order).toEqual(['verify', 'write', 'audit'])
  })

  it('demotes as well as promotes', async () => {
    calls.account = { ...TARGET, storedRole: 'MANAGER', resolvedRole: 'MANAGER' }
    const result = await changePlatformRole({ ...PROMOTE, role: 'USER' })

    expect(result).toEqual({ ok: true, to: 'USER', targetEmail: 'target@x.com' })
    expect(calls.writes).toEqual([{ userId: 'u-target', role: 'USER' }])
    expect(calls.audit[0]).toMatchObject({ outcome: { kind: 'APPLIED', from: 'MANAGER', to: 'USER' } })
  })

  for (const role of ['ADMIN', 'MANAGER'] as const) {
    it(`refuses a ${role}, writes nothing, and never checks their password`, async () => {
      asRole(role)
      const result = await changePlatformRole(PROMOTE)

      expect(result).toEqual({ ok: false, reason: 'NOT_PERMITTED' })
      expect(calls.writes).toEqual([])
      /*
       * The oracle property. A refused operator must not learn whether they
       * typed their own password correctly — they are already inside, and the
       * answer is none of their business.
       */
      expect(calls.verify).toEqual([])
      expect(calls.audit[0]).toMatchObject({
        actorRole: role,
        outcome: { kind: 'REFUSED', reason: 'NOT_PERMITTED' },
      })
    })
  }

  it('refuses a caller with no admin access, and writes no audit row at all', async () => {
    /*
     * requireAdmin() throws notFound() before this function does anything.
     * Recording it would let any signed-in seller fill the audit log at will,
     * and a log anybody can fill is a log nobody can read.
     */
    calls.access = null
    await expect(changePlatformRole(PROMOTE)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(calls.audit).toEqual([])
    expect(calls.writes).toEqual([])
  })
})

describe('a wrong password changes nothing and is recorded', () => {
  beforeEach(freshState)

  const WRONG = { targetUserId: 'u-target', role: 'MANAGER', password: 'wrong' }

  it('does not write, and leaves a WRONG_PASSWORD record', async () => {
    calls.verifyResult = { ok: false, reason: 'WRONG_PASSWORD' }
    const result = await changePlatformRole(WRONG)

    expect(result).toEqual({ ok: false, reason: 'WRONG_PASSWORD' })
    expect(calls.writes).toEqual([])
    expect(calls.audit[0]).toMatchObject({
      targetId: 'u-target',
      targetEmail: 'target@x.com',
      outcome: { kind: 'REFUSED', reason: 'WRONG_PASSWORD', attempted: 'MANAGER' },
    })
  })

  it('leaves three records for three attempts — the signal worth having', async () => {
    calls.verifyResult = { ok: false, reason: 'WRONG_PASSWORD' }
    await changePlatformRole(WRONG)
    await changePlatformRole(WRONG)
    await changePlatformRole(WRONG)

    expect(calls.audit).toHaveLength(3)
    for (const row of calls.audit) {
      expect(row).toMatchObject({ outcome: { kind: 'REFUSED', reason: 'WRONG_PASSWORD' } })
    }
    expect(calls.writes).toEqual([])
  })

  it('verifies the SESSION email even when the form supplies one', async () => {
    /*
     * THE REQUEST CARRIES AN ATTACKER-CHOSEN ADDRESS, and it must be ignored.
     *
     * An earlier version of this test posted no email at all and asserted that
     * verifyPassword received the session's. It passed against code that read
     * `request.email ?? access.email` — because the attack input was absent,
     * not because the guard held. A test whose input cannot distinguish the
     * two behaviours is not testing either of them.
     *
     * If the form's address were used, re-confirmation would become an oracle
     * for checking credentials against any account someone cares to name.
     */
    const hostile = {
      ...WRONG,
      email: 'victim@example.com',
      actorEmail: 'victim@example.com',
    } as unknown as typeof WRONG

    await changePlatformRole(hostile)
    expect(calls.verify).toEqual([{ email: 'actor@x.com', password: 'wrong' }])
    expect(calls.verify[0]?.email).not.toBe('victim@example.com')
  })

  it('does not report an outage as a wrong password', async () => {
    calls.verifyResult = { ok: false, reason: 'UNAVAILABLE' }
    const result = await changePlatformRole(WRONG)

    expect(result).toEqual({ ok: false, reason: 'AUTH_UNAVAILABLE' })
    expect(calls.audit[0]).toMatchObject({ outcome: { kind: 'REFUSED', reason: 'AUTH_UNAVAILABLE' } })
  })
})

describe('the other refusals, each of them written down', () => {
  beforeEach(freshState)

  it('refuses a role the panel may not assign, before any network call', async () => {
    for (const role of ['SUPER_ADMIN', 'ADMIN', 'OWNER', '', null, 7]) {
      calls.audit = []
      calls.verify = []
      const result = await changePlatformRole({ targetUserId: 'u-target', role, password: 'p' })
      expect(result, String(role)).toEqual({ ok: false, reason: 'INVALID_ROLE' })
      expect(calls.writes, String(role)).toEqual([])
      expect(calls.verify, String(role)).toEqual([])
      expect(calls.audit[0]).toMatchObject({ outcome: { kind: 'REFUSED', reason: 'INVALID_ROLE' } })
    }
  })

  it('refuses a target whose role comes from the environment', async () => {
    /*
     * Writing the column here SUCCEEDS and changes nothing, because the env
     * list outranks it. The UI renders no control for these accounts; this is
     * the half that holds when the form is posted anyway.
     */
    for (const resolved of ['SUPER_ADMIN', 'ADMIN']) {
      calls.audit = []
      calls.verify = []
      calls.account = { ...TARGET, resolvedRole: resolved }
      const result = await changePlatformRole({
        targetUserId: 'u-target',
        role: 'USER',
        password: 'p',
      })
      expect(result, resolved).toEqual({ ok: false, reason: 'ROLE_FROM_ENVIRONMENT' })
      expect(calls.writes, resolved).toEqual([])
      expect(calls.verify, resolved).toEqual([])
      expect(calls.audit[0]).toMatchObject({
        outcome: { kind: 'REFUSED', reason: 'ROLE_FROM_ENVIRONMENT' },
      })
    }
  })

  it('refuses an account that is no longer there', async () => {
    calls.account = null
    const result = await changePlatformRole({ targetUserId: 'u-gone', role: 'MANAGER', password: 'p' })

    expect(result).toEqual({ ok: false, reason: 'TARGET_NOT_FOUND' })
    expect(calls.writes).toEqual([])
    expect(calls.audit[0]).toMatchObject({ outcome: { kind: 'REFUSED', reason: 'TARGET_NOT_FOUND' } })
  })

  it('records no success when the update matched no row', async () => {
    // The account vanished between the read and the write. Writing "promoted
    // to manager" for it would put a false record in the one place that must
    // not hold one.
    calls.writeSucceeds = false
    const result = await changePlatformRole(PROMOTE)

    expect(result).toEqual({ ok: false, reason: 'TARGET_NOT_FOUND' })
    expect(calls.audit).toHaveLength(1)
    expect(calls.audit[0]).toMatchObject({ outcome: { kind: 'REFUSED' } })
    // No APPLIED record anywhere: the transaction returned false before
    // inserting one.
    expect(calls.audit.some((row) => (row.outcome as { kind: string }).kind === 'APPLIED')).toBe(
      false,
    )
  })

  it('rolls the role change back when the audit write fails, and says so', async () => {
    /*
     * THE GAP A2 LEFT, now closed. The old path did the UPDATE and the audit
     * INSERT as two separate awaits with the audit failure swallowed, so a
     * database that accepted the first and rejected the second left a
     * privilege change nobody recorded.
     *
     * The transaction makes that state unreachable: a failed record takes the
     * role change down with it. What the operator is told — "could not be
     * recorded, so it was rolled back" — is then TRUE, which is the point. The
     * alternative, reporting success, would have them believe a promotion
     * happened that the log has no memory of.
     */
    calls.writeThrows = true
    const result = await changePlatformRole(PROMOTE)

    expect(result).toEqual({ ok: false, reason: 'NOT_RECORDED' })
    // Nothing was applied: the mock throws before recording either write, the
    // way a rollback looks from out here.
    expect(calls.writes).toEqual([])
    expect(calls.order).toContain('write-rolled-back')
    // And the refusal itself is still recorded, through the separate
    // non-transactional path that has nothing to roll back.
    expect(calls.audit.at(-1)).toMatchObject({
      outcome: { kind: 'REFUSED', reason: 'NOT_RECORDED' },
    })
  })

  it('never reports success when the change was not recorded', async () => {
    // The property stated on its own, because it is the one that matters: no
    // input produces ok:true without an APPLIED record beside it.
    calls.writeThrows = true
    const result = await changePlatformRole(PROMOTE)
    expect(result.ok).toBe(false)
    expect(calls.audit.filter((r) => (r.outcome as { kind: string }).kind === 'APPLIED')).toEqual([])
  })

  it('stops checking passwords once the limit is spent, and records that too', async () => {
    calls.verifyResult = { ok: false, reason: 'WRONG_PASSWORD' }
    for (let attempt = 0; attempt < LIMITS.stepUp.limit; attempt += 1) {
      await changePlatformRole({ targetUserId: 'u-target', role: 'MANAGER', password: 'x' })
    }
    expect(calls.verify).toHaveLength(LIMITS.stepUp.limit)

    const result = await changePlatformRole({
      targetUserId: 'u-target',
      role: 'MANAGER',
      password: 'x',
    })
    expect(result).toEqual({ ok: false, reason: 'RATE_LIMITED' })
    // The limit is checked BEFORE the round trip, so no further password check.
    expect(calls.verify).toHaveLength(LIMITS.stepUp.limit)
    expect(calls.audit.at(-1)).toMatchObject({ outcome: { kind: 'REFUSED', reason: 'RATE_LIMITED' } })
  })

  it('does not let one operator spend another operator budget', async () => {
    calls.verifyResult = { ok: false, reason: 'WRONG_PASSWORD' }
    for (let attempt = 0; attempt < LIMITS.stepUp.limit + 1; attempt += 1) {
      await changePlatformRole({ targetUserId: 'u-target', role: 'MANAGER', password: 'x' })
    }
    expect(calls.audit.at(-1)).toMatchObject({ outcome: { reason: 'RATE_LIMITED' } })

    calls.access = { userId: 'u-other', email: 'other@x.com', role: 'SUPER_ADMIN' }
    calls.verifyResult = { ok: true }
    const result = await changePlatformRole(PROMOTE)
    expect(result.ok).toBe(true)
  })
})

describe('the audit log is readable by SUPER_ADMIN only', () => {
  it('gates the page on canSuperAdminOnly, not on a permission', () => {
    /*
     * ADMIN must be refused. `audit.view` is a SuperAdminOnlyCapability — a
     * separate type can() does not accept — so this cannot be relaxed into a
     * permission without the call site going red.
     */
    const source = code(join('app', '(admin)', 'admin', 'audit', 'page.tsx'))
    expect(source).toContain("canSuperAdminOnly('audit.view')")
    expect(source).toContain('notFound()')
    expect(source).not.toContain("can('audit.view')")
  })

  it('gates the role editor the same way', () => {
    const source = code(join('app', '(admin)', 'admin', 'users', '[userId]', 'role', 'page.tsx'))
    expect(source).toContain("canSuperAdminOnly('roles.write')")
    expect(source).toContain('notFound()')
  })

  it('OFFERS NO NAV ENTRY for either page without the capability', () => {
    /*
     * Behavioural, not a grep of the layout — the gate lives in the nav model
     * now, and the question worth asking was always "what is this viewer
     * offered", not "does that file contain this string".
     *
     * An ADMIN is the case that matters: they hold every delegatable
     * permission, so `can` returning true for everything is exactly their
     * shape, and neither of these two may appear for them.
     */
    const admin = visibleOperatorNav({ can: () => true, canSuperAdminOnly: () => false })
    const hrefs = admin.flatMap((group) => group.items.map((item) => item.href))
    expect(hrefs).not.toContain('/admin/audit')
    expect(hrefs).not.toContain('/admin/permissions')

    const superAdmin = visibleOperatorNav({ can: () => true, canSuperAdminOnly: () => true })
    const all = superAdmin.flatMap((group) => group.items.map((item) => item.href))
    expect(all).toContain('/admin/audit')
    expect(all).toContain('/admin/permissions')
  })

  it('keeps both capabilities out of the delegatable permission list', () => {
    // Re-asserted here, next to the write path, because this is the step where
    // being able to grant roles.write would actually matter.
    const source = code('domain/admin/roles.ts')
    expect(source).toContain("export const SUPER_ADMIN_ONLY = ['audit.view', 'roles.write']")
    const permissions = source.slice(
      source.indexOf('export const PERMISSIONS'),
      source.indexOf('export type Permission'),
    )
    expect(permissions).not.toContain('roles.write')
    expect(permissions).not.toContain('audit.view')
  })
})

/* ───────────────── every operator page still gates itself ────────────────── */

describe('the new pages are covered by the existing guards', () => {
  function pages(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) pages(path, out)
      else if (entry === 'page.tsx') out.push(path)
    }
    return out
  }

  it('added pages, so the sweep has more to check than before', () => {
    // If this ever drops back to 2, the pages were removed or moved out of the
    // tree the guard walks — and the guard would go on passing.
    expect(pages(join('app', '(admin)')).length).toBeGreaterThanOrEqual(5)
  })

  it('gates the server action through the domain, not in the action', () => {
    /*
     * The action parses a form and navigates. Every check lives in
     * changePlatformRole(), because a gate split between the action and the
     * domain is a gate with two places to forget.
     */
    const source = code(join('app', '(admin)', 'admin', 'users', 'actions.ts'))
    expect(source).toContain('changePlatformRole(')
    expect(source).not.toContain('canSuperAdminOnly')
    expect(source).not.toContain('verifyPassword')
    expect(source).not.toContain('setStoredPlatformRole')
  })
})

/** Source with comments stripped. See the note in the append-only block. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}
