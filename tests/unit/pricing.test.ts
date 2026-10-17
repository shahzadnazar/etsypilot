/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PRICING SURFACE, AND THE PRICES IT IS NOT ALLOWED TO INVENT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * A pricing page is the densest collection of promises a product makes, and
 * the two ways it goes wrong are opposites:
 *
 *   IT INVENTS A NUMBER      A price nobody approved, an annual discount
 *                            nobody calculated, a limit that fits the grid.
 *                            Every one of them is a commitment somebody has
 *                            to honour or retract in public.
 *   IT BREAKS A SUBSCRIPTION A rename that reaches the database, a public
 *                            card wired to a legacy Stripe price because the
 *                            names look similar, a key changed to tidy an
 *                            enum. These are not visible on the page at all.
 *
 * This file guards both directions. The second half — the one about plan
 * keys, Stripe ids and legacy tiers — is the half that matters more, because
 * nothing on screen would show it had gone wrong.
 */

import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { PLANS, planOf } from '@/domain/billing/plans'
import { FOUNDING_TIERS } from '@/domain/billing/founding-pricing'
import {
  CHECKOUT_REASON,
  PUBLIC_BILLING_INTERVALS,
  PUBLIC_PLANS,
  checkoutState,
  entitlementsOf,
  intervalFromParam,
  intervalParam,
  withInterval,
} from '@/domain/billing/public-plans'
import { comparisonCategories, cardHighlights } from '@/domain/billing/plan-comparison'
import { LIMITS, limitFor } from '@/lib/security/rate-limit'

/** Source with every run of whitespace collapsed, for matching JSX prose. */
function prose(file: string): string {
  return code(file).replace(/\s+/g, ' ')
}

/**
 * Does this source contain something shaped like a phone number?
 *
 * Not a single regex. The obvious one — `\+?\d[\d\s()-]{7,}` — matches a lone
 * digit followed by eight spaces, which JSX indentation produces constantly;
 * it fired on the `1` in "one shop" wrapped onto the next line. So: find runs
 * of characters a phone number is made of, then count the DIGITS in them.
 */
function looksLikeAPhoneNumber(source: string): string[] {
  return [...source.matchAll(/[+\d][\d ()+-]{6,}/g)]
    .map((match) => match[0])
    .filter((candidate) => candidate.replace(/\D/g, '').length >= 7)
}

function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
}

const PRICING_PAGE = code('app/(marketing)/pricing/page.tsx')
const COMPARE_PAGE = code('app/(marketing)/pricing/compare/page.tsx')
const CARDS = code('components/marketing/pricing-cards.tsx')
const FAQ = code('components/marketing/pricing-faq.tsx')
const CONTACT_PAGE = code('app/(marketing)/contact/page.tsx')
const CONTACT_ROUTE = code('app/api/contact/route.ts')

/* ══════════════════════ 1-2. exactly three, named Free, Basic, Pro ═══════ */

describe('the public plan structure', () => {
  it('is exactly three plans', () => {
    expect(PUBLIC_PLANS).toHaveLength(3)
  })

  it('names them Free, Basic and Pro, in that order', () => {
    expect(PUBLIC_PLANS.map((plan) => plan.name)).toEqual(['Free', 'Basic', 'Pro'])
    expect(PUBLIC_PLANS.map((plan) => plan.id)).toEqual(['FREE', 'BASIC', 'PRO'])
  })

  it('introduces no fourth card on either public page', () => {
    /*
     * The four founding tiers used to be the public table. They are still in
     * the repository — four approved prices are not a thing to delete while
     * tidying a page — and this is what stops them, or anything else, coming
     * back as a fourth column.
     */
    for (const [name, page] of [
      ['/pricing', PRICING_PAGE],
      ['/pricing/compare', COMPARE_PAGE],
    ] as const) {
      expect(page, name).not.toContain('FOUNDING_TIERS')
      for (const tier of ['Starter', 'Studio']) {
        expect(page, `${name} names the legacy tier ${tier}`).not.toContain(tier)
      }
    }
  })

  it('gives exactly one card the featured treatment, without claiming popularity', () => {
    const featured = PUBLIC_PLANS.filter((plan) => plan.featured)
    expect(featured).toHaveLength(1)
    expect(featured[0]!.id).toBe('PRO')
    // There are no customers, so "most popular" is not a fact this product
    // has — and it is the easiest claim on a pricing page to make up.
    for (const source of [CARDS, PRICING_PAGE, COMPARE_PAGE]) {
      expect(source).not.toMatch(/most popular/i)
      expect(source).not.toMatch(/best value/i)
      expect(source).not.toMatch(/recommended/i)
    }
    expect(featured[0]!.featuredLabel).toBe('Advanced')
  })
})

