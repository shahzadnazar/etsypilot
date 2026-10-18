/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE LANDING PAGE, HELD TO THE FOUR DEFECTS IT WAS BUILT TO FIX.
 *
 *   ISSUE 1  the signup CTA that went nowhere
 *   ISSUE 2  the fee arithmetic that was written into the markup
 *   ISSUE 3  the design tokens that did not match the design document
 *   ISSUE 4  the dropdowns no keyboard could open
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Issue 3 has its own file (tests/unit/design-tokens.test.ts) because it is a
 * comparison between two documents rather than a property of this page. The
 * other three are here, alongside the copy the owner set verbatim and the
 * structural rules — one <h1>, no dead hrefs — that a redesign is most likely
 * to break by accident.
 *
 * ── WHY SOURCE-LEVEL AND NOT A RENDER ────────────────────────────────────
 *
 * Both, actually: tests/browser/landing-page.py drives the real page in a real
 * browser and checks what a visitor can DO — open a menu with the keyboard,
 * type a price and read a loss. This file checks what cannot be seen from
 * outside: that the arithmetic has one home, that `aria-expanded` is rendered
 * from state rather than written as a literal, that no `href` is a fragment
 * nothing answers to.
 *
 * A browser check cannot see the difference between a correct fee total and a
 * correct fee total computed twice, and it is the second copy that goes wrong
 * six months from now.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { posixJoin } from '../support/paths'

/** A file with its comments removed, so prose about a defect is not the defect. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

/** Every .tsx under a directory. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = posixJoin(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (path.endsWith('.tsx')) out.push(path)
  }
  return out
}

/*
 * The public surface: the marketing route group and the components only it
 * renders. Deliberately not all of `components/` — the dashboard's own files
 * are a different set of rules, and sweeping them here would make this file
 * fail for reasons that have nothing to do with the landing page.
 */
const SURFACE = [...walk('app/(marketing)'), ...walk('components/marketing')]

const PAGE = code('app/(marketing)/page.tsx')
const NAV = code('components/marketing/nav.tsx')
const HERO = code('components/marketing/hero.tsx')
const SECTIONS = code('components/marketing/sections.tsx')

/**
 * Every id the public surface renders.
 *
 * Two spellings, because the page declares ids two ways. Most are literal
 * `id="profit"` attributes; the three feature rows carry `id={row.id}` and
 * take their value from a `rows` array, because they are rendered by one
 * component in a loop. A sweep that only read the attribute form reported the
 * nav's `/#discover` as dangling while the anchor was on the page — so it
 * reads both, and `anchorFields` is narrow enough (`id: 'slug'`) that it
 * cannot drag in unrelated object keys.
 */
function renderedIds(): Set<string> {
  const ids = new Set<string>()
  for (const file of SURFACE) {
    const text = code(file)
    for (const match of text.matchAll(/id="([a-z0-9-]+)"/g)) ids.add(match[1]!)
    for (const match of text.matchAll(/\bid:\s*'([a-z0-9-]+)'/g)) ids.add(match[1]!)
  }
  return ids
}

describe('the public surface this file is sweeping', () => {
  it('finds every file it is meant to be checking', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(SURFACE.length).toBeGreaterThanOrEqual(8)
    expect(SURFACE).toContain('app/(marketing)/page.tsx')
    expect(SURFACE).toContain('app/(marketing)/pricing/page.tsx')
    expect(SURFACE).toContain('components/marketing/nav.tsx')
    expect(SURFACE).toContain('components/marketing/previews.tsx')
  })
})

/* ═══════════════════════════════ the copy the owner set ═══════════════════ */

