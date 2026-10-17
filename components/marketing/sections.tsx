import Link from 'next/link'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { PROVENANCE_TYPES, type ProvenanceType } from '@/lib/provenance/types'
import { LegalLinks } from '@/components/legal/legal-links'
import { contactAddress, hasContactAddress } from '@/lib/brand'
import {
  EXPORTABLE_DATASETS,
  exportableNouns,
  notExportableNouns,
} from '@/domain/export/datasets'

/*
 * The landing page's sections.
 *
 * Server components, every one: the only JavaScript this page ships is the fee
 * calculator, and the motion is CSS. See styles/marketing.css.
 *
 * The composition rule throughout is that sections DIFFER — in width, in
 * rhythm, in whether they are ruled or open. Every section at max-w-7xl with
 * three equal cards in it is the shape this page is trying not to be.
 */

/*
 * ── THE NAVIGATION MOVED TO components/marketing/nav.tsx ─────────────────
 *
 * It was here, as a server component: a flat row of links with no dropdowns,
 * so there was nothing to open and nothing to announce. The approved design
 * has a Features menu and a Resources menu, and a menu needs state — which
 * means a client component, which means its own file rather than a `'use
 * client'` directive at the top of this one. Marking this module client would
 * ship the pricing table, the FAQ and the trust section's prose to the browser
 * as JavaScript to do it.
 *
 * Nothing else about this file changed shape, and both pages import the nav
 * from its new home.
 */

/* ────────────────────────────────────────────────── 4. why profit is hard */

/**
 * Three facts, and they are checkable.
 *
 * No outrage and no competitor named. Each is a property of Etsy's API or
 * Etsy's own dashboard, which is why this product exists and why its headline
 * number is sometimes withheld.
 */
const HARD_FACTS = [
  {
    heading: 'Etsy Ads spend is not in the API',
    body: 'Etsy exposes no endpoint for what you spend on Etsy Ads. Any tool showing you an ads figure per listing got it from somewhere other than Etsy, or worked it out. CobaltRank shows the shop-level figure Etsy does report, and says the per-listing one is unavailable.',
  },
  {
    heading: 'Offsite Ads fees arrive with no link back to the order',
    body: 'They land in the payment-account ledger, which is a separate read from your order receipts and carries no reference to the sale that caused them. Per-order margin cannot be computed from them — not slowly, not approximately. It cannot be computed.',
  },
  {
    heading: 'Etsy’s own dashboard shows gross, not net',
    body: 'The number on your Etsy homepage is revenue before fees, before discounts, before refunds and before anything you spent making the thing. Most sellers are reading it as income because it is the only number in front of them.',
  },
]