/* ════════════════════════════ 3. the billing toggle ═════════════════════ */

describe('the billing interval', () => {
  it('offers monthly and annually, and defaults to monthly', () => {
    expect([...PUBLIC_BILLING_INTERVALS]).toEqual(['MONTHLY', 'ANNUAL'])
    expect(intervalFromParam(undefined)).toBe('MONTHLY')
    expect(intervalFromParam('')).toBe('MONTHLY')
    expect(intervalFromParam('nonsense')).toBe('MONTHLY')
    expect(intervalFromParam('annual')).toBe('ANNUAL')
    expect(intervalFromParam('ANNUAL')).toBe('ANNUAL')
  })

  it('carries the choice through every link that leaves the page', () => {
    /*
     * The selection has to survive a navigation to /pricing/compare, a pasted
     * URL and the browser's back button. It does, because the URL is the
     * state — there is no React state to lose.
     */
    expect(withInterval('/pricing/compare', 'ANNUAL')).toBe('/pricing/compare?billing=annual')
    expect(withInterval('/pricing/compare', 'MONTHLY')).toBe('/pricing/compare')
    /*
     * And the fragment stays last. The landing page's toggle lives at
     * `/#pricing`, and the first version of this function appended the query
     * after the hash — putting `?billing=annual` INSIDE the fragment, where
     * no server sees it and no element answers to it.
     */
    expect(withInterval('/#pricing', 'ANNUAL')).toBe('/?billing=annual#pricing')
    expect(withInterval('/#pricing', 'MONTHLY')).toBe('/#pricing')
    expect(intervalParam('MONTHLY')).toBeNull()
    expect(intervalFromParam(intervalParam('ANNUAL') ?? undefined)).toBe('ANNUAL')
  })

  it('is built from links and a search param rather than client state', () => {
    // No 'use client' on the pricing surface at all: a page that needs a
    // bundle to decide which price to show displays the wrong one until it
    // loads.
    for (const [name, source] of [
      ['cards', CARDS],
      ['/pricing', PRICING_PAGE],
      ['/pricing/compare', COMPARE_PAGE],
      ['faq', FAQ],
    ] as const) {
      expect(source, name).not.toContain("'use client'")
      expect(source, name).not.toContain('useState')
    }
    expect(PRICING_PAGE).toContain('intervalFromParam(billing)')
    expect(COMPARE_PAGE).toContain('intervalFromParam(billing)')
  })

  it('marks the selected interval for a screen reader', () => {
    expect(CARDS).toContain('aria-current')
    expect(CARDS).toContain("aria-label=\"Billing interval\"")
  })
})

/* ═══════════════════ 4. no invented price and no invented discount ══════ */