describe('the headline and the opening copy are the owner’s, word for word', () => {
  it('states the headline in two sentences and two tones, inside one heading', () => {
    /*
     * Approved verbatim and not to be edited for rhythm. It is also the one
     * <h1> on the site, which is why it is two coloured spans inside a single
     * heading rather than two headings — a reader of headings should hear one.
     */
    expect(HERO).toContain('Find Better Keywords.')
    expect(HERO).toContain('Know Your Real Profit.')

    const h1 = HERO.slice(HERO.indexOf('<h1'), HERO.indexOf('</h1>'))
    expect(h1).toContain('Find Better Keywords.')
    expect(h1).toContain('Know Your Real Profit.')
    // The second sentence carries the brand colour, the first the charcoal.
    expect(h1).toMatch(/color:\s*'var\(--brand\)'/)
    expect(HERO).toMatch(/style=\{\{\s*color:\s*'var\(--ink-1\)'\s*\}\}/)
  })

  it('states the description verbatim, including the em dash', () => {
    const description = HERO.replace(/\s+/g, ' ')
    expect(description).toContain(
      'Research Etsy keywords, check listings with evidence, monitor shop performance, and make safer bulk updates — all in one place.',
    )
  })

  it('names the two calls to action exactly as approved', () => {
    expect(HERO).toContain('Start for Free')
    expect(HERO).toContain('Explore Features')
    // And the primary one appears in the nav too, where the design puts it.
    expect(NAV).toContain('Start for Free')
  })
})

/* ═══════════════════════════ ISSUE 1 — the dead CTA ══════════════════════ */

describe('ISSUE 1 — every call to action goes somewhere that exists', () => {
  it('sends "Start for Free" to the real signup route', () => {
    /*
     * The export sent it to `#signup`, and no element on the page carried
     * `id="signup"` — so the primary call to action scrolled nowhere and the
     * page's one conversion path was broken in the only place it mattered.
     *
     * /signup is a real route with a real Supabase sign-up behind it
     * (app/(public)/signup), which is what makes this honest rather than
     * merely non-broken: the alternative fix — a fake form that collects an
     * email and says "thanks" — would have been worse than the bug.
     */
    for (const file of [HERO, NAV, SECTIONS]) {
      expect(file).toMatch(/href="\/signup"/)
    }
  })

  it('carries no fragment that nothing on the page answers to', () => {
    const dangling: string[] = []

    /*
     * Every `href="#x"` and `href="/#x"` across the public surface, checked
     * against the `id="x"` attributes the same surface renders. This is the
     * assertion that fails if a section is renamed and a nav item is not.
     */
    const ids = renderedIds()

    for (const file of SURFACE) {
      for (const match of code(file).matchAll(/href="\/?#([a-z0-9-]+)"/g)) {
        if (!ids.has(match[1]!)) dangling.push(`${file}: #${match[1]}`)
      }
    }

    expect(dangling, 'an href points at a fragment no element provides').toEqual([])
  })

  it('finds the fragments it is meant to be resolving', () => {
    // The negative control for the sweep above: if the id set were empty, the
    // check would pass by finding nothing to compare.
    const ids = renderedIds()
    /*
     * `calculator` was in this list and is not any more: the homepage
     * calculator section was removed and the nav item that pointed at it now
     * goes to /tools/etsy-seller-calculator, a route rather than a fragment.
     * `how-it-works` takes its place as a new section with an id.
     */
    /*
     * `keywords` was on this list and is not any more: the keyword panel's id
     * moved onto the Discover row when the three steps became three equal
     * rows, and that row is `discover`. The nav and footer were updated with
     * it; the sweep above is what would catch either half being forgotten.
     */
    for (const anchor of ['features', 'discover', 'profit', 'listings', 'how-it-works', 'faq']) {
      expect(ids, `#${anchor} is linked from the nav`).toContain(anchor)
    }
  })

  it('carries no bare href="#" anywhere on the public surface', () => {
    /*
     * The export had three. A `href="#"` is a link that scrolls to the top of
     * the page, which to a sighted user reads as a broken button and to a
     * screen-reader user is announced as a link with no destination.
     */
    const offenders = SURFACE.filter((file) => /href="#"/.test(code(file)))
    expect(offenders).toEqual([])
  })

  it('does not name a signup fragment at all any more', () => {
    const offenders = SURFACE.filter((file) => /href="\/?#signup"/.test(code(file)))
    expect(offenders).toEqual([])
  })

  it('shows no account controls to a visitor who is not signed in', () => {
    /*
     * The nav is rendered for strangers only — the product's own shell takes
     * over after /login — so an avatar, an account menu or a "My shop" link
     * here would be chrome for a session that does not exist.
     */
    expect(NAV).toMatch(/href="\/login"/)
    expect(NAV).not.toMatch(/avatar|UserMenu|initials/i)
  })
})

