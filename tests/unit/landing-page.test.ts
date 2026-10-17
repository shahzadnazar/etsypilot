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
const CALCULATOR = code('components/marketing/profit-calculator.tsx')
const SECTIONS = code('components/marketing/sections.tsx')

describe('the public surface this file is sweeping', () => {
  it('finds every file it is meant to be checking', () => {
    // A sweep over nothing passes every assertion below perfectly.
    expect(SURFACE.length).toBeGreaterThanOrEqual(8)
    expect(SURFACE).toContain('app/(marketing)/page.tsx')
    expect(SURFACE).toContain('app/(marketing)/pricing/page.tsx')
    expect(SURFACE).toContain('components/marketing/nav.tsx')
    expect(SURFACE).toContain('components/marketing/profit-calculator.tsx')
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
    const ids = new Set<string>()
    for (const file of SURFACE) {
      for (const match of code(file).matchAll(/id="([a-z0-9-]+)"/g)) ids.add(match[1]!)
    }

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
    const ids = new Set<string>()
    for (const file of SURFACE) {
      for (const match of code(file).matchAll(/id="([a-z0-9-]+)"/g)) ids.add(match[1]!)
    }
    for (const anchor of ['features', 'keywords', 'calculator', 'profit', 'listings', 'faq']) {
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

describe('ISSUE 2 — the calculator owns no arithmetic and no rates', () => {
  it('runs the product’s own domain function rather than a second copy', () => {
    expect(CALCULATOR).toContain("from '@/domain/product-profit/calculate'")
    expect(CALCULATOR).toContain('calculateProductProfit(')
  })

  it('reads every fee rate from the dated table instead of literals', () => {
    expect(CALCULATOR).toContain("from '@/domain/fees/rules'")
    expect(CALCULATOR).toContain('DEFAULT_FEE_RATES')
    // The date the rates were recorded, and the country they were recorded
    // for, are both on screen — a rate with neither is a figure that was true
    // once.
    expect(CALCULATOR).toContain('FEE_RULES_EFFECTIVE')
    expect(CALCULATOR).toContain('FEE_RULES_SOURCE')
  })

  it('carries no hardcoded Etsy fee percentage or flat amount', () => {
    /*
     * The defect, exactly: the export printed "6.5%", "$0.20" and
     * "3% + $0.25" into the markup beside fee inputs that were bound to
     * nothing. Someone outside the US could correct a rate, watch the field
     * accept it, and read a total that had ignored them.
     *
     * The published values are matched specifically rather than "any number",
     * because this component legitimately contains sizes, widths and the
     * rounding of a percentage.
     */
    const offenders = ['6.5%', '$0.20', '$0.25', '0.065', '12%', '15%'].filter((literal) =>
      CALCULATOR.includes(literal),
    )
    expect(offenders, 'a published fee rate is written into the component').toEqual([])
  })

  it('never clamps a loss to zero, in the component or in the domain', () => {
    /*
     * `Math.max(0, netProfit)` renders a product losing $6 a sale as "$0.00",
     * which reads as break-even. A seller acting on that keeps selling it.
     *
     * The domain clamps INPUTS — a negative materials cost is a typo — and
     * that is a different operation on a different value, so the check is
     * specific about which: nothing may clamp a profit, a margin or a total.
     */
    const domain = code('domain/product-profit/calculate.ts')
    for (const source of [CALCULATOR, domain]) {
      expect(source).not.toMatch(/Math\.max\(\s*0\s*,\s*[^)]*(profit|margin|net|total)/i)
    }
  })

  it('paints a loss in the danger token and a gain in the success one', () => {
    expect(CALCULATOR).toMatch(/var\(--danger\)/)
    expect(CALCULATOR).toMatch(/var\(--success\)/)
    // And the sign is rendered, not implied by colour alone — SC 1.4.1.
    expect(CALCULATOR).toContain('signedMoney')
  })

  it('labels its output as an estimate rather than as the seller’s profit', () => {
    expect(CALCULATOR).toContain('Estimated net profit')
    // The provenance badge the product uses for arithmetic over entered
    // numbers. Not VERIFIED: nothing here was read from Etsy.
    expect(CALCULATOR).toMatch(/type="CALCULATED"/)
    expect(CALCULATOR).not.toMatch(/type="VERIFIED"/)
  })

  it('shows the cost breakdown, the margin, the total and the break-even', () => {
    for (const line of [
      'What the buyer pays',
      'Total fees and costs',
      'Break-even price',
      'result.marginPercent',
      'result.limitations',
    ]) {
      expect(CALCULATOR, line).toContain(line)
    }
  })

  it('says no margin rather than 0% when there is no revenue', () => {
    expect(CALCULATOR).toContain('result.marginPercent === null')
  })

  it('opens the fee row into one line per rate, with each rate’s own arithmetic', () => {
    /*
     * "Etsy fees" as a single figure is the one line a seller cannot check.
     * It is three or four rates on three different bases, which is why the
     * sum sellers do by hand — "6.5% of the price" — is always too low.
     *
     * The rows come from the same result as the total (`feeLines`), not from
     * a second call to the fee engine: two calls with the same inputs agree
     * today and are two things to keep in step tomorrow.
     */
    expect(CALCULATOR).toContain('result.feeLines.map')
    expect(CALCULATOR).toContain('fee.formula')
    const domain = code('domain/product-profit/calculate.ts')
    expect(domain).toContain('feeLines: fees.lines')
    expect(CALCULATOR).not.toContain('calculateFees(')
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
    // The calculator's own disclosure is held to the same rule.
    expect(CALCULATOR).toContain('aria-expanded={showRates}')
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
    expect(css).toMatch(/\.marketing \.mobile-link\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.marketing \.nav-link\s*\{[^}]*min-height:\s*40px/)
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
    const order = [
      'MarketingNav',
      'Hero',
      'Benefits',
      'KeywordResearch',
      'ProfitCalculator',
      'ProfitIntelligence',
      'ListingIntelligence',
      'ShopPerformance',
      'BulkUpdates',
      'Pricing',
      'Faq',
      'FinalCta',
      'MarketingFooter',
    ]
    const positions = order.map((name) => PAGE.indexOf(`<${name}`))
    for (const [index, position] of positions.entries()) {
      expect(position, `<${order[index]}> is missing from the page`).toBeGreaterThan(-1)
    }
    expect(positions, 'the sections are out of order').toEqual([...positions].sort((a, b) => a - b))
  })

  it('keeps the four sections the approved design did not have', () => {
    /*
     * They carry the honest part of the argument: why a figure is sometimes
     * withheld, how to check the claims, what each provenance badge means,
     * and the one-click door into the live demo. Deleting them to match a
     * visual comp would be deleting the reason the product is defensible.
     */
    for (const section of ['WhyProfitIsHard', 'WhatItDoes', 'ProvenanceSystem', 'Trust']) {
      expect(PAGE, section).toContain(`<${section}`)
    }
  })

  it('keeps the ledger with holes in it, next to the argument it evidences', () => {
    /*
     * It was the old page's hero. The approved design's hero is a confident
     * dashboard, so it moved rather than being deleted — between the three
     * reasons profit is hard and the provenance system, where it is the
     * worked example of "absent is not zero" rather than a claim a reader has
     * not yet been given a reason to believe.
     */
    expect(PAGE).toContain('<HeroLedger')
    const ledger = code('components/marketing/hero-ledger.tsx')
    expect(ledger).toContain('Not known')
    // Between those two sections, in that order.
    expect(PAGE.indexOf('<HeroLedger')).toBeGreaterThan(PAGE.indexOf('<WhyProfitIsHard'))
    expect(PAGE.indexOf('<HeroLedger')).toBeLessThan(PAGE.indexOf('<ProvenanceSystem'))
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

  it('still says the price is set and the limits are not, where that is true', () => {
    // Two founding tiers map to no plan. A pricing table with invented caps is
    // a promise about capability, and this product's rules forbid selling one
    // that does not exist.
    expect(SECTIONS).toContain('Limits are still being set')
    expect(SECTIONS).toContain('Join the waitlist')
    expect(SECTIONS).not.toMatch(/>\s*Subscribe\s*</)
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