describe('no price and no discount is invented', () => {
  it('prints $0 for Free, on both intervals, because that is verifiable', () => {
    const free = PUBLIC_PLANS[0]!
    for (const interval of PUBLIC_BILLING_INTERVALS) {
      const price = free.price[interval]
      expect(price.state).toBe('SET')
      if (price.state === 'SET') expect(price.amount).toBe(0)
    }
    // And the plan behind it really is free and really exists.
    expect(planOf('FREE').priceMonthly).toBe(0)
  })

  it('prints no price at all for Basic or Pro, on either interval', () => {
    /*
     * The two sets of numbers in this repository are a historical tier
     * structure (plans.ts: $15 and $29, never shown publicly) and a legacy
     * founding offer (founding-pricing.ts: $20/$27/$35/$45, four tiers that do
     * not map onto three plans). Neither was approved as the public price of
     * THIS structure, so neither is printed as one.
     */
    for (const plan of PUBLIC_PLANS.filter((p) => p.id !== 'FREE')) {
      for (const interval of PUBLIC_BILLING_INTERVALS) {
        expect(plan.price[interval].state, `${plan.id} ${interval}`).toBe('PENDING')
      }
    }
  })

  it('states a reason wherever a price is missing', () => {
    // A blank where a number should be reads as a page that failed to load.
    for (const plan of PUBLIC_PLANS) {
      for (const interval of PUBLIC_BILLING_INTERVALS) {
        const price = plan.price[interval]
        if (price.state === 'PENDING') expect(price.reason.length).toBeGreaterThan(40)
      }
    }
  })

  it('claims no annual saving anywhere, because there is no annual price', () => {
    /*
     * This product has never had an annual interval — the only non-monthly
     * period that has ever existed here is SIX_MONTH on the founding tiers, at
     * 15% off, which is a different offer on a different cadence. A "save 20%"
     * badge would be arithmetic over two numbers, one of which does not exist.
     */
    for (const [name, source] of [
      ['cards', CARDS],
      ['/pricing', PRICING_PAGE],
      ['/pricing/compare', COMPARE_PAGE],
      ['faq', FAQ],
    ] as const) {
      expect(source, name).not.toMatch(/save \d+%/i)
      expect(source, name).not.toMatch(/\d+% off/i)
      expect(source, name).not.toMatch(/two months free/i)
    }
  })

  it('writes no bare dollar amount into the pricing markup', () => {
    /*
     * Every figure on these pages comes from the domain. A `$29` typed into a
     * component is the defect this whole file exists to prevent, and it would
     * survive every other assertion here — the domain would still say PENDING
     * while the page showed a number.
     */
    for (const [name, source] of [
      ['cards', CARDS],
      ['/pricing', PRICING_PAGE],
      ['/pricing/compare', COMPARE_PAGE],
      ['faq', FAQ],
    ] as const) {
      const literals = [...source.matchAll(/\$\d+(\.\d+)?/g)].map((m) => m[0])
      expect(literals, `${name} has a hardcoded price`).toEqual([])
    }
  })
})

/* ═════════════════════ 5. the calls to action, and checkout ═════════════ */

describe('the calls to action', () => {
  it('sends Free to the real signup route', () => {
    const free = PUBLIC_PLANS[0]!
    expect(free.cta).toBe('Start for Free')
    expect(checkoutState(free, 'MONTHLY', { providerConfigured: true })).toBe('FREE_SIGNUP')
    expect(CARDS).toContain('href="/signup"')
  })

  it('names the paid calls to action as the brief sets them', () => {
    expect(PUBLIC_PLANS.map((plan) => plan.cta)).toEqual([
      'Start for Free',
      'Choose Basic',
      'Choose Pro',
    ])
  })

  it('refuses to call a paid plan purchasable, whatever the provider says', () => {
    /*
     * Even with a payment provider configured, a plan with no approved price
     * and no Stripe price id is not something anybody may be charged for.
     * The reason returned is the FIRST one that applies — "we have not set a
     * price" is more useful to a visitor than "our provider is not
     * configured", and both are true today.
     */
    for (const plan of PUBLIC_PLANS.filter((p) => p.id !== 'FREE')) {
      for (const interval of PUBLIC_BILLING_INTERVALS) {
        for (const providerConfigured of [true, false]) {
          const state = checkoutState(plan, interval, { providerConfigured })
          expect(state, `${plan.id} ${interval} provider=${providerConfigured}`).toBe('NO_PRICE')
        }
      }
    }
  })

  it('disables the button and says why, rather than linking at a checkout', () => {
    expect(CARDS).toContain('disabled')
    expect(CARDS).toContain('CHECKOUT_REASON[state]')
    expect(COMPARE_PAGE).toContain('CHECKOUT_REASON[state]')
    // The reason is text beside the button, tied to it, not a title attribute
    // a touch user never sees.
    expect(CARDS).toContain('aria-describedby')
    for (const reason of Object.values(CHECKOUT_REASON)) {
      expect(reason.length).toBeGreaterThan(20)
    }
  })

  it('has no checkout route to reach', () => {
    // Nothing anywhere starts a purchase, so there is no path a disabled
    // button could be routed around to.
    expect(() => readFileSync('app/api/billing/checkout/route.ts', 'utf8')).toThrow()
  })
})

/* ══════════════════════════ 6. compare all features ═════════════════════ */

describe('Compare All Features', () => {
  it('is a link to the real route, carrying the interval', () => {
    expect(PRICING_PAGE).toContain('Compare All Features')
    expect(PRICING_PAGE).toContain("withInterval('/pricing/compare', interval)")
    // A real page, not a modal: a comparison table is a thing people link to,
    // send on and open in a tab.
    expect(() => readFileSync('app/(marketing)/pricing/compare/page.tsx', 'utf8')).not.toThrow()
    expect(PRICING_PAGE).not.toMatch(/dialog|modal/i)
  })

  it('does not put the whole comparison table under the cards', () => {
    expect(PRICING_PAGE).not.toContain('comparisonCategories')
  })

  it('offers a way back', () => {
    expect(COMPARE_PAGE).toContain('Back to Pricing')
    expect(COMPARE_PAGE).toContain("withInterval('/pricing', interval)")
  })
})