/* ════════════════════════ ISSUE 2 — the fee arithmetic ═══════════════════ */

/*
 * ── THE CALCULATOR CAME OFF THE HOMEPAGE, AND THESE TESTS FOLLOWED IT ────
 *
 * This block used to read components/marketing/profit-calculator.tsx and
 * assert that the component owned no arithmetic, no rates and no clamp. The
 * owner removed the calculator section from the homepage; nothing else
 * rendered that component, so it is gone, and there is a public calculator
 * with a URL of its own at /tools/etsy-seller-calculator.
 *
 * THE DOMAIN ASSERTIONS DID NOT GO WITH IT. The defect ISSUE 2 named was
 * never really in the markup — `Math.max(0, netProfit)` renders a product
 * losing $6 a sale as "$0.00", which reads as break-even, and a seller acting
 * on that keeps selling it. That rule belongs to the arithmetic, and the
 * arithmetic is still here, still used by /tools and still covered by the ten
 * cases in tests/unit/product-profit.test.ts. So the no-clamp guard is kept
 * and pointed at the domain, which is where it should always have been.
 *
 * What is NOT kept is anything that only described the component: the dated
 * rate table on screen, the editable fee fields, the red-on-loss styling.
 * Those were properties of a surface that no longer exists, and a test that
 * asserts them against nothing is a test that passes for the wrong reason.
 */
describe('ISSUE 2 — a loss is never clamped to zero', () => {
  const DOMAIN = code('domain/product-profit/calculate.ts')

  it('has the domain function it is meant to be checking', () => {
    // A sweep over an empty string passes every assertion below perfectly.
    expect(DOMAIN.length).toBeGreaterThan(1000)
    expect(DOMAIN).toContain('export function calculateProductProfit')
  })

  it('never clamps a profit, a margin or a total', () => {
    /*
     * The domain clamps INPUTS — a negative materials cost is a typo — and
     * that is a different operation on a different value, so the check is
     * specific about which: nothing may clamp an output.
     */
    expect(DOMAIN).not.toMatch(/Math\.max\(\s*0\s*,\s*[^)]*(profit|margin|net|total)/i)
  })

  it('returns a negative profit and a negative margin rather than withholding them', () => {
    expect(DOMAIN).toContain('marginPercent: revenue === 0 ? null')
    expect(DOMAIN).toContain('profit < 0')
  })

  it('still reaches a calculator a visitor can use, on a route of its own', () => {
    /*
     * The homepage section is gone; the public calculator is not. This is the
     * assertion that would fail if removing the section had quietly left the
     * product with no public calculator at all.
     */
    expect(() =>
      readFileSync('app/(public)/tools/etsy-seller-calculator/page.tsx', 'utf8'),
    ).not.toThrow()
    // And the nav still points at it, rather than at the fragment it used to.
    expect(NAV).toContain('href="/tools/etsy-seller-calculator"')
    expect(NAV).not.toContain('#calculator')
  })
})

/* ═════════════════════ ISSUE 4 — the dropdown accessibility ══════════════ */

