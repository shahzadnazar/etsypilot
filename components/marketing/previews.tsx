import Link from 'next/link'
import { AUDIT_RULES } from '@/domain/audit/rules'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE PRODUCT SECTIONS. SERVER COMPONENTS, NO JAVASCRIPT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * Six sections, each a short claim and a picture of the screen that backs it.
 * Two rules run through all of them and they are the reason this file is worth
 * reading before editing it:
 *
 *   1. WHERE THE PRODUCT HAS REAL CONTENT, THE SECTION USES IT. The listing
 *      checks below are `AUDIT_RULES` — the same array the audit screen runs,
 *      with the same wording — so the page cannot advertise a check the
 *      product does not perform, and a rule reworded in the domain is
 *      reworded here. Prose retyped from a feature is prose that goes stale
 *      the first time the feature changes.
 *
 *   2. WHERE THE FIGURES ARE A SAMPLE, THE SECTION SAYS SO IN ITS OWN BODY.
 *      Not in a footnote at the bottom of the page: beside the number, where
 *      somebody screenshotting one panel still carries it.
 *
 * The keyword section is the one with the sharpest edge on it, and its note
 * is not a disclaimer but the actual position: Etsy publishes no search
 * volume, to anybody, through the API or otherwise. Any product showing you an
 * exact monthly search count for an Etsy term is modelling it. This one says
 * which figures are modelled and does not print a number dressed as a
 * measurement.
 */

const SECTION = 'px-4 py-14 md:px-6 md:py-20'
const WRAP = 'mx-auto max-w-[1180px]'

/*
 * ── `onTint` EXISTS BECAUSE --brand HAS NO HEADROOM IN DARK MODE ─────────
 *
 * On `--surface` or `--page-bg`, `--brand` measures 4.90:1 in dark — over the
 * 4.5:1 line, and only just. Put the same colour on `--brand-tint`, which is
 * the brand at 16% over the surface, and it drops to 3.81:1.
 *
 * So an eyebrow on a tinted panel uses `--brand-strong` instead: #A5B4FC in
 * dark, which measures 5.6:1 on the same tint, and the darker #3730A3 in
 * light, where it is stronger still. One prop rather than a second component,
 * because the distinction is "what is behind it" and nothing else.
 *
 * Found by axe, which had never been run against this page: the public site
 * had no accessibility sweep at all until tests/browser/landing-page.py got
 * one, and the dashboard's 104-surface audit is entirely behind the login.
 */
function Eyebrow({ children, onTint = false }: { children: React.ReactNode; onTint?: boolean }) {
  return (
    <span
      className="mono block text-[10.5px] font-semibold uppercase tracking-[0.1em]"
      style={{ color: onTint ? 'var(--brand-strong)' : 'var(--brand)' }}
    >
      {children}
    </span>
  )
}

function Panel({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div
      /*
       * ── `relative` IS LOAD-BEARING ───────────────────────────────────
       *
       * These panels contain tables, and every table here carries an
       * `sr-only` caption so a screen reader is told what it is looking at.
       * `sr-only` is `position: absolute`, and an absolutely positioned
       * element is clipped by an ancestor's `overflow` ONLY IF that ancestor
       * is itself positioned.
       *
       * Without this the caption escaped the panel entirely: its static
       * position is inside a table whose min-content width is wider than a
       * phone, so at 390px it landed past the viewport and the whole document
       * scrolled 80px sideways. `body.scrollWidth` reads correctly and every
       * element-level sweep comes back clean, which is what makes it hard to
       * find — the same mechanism cost an hour on /pricing/compare.
       */
      className="relative overflow-hidden border"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface)',
        borderRadius: 'var(--card-radius)',
      }}
    >
      {label ? (
        <div
          className="flex items-center justify-between gap-2 border-b px-3.5 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
        >
          <span className="text-[12px] font-semibold" style={{ color: 'var(--ink-1)' }}>
            {label}
          </span>
          <span
            className="mono text-[10px] uppercase tracking-[0.06em]"
            style={{ color: 'var(--muted-1)' }}
          >
            Sample data
          </span>
        </div>
      ) : null}
      {children}
    </div>
  )
}

/* ───────────────────────────────────────────── the one call to action */

/*
 * Every section's primary button, in one place.
 *
 * Six sections now carry "Start for Free" and they all go to /signup — a real
 * route with a real Supabase sign-up behind it. Written once because six
 * copies of a destination is five chances for one of them to drift, which is
 * exactly how the approved export ended up with five buttons pointing at a
 * `#signup` anchor that did not exist.
 *
 * `plan-cta` and `plan-cta-arrow` are the classes the pricing cards already
 * use, so the arrow's hover motion is defined once in styles/marketing.css
 * and sits inside its reduced-motion query.
 */