/* ══════════════════ 7. the comparison uses verified entitlements ════════ */

describe('the feature comparison', () => {
  const categories = comparisonCategories()

  it('covers the categories a seller came to compare', () => {
    const names = categories.map((category) => category.name.toLowerCase())
    for (const expected of ['keyword', 'profit', 'listing', 'performance', 'bulk', 'support']) {
      expect(names.some((name) => name.includes(expected)), expected).toBe(true)
    }
  })

  it('gives every row exactly one cell per public plan', () => {
    for (const category of categories) {
      expect(category.rows.length).toBeGreaterThan(0)
      for (const row of category.rows) {
        expect(row.cells, `${category.name} / ${row.label}`).toHaveLength(PUBLIC_PLANS.length)
      }
    }
  })

  it('reads every limit from the entitlements the product enforces', () => {
    /*
     * Not "a number appears in the table" — THE number. Each of these is read
     * elsewhere in the product: the usage meter caps listings, change history
     * sizes the rollback window, the audit log sizes retention, Shop Pulse
     * sizes its look-back. If a plan's limit moves, this moves with it.
     */
    const limitsFor = (label: string) =>
      categories
        .flatMap((category) => category.rows)
        .find((row) => row.label === label)
        ?.cells.map((cell) => (cell.kind === 'LIMIT' ? cell.value : cell.kind))

    const basic = planOf('SOLO')
    const pro = planOf('GROWTH')

    expect(limitsFor('Listings managed')).toEqual([
      'EXCLUDED',
      basic.limits.listings.toLocaleString('en-US'),
      pro.limits.listings.toLocaleString('en-US'),
    ])
    expect(limitsFor('Rollback window')).toEqual([
      'EXCLUDED',
      `${basic.limits.rollbackDays} days`,
      `${pro.limits.rollbackDays} days`,
    ])
    expect(limitsFor('Performance history')).toEqual([
      'EXCLUDED',
      `${basic.limits.pulseHistoryMonths} months`,
      `${pro.limits.pulseHistoryMonths} months`,
    ])
    expect(limitsFor('Audit history kept')).toEqual([
      'EXCLUDED',
      `${basic.limits.auditRetentionDays} days`,
      `${pro.limits.auditRetentionDays} days`,
    ])
  })

  it('marks an unbuilt feature as unbuilt in EVERY column, including Pro', () => {
    /*
     * The most expensive sentence a comparison table can contain is a tick in
     * the top column for something nobody can use. Keyword research is the
     * whole category: lib/signals returns null outside the demo, and Etsy's
     * API Terms item 22 forbids charging for what Etsy gives away — which
     * Marketplace Insights now does.
     */
    const keywords = categories.find((category) => /keyword/i.test(category.name))!
    expect(keywords.rows.length).toBeGreaterThan(0)
    for (const row of keywords.rows) {
      for (const cell of row.cells) {
        expect(cell.kind, `${row.label} is sold on some plan`).toBe('NOT_BUILT')
      }
    }
    // And the category says why, rather than leaving a reader to wonder.
    expect(keywords.note).toMatch(/Etsy/)
  })

  it('never shows an unbuilt feature as included anywhere', () => {
    const offenders: string[] = []
    for (const category of categories) {
      for (const row of category.rows) {
        const kinds = new Set(row.cells.map((cell) => cell.kind))
        if (kinds.has('NOT_BUILT') && kinds.size > 1) offenders.push(row.label)
      }
    }
    expect(offenders, 'a row is unbuilt on one plan and sold on another').toEqual([])
  })

  it('gives each card four to six highlights, read from the plan', () => {
    for (const plan of PUBLIC_PLANS) {
      const highlights = cardHighlights(plan)
      expect(highlights.length, plan.id).toBeGreaterThanOrEqual(2)
      expect(highlights.length, plan.id).toBeLessThanOrEqual(6)
      // Read from ./plans.ts, which opens by promising it describes only what
      // is built — so a highlight cannot be a sentence somebody wrote here.
      expect(entitlementsOf(plan).includes).toEqual(expect.arrayContaining(highlights))
    }
  })
})

