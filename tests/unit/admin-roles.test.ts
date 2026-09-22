import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  can,
  canSuperAdminOnly,
  hasAnyAdminAccess,
  PERMISSIONS,
  resolvePlatformRole,
  DEFAULT_ROLE_PERMISSIONS,
  SUPER_ADMIN_ONLY,
} from '@/domain/admin/roles'

const ENV = {
  superAdmin: process.env.SUPER_ADMIN_EMAILS,
  admin: process.env.ADMIN_EMAILS,
}

function setEnv(superAdmin?: string, admin?: string): void {
  if (superAdmin === undefined) delete process.env.SUPER_ADMIN_EMAILS
  else process.env.SUPER_ADMIN_EMAILS = superAdmin
  if (admin === undefined) delete process.env.ADMIN_EMAILS
  else process.env.ADMIN_EMAILS = admin
}

afterEach(() => setEnv(ENV.superAdmin, ENV.admin))

describe('each role resolves from the right place', () => {
  it('reads SUPER_ADMIN and ADMIN from the environment', () => {
    setEnv('boss@etsypilot.app', 'ops@etsypilot.app')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('SUPER_ADMIN')
    expect(resolvePlatformRole({ email: 'ops@etsypilot.app' })).toBe('ADMIN')
  })

  it('reads MANAGER from the column', () => {
    setEnv()
    expect(resolvePlatformRole({ email: 'a@x.com', storedRole: 'MANAGER' })).toBe('MANAGER')
  })

  it('gives everyone else USER', () => {
    setEnv('boss@etsypilot.app')
    expect(resolvePlatformRole({ email: 'seller@x.com', storedRole: 'USER' })).toBe('USER')
    expect(resolvePlatformRole({ email: 'seller@x.com' })).toBe('USER')
  })
})

describe('the environment outranks the database', () => {
  it('lets SUPER_ADMIN_EMAILS win over any stored role', () => {
    setEnv('boss@etsypilot.app')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app', storedRole: 'USER' })).toBe(
      'SUPER_ADMIN',
    )
  })

  it('lets SUPER_ADMIN_EMAILS win over ADMIN_EMAILS', () => {
    setEnv('both@x.com', 'both@x.com')
    expect(resolvePlatformRole({ email: 'both@x.com' })).toBe('SUPER_ADMIN')
  })

  it('REFUSES to read SUPER_ADMIN or ADMIN out of the column', () => {
    /*
     * The property the whole design rests on: a database compromise must not be
     * able to mint an administrator. Writing a row is a far lower bar than
     * editing a deployment's environment.
     */
    setEnv()
    expect(resolvePlatformRole({ email: 'attacker@x.com', storedRole: 'SUPER_ADMIN' })).toBe('USER')
    expect(resolvePlatformRole({ email: 'attacker@x.com', storedRole: 'ADMIN' })).toBe('USER')
  })
})

describe('unset and malformed environments deny', () => {
  it('denies when both are unset', () => {
    setEnv()
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('USER')
  })

  it('denies on an empty or whitespace value', () => {
    setEnv('', '   ')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('USER')
  })

  it('denies on garbage rather than matching something', () => {
    setEnv('{"emails":["boss@etsypilot.app"]}')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('USER')
  })

  it('never lets an account with no email match an empty entry', () => {
    /*
     * The dangerous shape. "a@x.com,,b@x.com" contains an empty entry; if it
     * were kept, a session with no email would match it and absence would
     * grant access.
     */
    setEnv('a@x.com,,b@x.com')
    expect(resolvePlatformRole({ email: '' })).toBe('USER')
    expect(resolvePlatformRole({ email: null })).toBe('USER')
    expect(resolvePlatformRole({ email: undefined })).toBe('USER')
    expect(resolvePlatformRole({ email: '   ' })).toBe('USER')
  })

  it('treats an unknown stored value as USER', () => {
    setEnv()
    for (const stored of ['OWNER', 'root', 'admin', '', '   ', 'MANAGER_']) {
      expect(resolvePlatformRole({ email: 'a@x.com', storedRole: stored }), stored).toBe('USER')
    }
  })
})

