import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'

import { posixJoin } from '../support/paths'
import {
  OPERATOR_NAV,
  allOperatorHrefs,
  isCurrentNavItem,
  visibleOperatorNav,
} from '@/domain/admin/navigation'
import { PERMISSIONS, SUPER_ADMIN_ONLY, can, type Permission } from '@/domain/admin/roles'

/*
 * THE OPERATOR SHELL, AND THE NAVIGATION IT DRAWS.
 *
 * Two claims, and the second is the one with teeth:
 *
 *   NOTHING IS OFFERED THAT DOES NOT EXIST   D54a, checked against the
 *                                            filesystem in both directions.
 *   NOTHING IS OFFERED THAT WOULD REFUSE     the gate on a nav item must be
 *                                            the SAME key its page passes to
 *                                            requireAdmin(). A link that 404s
 *                                            the person who follows it is
 *                                            worse than no link: it says a
 *                                            capability exists and that they
 *                                            nearly have it.
 *
 * COMMENTS ARE STRIPPED BEFORE ANYTHING IS MATCHED. This codebase has now hit
 * a guard matching its own documentation EIGHT times — the most recent two in
 * A6, where a buyer-field sweep fired on the page's user-visible promise that
 * no buyer data is read, and a decision-numbering guard fired on the paragraph
 * explaining the guard. Every read below goes through code(), and the gate
 * checks match a CALL SHAPE rather than a word.
 */

const ADMIN_ROOT = 'app/(admin)'