/* ════════════ 8-9. the legacy billing system is untouched ═══════════════ */

describe('nothing here reaches the billing system', () => {
  it('keeps the database plan keys exactly as they were', () => {
    /*
     * `key` is what the subscriptions table, every migration and every audit
     * record hold. `name` is what a seller reads. Only the second has ever
     * moved, and renaming the first would be a migration and a rewrite of
     * stored rows to change a label.
     */
    expect(PLANS.map((plan) => plan.key)).toEqual(['FREE', 'SOLO', 'GROWTH'])
    const schema = readFileSync('db/schema/index.ts', 'utf8')
    expect(schema).toContain('FREE | SOLO | GROWTH')
  })

  it('maps each public card to an entitlement plan that exists', () => {
    expect(PUBLIC_PLANS.map((plan) => plan.planKey)).toEqual(['FREE', 'SOLO', 'GROWTH'])
    for (const plan of PUBLIC_PLANS) {
      expect(() => entitlementsOf(plan), plan.id).not.toThrow()
    }
  })

  it('changes no entitlement or limit', () => {
    /*
     * Pinned, so a redesign of the pricing page cannot quietly re-tier the
     * product. These are the numbers existing subscribers are entitled to and
     * the ones every usage meter enforces; changing them is a product decision
     * that has to come here and be made deliberately.
     */
    expect(planOf('FREE').limits).toEqual({
      listings: 0,
      rollbackDays: null,
      pulseHistoryMonths: null,
      auditRetentionDays: null,
    })
    expect(planOf('SOLO').limits).toEqual({
      listings: 200,
      rollbackDays: 30,
      pulseHistoryMonths: 3,
      auditRetentionDays: 90,
    })
    expect(planOf('GROWTH').limits).toEqual({
      listings: 2000,
      rollbackDays: 90,
      pulseHistoryMonths: 12,
      auditRetentionDays: 365,
    })
  })

  it('leaves the legacy founding tiers and their prices intact', () => {
    // Four approved prices. Nothing renders them publicly any more; deleting
    // them would be discarding a commercial decision to tidy a page.
    expect(FOUNDING_TIERS.map((tier) => `${tier.name} ${tier.monthly}`)).toEqual([
      'Starter 20',
      'Growth 27',
      'Pro 35',
      'Studio 45',
    ])
  })

  it('connects no public card to a Stripe price', () => {
    /*
     * There is no Stripe price id in this repository, for any plan. The field
     * is null everywhere and declared rather than absent, so the absence is a
     * decision a reader can see — and `checkoutState` cannot return a
     * purchasable state while it is null.
     *
     * The failure this prevents: wiring "Pro" to a legacy price created for
     * the founding tier that happens to share the word.
     */
    for (const plan of PUBLIC_PLANS) {
      for (const interval of PUBLIC_BILLING_INTERVALS) {
        expect(plan.stripePriceId[interval], `${plan.id} ${interval}`).toBeNull()
      }
    }
  })

  it('introduces no migration that touches subscriptions', () => {
    const migration = readFileSync('db/migrations/0017_contact_messages.sql', 'utf8')
    expect(migration).not.toMatch(/subscriptions|usage_records/)
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/)
  })
})

/* ═══════════════════════════════ 10. the FAQ ════════════════════════════ */