describe('ISSUE 4 — the menus open for a keyboard and tell the truth about it', () => {
  it('renders aria-expanded from state, never as a literal', () => {
    /*
     * The export hardcoded `aria-expanded="false"` on menus that opened on
     * hover. An attribute that says "closed" on an open, painted menu is
     * worse than no attribute: it is a statement, and it is false.
     *
     * Rendering it from the same state that decides whether the panel exists
     * makes the two unable to disagree.
     */
    const offenders = SURFACE.filter((file) => /aria-expanded="(true|false)"/.test(code(file)))
    expect(offenders, 'aria-expanded is written as a literal').toEqual([])

    expect(NAV).toContain('aria-expanded={open}')
    expect(NAV).toContain('aria-expanded={mobileOpen}')
  })

  it('opens every menu from a real button, not a hover target', () => {
    const trigger = NAV.slice(NAV.indexOf('function NavMenu'))
    expect(trigger).toMatch(/<button[\s\S]*?type="button"/)
    expect(trigger).toContain('onClick={() => setOpen((value) => !value)}')
  })

  it('closes on Escape, returns focus to the trigger, and closes on an outside click', () => {
    expect(NAV).toContain("event.key !== 'Escape'")
    expect(NAV).toContain('trigger.current?.focus()')
    expect(NAV).toContain("document.addEventListener('pointerdown'")
    expect(NAV).toContain('wrapper.current?.contains(event.target as Node)')
  })

  it('removes both listeners when the menu closes', () => {
    // A document-level keydown left behind by every menu that has ever been
    // opened is how a page acquires an Escape key that does six things.
    expect(NAV).toContain("document.removeEventListener('keydown'")
    expect(NAV).toContain("document.removeEventListener('pointerdown'")
  })

  it('keeps hover for a pointer without making it the only way in', () => {
    // onPointerEnter, guarded on pointerType, rather than a CSS :hover rule —
    // so one piece of state drives both ways in and a touch tap gets the
    // click behaviour.
    expect(NAV).toContain('onPointerEnter')
    expect(NAV).toContain("event.pointerType !== 'touch'")
    expect(NAV).not.toMatch(/group-hover|hover:visible/)
  })

  it('unmounts a closed panel rather than hiding it with a class', () => {
    // display:none keeps the links in the DOM for a reader walking by element
    // rather than by focus. Unmounting answers both.
    expect(NAV).toMatch(/\{open \?/)
    expect(NAV).toMatch(/\{mobileOpen \?/)
    expect(NAV).not.toMatch(/className="[^"]*\bhidden\b[^"]*"[\s\S]{0,80}aria-expanded/)
  })

  it('gives the mobile menu a toggle with a name that changes with its state', () => {
    expect(NAV).toContain('aria-controls={mobileId}')
    expect(NAV).toMatch(/aria-label=\{mobileOpen \?/)
  })

  it('gives touch targets room, from the stylesheet rather than per call site', () => {
    const css = readFileSync('styles/marketing.css', 'utf8')
    expect(css).toMatch(/\.marketing \.mobile-link\s*\{[^}]*min-height:\s*4[46]px/)
    expect(css).toMatch(/\.marketing \.nav-link\s*\{[^}]*min-height:\s*4[02]px/)
    /*
     * And this stylesheet sets no `display` on a nav link.
     *
     * `.marketing .nav-link` is specificity (0,2,0) against Tailwind's
     * `.hidden` at (0,1,0), so a `display` here silently defeated
     * `hidden sm:inline-flex` on the "Log in" link — which then appeared,
     * wrapped onto two lines, in a 390px header beside the mobile menu button
     * that exists to prevent exactly that. The display mode belongs in the
     * markup, with the responsive variants that modify it.
     */
    const navRule = css.slice(css.indexOf('.marketing .nav-link {'))
    expect(navRule.slice(0, navRule.indexOf('}'))).not.toMatch(/display:/)
  })

  it('makes focus visible on every interactive element of the public pages', () => {
    const css = readFileSync('styles/marketing.css', 'utf8')
    expect(css).toMatch(/:focus-visible/)
    expect(css).toMatch(/outline:\s*2px solid var\(--brand\)/)
  })
})

/* ════════════════════════════ structure and honesty ══════════════════════ */

describe('the page’s structure', () => {
  it('has exactly one h1 per public page', () => {
    /*
     * Not one across the surface — /pricing has its own — but exactly one on
     * each. The landing page's lives in the hero component, so the count is
     * taken over the page plus everything it renders.
     */
    const landing = [PAGE, HERO, code('components/marketing/previews.tsx'), SECTIONS]
      .join('\n')
      .match(/<h1[\s>]/g)
    expect(landing?.length ?? 0).toBe(1)

    const pricing = [code('app/(marketing)/pricing/page.tsx'), SECTIONS].join('\n').match(/<h1[\s>]/g)
    expect(pricing?.length ?? 0).toBe(1)
  })

  it('renders the approved sections in the approved order', () => {
    /*
     * The owner's order, and it is checked as an ORDER rather than as a set:
     * every one of these is somewhere on the page is a weaker claim than the
     * page reads in this sequence, and the sequence is the thing a
     * restructure breaks by accident.
     */
    const order = [
      'MarketingNav',
      'Hero',
      'WhyChoose',
      'Benefits',
      'ShopPerformance',
      'BulkUpdates',
      'HowItWorks',
      'PricingSection',
      'Faq',
      'MarketingFooter',
    ]
    const positions = order.map((name) => PAGE.indexOf(`<${name}`))
    for (const [index, position] of positions.entries()) {
      expect(position, `<${order[index]}> is missing from the page`).toBeGreaterThan(-1)
    }
    expect(positions, 'the sections are out of order').toEqual([...positions].sort((a, b) => a - b))
  })

  it('carries exactly one Three Questions section, with its three steps', () => {
    /*
     * The section was UPDATED rather than replaced, so the thing most likely
     * to go wrong is a second copy of it appearing beside the first. The
     * heading is asserted once, across the whole public surface.
     */
    const headings = SURFACE.map((file) => code(file))
      .join('\n')
      .match(/Three questions, answered with your own numbers\./g)
    expect(headings?.length ?? 0).toBe(1)

    const previews = code('components/marketing/previews.tsx')
    for (const step of ['1 · Discover', '2 · Understand', '3 · Improve']) {
      expect(previews, step).toContain(step)
    }
  })

  it('gives the Discover row the keyword panel that used to be its own section', () => {
    /*
     * MOVED, not rebuilt. `KeywordExplorerPanel` is the same markup, the same
     * four sample rows and the same note about Etsy publishing no search
     * volume; the standalone section that framed it is gone. If somebody ever
     * retypes the table into the Discover row instead, there are two sets of
     * sample figures and two chances to word that position differently — so
     * the component is asserted, and the old section's heading is asserted
     * absent.
     */
    const previews = code('components/marketing/previews.tsx')
    expect(previews).toContain('export function KeywordExplorerPanel')
    expect(previews).toContain('<KeywordExplorerPanel />')
    expect(previews).toContain('Find Better Keywords')
    expect(previews).not.toContain('Find keywords worth targeting')
    expect(previews).not.toContain('export function KeywordResearch')

    // One keyword table on the page, not two.
    const tables = previews.match(/Keyword explorer/g)
    expect(tables?.length ?? 0).toBe(1)
  })

  it('carries exactly one How It Works section, and it was genuinely absent before', () => {
    const headings = SURFACE.map((file) => code(file))
      .join('\n')
      .match(/How CobaltRank Works/g)
    expect(headings?.length ?? 0).toBe(1)
    expect(PAGE).toContain('<HowItWorks')
    /*
     * The footer has a column called "How it works". It is a list of links
     * and not a section, which is why adding this one duplicated nothing —
     * and this is the line that would catch somebody later mistaking the two.
     */
    expect(SECTIONS).toContain('title="How it works"')
  })

  it('does not reintroduce the sections the owner removed', () => {
    /*
     * Five marketing sections came off the homepage. What they DESCRIBED is
     * untouched — the provenance system, the operator write boundary and the
     * export rules all still run, with their own guards — but the copy about
     * them is not to come back without somebody deciding it should.
     */
    for (const gone of [
      'Profit is hard on Etsy for three specific reasons',
      'Five surfaces, and the demo is the screenshot',
      'Every number says where it came from',
      'Eight things you can check',
      'Try the arithmetic on a price of your own',
    ]) {
      const offenders = SURFACE.filter((file) => code(file).includes(gone))
      expect(offenders, `${gone} is back on a public page`).toEqual([])
    }
    for (const component of ['WhyProfitIsHard', 'WhatItDoes', 'ProvenanceSystem', 'Trust']) {
      expect(PAGE, component).not.toContain(`<${component}`)
    }
  })

  it('kept the behaviour those sections described', () => {
    /*
     * The point of the removals is that they were COPY. This is the assertion
     * that fails if somebody reads "remove the provenance section" as "remove
     * provenance" — the badge component, its five types and the guard that
     * holds the product to them are all still here.
     */
    expect(() => readFileSync('components/provenance/provenance-badge.tsx', 'utf8')).not.toThrow()
    expect(() => readFileSync('lib/provenance/types.ts', 'utf8')).not.toThrow()
    expect(() => readFileSync('domain/admin/operator-writes.ts', 'utf8')).not.toThrow()
    expect(() => readFileSync('tests/unit/export-ungated.test.ts', 'utf8')).not.toThrow()
    // And the deletion sentence survived the Trust section that used it.
    expect(SECTIONS).toMatch(/not published yet/)
  })

  it('gives every Start for Free button the real signup route', () => {
    /*
     * Six sections carry one now. They are rendered by a single `StartFree`
     * helper rather than six copies of a <Link>, because six destinations is
     * five chances for one to drift — which is precisely how the approved
     * export ended up with five buttons pointing at a `#signup` anchor that
     * did not exist.
     */
    const previews = code('components/marketing/previews.tsx')
    expect(previews).toContain('function StartFree(')
    expect(previews).toContain('href="/signup"')
    const uses = previews.match(/<StartFree/g)
    expect(uses?.length ?? 0).toBeGreaterThanOrEqual(6)
    // One destination, written once — including the final call to action,
    // which had its own copy of the same button until this was asserted.
    expect(previews.match(/href="\/signup"/g)?.length ?? 0).toBe(1)
  })

  it('labels the dashboard preview as a sample, inside the picture', () => {
    // So a screenshot of the screenshot still carries it.
    expect(HERO).toContain('Illustrative sample shop')
    expect(HERO).toMatch(/<figcaption/)
    expect(HERO).toContain('A sample shop, not a real one.')
  })

  it('computes the footer’s copyright year instead of writing one', () => {
    /*
     * The export had "© 2026" in the markup: correct that day, wrong on the
     * first of January, and failing in the way nobody notices — the site
     * quietly advertises that it has not been touched in a year.
     */
    expect(SECTIONS).toContain('new Date().getFullYear()')
    expect(SECTIONS).toContain('© {year}')
    expect(SECTIONS).not.toMatch(/©\s*20\d\d/)
  })

  it('names no registered company in the footer', () => {
    // There is no legal entity yet — the legal documents carry
    // [[LEGAL_ENTITY]] as a marked blank for exactly this reason.
    const footer = SECTIONS.slice(SECTIONS.indexOf('export function MarketingFooter'))
    expect(footer).not.toMatch(/\b(Ltd|Limited|Inc\.|LLC|GmbH|Pty)\b/)
  })

  it('keeps the FAQ an accordion that works with no JavaScript', () => {
    // <details>/<summary> is focusable, operable by keyboard and announced as
    // expandable by every screen reader, with no state to get out of step.
    expect(SECTIONS).toMatch(/<details[\s\S]{0,400}<summary/)
  })

  it('carries the owner’s plan names, and records where the rename stops', () => {
    /*
     * The plans were renamed to Free, Basic and Pro. The four founding tiers
     * on /pricing were not, because there are four paid tiers and three plan
     * names and the tier already called Pro is a different price from the
     * plan now called Pro — resolving that is a pricing decision nobody has
     * made.
     *
     * This asserts the rename happened where it could AND that the conflict
     * is still written down where the next reader will meet it, so the note
     * cannot be deleted while the conflict survives it.
     */
    const plans = code('domain/billing/plans.ts')
    for (const name of ["name: 'Free'", "name: 'Basic'", "name: 'Pro'"]) {
      expect(plans, name).toContain(name)
    }
    expect(plans, 'the plan KEYS must not move — they are what the database holds').toContain(
      "key: 'SOLO'",
    )

    const founding = readFileSync('domain/billing/founding-pricing.ts', 'utf8')
    expect(founding).toMatch(/THE RENAME STOPS AT THIS FILE/)
    // And the tiers really are still the owner's, rather than the note being
    // left behind after a rename somebody applied anyway.
    expect(founding).toContain("name: 'Starter'")
    expect(founding).toContain("name: 'Studio'")
  })

  it('renders the three public plans rather than the four founding tiers', () => {
    /*
     * The public structure is exactly Free, Basic and Pro. The four founding
     * tiers — Starter, Growth, Pro, Studio — came off both public pages when
     * that was decided; their data stays in domain/billing/founding-pricing.ts
     * because four approved prices are not a thing to delete while tidying a
     * page, and that file says nothing renders them.
     *
     * tests/unit/pricing.test.ts owns the detail of what the cards may say.
     * This asserts only that the landing page is on the new component and
     * that the old table has not come back beside it.
     */
    expect(PAGE).toContain('<PricingSection')
    expect(SECTIONS).not.toContain('FOUNDING_TIERS')
    expect(SECTIONS).not.toMatch(/export function Pricing\b/)
  })
})

/* ════════════════════════════════ what it may not claim ══════════════════ */

describe('the page claims nothing it cannot show', () => {
  const ALL = SURFACE.map((file) => code(file)).join('\n')

  it('invents no social proof', () => {
    /*
     * There are no customers yet, and a product whose premise is that absent
     * is not zero cannot open with an invented number. The social proof is
     * the demo: one click, no account.
     */
    for (const pattern of [
      /\btrusted by\b/i,
      /\b\d[\d,]*\+? (?:sellers|shops|users|customers)\b/i,
      /\b\d(?:\.\d)? out of 5\b/i,
      /\btestimonial/i,
      /\bas featured in\b/i,
    ]) {
      expect(ALL, String(pattern)).not.toMatch(pattern)
    }
  })

  it('states no Etsy search volume as a measurement', () => {
    /*
     * Etsy publishes none — not through its API and not anywhere else. The
     * keyword section says so in as many words, and shows bands rather than
     * counts. tests/unit/source-claims.test.ts holds the whole product to
     * this; here it is checked where a visitor reads it first.
     */
    const previews = code('components/marketing/previews.tsx')
    expect(previews).toContain('Etsy publishes no search volume')
    expect(ALL).not.toMatch(/search volume:?\s*[\d,]+/i)
    expect(ALL).not.toMatch(/\b[\d,]{3,}\s*(?:monthly )?searches\b/i)
  })

  it('invents no production domain', () => {
    /*
     * No domain has been bought. The canonical tag and both social cards are
     * omitted until NEXT_PUBLIC_APP_URL is set, rather than pointing at a host
     * this deployment does not control — see lib/seo/site.ts.
     *
     * `cobaltrank.app/dashboard` in the preview's browser chrome is drawn
     * inside a picture of a screen, not asserted as this site's address, and
     * it is the one place the string may appear.
     */
    const offenders: string[] = []
    for (const file of SURFACE) {
      const text = code(file)
      for (const match of text.matchAll(/https?:\/\/[a-z0-9.-]*cobaltrank[a-z0-9.-]*/gi)) {
        offenders.push(`${file}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