/** Source with comments removed. See the note above. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

function pagesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = posixJoin(dir, entry)
    if (statSync(path).isDirectory()) pagesUnder(path, out)
    else if (entry === 'page.tsx') out.push(path)
  }
  return out
}

/** The file Next would render for an operator href. */
function pageFor(href: string): string {
  return posixJoin(ADMIN_ROOT, href.replace(/^\//, ''), 'page.tsx')
}

/** A viewer holding exactly these permissions and no capabilities. */
function viewer(...held: Permission[]) {
  const set = new Set(held)
  return { can: (p: Permission) => set.has(p), canSuperAdminOnly: () => false }
}

function hrefsFor(access: Parameters<typeof visibleOperatorNav>[0]): string[] {
  return visibleOperatorNav(access).flatMap((group) => group.items.map((item) => item.href))
}

/* ─────────────────────── nothing offered that is absent ──────────────────── */

describe('every navigation entry goes somewhere real', () => {
  it('finds the entries it is meant to be checking', () => {
    // A sweep over an empty nav passes perfectly.
    expect(allOperatorHrefs().length).toBeGreaterThan(0)
  })

  it('HAS A PAGE BEHIND EVERY HREF', () => {
    for (const href of allOperatorHrefs()) {
      expect(existsSync(pageFor(href)), `${href} -> ${pageFor(href)}`).toBe(true)
    }
  })

  it('OFFERS EVERY OPERATOR PAGE THAT IS A DESTINATION', () => {
    /*
     * The other direction of D54a, and the quieter of the two. Forgetting to
     * list a page does not 404 anybody — it just means the screen exists and
     * nobody can find it, which is how a surface gets built twice.
     *
     * Three kinds of page are legitimately absent from the nav and are named
     * rather than skipped by a pattern, so adding a fourth has to be a
     * decision someone writes down:
     *
     *   /admin              a redirect, not a screen.
     *   [userId] routes     reached from a row, not from the rail. A nav item
     *                       would need an account to point at.
     *   [role] routes       same: reached from the matrix.
     */
    const offered = new Set(allOperatorHrefs().map(pageFor))
    const unlisted = pagesUnder(ADMIN_ROOT)
      .filter((page) => !page.includes('[') )
      .filter((page) => page !== posixJoin(ADMIN_ROOT, 'admin', 'page.tsx'))
      .filter((page) => !offered.has(page))
    expect(unlisted).toEqual([])
  })

  it('DECLARES NO EMPTY GROUP, so a heading cannot outlive its last item', () => {
    /*
     * visibleOperatorNav drops an empty group, so this would never render —
     * which is exactly why it is worth asserting on the CONSTANT. A heading
     * left behind in the source after its items moved is a group that springs
     * back into the nav the day someone stops filtering.
     */
    for (const group of OPERATOR_NAV) {
      expect(group.items.length, group.label).toBeGreaterThan(0)
    }
  })

  it('carries no "unbuilt" flag, because an operator surface must not be a promise', () => {
    /*
     * The seller nav has one, deliberately: a listed-but-unbuilt item keeps
     * the roadmap honest. Here it would advertise a capability over other
     * people's data that does not exist, which is a different and worse claim.
     */
    const source = code('domain/admin/navigation.ts')
    expect(source).not.toContain('unbuilt')
    expect(source).not.toContain('Soon')
  })
})

/* ──────────────── nothing offered that would refuse the click ────────────── */

describe('a navigation entry is gated on exactly what its page requires', () => {
  it('MATCHES THE PAGE’S OWN GATE, key for key', () => {
    /*
     * The property that stops the two drifting. The nav says `users.view`; the
     * page says requireAdmin('users.view'). If either changes alone, a viewer
     * is either offered a link that 404s or refused a screen they may see.
     *
     * Matched as a CALL, not as a word: `requireAdmin('users.view')` with the
     * quotes, so a sentence mentioning users.view in prose cannot satisfy it —
     * and the prose is stripped first anyway.
     */
    for (const group of OPERATOR_NAV) {
      for (const item of group.items) {
        const source = code(pageFor(item.href))
        if (item.gate.kind === 'permission') {
          expect(source, item.href).toContain(`requireAdmin('${item.gate.key}')`)
        } else {
          /*
           * A capability page gates in two steps: requireAdmin() establishes
           * that the caller is an operator at all, then the capability decides.
           * Both must be present, and the refusal must be notFound() — a 403
           * would confirm the page exists.
           */
          expect(source, item.href).toContain(`canSuperAdminOnly('${item.gate.key}')`)
          expect(source, item.href).toContain('notFound()')
        }
      }
    }
  })

  it('uses canSuperAdminOnly for both non-delegatable capabilities and can() for none', () => {
    const gated = OPERATOR_NAV.flatMap((group) => group.items).filter(
      (item) => item.gate.kind === 'superAdminOnly',
    )
    expect(gated.map((item) => item.gate.key).sort()).toEqual([...SUPER_ADMIN_ONLY].sort())
    for (const item of gated) {
      // can() cannot even be called with one: SuperAdminOnlyCapability is a
      // separate type. Asserted at runtime too, in case of a cast.
      expect(PERMISSIONS as readonly string[], item.href).not.toContain(item.gate.key)
    }
  })

  it('gates every permission entry on a REAL permission', () => {
    for (const group of OPERATOR_NAV) {
      for (const item of group.items) {
        if (item.gate.kind !== 'permission') continue
        expect(PERMISSIONS as readonly string[], item.href).toContain(item.gate.key)
      }
    }
  })

  it('is reachable by a SUPER_ADMIN in full, which is what makes the capability pages safe', () => {
    /*
     * The capability pages ALSO call requireAdmin('users.view'). That is only
     * sound because holding a capability implies SUPER_ADMIN, and SUPER_ADMIN
     * holds every permission — otherwise a super admin with a trimmed
     * permission set would be locked out of the screen that repairs it.
     */
    for (const permission of PERMISSIONS) {
      expect(can('SUPER_ADMIN', permission), permission).toBe(true)
    }
  })
})

/* ─────────────────────────── omitted, never locked ───────────────────────── */

describe('the nav is composed from the viewer, not filtered on screen', () => {
  it('SHOWS EACH ENTRY EXACTLY WHEN ITS GATE IS HELD', () => {
    for (const group of OPERATOR_NAV) {
      for (const item of group.items) {
        const allowed =
          item.gate.kind === 'permission'
            ? { can: (p: Permission) => p === item.gate.key, canSuperAdminOnly: () => false }
            : {
                can: () => false,
                canSuperAdminOnly: (c: string) => c === item.gate.key,
              }
        expect(hrefsFor(allowed), item.href).toContain(item.href)

        const refused =
          item.gate.kind === 'permission'
            ? { can: (p: Permission) => p !== item.gate.key, canSuperAdminOnly: () => true }
            : {
                can: () => true,
                canSuperAdminOnly: (c: string) => c !== item.gate.key,
              }
        expect(hrefsFor(refused), item.href).not.toContain(item.href)
      }
    }
  })

  it('gives a viewer with nothing an EMPTY nav, not a nav of locked rows', () => {
    expect(visibleOperatorNav(viewer())).toEqual([])
  })

  it('DROPS A GROUP WHOSE EVERY ITEM IS GATED AWAY, heading and all', () => {
    /*
     * An empty heading is a padlock with extra steps: "Administration" over
     * nothing tells a manager there is an Administration section and that they
     * are not in it.
     */
    const managerish = visibleOperatorNav(viewer('users.view'))
    expect(managerish.map((group) => group.label)).toEqual(['People'])
    for (const group of managerish) expect(group.items.length).toBeGreaterThan(0)
  })

  it('never returns a group with no items, for any viewer', () => {
    const subsets: Permission[][] = [[], ...PERMISSIONS.map((p) => [p])]
    for (const held of subsets) {
      for (const groups of [visibleOperatorNav(viewer(...held))]) {
        for (const group of groups) {
          expect(group.items.length, `${held.join(',')} :: ${group.label}`).toBeGreaterThan(0)
        }
      }
    }
  })
})

/* ───────────────────────── the chrome itself ─────────────────────────────── */

const SHELL = 'components/admin/operator-shell.tsx'
const SIDEBAR = 'components/admin/operator-sidebar.tsx'
const DRAWER = 'components/admin/operator-mobile-bar.tsx'
const BANNER = 'components/admin/operator-banner.tsx'
const LAYOUT = posixJoin(ADMIN_ROOT, 'layout.tsx')

describe('the shell renders no padlock, because it cannot know of one', () => {
  it('passes the client components ALREADY-FILTERED groups, never an access object', () => {
    /*
     * The structural half of "omitted, never locked". A client component that
     * received AdminAccess would have the viewer's whole permission list in the
     * browser payload and could render whatever it liked from it. These two
     * receive a list of things to draw and nothing else.
     */
    for (const file of [SIDEBAR, DRAWER]) {
      const source = code(file)
      expect(source, file).toContain('OperatorNavGroup')
      expect(source, file).not.toContain('AdminAccess')
      expect(source, file).not.toContain('canSuperAdminOnly')
      expect(source, file).not.toContain('permissions')
    }
  })

  it('draws no disabled, locked or "soon" affordance anywhere in the chrome', () => {
    for (const file of [SHELL, SIDEBAR, DRAWER, BANNER]) {
      const source = code(file)
      for (const tell of ['disabled', 'aria-disabled', 'Locked', 'Soon', 'Lock']) {
        expect(source, `${file} :: ${tell}`).not.toContain(tell)
      }
    }
  })

  it('filters in the LAYOUT, on the server', () => {
    expect(code(LAYOUT)).toContain('visibleOperatorNav(access)')
  })

  it('REFUSES BEFORE IT COMPUTES ANYTHING, with nothing in between', () => {
    /*
     * Written first as "the refusal comes before the first
     * visibleOperatorNav(access)" and MUTATION-TESTED: inserting a call that
     * ran BEFORE the gate did not go red, because the inserted text read
     * `visibleOperatorNav(access!)` and indexOf found the original further
     * down. The fourth time in this build that indexOf has matched the wrong
     * occurrence.
     *
     * So the assertion is about the SHAPE instead: between resolving access
     * and refusing on it there is nothing at all. Anything a future edit adds
     * in that gap — a query, a derived value, a log line — is something a
     * refused request would have executed, and this goes red on it whatever it
     * is called.
     */
    const source = code(LAYOUT)
    const resolved = source.indexOf('await getAdminAccess()')
    const refusal = source.indexOf('if (!access) return')
    expect(resolved).toBeGreaterThan(-1)
    expect(refusal).toBeGreaterThan(resolved)
    const between = source.slice(resolved + 'await getAdminAccess()'.length, refusal)
    expect(between.trim()).toBe('')
  })
})

describe('the operator marker cannot be switched off', () => {
  it('renders the banner unconditionally, not behind a flag', () => {
    /*
     * D11's reasoning, carried over: the marker exists so a screenshot cannot
     * be misread. A banner behind a prop is a banner somebody can pass false
     * to, and the screen it would be missing from is the one showing another
     * person's revenue.
     */
    const source = code(SHELL)
    expect(source).toContain('<OperatorBanner')
    expect(source).not.toMatch(/\{\s*\w+\s*\?\s*<OperatorBanner/)
  })

  it('says whose session it is, so two operator logins are distinguishable', () => {
    expect(code(BANNER)).toContain('{email}')
    expect(code(BANNER)).toContain('{role')
  })

  it('keeps a way back to the seller app, and does not PREFETCH it', () => {
    /*
     * D94, measured in A4: a default-prefetched link to /dashboard re-created
     * the operator's own shop and membership rows, because the seller route
     * repairs a missing shop by provisioning it.
     */
    const source = code(BANNER)
    expect(source).toContain('href="/dashboard"')
    expect(source).toContain('prefetch={false}')
  })

  it('PREFETCHES NO SELLER ROUTE from anywhere in the chrome', () => {
    /*
     * The general form of the rule above, rather than the one link it was
     * found on. Every href in the operator chrome is either an /admin route or
     * carries prefetch={false}.
     */
    for (const file of [SHELL, SIDEBAR, DRAWER, BANNER, 'components/admin/operator-top-bar.tsx']) {
      const source = code(file)
      for (const match of source.matchAll(/href="(\/[^"]*)"/g)) {
        const href = match[1]!
        if (href.startsWith('/admin')) continue
        const line = source.slice(match.index, match.index + 200)
        expect(line, `${file} :: ${href}`).toContain('prefetch={false}')
      }
    }
  })
})

describe('the operator shell is its own, and does not bend the seller one', () => {
  it('takes none of AppShell’s seller-shaped props', () => {
    /*
     * shopName, plan, usage and openActionCount do not exist for an operator,
     * and making them optional on AppShell would push four `?? undefined`
     * branches into the component every seller sees on every screen.
     */
    const source = code(SHELL)
    for (const prop of ['shopName', 'lastSyncedAt', 'plan', 'usage', 'openActionCount', 'isDemo']) {
      expect(source, prop).not.toContain(prop)
    }
  })

  it('SHARES the sign-out rather than copying it', () => {
    // A second sign-out is a second thing to keep correct, and sign-out is the
    // control that must work with no JavaScript at all.
    expect(code('components/admin/operator-top-bar.tsx')).toContain(
      "from '@/components/layout/user-menu'",
    )
    expect(existsSync('components/admin/user-menu.tsx')).toBe(false)
  })

  it('leaves the seller shell untouched by the addition', () => {
    // AppShell must not have grown an operator branch.
    const source = code('components/layout/app-shell.tsx')
    expect(source).not.toContain('operator')
    expect(source).not.toContain('Operator')
  })
})

describe('the chrome meets the responsive standard the seller app is held to', () => {
  it('gives every drawer control a 44px touch target (D56/D61)', () => {
    const source = code(DRAWER)
    // The two buttons that open and close it.
    expect(source.match(/h-11 w-11/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    // And every row in the list.
    expect(source).toContain('min-h-[44px]')
  })

  it('hides the rail below lg and the drawer above it, so neither doubles up', () => {
    expect(code(SIDEBAR)).toContain('lg:flex')
    expect(code(SIDEBAR)).toContain('hidden')
    expect(code(DRAWER)).toContain('lg:hidden')
  })

  it('INVENTS NO COLOUR: tokens, or the one literal pair the banner documents', () => {
    /*
     * D1. The literal pair is the deliberate exception the demo banner and the
     * user-menu avatar already use — a token background with a literal
     * foreground breaks on theme flip, so a strip that must look identical in
     * both themes fixes both halves.
     */
    const allowed = new Set(['#241B12', '#F7F3ED', '#C9BCA9'])
    for (const file of [SHELL, SIDEBAR, DRAWER, BANNER, 'components/admin/operator-top-bar.tsx']) {
      for (const match of code(file).matchAll(/#[0-9A-Fa-f]{3,8}\b/g)) {
        expect(allowed, `${file} :: ${match[0]}`).toContain(match[0])
      }
    }
  })

  it('marks the open item with more than colour', () => {
    // artboard 89: never colour alone. A tint PLUS weight PLUS aria-current.
    for (const file of [SIDEBAR, DRAWER]) {
      const source = code(file)
      expect(source, file).toContain('aria-current')
      expect(source, file).toContain('font-semibold')
    }
  })
})

/* ───────────────────────────── the active item ───────────────────────────── */

describe('the open item stays lit two clicks in', () => {
  it('keeps Accounts marked on an account detail screen', () => {
    expect(isCurrentNavItem('/admin/users/abc123', '/admin/users')).toBe(true)
    expect(isCurrentNavItem('/admin/users/abc123/role', '/admin/users')).toBe(true)
  })

  it('does not light a sibling whose href is a string prefix', () => {
    // /admin/user must not light /admin/users, and the other way round.
    expect(isCurrentNavItem('/admin/users-archive', '/admin/users')).toBe(false)
    expect(isCurrentNavItem('/admin/audit', '/admin/users')).toBe(false)
  })
})

/* ────────────────────────── the 404 inside the console ───────────────────── */

const OPERATOR_404 = posixJoin(ADMIN_ROOT, 'not-found.tsx')
const SELLER_404 = 'app/not-found.tsx'
const FRAME = 'components/layout/not-found-frame.tsx'

describe('a 404 in the operator console says something true there', () => {
  /*
   * FOUND BY HAND ON THE RUNNING PANEL. app/(admin)/not-found.tsx was a
   * one-line re-export of the seller's 404, so a manager who typed
   * /admin/audit was told "the listing was deleted on Etsy" and offered
   * [Back to overview] and [Listing audit] — two buttons out of the console,
   * for a thing that does not exist in it.
   *
   * The re-export's stated reason was that one page cannot drift into two
   * different-looking 404s. That reason survives: the layout is shared and
   * only the words differ.
   */

  it('finds the two 404s it is meant to be checking', () => {
    // The anti-vacuity guard. Every assertion below is of the form "the
    // operator 404 does not say X", and a missing file satisfies all of them.
    for (const file of [OPERATOR_404, SELLER_404, FRAME]) {
      expect(existsSync(file), file).toBe(true)
    }
  })

  it('SENDS NOBODY TO THE SELLER APP, and names no listing', () => {
    const source = code(OPERATOR_404)
    for (const seller of ['/dashboard', '/listings', 'listing', 'Etsy shop']) {
      expect(source, seller).not.toContain(seller)
    }
  })

  it('still says all of that on the SELLER 404, which is where it is true', () => {
    /*
     * The converse. Without it the assertion above would pass just as well
     * against a 404 that had lost its links entirely, or against a repository
     * where nothing anywhere mentioned a listing.
     */
    const source = code(SELLER_404)
    expect(source).toContain('/dashboard')
    expect(source).toContain('/listings/audit')
    expect(source).toContain('listing was deleted on Etsy')
  })

  it('RENDERS THE SELLER 404 ITSELF for a viewer with no operator access', () => {
    /*
     * The disclosure rule, in prose rather than in a status code.
     *
     * /admin answers 404 rather than 403 because a 403 confirms /admin
     * exists. Operator-flavoured copy would confirm it just as loudly: "no
     * such operator screen" tells a signed-in seller that there ARE operator
     * screens. So the refused branch renders the seller component — not a
     * copy of its words, which would be one edit away from diverging.
     */
    const source = code(OPERATOR_404)
    expect(source).toContain("from '@/app/not-found'")
    expect(source).toMatch(/if\s*\(!access\)\s*return\s*<SellerNotFound\s*\/>/)
  })

  it('OFFERS THIS VIEWER’S OWN DESTINATIONS, not a fixed pair', () => {
    /*
     * A hardcoded [Accounts] [Audit log] would 404 a manager on the second
     * button — the failure the nav itself is built to avoid. The links come
     * from visibleOperatorNav, so there is no second opinion about what this
     * viewer may reach, and no /admin href is written in this file at all.
     */
    const source = code(OPERATOR_404)
    expect(source).toContain('visibleOperatorNav(access)')
    expect(source).not.toMatch(/['"]\/admin\//)
  })

  it('draws both 404s with ONE component, so they cannot drift apart', () => {
    for (const file of [OPERATOR_404, SELLER_404]) {
      expect(code(file), file).toContain('not-found-frame')
    }
    // And the frame is the only place the layout is written down.
    expect(code(FRAME)).toContain('min-h-screen')
    for (const file of [OPERATOR_404, SELLER_404]) {
      expect(code(file), file).not.toContain('min-h-screen')
    }
  })

  it('renders no button for a viewer with nowhere to go', () => {
    // An operator whose role has been stripped of every permission still
    // reaches the console; a link to a screen that would refuse them is the
    // padlock this panel does not have.
    expect(visibleOperatorNav(viewer()).flatMap((group) => group.items)).toEqual([])
    expect(code(FRAME)).toContain('links.length > 0')
  })
})

/* ───────────────────── one header, across both applications ──────────────── */

describe('the operator console writes no heading of its own', () => {
  /*
   * Seven operator pages hand-rolled
   *
   *     <h1 className="text-[22px] font-bold leading-tight tracking-[-0.01em] …">
   *
   * a literal that had ALREADY DRIFTED from PageHeader's `text-page` token —
   * which is the whole argument. Two spellings of one heading do not stay two
   * spellings of one heading; they become two headings.
   */

  it('finds the operator pages it is meant to be checking', () => {
    // Anti-vacuity, and it has teeth here: a broken pagesUnder() would report
    // no pages and every assertion below would pass on nothing at all.
    expect(pagesUnder(ADMIN_ROOT).length).toBeGreaterThan(10)
  })

  it('CONTAINS NO LITERAL <h1 ANYWHERE UNDER app/(admin)', () => {
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).not.toContain('<h1')
    }
  })

  /**
   * /admin renders nothing: it gates, then redirects to the one surface that
   * exists. A header rule cannot apply to a page with no markup, and the
   * exemption is PAID FOR below rather than asserted.
   */
  const RENDERS_NOTHING = posixJoin(ADMIN_ROOT, 'admin/page.tsx')

  it('exempts only the page that renders nothing, and proves it renders nothing', () => {
    const source = code(RENDERS_NOTHING)
    expect(source).toContain('redirect(')
    expect(source).not.toContain('return (')
    expect(source).not.toContain('className')
  })

  it('renders every one of them through PageHeader', () => {
    /*
     * The converse of the rule above, and not the same claim. "No <h1" is
     * satisfied by a page with no heading at all — a page that lost its title
     * in the move would pass it. This is what says the heading is still there.
     */
    for (const page of pagesUnder(ADMIN_ROOT)) {
      if (page === RENDERS_NOTHING) continue
      expect(code(page), page).toContain('<PageHeader')
    }
  })

  it('keeps the ONE <h1 in PageHeader, where the token is', () => {
    const header = code('components/layout/page-header.tsx')
    expect(header).toContain('<h1')
    expect(header).toContain('text-page')
    /*
     * And the drifted heading literal is gone from the operator pages. Matched
     * in full — `text-[22px] font-bold leading-tight` — rather than on the
     * size alone, because the size alone is also how admin/etsy renders a
     * metric, and a rule that fired on that would be telling a true thing
     * about the wrong element.
     */
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).not.toContain('text-[22px] font-bold leading-tight')
    }
  })

  it('gives the three detail screens a back link and the list screens none', () => {
    /*
     * The `back` slot exists because three pages invented their own markup for
     * it, each slightly different. Asserting WHICH pages carry one is what
     * stops the slot being sprayed across the list screens, where one level up
     * is the console's own rail.
     */
    const withBack = pagesUnder(ADMIN_ROOT)
      .filter((page) => code(page).includes('back={'))
      .sort()
    expect(withBack).toEqual([
      posixJoin(ADMIN_ROOT, 'admin/permissions/[role]/page.tsx'),
      posixJoin(ADMIN_ROOT, 'admin/users/[userId]/page.tsx'),
      posixJoin(ADMIN_ROOT, 'admin/users/[userId]/role/page.tsx'),
    ])
  })

  it('draws no breadcrumb trail', () => {
    // Two levels. A trail over two levels is a line of vertical space on a
    // phone spent saying what the single back link already says.
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page).toLowerCase(), page).not.toContain('breadcrumb')
    }
  })
})