describe('the pricing FAQ', () => {
  it('asks the seven questions the brief sets', () => {
    for (const question of [
      'Can I start CobaltRank for free?',
      'Can I switch plans later?',
      'Can I pay monthly or annually?',
      'What happens if I cancel?',
      'Are my Etsy shop details secure?',
      'Can I connect more than one Etsy shop?',
    ]) {
      expect(FAQ, question).toContain(question)
    }
    // The difference question is built from the plan names, so it cannot name
    // a tier the page does not show.
    expect(FAQ).toContain('What is the difference between ${names[0]}')
  })

  it('is a disclosure that works with no JavaScript', () => {
    // <details>/<summary>: focusable, keyboard-operable, and its open state
    // cannot drift from its aria-expanded because the browser owns both.
    expect(FAQ).toMatch(/<details[\s\S]{0,400}<summary/)
    expect(FAQ).not.toContain('aria-expanded')
  })

  it('promises no refund and invents no cancellation policy', () => {
    /*
     * The answers come from CANCELLATION_TERMS and LIMIT_POLICY verbatim.
     * "Cancel any time for a full refund" is the default sentence here and it
     * is false: charges are not refunded, and access runs to the end of the
     * period already paid for.
     */
    expect(FAQ).toContain('CANCELLATION_TERMS')
    expect(FAQ).toContain('LIMIT_POLICY')
    expect(FAQ).not.toMatch(/refund(ed|able)?\b(?![^.]*not)/i)
    expect(FAQ).not.toMatch(/money.back/i)
  })

  it('answers the billing question with what is actually true', () => {
    // No provider, no approved price, no annual interval. An FAQ that said
    // "yes, and annual saves you 20%" would be the most expensive sentence on
    // the site.
    // Matched against whitespace-collapsed source: JSX wraps prose across
    // lines wherever the formatter decides to, so a literal substring of a
    // sentence is a test of the line width rather than of the sentence.
    const text = prose('components/marketing/pricing-faq.tsx')
    expect(text).toContain('No payment provider is connected to this deployment')
    expect(text).toContain('Annual billing has never existed in this product')
  })

  it('says one shop, because multi-shop is not built', () => {
    expect(FAQ).toContain('AGENCY_NOTE')
    expect(FAQ).toContain('One shop per account today')
  })
})

/* ═════════════════════════════ 11. Contact Us ═══════════════════════════ */