export function WhyProfitIsHard() {
  return (
    <section
      id="why"
      className="border-t"
      style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
    >
      <div className="mx-auto max-w-[1180px] px-5 py-16 md:py-20">
        <h2 className="display max-w-[22ch] text-[28px] leading-[1.15] md:text-[36px]" style={{ color: 'var(--ink-1)' }}>
          Profit is hard on Etsy for three specific reasons.
        </h2>
        <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          None of them are anybody&rsquo;s fault, and none of them can be fixed by a prettier
          dashboard. They are why this product withholds a number instead of estimating one.
        </p>

        {/*
          * A ruled list, not three cards of equal height. The dividing rules do
          * the structural work and the widths differ, which is what makes it
          * read as a document rather than a feature grid.
          */}
        <dl className="mt-10 border-t" style={{ borderColor: 'var(--border)' }}>
          {HARD_FACTS.map((fact) => (
            <div
              key={fact.heading}
              className="grid gap-x-10 gap-y-2 border-b py-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <dt className="display text-[18px] leading-snug md:text-[20px]" style={{ color: 'var(--ink-1)' }}>
                {fact.heading}
              </dt>
              <dd className="max-w-[62ch] text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {fact.body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────── 5. what CobaltRank does */

const SURFACES = [
  {
    name: 'Profit Reality',
    href: '/profit',
    line: 'The waterfall at the top of this page, over your own receipts — with every line labelled by where it came from, and withheld where it cannot be known.',
  },
  {
    name: 'Listing Audit',
    href: '/listings/audit',
    line: 'Fourteen rules, each one a documented Etsy requirement or a threshold you set. Nothing in it guesses at Etsy’s ranking algorithm.',
  },
  {
    name: 'Shop Pulse',
    href: '/shop-pulse',
    line: 'Measures your orders against your own 90-day baseline and tests each recorded change against it. Three verdicts: correlated, ruled out, unknown. Never a cause it cannot show you.',
  },
  {
    name: 'Action Center',
    href: '/action-center',
    line: 'What needs attention, ranked by measured impact, each card carrying its evidence and a destination. Nothing to act on means an empty queue, not filler.',
  },
  {
    name: 'Bulk Editor with undo',
    href: '/listings/bulk-editor',
    line: 'Select, configure, validate, then the exact diff. Nothing reaches Etsy until you confirm that diff, and the change history can put it back.',
  },
]

export function WhatItDoes() {
  return (
    <section id="what" className="border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-[1180px] px-5 py-16 md:py-20">
        <h2 className="display max-w-[20ch] text-[28px] leading-[1.15] md:text-[36px]" style={{ color: 'var(--ink-1)' }}>
          Five surfaces, and the demo is the screenshot.
        </h2>
        <p className="mt-3 max-w-[58ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          Each link opens that screen in the live demo. No account, no email, nothing to install.
        </p>

        <ul className="mt-10 border-t" style={{ borderColor: 'var(--border)' }}>
          {SURFACES.map((surface) => (
            <li
              key={surface.name}
              className="grid items-baseline gap-x-10 gap-y-1.5 border-b py-5 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_auto]"
              style={{ borderColor: 'var(--border)' }}
            >
              <h3 className="display text-[18px]" style={{ color: 'var(--ink-1)' }}>
                {surface.name}
              </h3>
              <p className="max-w-[64ch] text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {surface.line}
              </p>
              <a href={`/api/demo/enter?to=${encodeURIComponent(surface.href)}`}
                className="mono whitespace-nowrap text-[12px] font-semibold"
                style={{ color: 'var(--brand-strong)' }}
              >
                Open in the demo →
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────── 6. the provenance system */

const PROVENANCE_LINES: Record<ProvenanceType, string> = {
  VERIFIED: 'Read from your own Etsy receipts. Not adjusted, not derived.',
  CALCULATED: 'Worked out from verified figures. The arithmetic is shown.',
  ESTIMATED: 'A range with its method and its confidence, never a precise-looking midpoint.',
  SELLER_INPUT: 'A number you entered. Yours, and labelled as yours.',
  UNAVAILABLE: 'Etsy does not expose it, or it has not been read yet. Shown as absent, never as zero.',
}

export function ProvenanceSystem() {
  return (
    <section
      id="provenance"
      className="border-t"
      style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
    >
      <div className="mx-auto max-w-[900px] px-5 py-16 md:py-20">
        <h2 className="display text-[28px] leading-[1.15] md:text-[36px]" style={{ color: 'var(--ink-1)' }}>
          Every number says where it came from.
        </h2>

        <dl className="mt-9 border-t" style={{ borderColor: 'var(--border)' }}>
          {PROVENANCE_TYPES.map((type) => (
            <div
              key={type}
              className="grid items-baseline gap-x-6 gap-y-1 border-b py-3.5 sm:grid-cols-[10.5rem_minmax(0,1fr)]"
              style={{ borderColor: 'var(--border)' }}
            >
              <dt>
                {/* The real badge, so this page cannot describe a system it has reimplemented. */}
                <ProvenanceBadge type={type} demo={false} />
              </dt>
              <dd className="text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {PROVENANCE_LINES[type]}
              </dd>
            </div>
          ))}
        </dl>

        <p
          className="display mt-9 max-w-[26ch] text-[24px] leading-[1.25] md:text-[30px]"
          style={{ color: 'var(--ink-1)' }}
        >
          When CobaltRank cannot verify a number, it says so instead of estimating one.
        </p>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────────────────── 7. trust */

/**
 * Each line is a fact the product can be checked against.
 *
 * ── THESE WERE VERIFIED AGAINST THE CODE, NOT AGAINST MEMORY ──────────────
 *
 * The owner's original list had seven. Three of them described intent rather
 * than current behaviour and are not printed as claims here — the report that
 * accompanied this page says which and why. A trust section is the worst place
 * in a product for a sentence that is almost true.
 *
 * "Not even we can" is the strongest sentence on the page and the one most
 * likely to be wrong, so it was checked against domain/admin/operator-writes.ts
 * itself. That file's allowlist is four entries: `users.platform_role` and
 * three operator-only audit and permission tables. No seller table is on it,
 * and the Etsy-write allowlist for the operator area is empty. The guard that
 * enforces it walks the operator closure transitively through imports, so a
 * module that merely IMPORTS something that can write fails it.
 */
const TRUST = [
  {
    claim: 'It never holds your Etsy password.',
    detail:
      'The connection is an OAuth token, stored encrypted. Revoke it from your Etsy account and CobaltRank stops reading and writing immediately — there is nothing it can do with a revoked token.',
  },
  {
    claim: 'Only you can change your shop.',
    detail:
      'Every write shows you the exact before-and-after first, fingerprinted so the set you approved is the set that is sent. Nothing goes to Etsy until you confirm that diff, and if the catalogue moved in between, CobaltRank refuses rather than applying to whatever is left.',
  },
  {
    claim: 'Not even we can.',
    detail:
      'CobaltRank staff can read your shop to support you, and cannot write to it — enforced in code, not by policy. The operator area may change four things, none of them yours: a person’s platform role and three of its own audit tables. It has no way to write a listing, an order, a cost or anything on Etsy.',
  },
  {
    claim: 'Refusals are recorded, not just writes.',
    detail:
      'The audit log is append-only and exportable, and it keeps what CobaltRank would not do as well as what it did — "Write refused — demo mode · nothing sent" is a record, with the reason and what would have changed.',
  },
  {
    claim: 'A rollback is planned against your shop as it is now.',
    detail:
      'Not as it was when the job ran. A listing somebody edited on Etsy since is excluded and named, rather than silently overwritten — restoring it would discard work CobaltRank did not do.',
  },
  {
    claim: 'Export what the figures are built on, any time.',
    /*
     * The nouns come from domain/export/datasets.ts, not from this file. The
     * first version of this line was written from memory and named four
     * datasets, two of which have no exporter. A sentence about what the
     * software does is now rendered from the software.
     */
    detail: `As CSV, from Settings: ${exportableNouns()}. Each file carries a provenance column beside every value and a header saying what it leaves out. ${notExportableNouns().charAt(0).toUpperCase()}${notExportableNouns().slice(1)} have no exporter yet, so "everything" would be the wrong word. ${deletionRoute()} There is no self-serve delete button yet, and a button that looked like one would be worse than saying so.`,
  },
  {
    claim: 'Two-factor authentication is available on every account.',
    detail:
      'An authenticator app, with recovery codes. Required for anyone operating CobaltRank itself.',
  },
  {
    claim: 'Cancel in one click.',
    detail: 'No email required, no retention call, no survey. Access continues to the end of the period you have paid for.',
  },
]

export function Trust() {
  return (
    <section id="trust" className="border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-[1180px] px-5 py-16 md:py-20">
        <h2 className="display max-w-[24ch] text-[28px] leading-[1.15] md:text-[36px]" style={{ color: 'var(--ink-1)' }}>
          Eight things you can check, rather than take our word for.
        </h2>

        <dl className="mt-10 grid gap-x-12 border-t md:grid-cols-2" style={{ borderColor: 'var(--border)' }}>
          {TRUST.map((item) => (
            <div key={item.claim} className="border-b py-5" style={{ borderColor: 'var(--border)' }}>
              <dt className="display text-[17px] leading-snug" style={{ color: 'var(--ink-1)' }}>
                {item.claim}
              </dt>
              <dd className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {item.detail}
              </dd>
            </div>
          ))}
        </dl>

        {/*
          * ── THESE TWO WENT THROUGH THE DEMO DOOR ────────────────────────
          *
          * They were plain <Link>s to /data/methodology and /data/sources.
          * Both pages are real and both live in app/(dashboard), whose layout
          * redirects a visitor with no session to /login — so a stranger who
          * followed "How every figure is produced" from the trust section
          * landed on a sign-in form. The route existed, the link worked, and
          * the destination was a door.
          *
          * A plain <a> with no prefetch, for the reasons the hero's button
          * records: <Link> client-side navigates and cannot apply a route
          * handler's 303 + Set-Cookie, and Next prefetches a <Link> on sight,
          * which would open a demo session for anybody who merely scrolled
          * past.
          */}
        <p className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
          <a href="/api/demo/enter?to=/data/methodology" className="font-semibold underline underline-offset-2" style={{ color: 'var(--brand-strong)' }}>
            How every figure is produced
          </a>
          <a href="/api/demo/enter?to=/data/sources" className="font-semibold underline underline-offset-2" style={{ color: 'var(--brand-strong)' }}>
            Where every figure comes from
          </a>
          <span style={{ color: 'var(--muted-1)' }}>
            Both pages are in the product. No competitor publishes an equivalent.
          </span>
        </p>
      </div>
    </section>
  )
}

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PRICING SECTION MOVED, AND THE FOUR FOUNDING TIERS CAME OFF THE
 *   PUBLIC PAGES.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `Pricing` and `TierCard` were here. They rendered the four founding tiers
 * from domain/billing/founding-pricing.ts — Starter $20, Growth $27, Pro $35,
 * Studio $45 — on `/` and on `/pricing`.
 *
 * The public plan structure is now exactly Free, Basic and Pro, so both pages
 * render components/marketing/pricing-cards.tsx instead, and the landing
 * page's block is `PricingSection` in that same file: the SAME cards as
 * /pricing rather than a second table tuned for a narrower column, because two
 * pricing tables in one product is two sets of numbers to keep in step.
 *
 * ── WHAT WAS KEPT ────────────────────────────────────────────────────────
 *
 * The trial terms, verbatim, moved with the section. domain/billing/founding-
 * pricing.ts is untouched: its four prices are the only ones anybody has ever
 * approved for anything, and deleting a commercial decision to tidy a page is
 * not this file's call. Nothing renders them publicly today, and that file
 * says so.
 */

/* ────────────────────────────────────────────────────────────────── 9. FAQ */

const FAQ = [
  {
    q: 'Is my Etsy account safe?',
    a: 'CobaltRank never sees your Etsy password. You connect with an OAuth token, scoped to what it needs, stored encrypted, and revocable from your Etsy account at any moment. Revoking it stops every read and every write.',
  },
  {
    q: 'What happens when I connect?',
    a: 'CobaltRank reads your listings and your order receipts into its own tables, so the screens are fast and work when Etsy is slow. It writes nothing on connection. Until you run a bulk edit and confirm its diff, CobaltRank has never sent anything to Etsy.',
  },
  {
    q: 'Can it change my listings without asking?',
    a: 'No. Every write goes through the same path: select, validate, then the exact before-and-after, fingerprinted. If the catalogue changes between your approval and the apply, it refuses and tells you what moved rather than applying to whatever is left.',
  },
  {
    q: 'Why is there no keyword research?',
    a: 'Because Etsy does not expose search volume through its API. Every tool that shows you a volume number got it from somewhere else — a third-party panel, a clickstream, a model — and most of them do not say which. CobaltRank will not ship an estimate dressed as a measurement. The Research screens are drawn and you can walk through them in the demo, where every figure is sample data and badged as such; on a connected shop they say they are not built rather than inventing a number. If a trustworthy source appears, it will arrive labelled Estimated with its method attached, and not before.',
  },
  {
    q: 'When does it launch?',
    a: 'The product is built and you can walk through all of it in the demo right now. What is not built is billing — there is no payment provider wired up — and the email sender the trial needs before it can take a card. The waitlist is how you find out when both are.',
  },
  {
    q: 'Can I get my data out?',
    a: `${EXPORTABLE_DATASETS.length} CSV files, from Settings, without asking anybody: ${exportableNouns()}. ${notExportableNouns().charAt(0).toUpperCase()}${notExportableNouns().slice(1)} are not exportable yet, which is why this answer is not the word "everything". ${deletionRoute()}`,
  },
]

export function Faq() {
  return (
    <section id="faq" className="border-t" style={{ borderColor: 'var(--border)' }}>
      <div className="mx-auto max-w-[800px] px-5 py-16 md:py-20">
        <h2 className="display text-[28px] leading-[1.15] md:text-[36px]" style={{ color: 'var(--ink-1)' }}>
          What sellers ask first.
        </h2>

        <div className="mt-9 border-t" style={{ borderColor: 'var(--border)' }}>
          {FAQ.map((item) => (
            <details key={item.q} className="border-b py-4" style={{ borderColor: 'var(--border)' }}>
              <summary
                className="display cursor-pointer list-none text-[17px] leading-snug"
                style={{ color: 'var(--ink-1)' }}
              >
                {item.q}
              </summary>
              <p className="mt-2.5 max-w-[66ch] text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/*
 * How a seller asks for their data to be deleted, said once.
 *
 * Two surfaces claim this — the trust section and the FAQ — and both used to
 * print `privacy@<domain>`. No domain has been bought, so that address routed
 * nowhere. Privacy §6 tells a seller that emailing it is the ONLY way to
 * exercise a deletion right, which makes a dead address the worst kind of
 * false claim this page could carry: the remedy for a right, that does not
 * work.
 *
 * So the address comes from lib/brand.ts, where it is `null`, and when it is
 * null the sentence says what is actually true instead of naming a mailbox
 * nobody reads. The same rule the legal documents already follow with
 * `[[PRIVACY_EMAIL]]`.
 */
function deletionRoute(): string {
  const address = contactAddress('privacy')
  return address
    ? `Deletion is a request to ${address} today — actioned within 30 days, with written confirmation of what was removed.`
    : 'Deletion is a request rather than a button today, and the address to send it to is not published yet — no contact domain has been bought. It will be on this page and in the Privacy Policy before anybody can connect a shop.'
}

/* ───────────────────────────────────────────────────────────────── footer */

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE FOOTER. FOUR COLUMNS, AND A YEAR NOBODY HAS TO REMEMBER.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * ── THE COPYRIGHT YEAR IS COMPUTED, NOT TYPED ────────────────────────────
 *
 * The approved design had "© 2026" written into the markup. It is correct
 * today and wrong on the first of January, and the failure mode is the worst
 * kind: nothing breaks, nobody is paged, and the site quietly advertises that
 * it has not been touched in a year. `new Date()` on a server component is
 * evaluated per request — every page in this product already renders on
 * demand for the CSP nonce (see app/layout.tsx) — so this is the real year,
 * forever, at no cost.
 *
 * ── AND NO COMPANY NAME ──────────────────────────────────────────────────
 *
 * The line reads "© <year> CobaltRank" and stops there. There is no
 * registered entity yet: the legal documents carry `[[LEGAL_ENTITY]]` as a
 * marked blank for exactly this reason, and a footer that invented "CobaltRank
 * Ltd" or "CobaltRank, Inc." would be the one false claim on this page that a
 * reader could check in a public register.
 */
export function MarketingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}>
      <div className="mx-auto max-w-[1180px] px-5 py-12">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
          {/* ── the mark, and what this is ──────────────────────────── */}
          <div>
            <span className="display text-[17px]" style={{ color: 'var(--ink-1)' }}>
              CobaltRank
            </span>
            <p
              className="mt-2 max-w-[34ch] text-[12.5px] leading-relaxed"
              style={{ color: 'var(--muted-1)' }}
            >
              Etsy keyword research, real profit arithmetic, evidence-based listing checks and
              safer bulk updates. Every figure says where it came from.
            </p>
            <Link
              href="/signup"
              className="mt-3.5 inline-flex items-center px-3.5 text-[13px] font-semibold"
              style={{
                background: 'var(--brand)',
                color: 'var(--on-brand)',
                borderRadius: 'var(--paper-radius)',
                minHeight: '40px',
              }}
            >
              Start for Free
            </Link>
          </div>

          <FooterColumn
            title="Product"
            links={[
              { label: 'Keyword research', href: '/#keywords' },
              { label: 'Profit calculator', href: '/#calculator' },
              { label: 'Listing checks', href: '/#listings' },
              { label: 'Shop performance', href: '/#performance' },
              { label: 'Bulk updates', href: '/#bulk' },
              { label: 'Pricing', href: '/pricing' },
            ]}
          />

          <FooterColumn
            title="How it works"
            links={[
              { label: 'How the figures are made', href: '/#provenance' },
              { label: 'What you can check', href: '/#trust' },
              { label: 'Common questions', href: '/#faq' },
              /* Through the demo door, for the reason the trust section
                 above records: both pages are inside the dashboard shell. */
              { label: 'Methodology', href: '/api/demo/enter?to=/data/methodology' },
              { label: 'Data sources', href: '/api/demo/enter?to=/data/sources' },
            ]}
          />

          <div>
            <h2
              className="mono text-[10.5px] uppercase tracking-[0.07em]"
              style={{ color: 'var(--muted-1)' }}
            >
              Account
            </h2>
            <ul className="mt-2.5 flex flex-col gap-0.5 text-[13px]">
              <li>
                <Link href="/login" className="footer-link">
                  Log in
                </Link>
              </li>
              <li>
                <Link href="/signup" className="footer-link">
                  Create an account
                </Link>
              </li>
              <li>
                {/*
                  * A plain <a>, and no prefetch. <Link> client-side navigates,
                  * and a route handler's 303 + Set-Cookie cannot be applied by
                  * the router — measured on the hero's own button. Next also
                  * prefetches a <Link> on sight, which would set the demo
                  * cookie for anybody who merely scrolled to the footer.
                  */}
                <a href="/api/demo/enter" className="footer-link">
                  See the live demo
                </a>
              </li>
              <li>
                <Link href="/#waitlist" className="footer-link">
                  Join the waitlist
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-10 flex flex-wrap items-start gap-x-8 gap-y-4 border-t pt-6"
          style={{ borderColor: 'var(--border)' }}
        >
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]" aria-label="Footer">
          {/*
            * The legal pages now exist — /legal/terms, /legal/privacy,
            * /legal/subprocessors, /legal/etsy — and this used to say they did
            * not, because for a while a footer link to a privacy policy was a
            * 404 that tests/unit/links.test.ts caught.
            *
            * They are still not linked unconditionally. LegalLinks renders
            * them only while the documents are in force: both still carry
            * `[[LEGAL_ENTITY]]` and friends, and a footer link presents a
            * document as settled. A reader who goes to the URL directly gets
            * the document in full with its draft state stated; a reader who
            * follows a link from here would reasonably assume it was final.
            * One function decides, in lib/legal/documents.ts, so this footer
            * and the signup form and the acceptance gate cannot disagree.
            */}
          <LegalLinks variant="footer" />
          {/*
            * The Contact link renders only when there is an address to send
            * people to. No domain has been bought, so today there is not, and
            * a mailto: that bounces is worse than no link — see lib/brand.ts.
            */}
          {hasContactAddress('support') ? (
            <a
              href={`mailto:${contactAddress('support')}`}
              style={{ color: 'var(--ink-2)' }}
            >
              Contact
            </a>
          ) : null}
        </nav>

        <p
          className="min-w-[32ch] max-w-[72ch] flex-1 text-[12px] leading-relaxed"
          style={{ color: 'var(--muted-1)' }}
        >
          {/* The same disclaimer the app already carries. */}
          CobaltRank is not affiliated with, endorsed by, or sponsored by Etsy, Inc. Etsy is a
          trademark of Etsy, Inc. CobaltRank uses the Etsy API but is not endorsed or certified by
          Etsy.
        </p>

        {/*
          * Last in the row and last in the DOM. The legal links above it are
          * conditional — they render nothing at all while the documents are
          * drafts — so anything anchored with `ml-auto` BEFORE the disclaimer
          * ends up floating in the middle of an otherwise empty line. Reading
          * order and visual order agree this way in both states.
          */}
        <p className="figure whitespace-nowrap text-[12px]" style={{ color: 'var(--muted-1)' }}>
          © {year} CobaltRank
        </p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { label: string; href: string }[]
}) {
  return (
    <div>
      {/*
        * An <h2>, not a styled <span>. A footer with four unlabelled lists in
        * it is four undifferentiated link piles to anyone navigating by
        * heading — and there is exactly one <h1> on this page, so these sit at
        * the right level under it.
        */}
      <h2 className="mono text-[10.5px] uppercase tracking-[0.07em]" style={{ color: 'var(--muted-1)' }}>
        {title}
      </h2>
      <ul className="mt-2.5 flex flex-col gap-0.5 text-[13px]">
        {links.map((link) => (
          <li key={link.href}>
            {/*
              * A route handler gets a plain <a>, and a page gets <Link>. The
              * distinction is not cosmetic: <Link> client-side navigates, and
              * the router cannot apply the 303 + Set-Cookie that the demo door
              * answers with — measured, the click left the browser where it
              * was with no cookie. It also stops Next prefetching the demo
              * door for anybody who scrolls to the footer.
              */}
            {link.href.startsWith('/api/') ? (
              <a href={link.href} className="footer-link">
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className="footer-link">
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