describe('ambiguous env values fail in the direction chosen', () => {
  it('TRIMS whitespace, so a stray space grants rather than locking out', () => {
    // Failing closed here would mean an invisible character silently denying
    // the only administrator, with nothing to diagnose from the outside.
    setEnv('  boss@etsypilot.app  ,  ', '  ops@x.com ')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('SUPER_ADMIN')
    expect(resolvePlatformRole({ email: 'ops@x.com' })).toBe('ADMIN')
    // Trimming grants; it must not also widen. Nobody else gets in.
    expect(resolvePlatformRole({ email: 'boss@x.com' })).toBe('USER')
  })

  it('lower-cases BOTH sides, so case never decides the outcome either way', () => {
    setEnv('Boss@EtsyPilot.App')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app' })).toBe('SUPER_ADMIN')
    expect(resolvePlatformRole({ email: 'BOSS@ETSYPILOT.APP' })).toBe('SUPER_ADMIN')
    // And a different address still does not match, capitalised or not.
    expect(resolvePlatformRole({ email: 'Boss@other.app' })).toBe('USER')
  })

  it('trims the session email too', () => {
    setEnv('boss@etsypilot.app')
    expect(resolvePlatformRole({ email: ' boss@etsypilot.app ' })).toBe('SUPER_ADMIN')
  })

  it('matches the whole address, never a prefix', () => {
    setEnv('boss@etsypilot.app')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.app.evil.com' })).toBe('USER')
    expect(resolvePlatformRole({ email: 'boss@etsypilot.ap' })).toBe('USER')
  })
})

describe('a SHOP role grants no PLATFORM access', () => {
  it('gives an OWNER of their own shop nothing', () => {
    /*
     * The conflation this whole model exists to prevent. EVERY seller is OWNER
     * of their own shop — provisioning creates exactly that membership — so if
     * the axes were joined, every seller would be an operator.
     *
     * resolvePlatformRole takes no membership and has no parameter one could be
     * passed through, which is the structural half of the guarantee. This is
     * the behavioural half.
     */
    expect(resolvePlatformRole({ email: 'seller@x.com', storedRole: 'OWNER' })).toBe('USER')
    expect(hasAnyAdminAccess(resolvePlatformRole({ email: 'seller@x.com' }))).toBe(false)
  })

  it('reads no membership anywhere in the role model', () => {
    const source = readFileSync('domain/admin/roles.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(source).not.toContain('membership')
    expect(source).not.toContain('memberships')
  })
})

describe('permissions', () => {
  it('gives SUPER_ADMIN and ADMIN all seven', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN).toHaveLength(7)
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).toHaveLength(7)
    for (const permission of PERMISSIONS) {
      expect(can('SUPER_ADMIN', permission), permission).toBe(true)
      expect(can('ADMIN', permission), permission).toBe(true)
    }
  })

  it('gives MANAGER users.view and nothing else', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.MANAGER).toEqual(['users.view'])
    expect(can('MANAGER', 'users.view')).toBe(true)
    expect(can('MANAGER', 'subscriptions.view')).toBe(false)
    expect(can('MANAGER', 'users.detail')).toBe(false)
  })

  it('gives USER none, and no admin access at all', () => {
    expect(DEFAULT_ROLE_PERMISSIONS.USER).toEqual([])
    expect(hasAnyAdminAccess('USER')).toBe(false)
    for (const permission of PERMISSIONS) {
      expect(can('USER', permission), permission).toBe(false)
    }
  })
})

describe('the two non-delegatable capabilities', () => {
  it('are not permissions, so no role can be granted them', () => {
    // If either ever appeared in PERMISSIONS, a future checkbox editor would
    // render it and an ADMIN could be given the power to promote themselves.
    for (const capability of SUPER_ADMIN_ONLY) {
      expect(PERMISSIONS as readonly string[]).not.toContain(capability)
      for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'] as const) {
        expect(DEFAULT_ROLE_PERMISSIONS[role] as readonly string[], role).not.toContain(capability)
      }
    }
  })

  it('answer only to SUPER_ADMIN', () => {
    for (const capability of SUPER_ADMIN_ONLY) {
      expect(canSuperAdminOnly('SUPER_ADMIN', capability)).toBe(true)
      expect(canSuperAdminOnly('ADMIN', capability)).toBe(false)
      expect(canSuperAdminOnly('MANAGER', capability)).toBe(false)
      expect(canSuperAdminOnly('USER', capability)).toBe(false)
    }
  })
})

/*
 * The cross-shop repository is the single most dangerous file in the codebase.
 * Its NAME is the first guard; this is the one that actually holds.
 */