/* ───────────────────────── one table in the console ──────────────────────── */

const OPERATOR_TABLE = 'components/admin/operator-table.tsx'

describe('every operator table goes through one wrapper', () => {
  /*
   * Six pages wrote out the same scroll region by hand, and one class in it is
   * load-bearing: `relative`. Without it the sr-only spans inside the rows —
   * position:absolute, with no positioned ancestor to clip them — dragged the
   * DOCUMENT's scroll width to 778px in a 390px viewport. Measured, and fixed
   * in commit 81852ac.
   *
   * A fix remembered in six places is a fix that will be forgotten in the
   * seventh, and this one is invisible at 1440.
   */

  it('finds the wrapper and the pages it is meant to be checking', () => {
    expect(existsSync(OPERATOR_TABLE)).toBe(true)
    expect(pagesUnder(ADMIN_ROOT).length).toBeGreaterThan(10)
  })

  it('LEAVES NO RAW <table UNDER app/(admin)', () => {
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).not.toContain('<table')
    }
  })

  it('still has six tables, so none was deleted rather than moved', () => {
    /*
     * The converse. "No raw <table" is satisfied by an operator console with
     * no tables in it at all, which is exactly what a bad refactor produces.
     */
    const users = pagesUnder(ADMIN_ROOT).filter((page) => code(page).includes('<OperatorTable'))
    expect(users.map((page) => page.replace(`${ADMIN_ROOT}/`, '')).sort()).toEqual([
      'admin/audit/page.tsx',
      'admin/etsy/page.tsx',
      'admin/managers/page.tsx',
      'admin/permissions/page.tsx',
      'admin/subscriptions/page.tsx',
      'admin/users/page.tsx',
    ])
  })

  it('keeps `relative` in the ONE place, with the scroll plumbing', () => {
    const wrapper = code(OPERATOR_TABLE)
    for (const needed of [
      'relative',
      'overflow-x-auto',
      'tabIndex={0}',
      'role="region"',
      'scrolls horizontally',
      '<caption className="sr-only">',
    ]) {
      expect(wrapper, needed).toContain(needed)
    }
  })

  it('takes its caption and its label as REQUIRED props', () => {
    /*
     * Optional is how a hurried copy-paste ships a table with no caption and
     * no region label — the two things a screen-reader user has instead of the
     * layout. The `?` is what this asserts is absent.
     */
    const wrapper = code(OPERATOR_TABLE)
    expect(wrapper).toMatch(/\blabel: string\b/)
    expect(wrapper).toMatch(/\bcaption: ReactNode\b/)
    expect(wrapper).not.toMatch(/\b(label|caption|minWidth)\?:/)
  })

  it('gives every table a caption and a min-width of its own', () => {
    // The widths were hand-picked per table and those numbers were right; it
    // was the plumbing copied alongside them that was wrong.
    const widths: number[] = []
    for (const page of pagesUnder(ADMIN_ROOT)) {
      const source = code(page)
      if (!source.includes('<OperatorTable')) continue
      expect(source, page).toMatch(/caption="[^"]{20,}"/)
      const width = source.match(/minWidth=\{(\d+)\}/)
      expect(width, page).not.toBeNull()
      widths.push(Number(width![1]))
    }
    expect(widths.sort((a, b) => a - b)).toEqual([720, 760, 820, 860, 860, 900])
  })
})
