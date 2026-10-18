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
      className="mono t-eyebrow block font-semibold"
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
      className={`plan-cta inline-flex items-center gap-1.5 px-6 text-[15.5px] font-semibold ${className}`}
      style={{
        minHeight: '48px',
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
function Glyph({
  name,
}: {
  name: 'search' | 'coins' | 'check' | 'layers' | 'plug' | 'trend' | 'users'
}) {
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
    users: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20a6 6 0 0112 0" />
        <path d="M16 5.2a3.2 3.2 0 010 5.6" />
        <path d="M18.5 20a6 6 0 00-3-5.2" />
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
 * ── THE HEADING NAMED A CATEGORY INSTEAD OF A DIFFERENCE ─────────────────
 *
 * It read "Built to Help Etsy Sellers Grow Smarter", which every Etsy tool
 * ever built could print without changing a word — and this section sits
 * directly under the hero, where a visitor decides in about six seconds
 * whether this is another keyword tool.
 *
 * It is not another keyword tool, and the new heading says the thing the
 * competition cannot: keyword research is table stakes, and the part nobody
 * else does is tell you what the sale actually left you with. Charcoal for
 * the category, indigo for the claim.
 *
 * ── SIX ITEMS, AND TREND TRACKING IS NOT ONE OF THEM ─────────────────────
 *
 * Trends live inside keyword research and competitor insights, which is where
 * the product puts them. A seventh badge saying "Trend tracking" would be a
 * third name for the same screen, and a strip of badges is most useful when
 * each one is a different answer.
 */
const WHY_CHOOSE = [
  { icon: 'search' as const, label: 'Etsy Keyword Research', href: '#discover' },
  { icon: 'users' as const, label: 'Competitor Insights', href: '#discover' },
  { icon: 'coins' as const, label: 'Real Profit Clarity', href: '#profit' },
  { icon: 'check' as const, label: 'Evidence-Based Listing Checks', href: '#listings' },
  { icon: 'trend' as const, label: 'Shop Performance', href: '#performance' },
  { icon: 'layers' as const, label: 'Safer Bulk Updates', href: '#bulk' },
]

export function WhyChoose() {
  return (
    <section id="why" className={SECTION} style={{ background: 'var(--surface)' }}>
      <div className={WRAP}>
        {/*
          * ── `ch` IS THE WRONG UNIT ON A HEADING WRAPPER ──────────────────
          *
          * `ch` resolves against the element's OWN font, and this wrapper is
          * a plain div inheriting Inter at 16px — so `max-w-[32ch]` came out
          * at about 290px, and the 42px serif inside it broke "More Than Etsy
          * / SEO." mid-sentence. The measure has to be set in a unit that does
          * not depend on a font the heading is not using.
          *
          * Wide enough that each of the two sentences holds one line at the
          * desktop ceiling; below that the clamp shrinks the type faster than
          * the container, so it keeps breaking where the <br/> says.
          */}
        <div className="mx-auto max-w-[44rem] text-center">
          <Eyebrow>Why Choose CobaltRank</Eyebrow>
          <h2 className="display t-h2 mt-3" style={{ color: 'var(--ink-1)' }}>
            More Than Etsy SEO.
            {/*
              * An explicit break between the two sentences, because the two
              * colours are doing the work of separating them and a wrap that
              * lands mid-sentence — "More Than Etsy / SEO. Know What" — puts
              * the colour change in the middle of a line where it reads as an
              * accident. One line each, which is also how it is read aloud.
              */}
            <br />
            <span style={{ color: 'var(--brand)' }}>Know What You Actually Made.</span>
          </h2>
        </div>

        {/*
          * A separate, wider measure for the paragraph than for the heading.
          * A heading wants a short line so it breaks where the sense does; a
          * paragraph at that width is five ragged lines. Two max-widths, one
          * centred column, roughly three lines on a desktop.
          */}
        <p
          className="t-lead mx-auto mt-5 max-w-[64ch] text-center"
          style={{ color: 'var(--ink-2)' }}
        >
          Research Etsy keywords, analyze competitors, and follow trends — while understanding your
          real profit, checking listings with evidence, monitoring shop performance, and making
          safer bulk changes.
        </p>

        <ul className="mx-auto mt-10 grid max-w-[1000px] gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WHY_CHOOSE.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="why-tile flex h-full items-center gap-3 border px-4 py-4"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface)',
                  borderRadius: 'var(--card-radius)',
                  minHeight: '72px',
                }}
              >
                <Glyph name={item.icon} />
                <span className="t-body font-semibold" style={{ color: 'var(--ink-1)' }}>
                  {item.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex justify-center">
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

/* ──────────────────────────── the profit waterfall, moved intact */

/*
 * ── THIS WAS THE "Revenue is not profit" SECTION'S PANEL ──────────────
 *
 * Same markup, same figures, same arithmetic — moved into the Understand
 * row rather than retyped there, so there is one waterfall on the page and
 * one set of sample numbers to keep honest. The section that framed it is
 * gone; the panel is not.
 */
const WATERFALL = [
  { label: 'What buyers paid', amount: 24890, tone: 'ink' },
  { label: 'Etsy fees', amount: -3912, tone: 'down' },
  { label: 'Materials and packaging', amount: -4318, tone: 'down' },
  { label: 'Postage you paid', amount: -2556, tone: 'down' },
  { label: 'Offsite Ads', amount: -1195.5, tone: 'down' },
  { label: 'Your time, at the rate you set', amount: -1478, tone: 'down' },
] as const

export function ProfitWaterfallPanel() {
  const money = (n: number) =>
    `${n < 0 ? '\u2212' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const widest = Math.max(...WATERFALL.map((row) => Math.abs(row.amount)))

  return (
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
  )
}

/* ─────────────────────────────── the listing audit, moved intact */

/*
 * ── THIS WAS THE "A finding, a reason" SECTION'S PANEL ────────────────
 *
 * The first three ERROR rules, from the product's own array — not a
 * hand-written selection: whatever the audit treats as blocking is what
 * the page shows, so the two cannot diverge. Moved into the Improve row
 * with the section folded in around it.
 */
export function ListingAuditPanel() {
  const shown = AUDIT_RULES.filter((rule) => rule.severity === 'ERROR').slice(0, 3)

  return (
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
  )
}

/* ──────────────────────────────────────────────────── C. core benefits */

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THREE QUESTIONS, AND NOW THREE ROWS OF EQUAL WEIGHT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The heading and the three steps are unchanged. What changed is that the
 * three steps were not equal: Discover had a full two-column row with a
 * dashboard beside it, while Understand and Improve were small text cards
 * underneath. A reader scanning the page saw one feature and two footnotes,
 * which is a hierarchy nobody chose — it was an artefact of Discover having
 * inherited the keyword panel when its own section was folded in.
 *
 * All three are rows now, alternating, each with its own product preview, its
 * own Start for Free, and the same measure, spacing and radii.
 *
 * ── THE PROFIT AND LISTING SECTIONS WERE FOLDED IN RATHER THAN COPIED ────
 *
 * `ProfitIntelligence` and `ListingIntelligence` were separate sections lower
 * down the page, carrying exactly the panels rows 2 and 3 needed. Showing the
 * same waterfall and the same audit findings twice on one page would have
 * been two answers to one question, so the panels moved up into the rows that
 * ask it and the standalone sections are gone — the same move the keyword
 * section made last time.
 *
 * `id="profit"` and `id="listings"` moved with them. The nav's Features menu,
 * the footer and the "Why choose" badges all link to those fragments, and an
 * anchor that stops resolving because a section was reorganised is the defect
 * tests/unit/landing-page.test.ts exists to catch.
 *
 * ── ALTERNATING, AND STACKING IN READING ORDER ───────────────────────────
 *
 * Text / image, image / text, text / image on a wide screen. On a narrow one
 * every row stacks heading-description-CTA first and preview second, whatever
 * its desktop order — `order-first lg:order-none` on the text column does it
 * — because a reader who meets the screenshot before the sentence has to
 * work out what they are looking at.
 */

interface FeatureRow {
  id: string
  step: string
  title: string
  body: string
  /** True where the preview sits on the LEFT at desktop width. */
  previewFirst: boolean
  preview: React.ReactNode
  note?: string
}

export function Benefits() {
  const rows: FeatureRow[] = [
    {
      id: 'discover',
      step: '1 · Discover',
      title: 'Find Better Keywords',
      body: 'Discover Etsy keyword opportunities, analyze competition, and track search trends to improve your listing strategy.',
      previewFirst: false,
      preview: <KeywordExplorerPanel />,
    },
    {
      id: 'profit',
      step: '2 · Understand',
      title: 'Know Your Real Profit',
      body: 'See what you actually earn after Etsy fees, materials, shipping, advertising, and the cost of your work — subtracted from what the buyer actually paid.',
      previewFirst: true,
      preview: <ProfitWaterfallPanel />,
    },
    {
      id: 'listings',
      step: '3 · Improve',
      title: 'Fix Listings on Evidence',
      body: `Find listing issues with ${AUDIT_RULES.length} mechanical checks. See what was found, why it matters, and what to do next.`,
      previewFirst: false,
      preview: <ListingAuditPanel />,
      note: 'The wording in the findings is the product’s own, read from the rules the audit runs — so this page cannot advertise a check that is not performed.',
    },
  ]

  return (
    <section id="features" className={SECTION} style={{ background: 'var(--page-bg)' }}>
      <div className={WRAP}>
        <div className="mx-auto max-w-[36rem] text-center">
          <Eyebrow>Everything you need to sell smarter</Eyebrow>
          <h2 className="display t-h2 mt-3" style={{ color: 'var(--ink-1)' }}>
            Three questions, answered with your own numbers.
          </h2>
        </div>

        <div className="mt-14 flex flex-col gap-16 md:gap-20">
          {rows.map((row) => (
            <div
              key={row.id}
              id={row.id}
              /*
               * ── THE TRACKS SWAP WITH THE ORDER, NOT JUST THE ORDER ────
               *
               * `order` alone moves the preview into the FIRST track, and the
               * first track is the narrow one — so the Understand row's
               * waterfall came out 400px wide against 724px for the keyword
               * explorer and the audit panel either side of it. Three rows
               * meant to carry equal weight, one of which had a preview
               * nearly half the size. Measured, not noticed.
               *
               * Flipping the template too keeps the text column at 25rem and
               * the preview at 1fr in all three rows, whichever side each one
               * is on.
               */
              className={`grid items-center gap-8 lg:gap-14 ${
                row.previewFirst
                  ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]'
                  : 'lg:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]'
              }`}
            >
              <div className={`order-first ${row.previewFirst ? 'lg:order-last' : ''}`}>
                <span className="mono t-eyebrow block" style={{ color: 'var(--muted-1)' }}>
                  {row.step}
                </span>
                <h3 className="display t-h3 mt-3" style={{ color: 'var(--ink-1)' }}>
                  {row.title}
                </h3>
                <p className="t-body mt-4 max-w-[46ch]" style={{ color: 'var(--ink-2)' }}>
                  {row.body}
                </p>
                {row.note ? (
                  <p className="t-note mt-3 max-w-[46ch]" style={{ color: 'var(--muted-1)' }}>
                    {row.note}
                  </p>
                ) : null}
                <div className="mt-7">
                  <StartFree />
                </div>
              </div>

              {/*
                * `min-w-0`: a grid item's min-width defaults to `auto`, which
                * means "no smaller than your content's min-content width" —
                * and these contain tables. Without it the stacked column took
                * the table's minimum and the page scrolled sideways at 390px.
                */}
              <div className={`min-w-0 ${row.previewFirst ? 'lg:order-first' : ''}`}>
                {row.preview}
              </div>
            </div>
          ))}
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
          <h2 className="display t-h3 mt-3" style={{ color: 'var(--ink-1)' }}>
            What changed, and what nobody can explain.
          </h2>
          <p className="t-body mt-4" style={{ color: 'var(--ink-2)' }}>
            Movements are measured against your own baseline, not against other shops. Where a
            change lines up with something you did, the product says so. Where it does not, it says
            that instead of inventing a reason — which is the half most dashboards leave out.
          </p>
          <ul className="t-note mt-5 flex flex-col gap-2.5" style={{ color: 'var(--ink-2)' }}>
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

          <p className="t-note mt-4" style={{ color: 'var(--muted-1)' }}>
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
          <h2 className="display t-h3 mt-3" style={{ color: 'var(--ink-1)' }}>
            Make bulk changes with confidence.
          </h2>
          <p className="t-body mt-4" style={{ color: 'var(--ink-2)' }}>
            Select the listings, read the diff line by line, then apply. Validation runs before
            anything is sent, and nothing reaches Etsy that you have not confirmed on screen.
          </p>
          <ol className="mt-5 flex flex-wrap gap-2">
            {['1 · Select', '2 · Preview the diff', '3 · Apply'].map((step) => (
              <li
                key={step}
                className="mono border px-3 py-1.5 text-[12.5px]"
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
      className="flex h-[132px] items-center justify-center overflow-hidden border-b px-3"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--canvas-soft)',
        borderTopLeftRadius: 'calc(var(--card-radius) - 1px)',
        borderTopRightRadius: 'calc(var(--card-radius) - 1px)',
      }}
    >
      {children}
    </div>
  )
}

/*
 * The order is the owner's: connect, analyse, optimise, monitor. The
 * analyse and optimise cards were the other way round for one build —
 * their titles were swapped in place without their bodies and artwork
 * moving with them, which is the hazard of renaming entries in an array
 * instead of reordering it.
 */
const HOW_IT_WORKS = [
  {
    title: 'Connect Your Etsy Shop',
    body: 'Securely connect your Etsy shop to access supported listings, transactions, and shop information.',
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
    title: 'Analyze Keywords & Profit',
    body: 'Explore keyword opportunities and understand your earnings after fees and costs.',
    /*
     * The two halves of this card are not the same kind of number, and the
     * card says so. Profit is arithmetic over a connected shop's own
     * receipts; the keyword side has no data source outside the demo —
     * lib/signals/index.ts returns null in live mode — so one is a record
     * and the other is a modelled indicator. A step that presented them as
     * equally solid would be the claim this product does not make.
     */
    note: 'Keyword figures are modelled indicators. Profit is worked out from your own connected-shop records.',
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
        <span className="mt-1 flex items-center gap-1.5">
          <span className="text-[9.5px]" style={{ color: 'var(--ink-2)' }}>
            Demand High · Competition Low
          </span>
          <span
            className="mono px-1 py-0.5 text-[8px] uppercase tracking-[0.06em]"
            style={{ background: 'var(--canvas-soft)', color: 'var(--muted-1)', borderRadius: '3px' }}
          >
            Modelled
          </span>
        </span>
        {/*
          * The profit half, beside the keyword half, with its own marker.
          * The visual carries the distinction the card's note states: one
          * line is an indicator, the other is a record.
          */}
        <span
          className="mt-2 flex items-center justify-between gap-2 border-t pt-2"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-[10px]" style={{ color: 'var(--ink-2)' }}>
            Net profit · 45.9%
          </span>
          <span className="figure text-[11px] font-semibold" style={{ color: 'var(--success)' }}>
            $11,430.50
          </span>
        </span>
        <span className="mono mt-1 block text-[8px] uppercase tracking-[0.06em]" style={{ color: 'var(--muted-1)' }}>
          From connected-shop records
        </span>
      </div>
    ),
  },
  {
    title: 'Optimize & Review Listings',
    body: 'Identify listing issues, review evidence-based recommendations, and preview changes before applying them.',
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
        {/*
          * A before/after pair, because this step is about PREVIEWING a
          * change rather than making one. No rollback or undo is shown or
          * named: the product does have a rollback window and it is a plan
          * entitlement, which is a different promise from "you can see this
          * before it happens", and only the second is what this card claims.
          */}
        <span className="mono mt-2 block text-[9px]" style={{ color: 'var(--muted-1)' }}>
          Before
        </span>
        <span
          className="mono block truncate px-1.5 py-0.5 text-[9.5px]"
          style={{ background: 'var(--canvas-soft)', color: 'var(--danger)', borderRadius: '3px' }}
        >
          handmade mug, gift
        </span>
        <span className="mono mt-1 block text-[9px]" style={{ color: 'var(--muted-1)' }}>
          After
        </span>
        <span
          className="mono block truncate px-1.5 py-0.5 text-[9.5px]"
          style={{ background: 'var(--canvas-soft)', color: 'var(--success)', borderRadius: '3px' }}
        >
          stoneware mug, espresso cup
        </span>
      </div>
    ),
  },
  {
    title: 'Monitor & Improve',
    body: 'Track shop performance, review meaningful changes, and refine your selling decisions.',
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
        <div className="mx-auto max-w-[30rem] text-center">
          <Eyebrow>How It Works</Eyebrow>
          <h2 className="display t-h2 mt-3" style={{ color: 'var(--ink-1)' }}>
            How CobaltRank Works
          </h2>
        </div>
        <p className="t-lead mx-auto mt-4 max-w-[56ch] text-center" style={{ color: 'var(--ink-2)' }}>
          Connect your shop, understand your numbers, improve your listings, and track what
          changes.
        </p>

        {/*
          * `step-grid` draws the connectors between cards on a wide screen —
          * a hairline from each card's right edge to the next, in CSS, with
          * no extra elements in the markup and nothing to read for a screen
          * reader. It is off below `lg`, where the cards stack and a line
          * pointing sideways would be describing a layout that is not there.
          */}
        <ol className="step-grid mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.title}
              /*
               * No `overflow-hidden` here, deliberately. It clipped the
               * connector hairline that `.step-grid > li::after` draws into
               * the gutter — the line was being painted and then cut off at
               * the card's own edge. The illustration rounds its own top
               * corners instead, which is all the clipping was for.
               */
              className="step-card flex flex-col border"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--surface)',
                borderRadius: 'var(--card-radius)',
              }}
            >
              <StepArt>{step.art}</StepArt>
              <div className="flex flex-1 flex-col p-5">
                {/*
                  * Zero-padded and in the brand colour, because the number is
                  * the thing that makes four cards read as a sequence rather
                  * than as a feature grid.
                  */}
                <span
                  className="figure text-[13px] font-semibold tracking-[0.06em]"
                  style={{ color: 'var(--brand)' }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3 className="display mt-1.5 text-[19px] leading-snug md:text-[21px]" style={{ color: 'var(--ink-1)' }}>
                  {step.title}
                </h3>
                <p className="t-note mt-2 flex-1" style={{ color: 'var(--ink-2)' }}>
                  {step.body}
                </p>
                {step.note ? (
                  <p
                    className="mt-3 border-t pt-3 text-[12px] leading-snug"
                    style={{ borderColor: 'var(--border)', color: 'var(--warning-ink)' }}
                  >
                    {step.note}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-11 flex justify-center">
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
        <h2 className="display t-h2 mt-3" style={{ color: 'var(--ink-1)' }}>
          Know your numbers.
          <br />
          <span style={{ color: 'var(--brand)' }}>Grow with confidence.</span>
        </h2>
        <p className="t-lead mx-auto mt-4 max-w-[54ch]" style={{ color: 'var(--ink-2)' }}>
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
        <p className="t-note mt-5" style={{ color: 'var(--ink-2)' }}>
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