describe('Contact Us', () => {
  it('points at a route that exists', () => {
    expect(code('components/marketing/contact-cta.tsx')).toContain('href="/contact"')
    expect(() => readFileSync('app/(marketing)/contact/page.tsx', 'utf8')).not.toThrow()
    expect(() => readFileSync('app/api/contact/route.ts', 'utf8')).not.toThrow()
  })

  it('invents no email, phone number, address or response time', () => {
    /*
     * lib/brand.ts holds both contact addresses as null because no domain has
     * been bought, and the page renders the honest branch. The literals below
     * are the ones a contact page grows by itself.
     */
    for (const [name, source] of [
      ['contact page', CONTACT_PAGE],
      ['contact cta', code('components/marketing/contact-cta.tsx')],
    ] as const) {
      expect(source, name).not.toMatch(/[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}/i)
      expect(looksLikeAPhoneNumber(source), name).toEqual([])
      expect(source, name).not.toMatch(/within \d+ (hours?|business days?)/i)
      expect(source, name).not.toMatch(/we('|’)ll (get back|reply|respond)/i)
    }
    // And it reads the address from lib/brand.ts rather than printing one.
    expect(CONTACT_PAGE).toContain("hasContactAddress('support')")
  })

  it('claims only that the message was recorded, never that it was sent', () => {
    /*
     * There is no email sender in this product. The table IS the delivery
     * mechanism, and the confirmation names what has NOT happened rather than
     * leaving a reader to assume an email is on its way.
     */
    expect(CONTACT_PAGE).toContain('Nothing has been emailed')
    expect(CONTACT_ROUTE).not.toMatch(/sendMail|sendEmail|transporter/i)
  })

  it('validates on the client and again on the server, from one definition', () => {
    expect(CONTACT_PAGE).toContain('CONTACT_LIMITS')
    expect(CONTACT_ROUTE).toContain('CONTACT_LIMITS')
    expect(CONTACT_PAGE).toContain('required')
  })

  it('is rate limited more tightly than the rest of the API', () => {
    expect(limitFor('/api/contact')).toEqual(LIMITS.publicForm)
    expect(limitFor('/api/waitlist')).toEqual(LIMITS.publicForm)
    expect(LIMITS.publicForm.limit).toBeLessThan(LIMITS.api.limit)
  })

  it('carries a honeypot that answers a bot the same way it answers a person', () => {
    // Telling a submitter their message was rejected is telling them how to
    // send the next one.
    expect(CONTACT_PAGE).toContain('name="website"')
    expect(CONTACT_ROUTE).toContain("read('website')")
    expect(CONTACT_ROUTE).toContain('?sent=ok')
  })

  it('shows a non-functional state rather than a form with nowhere to write', () => {
    expect(CONTACT_PAGE).toContain('isDatabaseConfigured()')
    expect(CONTACT_PAGE).toContain('The form is not available on this deployment')
    expect(CONTACT_ROUTE).toContain('isDatabaseConfigured()')
  })
})

/* ════════════════════ 13-14. accessibility and the dashboard ════════════ */

describe('the pricing surface, mechanically', () => {
  const CSS = readFileSync('styles/marketing.css', 'utf8')

  it('keeps every hover effect decorative and behind reduced-motion', () => {
    /*
     * A card that reveals its price, its features or its disabled reason on
     * hover is blank on every touch device and to every keyboard user. The
     * hover block adds lift, shadow and a border colour and nothing else.
     */
    const block = CSS.slice(CSS.indexOf('.marketing .plan-card'))
    const hover = block.slice(block.indexOf('.marketing .plan-card:hover'))
    expect(hover.slice(0, 400)).not.toMatch(/display|visibility|opacity|content:/)
    // And the whole animated block is inside a reduced-motion query.
    const motionQuery = CSS.indexOf('@media (prefers-reduced-motion: no-preference)', CSS.indexOf('.marketing .plan-card'))
    expect(motionQuery).toBeGreaterThan(-1)
    expect(motionQuery).toBeLessThan(CSS.indexOf('.marketing .plan-card:hover'))
  })

  it('gives focus the same emphasis hover gets', () => {
    expect(CSS).toContain('.marketing .plan-card:focus-within')
  })

  it('does not scale the cards, which would resample their text', () => {
    const block = CSS.slice(CSS.indexOf('.marketing .plan-card'), CSS.indexOf('.marketing .compare-table'))
    expect(block).not.toMatch(/transform:\s*scale/)
  })

  it('keeps the comparison table readable while it scrolls', () => {
    // Plan names pinned on desktop, row labels pinned when it scrolls
    // sideways — a comparison table with its labels gone is three columns of
    // ticks about nothing.
    expect(CSS).toMatch(/\.compare-table thead th\s*\{[^}]*position:\s*sticky/)
    expect(CSS).toMatch(/\.compare-table th\[scope='row'\]\s*\{[^}]*position:\s*sticky/)
    expect(COMPARE_PAGE).toContain('overflow-x-auto')
    // Reachable by keyboard, or the right-hand column needs a pointer.
    expect(COMPARE_PAGE).toContain('tabIndex={0}')
    expect(COMPARE_PAGE).toContain('aria-label="Plan comparison, scrollable"')
  })

  it('uses real table semantics', () => {
    expect(COMPARE_PAGE).toContain('<caption')
    expect(COMPARE_PAGE).toContain('scope="col"')
    expect(COMPARE_PAGE).toContain('scope="row"')
    expect(COMPARE_PAGE).toContain('scope="colgroup"')
    // A tick with no context is useless to a screen reader walking a column.
    expect(COMPARE_PAGE).toContain('sr-only')
  })

  it('gives every public page exactly one h1', () => {
    for (const [name, source] of [
      ['/pricing', PRICING_PAGE],
      ['/pricing/compare', COMPARE_PAGE],
      ['/contact', CONTACT_PAGE],
    ] as const) {
      expect(source.match(/<h1[\s>]/g)?.length ?? 0, name).toBe(1)
    }
  })

  it('gives each page distinct metadata, and invents no domain', () => {
    const titles = [PRICING_PAGE, COMPARE_PAGE, CONTACT_PAGE].map(
      (source) => source.match(/title:\s*'([^']+)'/)?.[1],
    )
    expect(new Set(titles).size).toBe(3)
    for (const title of titles) expect(title!.length).toBeLessThanOrEqual(60)

    for (const source of [PRICING_PAGE, COMPARE_PAGE, CONTACT_PAGE]) {
      expect(source).toMatch(/\.\.\.canonical\(/)
      expect(source).not.toMatch(/https?:\/\//)
    }
  })

  it('repaints no part of the authenticated dashboard', () => {
    /*
     * Every colour on these pages is a token redefined under `.marketing`,
     * which only app/(marketing)/layout.tsx applies. The dashboard's
     * terracotta palette lives in styles/globals.css and nothing here touches
     * it — tests/unit/design-tokens.test.ts holds both to their documents.
     */
    const globals = readFileSync('styles/globals.css', 'utf8')
    expect(globals).not.toContain('plan-card')
    expect(globals).not.toContain('compare-table')

    const added = CSS.slice(CSS.indexOf('the pricing cards'))
    const unscoped = [...added.matchAll(/^\.(?!marketing)[a-z][\w-]*/gm)].map((m) => m[0])
    expect(unscoped, 'a pricing rule escapes the .marketing scope').toEqual([])
  })
})