function StartFree({
  variant = 'solid',
  className = '',
}: {
  variant?: 'solid' | 'outline'
  className?: string
}) {
  const solid = variant === 'solid'
  return (
    <Link
      href="/signup"
      className={`plan-cta inline-flex items-center gap-1.5 px-5 text-[14px] font-semibold ${className}`}
      style={{
        minHeight: '44px',
        background: solid ? 'var(--brand)' : 'var(--surface)',
        color: solid ? 'var(--on-brand)' : 'var(--brand-strong)',
        border: `1px solid ${solid ? 'var(--brand)' : 'var(--border-strong)'}`,
        borderRadius: 'var(--paper-radius)',
      }}
    >
      Start for Free
      <span aria-hidden className="plan-cta-arrow">
        →
      </span>
    </Link>
  )
}

/*
 * The small glyphs the "Why choose" row and the How-it-works cards use.
 *
 * Inline SVG rather than lucide-react, which is already a dependency: eight
 * decorative shapes are not worth eight more components in the public bundle,
 * and these are `aria-hidden` — the heading beside each one is the label.
 */
function Glyph({ name }: { name: 'search' | 'coins' | 'check' | 'layers' | 'plug' | 'trend' }) {
  const paths: Record<typeof name, React.ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </>
    ),
    coins: (
      <>
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
        <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    check: (
      <>
        <path d="M20 11.1V12a9 9 0 11-5.3-8.2" />
        <path d="M9 11l3 3 9-9" />
      </>
    ),
    layers: (
      <>
        <path d="M12 3l9 5-9 5-9-5 9-5z" />
        <path d="M3 13l9 5 9-5" />
      </>
    ),
    plug: (
      <>
        <path d="M9 3v6" />
        <path d="M15 3v6" />
        <path d="M7 9h10v3a5 5 0 01-10 0V9z" />
        <path d="M12 17v4" />
      </>
    ),
    trend: (
      <>
        <path d="M3 17l5-5 4 4 8-8" />
        <path d="M15 8h5v5" />
      </>
    ),
  }

  return (
    <span
      aria-hidden
      className="grid h-10 w-10 shrink-0 place-items-center"
      style={{ background: 'var(--brand-tint)', color: 'var(--brand-strong)', borderRadius: '10px' }}
    >
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths[name]}
      </svg>
    </span>
  )
}

/* ─────────────────────────────────── B2. why choose CobaltRank */

/*
 * Directly under the hero's dashboard, and deliberately NOT another dashboard.
 *
 * The hero already shows the product. This section's job is to say what it is
 * for, in one paragraph and four words, and then get out of the way — so it is
 * type and four glyphs, with no second screenshot competing with the one above
 * it.
 *
 * The four labels are the four things the product does that a seller can
 * name. Each one links to the section that shows it, so the row doubles as a
 * contents page for the rest of the scroll.
 */
const WHY_CHOOSE = [
  { icon: 'search' as const, label: 'Keyword research', href: '#features' },
  { icon: 'coins' as const, label: 'Real profit', href: '#profit' },
  { icon: 'check' as const, label: 'Listing checks', href: '#listings' },
  { icon: 'layers' as const, label: 'Safer bulk updates', href: '#bulk' },
]

export function WhyChoose() {
  return (
    <section id="why" className={SECTION} style={{ background: 'var(--surface)' }}>
      <div className={WRAP}>
        <div className="mx-auto max-w-[58ch] text-center">
          <Eyebrow>Why Choose CobaltRank</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            Built to Help Etsy Sellers Grow Smarter
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            From Etsy keyword research, competitor analysis, and trend tracking to real profit
            insights, evidence-based listing checks, and safer bulk updates — CobaltRank helps you
            optimize listings, attract shoppers, and make smarter selling decisions.
          </p>
        </div>

        <ul className="mx-auto mt-9 grid max-w-[920px] gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {WHY_CHOOSE.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="why-tile flex h-full items-center gap-3 border px-4 py-3.5"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface)',
                  borderRadius: 'var(--card-radius)',
                  minHeight: '64px',
                }}
              >
                <Glyph name={item.icon} />
                <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-9 flex justify-center">
          <StartFree />
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────── the keyword explorer, moved intact */

/*
 * ── THIS WAS A SECTION OF ITS OWN, AND IT IS THE SAME MARKUP ──────────
 *
 * It lived under "Find keywords worth targeting." with its own heading and
 * its own band of page. That section is gone; the panel is not. Extracting
 * it to a component rather than retyping it into the Discover row is the
 * difference between moving a thing and building a second one that looks
 * like it — and a second keyword table is a second set of sample figures
 * and a second chance to word the Etsy-search-volume position differently.
 *
 * The note under the table came with it, unchanged. It is not a disclaimer
 * under the fold: it is the position, in the same type size as the table's
 * own text, and it is the sentence this panel exists to be honest about.
 */