describe('only admin code may read across shops', () => {
  const MODULE = 'admin-reads-every-shop'

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.next') continue
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path, out)
      else if (/\.tsx?$/.test(path)) out.push(path)
    }
    return out
  }

  /*
   * COMMENTS STRIPPED, and this is the THIRD time that has turned out to
   * matter in this file. The sweep matched the module's NAME anywhere in a
   * file, so admin-audit-log.ts and admin-writes-platform-role.ts — which
   * mention it in their banners to explain that they cross the same boundary
   * for the same reason — were reported as illegal importers. A guard that
   * fires on prose about the rule is a guard people learn to route around by
   * deleting the prose.
   */
  const code = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  const importers = ['app', 'components', 'domain', 'lib']
    .flatMap((root) => walk(root))
    .filter((file) => !file.endsWith(`${MODULE}.ts`))
    .filter((file) => code(file).includes(MODULE))

  it('finds the importers it is meant to be checking', () => {
    // A sweep that matches nothing passes perfectly.
    expect(importers.length).toBeGreaterThan(0)
  })

  it('is imported only from app/(admin) and domain/admin', () => {
    const stray = importers.filter(
      (file) => !file.startsWith('app/(admin)') && !file.startsWith(join('domain', 'admin')),
    )
    expect(stray).toEqual([])
  })

  it('contains no write of any kind', () => {
    const source = readFileSync(`lib/repositories/${MODULE}.ts`, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const write of ['.insert(', '.update(', '.delete(', 'withAccountStore']) {
      expect(source, write).not.toContain(write)
    }
  })

  it('selects no secret and no seller money', () => {
    /*
     * Comments stripped, and the reason is not cosmetic: the banner at the top
     * of that file NAMES these things in order to forbid them. Matching the
     * prose would mean the rule could only be obeyed by deleting the rule.
     */
    const source = readFileSync(`lib/repositories/${MODULE}.ts`, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    for (const forbidden of ['tokenRef', 'SERVICE_ROLE', 'schema.orders', 'schema.listings']) {
      expect(source, forbidden).not.toContain(forbidden)
    }
  })
})

/*
 * The layout no longer refuses on its own, so this is not a style rule.
 *
 * app/(admin)/layout.tsx passes `children` straight through when access is
 * refused, because a notFound() thrown from a LAYOUT renders Next's bare error
 * document instead of the ordinary 404 page — a visibly different response
 * that let a signed-in seller tell /admin apart from a URL nobody wrote. The
 * cost of that fix is that the PAGE is now what refuses. If one ever forgets,
 * the layout hands it a non-operator and the page renders for them.
 */
describe('every operator page gates itself', () => {
  function pages(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) pages(path, out)
      else if (entry === 'page.tsx') out.push(path)
    }
    return out
  }

  const found = pages('app/(admin)')

  /*
   * COMMENTS STRIPPED, and this is not tidiness — it is the fix for a sweep
   * that did not work. The first version tested `source.includes('requireAdmin(')`
   * against the raw file, and deleting the actual call from the users page left
   * it green: the page's own comment says "requireAdmin() rather than a boolean
   * from the layout", which contains the pattern. The check was reading the
   * prose ABOUT the guard instead of the guard.
   */
  const code = (file: string) =>
    readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

  it('finds the pages it is meant to be checking', () => {
    // 0 == 0 passes perfectly. This is what stops that.
    expect(found.length).toBeGreaterThan(0)
  })

  it('calls requireAdmin() in every one of them', () => {
    const ungated = found.filter((file) => !code(file).includes('requireAdmin('))
    expect(ungated).toEqual([])
  })

  it('calls it before anything that answers the request', () => {
    /*
     * Ordering, not just presence. /admin redirect()s to /admin/users, and a
     * redirect issued before the check would tell a non-operator that /admin
     * exists and where it leads — the same disclosure, by a different verb.
     */
    for (const file of found) {
      const source = code(file)
      const gate = source.indexOf('requireAdmin(')
      for (const answer of [
        'redirect(',
        'adminListUsers(',
        'adminReadAccount(',
        'adminListManagers(',
        'readAdminAuditLog(',
      ]) {
        const at = source.indexOf(answer)
        if (at === -1) continue
        expect(gate, `${file} ${answer}`).toBeLessThan(at)
      }
    }
  })

  it('exposes no static metadata from an operator route', () => {
    /*
     * Next resolves a route's static metadata whether or not the component
     * renders, so `export const metadata` survives notFound() and lands in the
     * flight payload. Measured: a refused seller's 404 carried
     * "Accounts · Operations · EtsyPilot". A <title> inside the component
     * cannot leak, because a refused request never reaches it.
     */
    for (const file of [...found, join('app', '(admin)', 'layout.tsx')]) {
      const source = code(file)
      expect(source, file).not.toContain('export const metadata')
      expect(source, file).not.toContain('generateMetadata')
    }
  })
})

describe('the seller app never links to /admin', () => {
  it('has no /admin href in the navigation or the seller shell', () => {
    const files = ['components/layout/navigation.ts', 'components/layout/top-bar.tsx',
      'components/layout/sidebar.tsx', 'components/layout/user-menu.tsx']
    for (const file of files) {
      /*
       * The quote is part of the pattern. A bare '/admin' also matches the
       * path `repositories/admin-reads-every-shop`, which would make this
       * test fire for a reason it does not describe — and a guard you cannot
       * read the failure of is a guard you start ignoring. The import is
       * already covered, by name, one describe block up.
       */
      const source = readFileSync(file, 'utf8')
      for (const href of ["'/admin", '"/admin', '`/admin']) {
        expect(source, `${file} ${href}`).not.toContain(href)
      }
    }
  })
})
