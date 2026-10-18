import Link from 'next/link'
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

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   FIVE SECTIONS CAME OFF THIS FILE, AND NONE OF THE BEHAVIOUR DID.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * `WhyProfitIsHard`, `WhatItDoes`, `ProvenanceSystem` and `Trust` were here,
 * and `Pricing` before them. The owner removed all of them from the homepage;
 * nothing else rendered them, so the components are gone rather than left as
 * exports nobody calls.
 *
 * WHAT THEY SAID IS STILL TRUE AND STILL ENFORCED. They were copy ABOUT the
 * product, and the product is unchanged:
 *
 *   The provenance system      lib/provenance/types.ts, rendered by
 *                              components/provenance/provenance-badge.tsx on
 *                              every figure in the application.
 *   "Not even we can"          domain/admin/operator-writes.ts and its
 *                              transitive guard in
 *                              tests/unit/operator-write-boundary.test.ts.
 *   Export as a right          tests/unit/export-ungated.test.ts, which holds
 *                              both directions: no plan may advertise it and
 *                              no code may gate it.
 *   The three Etsy facts       Still the reason domain/ads and the profit
 *                              waterfall withhold figures rather than
 *                              estimating them.
 *
 * `deletionRoute()` below survived the deletion of `Trust`, which used it,
 * because the FAQ uses it too — and tests/unit/brand.test.ts asserts this
 * file still names `contactAddress('privacy')` and still explains that
 * deletion has no published address yet. A sentence about a right may not
 * disappear because a marketing section did.
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
              { label: 'Keyword research', href: '/#discover' },
              /*
                * The homepage calculator section is gone, so this points at
                * the calculator that has a URL of its own — a real public
                * route in app/(public), reachable with no account. A footer
                * link to `/#calculator` after that section was removed would
                * be the dead fragment this product's own guards forbid.
                */
              { label: 'Profit calculator', href: '/tools/etsy-seller-calculator' },
              { label: 'Listing checks', href: '/#listings' },
              { label: 'Shop performance', href: '/#performance' },
              { label: 'Bulk updates', href: '/#bulk' },
              { label: 'Pricing', href: '/pricing' },
            ]}
          />

          <FooterColumn
            title="How it works"
            links={[
              /*
                * `/#provenance` and `/#trust` were these two, and both
                * sections came off the homepage. The pages they summarised
                * are still in the product and say it at greater length, so
                * the links follow the content through the demo door rather
                * than pointing at anchors nothing answers to.
                */
              { label: 'How the figures are made', href: '/api/demo/enter?to=/data/methodology' },
              { label: 'What you can check', href: '/api/demo/enter?to=/data/sources' },
              { label: 'Common questions', href: '/#faq' },
              { label: 'Pricing comparison', href: '/pricing/compare' },
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