const KEYWORD_ROWS = [
  { term: 'stoneware espresso cups', demand: 'High', competition: 'Low–Medium', trend: 'Rising', score: 94 },
  { term: 'ceramic espresso set with saucer', demand: 'Medium', competition: 'Low', trend: 'Rising', score: 91 },
  { term: 'pottery demitasse cups', demand: 'Medium', competition: 'Low', trend: 'Steady', score: 86 },
  { term: 'minimal espresso mug handmade', demand: 'Low–Medium', competition: 'Low', trend: 'Seasonal', score: 74 },
]

export function KeywordExplorerPanel() {
  return (
    <div>
      <Panel label="Keyword explorer">
        <div
          className="flex flex-wrap items-center gap-2 border-b px-3.5 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <span
            className="flex h-9 flex-1 items-center gap-2 border px-3 text-[13px]"
            style={{
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-1)',
              borderRadius: 'var(--paper-radius)',
              background: 'var(--surface)',
            }}
          >
            <span aria-hidden style={{ color: 'var(--muted-1)' }}>
              ⌕
            </span>
            stoneware espresso cups
          </span>
          <span
            className="mono px-2 py-1 text-[10.5px] uppercase tracking-[0.06em]"
            style={{
              background: 'var(--canvas-soft)',
              color: 'var(--muted-1)',
              borderRadius: '4px',
            }}
          >
            Modelled
          </span>
        </div>

        {/*
          * Five columns do not fit a phone, and the honest options are to
          * drop columns or to let it scroll. It scrolls: a keyword table
          * without its competition column is a different table, and the
          * section's whole claim is about what the columns say.
          *
          * `relative`, for the reason the Panel above records — the caption
          * below is absolutely positioned and would otherwise escape this
          * scroller exactly as it escaped the panel.
          */}
        <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: '520px' }}>
          <caption className="sr-only">
            Four sample keywords with modelled demand, competition, seasonal direction and an
            opportunity score out of 100.
          </caption>
          <thead>
            <tr>
              {['Keyword', 'Demand', 'Competition', 'Trend', 'Opportunity'].map((head) => (
                <th
                  key={head}
                  scope="col"
                  className="mono px-3.5 py-2 text-[10px] uppercase tracking-[0.06em]"
                  style={{ color: 'var(--muted-1)', background: 'var(--canvas-soft)' }}
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KEYWORD_ROWS.map((row) => (
              <tr key={row.term} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-3.5 py-2.5 text-[13px]" style={{ color: 'var(--ink-1)' }}>
                  {row.term}
                </td>
                <td className="px-3.5 py-2.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                  {row.demand}
                </td>
                <td className="px-3.5 py-2.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                  {row.competition}
                </td>
                <td className="px-3.5 py-2.5 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                  {row.trend}
                </td>
                <td
                  className="figure px-3.5 py-2.5 text-right text-[13px] font-semibold"
                  style={{ color: 'var(--brand)' }}
                >
                  {row.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Panel>

      {/*
        * The sentence this section exists to be honest about. It is not a
        * disclaimer under the fold — it is the position, directly under
        * the table, in the same type size as the table's own text.
        */}
      <p
        className="mt-3 text-[12.5px] leading-relaxed"
        style={{ color: 'var(--muted-1)' }}
      >
        <strong style={{ color: 'var(--ink-2)' }}>Etsy publishes no search volume</strong> — not
        through its API and not anywhere else. These are modelled bands shown as bands, not as
        counts, and they are sample data until a keyword source is connected. Any tool quoting
        you an exact monthly search count for an Etsy term is modelling it too.
      </p>
    </div>
  )
}

/* ──────────────────────────────────────────────────── C. core benefits */

/*
 * ── THE SAME THREE QUESTIONS, WITH THE FIRST ONE OPENED OUT ─────────────
 *
 * The heading and the three steps are unchanged: Discover, Understand,
 * Improve, answered with the seller's own numbers. What changed is that the
 * first step now carries the screen that answers it.
 *
 * The keyword explorer used to be a section of its own further down the page,
 * under "Find keywords worth targeting." That section is gone and its panel
 * moved here, intact — `KeywordExplorerPanel` below is the same markup, the
 * same sample rows and the same note about Etsy publishing no search volume.
 * Moving it rather than rebuilding it is what stops the two drifting into
 * different claims about the same table.
 *
 * `id="keywords"` moved with it. The nav's Features menu and the footer both
 * link to `/#keywords`, and an anchor that stops resolving because a section
 * was reorganised is the defect tests/unit/landing-page.test.ts exists to
 * catch — so the id lives on the row that now holds the keyword content.
 *
 * Steps 2 and 3 keep their cards, their wording and their "See it →" links,
 * which is what was asked: they already work, and rebuilding them as a second
 * two-column row would be a redesign of something nobody reported a problem
 * with.
 */

const BENEFITS = [
  {
    step: '2 · Understand',
    title: 'Know your real profit',
    body: 'Every fee, every material, the postage you actually paid and the hour you actually worked — subtracted from what the buyer actually paid.',
    href: '#profit',
  },
  {
    step: '3 · Improve',
    title: 'Fix listings on evidence',
    body: `${AUDIT_RULES.length} mechanical checks against your own fields. Each finding says what it found, why it matters and what to do — never a score standing in for a reason.`,
    href: '#listings',
  },
] as const

export function Benefits() {
  return (
    <section id="features" className={SECTION} style={{ background: 'var(--page-bg)' }}>
      <div className={WRAP}>
        <div className="mx-auto max-w-[46ch] text-center">
          <Eyebrow>Everything you need to sell smarter</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            Three questions, answered with your own numbers.
          </h2>
        </div>

        {/* ── 1 · Discover, with the keyword explorer beside it ───────── */}
        <div
          id="keywords"
          className="mt-10 grid items-center gap-9 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]"
        >
          <div>
            <span
              className="mono text-[10.5px] uppercase tracking-[0.08em]"
              style={{ color: 'var(--muted-1)' }}
            >
              1 · Discover
            </span>
            <h3
              className="display mt-2 text-[24px] leading-[1.15] md:text-[28px]"
              style={{ color: 'var(--ink-1)' }}
            >
              Find better keywords
            </h3>
            <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              Discover promising Etsy keywords, explore competition, and track trends to find
              better opportunities for your listings.
            </p>
            <div className="mt-6">
              <StartFree />
            </div>
          </div>

          {/*
            * `min-w-0` is the whole reason this wrapper exists.
            *
            * A grid item's `min-width` defaults to `auto`, which means "no
            * smaller than your content's min-content width" — and this item's
            * content is a table with a 520px minimum. So at 390px the single
            * implicit column became 522px wide and the PAGE scrolled
            * sideways, even though the table itself was already in a scroller
            * that would have handled it. The `minmax(0, …)` in the lg columns
            * above says the same thing for wide screens; this says it for the
            * stacked one.
            */}
          <div className="min-w-0">
            <KeywordExplorerPanel />
          </div>
        </div>

        {/* ── 2 · Understand and 3 · Improve, as they were ────────────── */}
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <div
              key={benefit.title}
              className="flex flex-col border p-5"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <span
                className="mono text-[10.5px] uppercase tracking-[0.08em]"
                style={{ color: 'var(--muted-1)' }}
              >
                {benefit.step}
              </span>
              <h3 className="display mt-2 text-[19px]" style={{ color: 'var(--ink-1)' }}>
                {benefit.title}
              </h3>
              <p
                className="mt-2 flex-1 text-[13.5px] leading-relaxed"
                style={{ color: 'var(--ink-2)' }}
              >
                {benefit.body}
              </p>
              <Link
                href={benefit.href}
                className="mt-3 inline-flex items-center text-[13px] font-semibold"
                style={{ color: 'var(--brand)', minHeight: '32px' }}
              >
                See it →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ────────────────────────────────────────────── F. profit intelligence */

const WATERFALL = [
  { label: 'What buyers paid', amount: 24890, tone: 'ink' },
  { label: 'Etsy fees', amount: -3912, tone: 'down' },
  { label: 'Materials and packaging', amount: -4318, tone: 'down' },
  { label: 'Postage you paid', amount: -2556, tone: 'down' },
  { label: 'Offsite Ads', amount: -1195.5, tone: 'down' },
  { label: 'Your time, at the rate you set', amount: -1478, tone: 'down' },
] as const

export function ProfitIntelligence() {
  const money = (n: number) =>
    `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const widest = Math.max(...WATERFALL.map((row) => Math.abs(row.amount)))

  return (
    <section id="profit" className={SECTION} style={{ background: 'var(--surface)' }}>
      <div className={`${WRAP} grid items-start gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]`}>
        <div>
          <Eyebrow>Profit intelligence</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            Revenue is not profit.
            <br />
            <span style={{ color: 'var(--brand)' }}>Know the difference.</span>
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Etsy shows you what came in. The fees arrive days later in a separate payment-account
            ledger, and what it cost you to make the thing lives in your head. CobaltRank puts all
            three in one column and subtracts them.
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {[
              ['Itemised deductions', 'Every fee line with the arithmetic that produced it, not one lump labelled “Etsy fees”.'],
              ['Hidden losses surfaced', 'A listing that sells below cost is a finding, not something you notice at year end.'],
              ['Nothing invented', 'Where a cost is unknown the figure is withheld and says so, rather than being filled in with a guess.'],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-2.5">
                <span aria-hidden style={{ color: 'var(--success)' }}>
                  ✓
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                    {title}
                  </span>
                  <span className="block text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-7">
            <StartFree />
          </div>
        </div>

        <Panel label="Where a month of revenue went">
          <div className="flex flex-col gap-2.5 p-4">
            {WATERFALL.map((row) => (
              <div key={row.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
                    {row.label}
                  </span>
                  <span
                    className="figure text-[13px]"
                    style={{ color: row.tone === 'down' ? 'var(--danger)' : 'var(--ink-1)' }}
                  >
                    {money(row.amount)}
                  </span>
                </div>
                {/* A bar, drawn with a div: no chart library on a page whose
                    only JavaScript is the calculator. */}
                <span
                  aria-hidden
                  className="block h-1.5"
                  style={{
                    width: `${Math.max(4, (Math.abs(row.amount) / widest) * 100)}%`,
                    background: row.tone === 'down' ? 'var(--danger-mark)' : 'var(--brand)',
                    borderRadius: '2px',
                    opacity: row.tone === 'down' ? 0.55 : 1,
                  }}
                />
              </div>
            ))}
            <div
              className="mt-1 flex items-baseline justify-between gap-3 border-t pt-3"
              style={{ borderColor: 'var(--border)' }}
            >
              <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                Net profit · 45.9% margin
              </span>
              <span className="figure text-[17px] font-semibold" style={{ color: 'var(--success)' }}>
                $11,430.50
              </span>
            </div>
          </div>
        </Panel>
      </div>
    </section>
  )
}

/* ───────────────────────────────────────── G. listing intelligence */

export function ListingIntelligence() {
  /*
   * The first three ERROR rules, from the product's own array. Not a
   * hand-written selection: whatever the audit treats as blocking is what the
   * page shows, so the two cannot diverge.
   */
  const shown = AUDIT_RULES.filter((rule) => rule.severity === 'ERROR').slice(0, 3)

  return (
    /*
     * ── CENTRED HEADING AND A FULL-WIDTH PANEL BECAME TWO COLUMNS ───────
     *
     * The section said the same thing it says now; it said it above a
     * 860px panel rather than beside one, which left the page alternating
     * split, centred, split, split. The copy, the panel and the rules it
     * reads are unchanged — this is the layout catching up with its
     * neighbours.
     *
     * The column order mirrors the profit section above it (text left,
     * screen right) and inverts for shop performance below, so the page
     * alternates rather than repeating one arrangement four times.
     */
    <section id="listings" className={SECTION} style={{ background: 'var(--page-bg)' }}>
      <div className={`${WRAP} grid items-start gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]`}>
        <div>
          <Eyebrow>Evidence-based listing checks</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            A finding, a reason, and what to do.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {AUDIT_RULES.length} mechanical rules run against your own listing fields. No rule
            models Etsy&rsquo;s ranking — nobody outside Etsy can.
          </p>
          <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Each finding carries the field it looked at, why it matters and what to change. Several
            can be fixed across every affected listing at once, through the same confirmed diff as
            any other bulk edit.
          </p>

          <div className="mt-7">
            <StartFree />
          </div>
        </div>

        <div>
          <Panel label="Listing audit">
            <ul>
              {shown.map((rule) => (
                <li
                  key={rule.code}
                  className="border-b px-4 py-3.5 last:border-b-0"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="mono px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
                      style={{
                        background: 'var(--danger-surface)',
                        color: 'var(--danger-ink)',
                        border: '1px solid var(--danger-border)',
                        borderRadius: '4px',
                      }}
                    >
                      Error
                    </span>
                    <span className="text-[13.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                      {rule.label}
                    </span>
                    {rule.bulkFixable ? (
                      <span
                        className="mono ml-auto text-[10.5px] uppercase tracking-[0.06em]"
                        style={{ color: 'var(--muted-1)' }}
                      >
                        Fixable in bulk
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    <strong style={{ color: 'var(--ink-1)' }}>Why this matters.</strong> {rule.why}
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                    <strong style={{ color: 'var(--ink-1)' }}>What to do.</strong> {rule.fix}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
          <p className="mt-3 text-[12.5px] leading-relaxed" style={{ color: 'var(--muted-1)' }}>
            The wording above is the product&rsquo;s own, read from the rules the audit runs — so
            this page cannot advertise a check that is not performed.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────── H. shop performance */

const PULSE = [
  { label: 'Orders', value: '312', change: '+8.4%', up: true },
  { label: 'Revenue', value: '$24,890', change: '+5.1%', up: true },
  { label: 'Average order', value: '$79.78', change: '−3.0%', up: false },
  { label: 'Listings active', value: '412', change: '+6', up: true },
]

export function ShopPerformance() {
  return (
    <section id="performance" className={SECTION} style={{ background: 'var(--surface)' }}>
      <div className={`${WRAP} grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]`}>
        <Panel label="Shop pulse · last 30 days vs the 90 before">
          <div className="grid grid-cols-2 gap-px" style={{ background: 'var(--border)' }}>
            {PULSE.map((stat) => (
              <div key={stat.label} className="p-4" style={{ background: 'var(--surface)' }}>
                <span
                  className="mono block text-[10px] uppercase tracking-[0.07em]"
                  style={{ color: 'var(--muted-1)' }}
                >
                  {stat.label}
                </span>
                <span className="figure mt-1 block text-[19px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                  {stat.value}
                </span>
                <span
                  className="figure mt-0.5 block text-[12px]"
                  style={{ color: stat.up ? 'var(--success)' : 'var(--danger)' }}
                >
                  {stat.change}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t p-4" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[12.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              <strong style={{ color: 'var(--ink-1)' }}>Orders fell on 14 October</strong> and
              nothing in your change history explains it. The evidence is on the card; the product
              does not guess at a cause.
            </p>
          </div>
        </Panel>

        <div>
          <Eyebrow>Shop performance</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            What changed, and what nobody can explain.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Movements are measured against your own baseline, not against other shops. Where a
            change lines up with something you did, the product says so. Where it does not, it says
            that instead of inventing a reason — which is the half most dashboards leave out.
          </p>
          <ul className="mt-5 flex flex-col gap-2 text-[13.5px]" style={{ color: 'var(--ink-2)' }}>
            {[
              'Orders, revenue and average order against your own 90-day baseline',
              'Every recorded change tested against the movement it might explain',
              'Three verdicts — correlated, ruled out, unknown — and never a fourth',
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span aria-hidden style={{ color: 'var(--success)' }}>
                  ✓
                </span>
                {line}
              </li>
            ))}
          </ul>

          <div className="mt-7">
            <StartFree />
          </div>

          <p className="mt-4 text-[13px] leading-relaxed" style={{ color: 'var(--muted-1)' }}>
            Figures shown are from the sample shop.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ───────────────────────────────────────────────── I. safer bulk edits */

export function BulkUpdates() {
  return (
    <section id="bulk" className={SECTION} style={{ background: 'var(--page-bg)' }}>
      <div className={`${WRAP} grid items-start gap-10 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]`}>
        <div>
          <Eyebrow>Safer bulk updates</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            Make bulk changes with confidence.
          </h2>
          <p className="mt-4 text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Select the listings, read the diff line by line, then apply. Validation runs before
            anything is sent, and nothing reaches Etsy that you have not confirmed on screen.
          </p>
          <ol className="mt-5 flex flex-wrap gap-2">
            {['1 · Select', '2 · Preview the diff', '3 · Apply'].map((step) => (
              <li
                key={step}
                className="mono border px-2.5 py-1 text-[11.5px]"
                style={{
                  borderColor: 'var(--border-strong)',
                  color: 'var(--ink-2)',
                  background: 'var(--surface)',
                  borderRadius: 'var(--paper-radius)',
                }}
              >
                {step}
              </li>
            ))}
          </ol>

          {/*
            * No rollback claim here, deliberately. The product does have a
            * rollback window and it is a plan entitlement — 30 days on Basic,
            * 90 on Pro — but it is a different promise from "this edit is
            * safe to make", and a recovery guarantee is the one sentence on
            * this page that a seller would act on hardest. What this section
            * claims is what it shows: select, read the diff, apply, and
            * nothing reaches Etsy unconfirmed.
            */}
          <div className="mt-7">
            <StartFree />
          </div>
        </div>

        <Panel label="Bulk tag replacement · 4 listings staged">
          <div className="p-4">
            <div
              className="flex flex-wrap items-center gap-2 border px-3 py-2 text-[12px]"
              style={{
                borderColor: 'var(--warning-border)',
                background: 'var(--warning-surface)',
                color: 'var(--warning-ink)',
                borderRadius: 'var(--paper-radius)',
              }}
            >
              <span aria-hidden>⚑</span>1 listing title would exceed 140 characters. It is held
              back; the other three are unaffected.
            </div>

            <dl className="mt-3 flex flex-col gap-2">
              {[
                ['Before', 'handmade mug, coffee mug, gift', 'var(--danger)'],
                ['After', 'stoneware mug, espresso cup, gift for coffee lover', 'var(--success)'],
              ].map(([label, value, colour]) => (
                <div key={label} className="flex flex-col gap-0.5">
                  <dt className="mono text-[10px] uppercase tracking-[0.07em]" style={{ color: 'var(--muted-1)' }}>
                    {label}
                  </dt>
                  <dd
                    className="mono border px-2.5 py-1.5 text-[12px]"
                    style={{
                      borderColor: 'var(--border)',
                      background: 'var(--canvas-soft)',
                      color: colour,
                      borderRadius: '4px',
                    }}
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: 'var(--muted-1)' }}>
              Sample diff. Bulk editing runs against a connected shop — the preview above is what
              you confirm before anything is applied, and every applied job is reversible from
              Change History.
            </p>
          </div>
        </Panel>
      </div>
    </section>
  )
}

/* ──────────────────────────────────────────────────── J. how it works */

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   HOW IT WORKS. FOUR CARDS, AND ONE OF THEM IS NOT FINISHED.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * There was no How-it-works section on this page before — the footer has a
 * column by that name, which is a list of links and not a section — so this is
 * added rather than rebuilt, and it is the only section on the page with that
 * provenance besides "Why choose".
 *
 * ── THE ILLUSTRATIONS ARE THE PRODUCT, NOT PICTURES OF IT ────────────────
 *
 * Each card carries a small working piece of the interface in live HTML: the
 * scope chips the connect screen really shows, an audit finding in the shape
 * the audit really renders, a keyword row with the marker the explorer really
 * carries, a pulse stat with its real delta colours. Stock photography of a
 * person at a laptop would be faster and would say nothing; a screenshot would
 * be an asset to keep in step with four screens. This is neither.
 *
 * ── AND THE THIRD CARD SAYS WHAT IS NOT BUILT ────────────────────────────
 *
 * "Research keywords, analyze competitors, follow trends" describes screens
 * that exist and have no data source outside the demo: lib/signals/index.ts
 * returns null in live mode, so a connected shop sees an unbuilt state. The
 * card keeps the owner's sentence and carries the fact beside it, because a
 * four-card strip that presents three shipped things and one unfinished one
 * as the same thing is the kind of claim this product does not make. The
 * comparison table on /pricing/compare says the same in its own words.
 */

function StepArt({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex h-[108px] items-center justify-center overflow-hidden border-b px-3"
      style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
    >
      {children}
    </div>
  )
}

const HOW_IT_WORKS = [
  {
    title: 'Connect Your Shop',
    body: 'Connect your Etsy shop and bring your listings and shop information together.',
    art: (
      <div
        className="w-full max-w-[220px] border px-3 py-2.5"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          borderRadius: 'var(--paper-radius)',
        }}
      >
        <span className="block text-[11.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
          Willow &amp; Fern
        </span>
        <span className="mono mt-0.5 block text-[9.5px]" style={{ color: 'var(--muted-1)' }}>
          OAuth · no password
        </span>
        <span className="mt-2 flex flex-wrap gap-1">
          {['listings_r', 'listings_w', 'transactions_r'].map((scope) => (
            <span
              key={scope}
              className="mono px-1.5 py-0.5 text-[9px]"
              style={{
                background: 'var(--brand-tint)',
                color: 'var(--brand-strong)',
                borderRadius: '3px',
              }}
            >
              {scope}
            </span>
          ))}
        </span>
      </div>
    ),
  },
  {
    title: 'Optimize Listings',
    body: 'Identify listing issues and make improvements backed by evidence.',
    art: (
      <div
        className="w-full max-w-[220px] border px-3 py-2.5"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          borderRadius: 'var(--paper-radius)',
        }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="mono px-1 py-0.5 text-[8.5px] font-semibold uppercase"
            style={{
              background: 'var(--danger-surface)',
              color: 'var(--danger-ink)',
              borderRadius: '3px',
            }}
          >
            Error
          </span>
          <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-1)' }}>
            Sells below cost
          </span>
        </span>
        <span className="mt-1.5 block text-[10px] leading-snug" style={{ color: 'var(--ink-2)' }}>
          Price minus fees minus cost is negative.
        </span>
        <span className="mono mt-1.5 block text-[9px]" style={{ color: 'var(--muted-1)' }}>
          Fixable in bulk
        </span>
      </div>
    ),
  },
  {
    title: 'Explore Smarter Tools',
    body: 'Research keywords, analyze competitors, follow trends, and understand profitability.',
    /* Not operational on a connected shop. See the module note. */
    note: 'Keyword, competitor and trend screens run on sample data until a source is connected.',
    art: (
      <div
        className="w-full max-w-[220px] border px-3 py-2.5"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          borderRadius: 'var(--paper-radius)',
        }}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[11px]" style={{ color: 'var(--ink-1)' }}>
            stoneware espresso cups
          </span>
          <span className="figure text-[11px] font-semibold" style={{ color: 'var(--brand)' }}>
            94
          </span>
        </span>
        <span className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px]" style={{ color: 'var(--ink-2)' }}>
            Demand High · Competition Low
          </span>
        </span>
        <span
          className="mono mt-2 inline-block px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.06em]"
          style={{ background: 'var(--canvas-soft)', color: 'var(--muted-1)', borderRadius: '3px' }}
        >
          Sample data
        </span>
      </div>
    ),
  },
  {
    title: 'Track and Improve',
    body: 'Monitor shop performance, review changes, and make smarter decisions over time.',
    art: (
      <div
        className="w-full max-w-[220px] border px-3 py-2.5"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          borderRadius: 'var(--paper-radius)',
        }}
      >
        <span className="mono block text-[9px] uppercase tracking-[0.07em]" style={{ color: 'var(--muted-1)' }}>
          Orders · 30 days
        </span>
        <span className="flex items-baseline gap-2">
          <span className="figure text-[17px] font-semibold" style={{ color: 'var(--ink-1)' }}>
            312
          </span>
          <span className="figure text-[11px]" style={{ color: 'var(--success)' }}>
            +8.4%
          </span>
        </span>
        {/*
          * `--border-strong` for the earlier weeks rather than `--brand-tint`:
          * the tint is the brand at 16% and at this size it was indistinct
          * from the card behind it, so the sparkline read as a flat grey row
          * instead of as a shape. The current week keeps the brand, which is
          * the only thing the bars are there to point at.
          */}
        <span aria-hidden className="mt-2 flex h-8 items-end gap-1">
          {[40, 55, 48, 62, 58, 74, 100].map((height, index) => (
            <span
              key={index}
              className="block flex-1"
              style={{
                height: `${height}%`,
                background: index === 6 ? 'var(--brand)' : 'var(--border-strong)',
                borderRadius: '2px',
              }}
            />
          ))}
        </span>
      </div>
    ),
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className={SECTION} style={{ background: 'var(--surface)' }}>
      <div className={WRAP}>
        <div className="mx-auto max-w-[46ch] text-center">
          <Eyebrow>How It Works</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            From Connection to Growth
          </h2>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.title}
              className="step-card flex flex-col overflow-hidden border"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <StepArt>{step.art}</StepArt>
              <div className="flex flex-1 flex-col p-4">
                <span
                  className="mono text-[10px] uppercase tracking-[0.08em]"
                  style={{ color: 'var(--muted-1)' }}
                >
                  Step {index + 1}
                </span>
                <h3 className="display mt-1 text-[17px]" style={{ color: 'var(--ink-1)' }}>
                  {step.title}
                </h3>
                <p
                  className="mt-1.5 flex-1 text-[13px] leading-relaxed"
                  style={{ color: 'var(--ink-2)' }}
                >
                  {step.body}
                </p>
                {step.note ? (
                  <p
                    className="mt-2.5 border-t pt-2.5 text-[11.5px] leading-snug"
                    style={{ borderColor: 'var(--border)', color: 'var(--warning-ink)' }}
                  >
                    {step.note}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-9 flex justify-center">
          <StartFree />
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────── L. final CTA */

export function FinalCta() {
  return (
    <section className={SECTION} style={{ background: 'var(--surface)' }}>
      <div
        className="mx-auto max-w-[900px] border px-6 py-12 text-center"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--brand-tint)',
          borderRadius: 'var(--card-radius)',
        }}
      >
        <Eyebrow onTint>Getting started</Eyebrow>
        <h2
          className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
          style={{ color: 'var(--ink-1)' }}
        >
          Know your numbers.
          <br />
          <span style={{ color: 'var(--brand)' }}>Grow with confidence.</span>
        </h2>
        <p
          className="mx-auto mt-3 max-w-[52ch] text-[14.5px] leading-relaxed"
          style={{ color: 'var(--ink-2)' }}
        >
          Start on the free plan — the calculators and the methodology, with no shop connection and
          no card. Connect a shop when you want the rest.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <StartFree />
          <a
            href="/api/demo/enter"
            className="inline-flex h-11 items-center border px-5 text-[14px] font-semibold"
            style={{
              borderColor: 'var(--border-strong)',
              background: 'var(--surface)',
              color: 'var(--ink-1)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            See the live demo
          </a>
        </div>
        {/*
          * `--ink-2`, not `--muted-1`. The muted grey is 4.43:1 on this tint
          * in dark mode — the one place on the page where a secondary line
          * sits on a coloured panel rather than on a surface.
          */}
        <p className="mt-4 text-[12.5px]" style={{ color: 'var(--ink-2)' }}>
          Prefer to hear when the paid tiers open?{' '}
          <Link href="#waitlist" style={{ color: 'var(--brand-strong)', fontWeight: 600 }}>
            Join the waitlist
          </Link>
          .
        </p>
      </div>
    </section>
  )
}
