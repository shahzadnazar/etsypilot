import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'

import { pageForRoute, posixJoin } from '../support/paths'
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

/**
 * The file Next would render for an operator href.
 *
 * Resolved by MATCHING ROUTES, not by rebuilding the path from the href. The
 * old version was `${ADMIN_ROOT}/${href}/page.tsx`, which held only while
 * every route was one directory per URL segment. /admin/users now lives in
 * app/(admin)/admin/users/(list)/page.tsx — a route group, invisible in the
 * URL — so the href no longer spells its own file path.
 */
function pageFor(href: string): string {
  return pageForRoute(href, pagesUnder(ADMIN_ROOT)) ?? `${href} (no page)`
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
    const refusal = source.indexOf('if (!access)')
    expect(resolved).toBeGreaterThan(-1)
    expect(refusal).toBeGreaterThan(resolved)
    const between = source.slice(resolved + 'await getAdminAccess()'.length, refusal)
    expect(between.trim()).toBe('')
  })

  it('REFUSES WITH notFound(), so the status is decided before the first byte', () => {
    /*
     * This line used to pass `children` through and let the PAGE refuse, on a
     * measurement that had expired: a notFound() from a layout no longer falls
     * back to Next's bare error document. Re-measured on 16.3.6 — it renders
     * the ordinary 404 page, 8,798 bytes against 8,964 for a genuinely missing
     * URL, at the same 404 status.
     *
     * And leaving it was costing that status. Adding a loading.tsx to the
     * operator routes put each page inside a Suspense boundary, so Next
     * streams: the shell is flushed with 200 before the page's gate runs, and
     * a notFound() cannot change a status already sent. Measured — every
     * operator route with a skeleton answered 200 with 404 copy, and
     * /admin/permissions, the one without a skeleton, answered 404. A 200 that
     * says "not found" confirms /admin exists to any script that looks.
     */
    expect(code(LAYOUT)).toContain('if (!access) notFound()')
    expect(code(LAYOUT)).toContain("from 'next/navigation'")
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

  it('grows no operator BRANCH in the seller shell', () => {
    /*
     * This used to ban the substring "operator" from AppShell outright, and
     * that stopped being the right claim when the seller top bar gained a way
     * back to the console: AppShell forwards an `isOperator` boolean now.
     *
     * Forwarding a boolean is not a branch. What the rule was protecting is
     * that the seller shell holds no operator CHROME and makes no operator
     * DECISION — it renders no operator component, imports nothing from the
     * console, and is never handed the means to work out who an operator is.
     * That is asserted directly, which is stronger than a word ban that a
     * rename would have walked straight through.
     */
    const source = code('components/layout/app-shell.tsx')
    expect(source).toContain('isOperator')
    for (const forbidden of [
      'Operator', // no OperatorShell, OperatorSidebar, OperatorBanner…
      'getAdminAccess',
      'canSuperAdminOnly',
      'AdminAccess',
      'visibleOperatorNav',
      '/admin',
    ]) {
      expect(source.replace(/isOperator/g, ''), forbidden).not.toContain(forbidden)
    }
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
      pageFor('/admin/users/[userId]')!,
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
      'admin/users/(list)/page.tsx',
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

/* ─────────────────── the shared state surfaces, in the console ───────────── */

describe('the operator console uses the shared state surfaces', () => {
  /*
   * components/ui/states.tsx was used by 23 seller files and ZERO operator
   * files. Every operator empty was
   *
   *     <Card className="p-[18px] text-small text-ink-2">No accounts yet…</Card>
   *
   * — no heading, no next step — and six pages carried an identical local
   * `Nothing()` helper with no title at all. There was no error.tsx anywhere
   * under app/(admin), so a throw lost the console chrome along with the page,
   * and no loading.tsx, so every screen showed a blank frame and then snapped.
   */

  /**
   * The skeleton that covers a screen, beside whatever file serves it.
   *
   * Derived from the page rather than from the screen name: /admin/users is
   * served out of a `(list)` route group now, so `admin/users/loading.tsx` is
   * no longer where its skeleton lives.
   */
  const loadingFor = (screen: string) =>
    posixJoin(pageFor(`/admin/${screen}`).replace(/\/page\.tsx$/, ''), 'loading.tsx')

  const QUERY_SCREENS = [
    'ai',
    'audit',
    'etsy',
    'managers',
    'metrics',
    'operations',
    'subscriptions',
    'usage',
    'users',
  ]

  it('has an error boundary INSIDE the group, so a throw keeps the chrome', () => {
    const boundary = posixJoin(ADMIN_ROOT, 'error.tsx')
    expect(existsSync(boundary)).toBe(true)
    const source = code(boundary)
    expect(source).toContain('ErrorState')
    expect(source).toContain('error.digest')
    expect(source).toContain('reset')
  })

  it('LEAKS NO STACK TRACE OR DATABASE MESSAGE, and invents no reference', () => {
    /*
     * `error.message` is never rendered. And the reference is Next's digest or
     * NOTHING: app/error.tsx used to invent one with a random generator, which
     * is worse than none — it sends someone into a support conversation
     * holding evidence that appears in no log.
     */
    const source = code(posixJoin(ADMIN_ROOT, 'error.tsx'))
    expect(source).not.toContain('error.message')
    expect(source).not.toContain('error.stack')
    expect(source).not.toMatch(/makeReference|randomUUID|Math\.random/)
  })

  it('gives every screen that runs a query a skeleton', () => {
    for (const screen of QUERY_SCREENS) {
      const loading = loadingFor(screen)
      expect(existsSync(loading), loading).toBe(true)
      const source = code(loading)
      expect(source, loading).toContain('Skeleton')
      // Announced as waiting. Every Skeleton is aria-hidden, so without this
      // the whole route announces as an empty region.
      expect(source, loading).toContain('aria-busy')
      expect(source, loading).toContain('aria-label')
    }
  })

  it('shapes each skeleton like its own page, not like a generic bar', () => {
    /*
     * The converse, and the one that has teeth: nine copies of the same
     * three-bar placeholder would satisfy every assertion above. Counting the
     * distinct skeleton bodies is what says they were shaped rather than
     * pasted.
     */
    const bodies = new Set(
      QUERY_SCREENS.map((screen) =>
        code(loadingFor(screen)).split('return (')[1]!.replace(/\s+/g, ' '),
      ),
    )
    expect(bodies.size).toBeGreaterThanOrEqual(6)
  })

  /**
   * A Card of bare text rendered because something is EMPTY.
   *
   * Matched as the branch rather than as the class, deliberately. The same
   * `p-[18px] text-small …` Card is also how the permissions screen renders
   * two explanatory notes, and those are not empty states — they have a
   * heading, a list, and they render whatever the data says. A rule that fired
   * on them would be true about the class and wrong about the page. What was
   * actually the defect is a length-zero branch whose whole content is a
   * paragraph in a box.
   */
  const BARE_EMPTY = /(?:length|size)\s*===\s*0\s*\?\s*\(\s*<Card[^>]*text-small/

  it('RENDERS NO BARE-TEXT EMPTY STATE on any operator page', () => {
    for (const page of pagesUnder(ADMIN_ROOT)) {
      const source = code(page)
      expect(source, page).not.toMatch(BARE_EMPTY)
      // And the six identical local helpers that did the same inside sections.
      expect(source, page).not.toContain('function Nothing')
      expect(source, page).not.toContain('<Nothing>')
    }
  })

  it('catches the shape it is looking for when it is really there', () => {
    // The positive control. Without it the rule above passes on a repository
    // where the spelling moved rather than the pattern.
    expect(
      BARE_EMPTY.test(
        'users.length === 0 ? (\n <Card className="p-[18px] text-small text-ink-2">No accounts yet.',
      ),
    ).toBe(true)
    expect(BARE_EMPTY.test('<Card className="p-[18px] text-small text-ink-2">A note.')).toBe(false)
  })

  it('still has an empty state on every screen that can be empty', () => {
    // The converse. "No bare text" is satisfied by deleting the empty states.
    for (const screen of QUERY_SCREENS) {
      const page = pageFor(`/admin/${screen}`)
      expect(code(page), page).toContain('<EmptyState')
    }
  })

  it('gives every empty state a title AND a description', () => {
    /*
     * The complaint was not that the empties were missing — it was that they
     * were a sentence with no heading and no next step. A title prop that is
     * present but blank would pass a looser check than this one.
     */
    let counted = 0
    for (const page of pagesUnder(ADMIN_ROOT)) {
      const source = code(page)
      for (const match of source.matchAll(/<EmptyState\b([\s\S]*?)\/>/g)) {
        const props = match[1]!
        expect(props, page).toMatch(/title=\{?[`'"]?.{8,}/)
        expect(props, page).toMatch(/description=/)
        counted += 1
      }
    }
    // Anti-vacuity: a regex that matched nothing would pass the loop above.
    expect(counted).toBeGreaterThanOrEqual(17)
  })

  it('renders an unavailable figure through UnavailableCard, never an em dash', () => {
    /*
     * admin/ai, admin/users/[userId] and admin/metrics each re-implemented an
     * unavailable figure locally as `—` plus a paragraph. One component draws
     * it now, and the branch is what makes "a null value cannot render as a
     * number" true by construction rather than by care.
     */
    const figure = code('components/admin/operator-figure.tsx')
    expect(figure).toContain('UnavailableCard')
    expect(figure).toContain('figure.value === null')
    // Both branches carry a badge: unavailable IS a provenance class.
    expect(figure.match(/badge/g)?.length ?? 0).toBeGreaterThanOrEqual(3)

    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).not.toContain('function Figure(')
    }
  })
})

/* ────────────────── numbers formatted by the shared rule ─────────────────── */

describe('the operator console formats no number of its own', () => {
  /*
   * components/ui/numeric.tsx was used by 12 seller pages and 20 seller
   * components, and by ZERO operator files — which wrote the `tnum` class out
   * by hand 38 times instead.
   *
   * THIS IS NOT STYLING. Those primitives carry two rules that cannot be
   * remembered one cell at a time:
   *
   *   a figure never wraps, because "−$13.42" broken across two lines reads as
   *   a dash and then a number;
   *
   *   a null money value renders as an em dash and NEVER 0.00, because a zero
   *   in a money column is a claim and "we do not know" is not zero.
   *
   * admin/subscriptions rendered a plan price as raw formatCurrency. A missing
   * price there would have read as FREE.
   */

  it('CONTAINS NO LITERAL tnum ON ANY OPERATOR PAGE', () => {
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).not.toContain('tnum')
    }
  })

  it('keeps tnum in the primitives, which is the only place it belongs', () => {
    // The converse: "no tnum" is satisfied by a console that lost tabular
    // figures altogether, which is a silent visual regression.
    const numeric = code('components/ui/numeric.tsx')
    expect(numeric.match(/tnum/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('renders every operator figure through Numeric, Money or a cell', () => {
    const users = pagesUnder(ADMIN_ROOT).filter((page) =>
      /<(Numeric|Money|NumericCell)\b/.test(code(page)),
    )
    expect(users.length).toBeGreaterThanOrEqual(9)
  })

  it('SENDS THE ONE PRICE THROUGH Money, so a missing one cannot read as free', () => {
    const page = posixJoin(ADMIN_ROOT, 'admin/subscriptions/page.tsx')
    const source = code(page)
    expect(source).toContain('<Money value={entry.plan.priceMonthly}')
    // formatCurrency has no fallback shape at all: it takes a number and
    // returns a string, so there is nowhere for "not known" to go.
    expect(source).not.toContain('formatCurrency')
  })

  it('leaves formatCurrency nowhere in the operator console', () => {
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).not.toContain('formatCurrency(')
    }
  })

  it('does not dress non-numbers as numerals', () => {
    /*
     * Three of the 38 were not figures at all: an OAuth scope, and two table
     * names in prose. Turning those into <Numeric> would have satisfied the
     * rule above while making the rule mean nothing — `tnum` on a word is a
     * class that does nothing, and a Numeric around one is a lie about what
     * the element holds. They lost the class instead.
     */
    const detail = code(pageFor('/admin/users/[userId]'))
    expect(detail).toMatch(/<li[\s\S]{0,200}\{scope\}/)
    expect(detail).not.toMatch(/<Numeric[^>]*>\s*\{scope\}/)
    expect(code(posixJoin(ADMIN_ROOT, 'admin/usage/page.tsx'))).toContain('<code>usage_records</code>')
  })
})

/* ───────────────── every operator number says where it came from ─────────── */

describe('an operator figure cannot render without its provenance', () => {
  /*
   * ══════════════════════════════════════════════════════════════════════
   *   THE OPERATOR SCREENS ARE WHERE "WHY IS THIS SELLER'S FIGURE WRONG"
   *   IS ANSWERED, AND THEY WERE THE ONES NOT SAYING WHERE A FIGURE CAME
   *   FROM.
   * ══════════════════════════════════════════════════════════════════════
   *
   * A seller saw a chip on every figure and a clickable methodology on four
   * screens. An operator saw a bare number on 7 of 13, and the clickable
   * methodology on none. That is worse than an inconsistency: the person
   * asked to explain a discrepancy was the one working from numbers that did
   * not say whether they were measured or inferred.
   */

  const COUNTING_MODULES = [
    'domain/admin/usage.ts',
    'domain/admin/subscriptions.ts',
    'domain/admin/operations.ts',
    'domain/admin/etsy-health.ts',
    'domain/admin/metrics.ts',
  ]

  it('finds the modules it is meant to be checking', () => {
    for (const module of COUNTING_MODULES) expect(existsSync(module), module).toBe(true)
  })

  it('RETURNS Provenanced COUNTS, never a bare number', () => {
    /*
     * The structural half, and the reason there is so little test here: the
     * TYPE does the work. `count: Provenanced<number>` on every count row
     * means a bare number cannot reach OperatorFigure, which accepts only
     * Provenanced<T>. Four pages failed to compile the moment these changed,
     * which is the check — this assertion only stops the types being quietly
     * loosened back.
     */
    for (const module of COUNTING_MODULES) {
      expect(code(module), module).toMatch(/count:\s*Provenanced<number>/)
      expect(code(module), module).not.toMatch(/^\s*count:\s*number$/m)
    }
  })

  it('takes ONLY a Provenanced figure, so a bare number does not compile', () => {
    const figure = code('components/admin/operator-figure.tsx')
    expect(figure).toMatch(/figure:\s*Provenanced<string \| number>/)
    expect(figure).not.toMatch(/figure\?:/)
  })

  it('CLASSIFIES BY WHAT IS TRUE, not by what flatters', () => {
    /*
     * Each of these is a decision that could have gone the comfortable way.
     *
     * Usage is CALCULATED because usage_records.used is never written — the
     * screen counts rows and compares them with a limit, and calling that
     * verified would be the single most misleading badge in the console,
     * since usage is exactly what an operator is asked to check when a seller
     * says a limit is wrong.
     */
    expect(code('domain/admin/usage.ts')).toContain('countedUsage(')
    expect(code('domain/admin/usage.ts')).not.toContain('countedRows(')

    // Subscriptions and operations count rows in our own tables: VERIFIED.
    expect(code('domain/admin/subscriptions.ts')).toContain('countedRows(')
    expect(code('domain/admin/operations.ts')).toContain('countedRows(')

    // Etsy health is BOTH, and that is the point: a state a row carries is
    // verified, a state that comes from a threshold we chose is calculated.
    const health = code('domain/admin/etsy-health.ts')
    expect(health).toContain('countedRows(')
    expect(health).toContain('countedAgainstThreshold(')

    // Onboarding is UNAVAILABLE, because nothing writes the column.
    expect(code('domain/admin/metrics.ts')).toContain('fromUnmaintainedColumn(')
  })

  it('does not badge the onboarding funnel as CALCULATED', () => {
    /*
     * The one that would be easiest to get wrong and hardest to notice.
     * Calculated says "we worked this out", which invites the reader to
     * believe the result. There is no result here to believe: the column
     * defaults to NOT_STARTED and nothing writes it.
     */
    const provenance = code('domain/admin/provenance.ts')
    const start = provenance.indexOf('export function fromUnmaintainedColumn')
    expect(start).toBeGreaterThan(-1)
    const body = provenance.slice(start, start + 260)
    expect(body).toContain('unavailable(')
    expect(body).not.toContain('calculated(')
  })

  it('RENDERS A BADGE ON EVERY SCREEN THE REPORT NAMED', () => {
    for (const screen of ['usage', 'subscriptions', 'operations', 'etsy', 'metrics', 'ai']) {
      const page = posixJoin(ADMIN_ROOT, `admin/${screen}/page.tsx`)
      expect(code(page), page).toContain('<OperatorFigure')
    }
  })

  it('gives every operator metricKey a real methodology behind it', () => {
    /*
     * ProvenanceButton renders a STATIC badge for a key with no entry — a
     * dead control is worse than no control — so a typo here would silently
     * leave the figure unclickable and every other assertion would still
     * pass. This is what catches that.
     */
    const registry = code('lib/provenance/methodology.ts')
    const used = new Set<string>()
    for (const page of pagesUnder(ADMIN_ROOT)) {
      const source = code(page)
      // BOTH spellings. A figure standing alone keeps its own clickable badge
      // (`metricKey="…"`); a dense grid of figures offers one for the panel
      // through OperatorSection (`methodology={{ key: '…' }}`), because five
      // 24px targets side by side fail WCAG 2.2 target-size — measured.
      for (const match of source.matchAll(/metricKey="([^"]+)"/g)) used.add(match[1]!)
      for (const match of source.matchAll(/key: '(operator\w+)'/g)) used.add(match[1]!)
    }
    expect(used.size).toBeGreaterThanOrEqual(6)
    for (const key of used) {
      expect(registry, key).toMatch(new RegExp(`\\n  ${key}:\\s*\\{`))
    }
  })

  it('writes no operator methodology that contradicts its own figure', () => {
    /*
     * The badge type comes from the DOMAIN and the drawer's type comes from
     * the REGISTRY, so the two can disagree — and a drawer headed "Verified"
     * over a figure badged "Calculated" is worse than either alone. Checked
     * on the two where the classification is the whole argument.
     */
    const registry = code('lib/provenance/methodology.ts')
    const entryFor = (key: string) => {
      const at = registry.indexOf(`\n  ${key}: {`)
      return registry.slice(at, at + 400)
    }
    expect(entryFor('operatorUsage')).toContain("type: 'CALCULATED'")
    expect(entryFor('operatorOnboarding')).toContain("type: 'UNAVAILABLE'")
    expect(entryFor('operatorPlanMix')).toContain("type: 'VERIFIED'")
  })
})

/* ──────── the definition under the badge is true where it is rendered ────── */

describe('a methodology drawer credits the source the figure actually used', () => {
  /*
   * FOUND BY READING THE DRAWER on a running server, not by any test.
   *
   * PROVENANCE_DEFINITION.VERIFIED is "Etsy returned it for your own shop.
   * Exact." — correct on every seller screen, and FALSE on every operator one.
   * A verified operator figure is a count of rows in our own tables, and the
   * operator console makes no Etsy call at all (D94/D94a). The drawer was
   * crediting a source the figure had not touched, under a heading that says
   * Verified, on the screens whose whole job is to be trusted about where a
   * number came from.
   *
   * An override on the entry rather than a broader canonical sentence: that
   * sentence is the published definition on the Methodology page, and
   * loosening it to cover both would make a seller-facing promise vaguer in
   * order to fix an operator-facing screen.
   */

  const REGISTRY = 'lib/provenance/methodology.ts'

  function operatorEntries(): [string, string][] {
    const source = code(REGISTRY)
    const out: [string, string][] = []
    for (const match of source.matchAll(/\n {2}(operator\w+): \{([\s\S]*?)\n {2}\},/g)) {
      out.push([match[1]!, match[2]!])
    }
    return out
  }

  it('finds the operator entries it is meant to be checking', () => {
    expect(operatorEntries().length).toBeGreaterThanOrEqual(7)
  })

  it('CREDITS ETSY FOR NOTHING, on any operator metric', () => {
    for (const [key, body] of operatorEntries()) {
      expect(body, `${key} source`).toMatch(/source:\s*['"]EtsyPilot database/)
    }
  })

  it('overrides the canonical definition wherever it names Etsy as the source', () => {
    const canonicalCreditsEtsy = new Set(['VERIFIED', 'UNAVAILABLE'])
    for (const [key, body] of operatorEntries()) {
      const type = body.match(/type:\s*'(\w+)'/)?.[1]
      if (!type || !canonicalCreditsEtsy.has(type)) continue
      expect(body, `${key} (${type}) must not inherit the Etsy-crediting definition`).toContain(
        'definition:',
      )
    }
  })

  it('has a drawer that prefers the override', () => {
    const drawer = code('components/provenance/methodology-drawer.tsx')
    expect(drawer).toContain('methodology.definition ?? PROVENANCE_DEFINITION')
  })

  it('leaves the published seller definitions exactly as they were', () => {
    // The override exists so this sentence did not have to change. If it ever
    // does, the Methodology page and this constant have to move together.
    const types = code('lib/provenance/types.ts')
    expect(types).toContain("VERIFIED: 'Etsy returned it for your own shop. Exact.'")
    expect(types).toContain("UNAVAILABLE: 'Etsy does not expose it. We show nothing, not a guess.'")
  })
})

/* ──────────────── card internals, and the phone navigation ───────────────── */

const SECTION = 'components/admin/operator-section.tsx'

describe('the operator console composes cards rather than padding them', () => {
  /*
   * A sixth identical helper. `function Section({ title, blurb, children })`
   * existed verbatim in five operator pages and a sixth time in metrics,
   * differing only by a missing `mb-3` — after the local `Nothing()` empty
   * state and the table wrapper, which is three.
   */

  it('finds the shared section', () => {
    expect(existsSync(SECTION)).toBe(true)
  })

  it('WRITES p-[18px] ON NO OPERATOR PAGE', () => {
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).not.toContain('p-[18px]')
    }
  })

  it('keeps the padding in the primitives', () => {
    // The converse: "no p-[18px]" is satisfied by a console with no padding.
    const card = code('components/ui/card.tsx')
    expect(card.match(/p-\[18px\]/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('declares no local Section helper anywhere', () => {
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).not.toMatch(/^function Section\(/m)
    }
  })

  it('keeps the heading LEVEL with the page and the SIZE with the component', () => {
    /*
     * CardTitle renders an h3 by default. Adopting it unchanged would have
     * made every operator section skip from the page's h1 to an h3 — a worse
     * outcome than the hand-rolled heading it replaced. And its 15px would
     * have grown six screens' section titles as a side effect of a refactor
     * nobody asked to change the design.
     */
    const card = code('components/ui/card.tsx')
    expect(card).toMatch(/as: Tag = 'h3'/)
    const section = code(SECTION)
    expect(section).toContain('as="h2"')
    expect(section).toContain('text-small')
  })
})

describe('the phone navigates through the drawer, and nothing else', () => {
  /*
   * A permission-derived bottom tab bar was built here and then removed: it
   * worked as specified — four visible items plus a More for a super admin,
   * two and no More for a manager — and the owner did not want it. Operator
   * navigation is the rail and its drawer, for all three roles, which is what
   * it was before the bar.
   *
   * The tests that asserted the bar's own behaviour went with it rather than
   * being left pointing at a file that does not exist. What survives is the
   * part that was never about the bar: the DRAWER offers exactly what each
   * role may see, which is the claim the bar borrowed from it.
   */

  it('renders no bottom tab bar in the operator shell', () => {
    expect(existsSync('components/admin/operator-mobile-tabs.tsx')).toBe(false)
    const shell = code(SHELL)
    expect(shell).not.toContain('MobileTabs')
    // And the seller app keeps its own, which this decision does not touch.
    expect(existsSync('components/layout/mobile-tabs.tsx')).toBe(true)
  })

  it('leaves the drawer owning its own open state, with no second opener', () => {
    /*
     * The shared context existed only so the bar's "More" could open this
     * drawer. One opener again, so the flag lives where it is used — a context
     * nobody needs is a place for two components to disagree later.
     */
    expect(existsSync('components/admin/operator-drawer.tsx')).toBe(false)
    expect(code(DRAWER)).toContain('useState(false)')
    expect(code(DRAWER).match(/aria-controls="operator-nav"/g)?.length ?? 0).toBe(1)
  })

  it('reserves no room below lg for a bar that is not there', () => {
    // The scroller carried pb-20 so content could clear the bar.
    expect(code(SHELL)).not.toContain('pb-20')
  })

  it('OFFERS EXACTLY WHAT EACH ROLE MAY SEE, which is the drawer\u2019s job now', () => {
    /*
     * Kept from the deleted block, because it was never a claim about the bar:
     * visibleOperatorNav is what the rail and the drawer both render.
     */
    const forManager = visibleOperatorNav(viewer('users.view')).flatMap((g) => g.items)
    expect(forManager.map((item) => item.href)).toEqual(['/admin/users', '/admin/managers'])

    const forSuper = visibleOperatorNav({
      can: () => true,
      canSuperAdminOnly: () => true,
    }).flatMap((g) => g.items)
    expect(forSuper.length).toBeGreaterThan(4)
    expect(forSuper.every((item) => item.href.startsWith('/admin/'))).toBe(true)
  })
})

/* ──────────────────── the heading outline of a screen ────────────────────── */

describe('no operator screen skips a heading level', () => {
  /*
   * FOUND BY SWEEPING THE RENDERED PAGES, not by reading the source. A sweep
   * of the ten operator screens reported the outline "H1,H3" on /admin/audit
   * and a clean "H1,H2,H2…" everywhere else — and /admin/audit was the one
   * page whose entire content was an empty state.
   *
   * EmptyState rendered an h3. Every page that uses it has exactly one other
   * heading, the h1 in PageHeader, so the h3 skipped a level — on 23 seller
   * screens as well as the nine operator ones that had just adopted it. A
   * screen reader navigating by heading is told there is a section it missed.
   */

  it('renders the page-level empty AND error states as an h2', () => {
    /*
     * Both, because they are the same shape in the same place: a block that
     * replaces a page's content under that page's single h1. ErrorState had
     * the same skip and the sweep could not see it — an error boundary only
     * renders when something throws.
     */
    const states = code('components/ui/states.tsx')
    expect(states.match(/<h2 className="text-section text-ink-1">/g)?.length).toBe(2)
    expect(states).not.toContain('<h3 className="text-section')
  })

  it('renders the QUIET one as an h3, because it sits under a section h2', () => {
    // Not the same fix twice. The quiet form is inside a panel whose own title
    // is an h2, so h3 is the level that does NOT skip there.
    const states = code('components/ui/states.tsx')
    expect(states).toContain('<h3 className="text-small font-semibold text-ink-1">')
  })

  it('leaves the size alone: this changed what the heading is, not how it looks', () => {
    expect(code('components/ui/states.tsx')).toContain('text-section')
  })

  it('gives every operator section an h2 under the page h1', () => {
    const section = code(SECTION)
    expect(section).toContain('as="h2"')
  })
})

/* ─────────────── one navigation per landmark name, on a phone ────────────── */

describe('the two operator navigations do not share one name', () => {
  /*
   * FOUND WHILE ADDING A BOTTOM BAR, and it outlived the bar. The rail and the
   * drawer both carried aria-label="Operator sections"; a third nav made that
   * three identical choices for anyone navigating by landmark. The bar is gone
   * and the distinct names stay, because the rail and the drawer can still
   * both be in the document — the rail is rendered at every width and hidden
   * below lg by CSS, not omitted.
   */
  it('gives each navigation its own label', () => {
    const labels = [code('components/admin/operator-sidebar.tsx'), code(DRAWER)].map(
      (source) => source.match(/aria-label="([^"]+)"/)?.[1],
    )
    expect(labels.every(Boolean)).toBe(true)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('leaves the seller app\u2019s own bar alone', () => {
    // Removing the operator bar was an operator-side decision.
    expect(code('components/layout/mobile-tabs.tsx')).toContain('aria-label="Primary"')
  })
})

/* ──────────── the gate decides before the response starts streaming ─────── */

describe('a skeleton cannot cost the operator gate its status code', () => {
  /*
   * The regression this pair exists to prevent, because it happened:
   * a loading.tsx under each operator route put every page inside a Suspense
   * boundary,
   * Next began streaming, and the 200 was on the wire before the page's
   * requireAdmin() ran. Every skeletoned route answered 200 with 404 copy.
   */
  it('gates in the LAYOUT, above every route-level Suspense boundary', () => {
    expect(code(LAYOUT)).toContain('notFound()')
  })

  it('still gates every page as well, so the layout is not the only check', () => {
    /*
     * The layout answers "is this an operator at all". Each page answers "may
     * this operator see THIS", which the layout cannot know. Removing either
     * leaves a hole, so both are asserted.
     */
    for (const page of pagesUnder(ADMIN_ROOT)) {
      expect(code(page), page).toContain('requireAdmin(')
    }
  })
})

/* ───────────────── the description has a measure, not a viewport ─────────── */

describe('a page description is constrained to a readable width', () => {
  /*
   * Moving the operator pages onto PageHeader lost a width the hand-rolled
   * headings had. MEASURED at 1920: the managers description was ONE line
   * 1,462px wide — 235 characters — and Accounts 1,126px.
   */
  it('constrains the subtitle the way EmptyState constrains its description', () => {
    expect(code('components/layout/page-header.tsx')).toMatch(
      /max-w-prose[^"]*text-small text-muted-1/,
    )
    // The rule it is borrowed from, so the two cannot drift apart silently.
    expect(code('components/ui/states.tsx')).toContain('max-w-prose')
  })

  it('leaves the heading itself unconstrained', () => {
    // A title is short and centred on nothing; wrapping one at 65ch would
    // break an account's email address across lines on the detail screen.
    const header = code('components/layout/page-header.tsx')
    const h1 = header.indexOf('<h1')
    expect(header.slice(h1, header.indexOf('>', h1))).not.toContain('max-w-prose')
  })
})
