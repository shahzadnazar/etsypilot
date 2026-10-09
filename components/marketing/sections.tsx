import Link from 'next/link'
import { ProvenanceBadge } from '@/components/provenance/provenance-badge'
import { PROVENANCE_TYPES, type ProvenanceType } from '@/lib/provenance/types'
import {
  FOUNDING_NOTE,
  FOUNDING_TIERS,
  includesFor,
  limitsFor,
  perMonth,
  type FoundingTier,
} from '@/domain/billing/founding-pricing'
import { TRIAL_TERMS } from '@/domain/billing/plans'
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

/* ───────────────────────────────────────────────────────────── navigation */

export function MarketingNav() {
  return (
    <header
      className="border-b"
      style={{ borderColor: 'var(--border)', background: 'var(--page-bg)' }}
    >
      <nav
        className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5"
        aria-label="Main"
      >
        <Link href="/" className="display mr-2 text-[17px]" style={{ color: 'var(--ink-1)' }}>
          EtsyPilot
        </Link>
        <Link href="#what" className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          Features
        </Link>
        <Link href="/pricing" className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
          Pricing
        </Link>
        {/*
          * Through the demo door, because /tools is inside the dashboard shell
          * and a visitor with no account is redirected to /login by it. A nav
          * item that bounces a stranger to a sign-in form is the defect this
          * whole page exists to fix, one link smaller.
          */}
        <a href="/api/demo/enter?to=/tools"
          className="text-[13px]"
          style={{ color: 'var(--ink-2)' }}
        >
          Free tools
        </a>
        <span className="ml-auto flex items-center gap-2.5">
          {/*
            * prefetch={false} on the demo door: Next prefetches a <Link> on
            * sight, and prefetching a route handler would set the demo cookie
            * for anybody who merely scrolled past the nav.
            */}
          <a href="/api/demo/enter"
            className="text-[13px] font-semibold"
            style={{ color: 'var(--brand-strong)' }}
          >
            See the demo
          </a>
          <Link href="/login" className="text-[13px]" style={{ color: 'var(--ink-2)' }}>
            Log in
          </Link>
          <Link
            href="#waitlist"
            className="px-3 py-1.5 text-[13px] font-semibold"
            style={{
              background: 'var(--brand)',
              color: 'var(--on-brand)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            Join the waitlist
          </Link>
        </span>
      </nav>
    </header>
  )
}

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
    body: 'Etsy exposes no endpoint for what you spend on Etsy Ads. Any tool showing you an ads figure per listing got it from somewhere other than Etsy, or worked it out. EtsyPilot shows the shop-level figure Etsy does report, and says the per-listing one is unavailable.',
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

/* ───────────────────────────────────────────── 5. what EtsyPilot does */

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
  AI_DRAFT: 'Written by the assistant from evidence on your screen, for you to approve or discard.',
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
          When EtsyPilot cannot verify a number, it says so instead of estimating one.
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
      'The connection is an OAuth token, stored encrypted. Revoke it from your Etsy account and EtsyPilot stops reading and writing immediately — there is nothing it can do with a revoked token.',
  },
  {
    claim: 'Only you can change your shop.',
    detail:
      'Every write shows you the exact before-and-after first, fingerprinted so the set you approved is the set that is sent. Nothing goes to Etsy until you confirm that diff, and if the catalogue moved in between, EtsyPilot refuses rather than applying to whatever is left.',
  },
  {
    claim: 'Not even we can.',
    detail:
      'EtsyPilot staff can read your shop to support you, and cannot write to it — enforced in code, not by policy. The operator area may change four things, none of them yours: a person’s platform role and three of its own audit tables. It has no way to write a listing, an order, a cost or anything on Etsy.',
  },
  {
    claim: 'Refusals are recorded, not just writes.',
    detail:
      'The audit log is append-only and exportable, and it keeps what EtsyPilot would not do as well as what it did — "Write refused — demo mode · nothing sent" is a record, with the reason and what would have changed.',
  },
  {
    claim: 'A rollback is planned against your shop as it is now.',
    detail:
      'Not as it was when the job ran. A listing somebody edited on Etsy since is excluded and named, rather than silently overwritten — restoring it would discard work EtsyPilot did not do.',
  },
  {
    claim: 'Export what the figures are built on, any time.',
    /*
     * The nouns come from domain/export/datasets.ts, not from this file. The
     * first version of this line was written from memory and named four
     * datasets, two of which have no exporter. A sentence about what the
     * software does is now rendered from the software.
     */
    detail: `As CSV, from Settings: ${exportableNouns()}. Each file carries a provenance column beside every value and a header saying what it leaves out. ${notExportableNouns().charAt(0).toUpperCase()}${notExportableNouns().slice(1)} have no exporter yet, so "everything" would be the wrong word. Deletion is a request to privacy@etsypilot.app today and is actioned within 30 days — there is no self-serve delete button yet, and a button that looked like one would be worse than saying so.`,
  },
  {
    claim: 'Two-factor authentication is available on every account.',
    detail:
      'An authenticator app, with recovery codes. Required for anyone operating EtsyPilot itself.',
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

        <p className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[13.5px]">
          <Link href="/data/methodology" className="font-semibold underline underline-offset-2" style={{ color: 'var(--brand-strong)' }}>
            How every figure is produced
          </Link>
          <Link href="/data/sources" className="font-semibold underline underline-offset-2" style={{ color: 'var(--brand-strong)' }}>
            Where every figure comes from
          </Link>
          <span style={{ color: 'var(--muted-1)' }}>
            Both pages are in the product. No competitor publishes an equivalent.
          </span>
        </p>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────────────────────── 8. pricing */

export function Pricing({ heading = true }: { heading?: boolean }) {
  return (
    <section
      id="pricing"
      className="border-t"
      style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
    >
      <div className="mx-auto max-w-[1180px] px-5 py-16 md:py-20">
        {heading ? (
          <h2 className="display text-[28px] leading-[1.15] md:text-[36px]" style={{ color: 'var(--ink-1)' }}>
            Pricing
          </h2>
        ) : null}
        <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {FOUNDING_NOTE} Six months is 15% off, paid once.
        </p>

        <div className="mt-10 grid gap-px border md:grid-cols-2 lg:grid-cols-4" style={{ borderColor: 'var(--border)', background: 'var(--border)', borderRadius: 'var(--paper-radius)' }}>
          {FOUNDING_TIERS.map((tier) => (
            <TierCard key={tier.name} tier={tier} />
          ))}
        </div>

        {/*
          * The trial terms, verbatim as the owner set them. The DAYS come from
          * TRIAL_TERMS so the page cannot say seven while the flow does
          * something else, and domain/billing/trial.ts refuses to start that
          * flow at all until an email sender is configured — because
          * "we'll email you before it ends" is a promise this deployment
          * cannot yet keep.
          */}
        <p
          className="mt-8 max-w-[70ch] border-l-2 pl-4 text-[13.5px] leading-relaxed"
          style={{ borderColor: 'var(--brand)', color: 'var(--ink-2)' }}
        >
          {TRIAL_TERMS.terms}
        </p>
      </div>
    </section>
  )
}

function TierCard({ tier }: { tier: FoundingTier }) {
  const includes = includesFor(tier)
  const limits = limitsFor(tier)

  return (
    <div className="flex flex-col gap-3 p-5" style={{ background: 'var(--surface)' }}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="display text-[19px]" style={{ color: 'var(--ink-1)' }}>
          {tier.name}
        </h3>
        {tier.popular ? (
          <span
            className="mono px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.06em]"
            style={{ background: 'var(--brand-tint)', color: 'var(--brand-strong)', borderRadius: '2px' }}
          >
            Most popular
          </span>
        ) : null}
      </div>

      <p className="text-[12.5px] leading-snug" style={{ color: 'var(--muted-1)' }}>
        {tier.positioning}
      </p>

      <p className="flex items-baseline gap-1.5">
        <span className="figure text-[30px] font-semibold" style={{ color: 'var(--ink-1)' }}>
          ${tier.monthly}
        </span>
        <span className="text-[12.5px]" style={{ color: 'var(--muted-1)' }}>
          / month
        </span>
      </p>
      <p className="figure text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
        or ${tier.sixMonth} for six months
        <span style={{ color: 'var(--muted-1)' }}> · ${perMonth(tier)}/mo</span>
      </p>

      <ul className="mt-1 flex flex-col gap-1.5 border-t pt-3 text-[13px]" style={{ borderColor: 'var(--border)', color: 'var(--ink-2)' }}>
        {includes.map((line) => (
          <li key={line}>{line}</li>
        ))}
        {limits ? (
          <li className="figure" style={{ color: 'var(--muted-1)' }}>
            {limits.listings.toLocaleString('en-US')} listings · {limits.aiGenerations} AI drafts /
            month · {limits.auditRetentionDays}-day audit history
          </li>
        ) : (
          /*
            * No invented caps. ./plans.ts holds three plans and this tier maps
            * to none of them, so its price is decided and its limits are not.
            * Saying so is the only honest thing a pre-launch pricing table can
            * do — a made-up listing cap is a promise about capability.
            */
          <li style={{ color: 'var(--muted-1)' }}>
            Limits are still being set. The price is fixed; what it includes is not published yet,
            and will be before anybody is charged.
          </li>
        )}
      </ul>

      {/*
        * "Join the waitlist", never "Subscribe". There is no payment provider
        * wired up, and a button that cannot take money must not pretend it can.
        */}
      <Link
        href="#waitlist"
        className="mt-auto px-3 py-2 text-center text-[13px] font-semibold"
        style={{
          background: tier.popular ? 'var(--brand)' : 'var(--surface)',
          color: tier.popular ? 'var(--on-brand)' : 'var(--brand-strong)',
          border: tier.popular ? '1px solid var(--brand)' : '1px solid var(--border)',
          borderRadius: 'var(--paper-radius)',
        }}
      >
        Join the waitlist
      </Link>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────── 9. FAQ */

const FAQ = [
  {
    q: 'Is my Etsy account safe?',
    a: 'EtsyPilot never sees your Etsy password. You connect with an OAuth token, scoped to what it needs, stored encrypted, and revocable from your Etsy account at any moment. Revoking it stops every read and every write.',
  },
  {
    q: 'What happens when I connect?',
    a: 'EtsyPilot reads your listings and your order receipts into its own tables, so the screens are fast and work when Etsy is slow. It writes nothing on connection. Until you run a bulk edit and confirm its diff, EtsyPilot has never sent anything to Etsy.',
  },
  {
    q: 'Can it change my listings without asking?',
    a: 'No. Every write goes through the same path: select, validate, then the exact before-and-after, fingerprinted. If the catalogue changes between your approval and the apply, it refuses and tells you what moved rather than applying to whatever is left.',
  },
  {
    q: 'Why is there no keyword research?',
    a: 'Because Etsy does not expose search volume through its API. Every tool that shows you a volume number got it from somewhere else — a third-party panel, a clickstream, a model — and most of them do not say which. EtsyPilot will not ship an estimate dressed as a measurement. If a trustworthy source appears, it will arrive labelled Estimated with its method attached, and not before.',
  },
  {
    q: 'When does it launch?',
    a: 'The product is built and you can walk through all of it in the demo right now. What is not built is billing — there is no payment provider wired up — and the email sender the trial needs before it can take a card. The waitlist is how you find out when both are.',
  },
  {
    q: 'Can I get my data out?',
    a: `${EXPORTABLE_DATASETS.length} CSV files, from Settings, without asking anybody: ${exportableNouns()}. ${notExportableNouns().charAt(0).toUpperCase()}${notExportableNouns().slice(1)} are not exportable yet, which is why this answer is not the word "everything". Deletion is a request to privacy@etsypilot.app today — actioned within 30 days, with written confirmation of what was removed.`,
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

/* ───────────────────────────────────────────────────────────────── footer */

export function MarketingFooter() {
  return (
    <footer className="border-t" style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}>
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-start gap-x-8 gap-y-4 px-5 py-10">
        <span className="display text-[16px]" style={{ color: 'var(--ink-1)' }}>
          EtsyPilot
        </span>
        <nav className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]" aria-label="Footer">
          {/*
            * Privacy and Terms are NOT linked, because neither page exists —
            * tests/unit/links.test.ts caught the two 404s the moment they were
            * written. A footer link to a privacy policy that is not there is
            * worse on this page than anywhere else in the product: it is one
            * of the things a sceptical seller clicks first, and finding
            * nothing is the answer they take away.
            *
            * They go back the day the pages are written. Until then the two
            * documents that DO exist and that no competitor publishes are the
            * ones in front of people.
            */}
          <Link href="/data/methodology" style={{ color: 'var(--ink-2)' }}>Methodology</Link>
          <Link href="/data/sources" style={{ color: 'var(--ink-2)' }}>Data sources</Link>
          <a href="mailto:hello@etsypilot.app" style={{ color: 'var(--ink-2)' }}>Contact</a>
        </nav>
        <p className="w-full max-w-[72ch] text-[12px] leading-relaxed" style={{ color: 'var(--muted-1)' }}>
          {/* The same disclaimer the app already carries. */}
          EtsyPilot is not affiliated with, endorsed by, or sponsored by Etsy, Inc. Etsy is a
          trademark of Etsy, Inc. EtsyPilot uses the Etsy API but is not endorsed or certified by
          Etsy.
        </p>
      </div>
    </footer>
  )
}
