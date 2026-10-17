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
      className="overflow-hidden border"
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

/* ──────────────────────────────────────────────────── C. core benefits */

const BENEFITS = [
  {
    step: '1 · Discover',
    title: 'Find better keywords',
    body: 'Search a term and see modelled demand, how crowded it is, and which related terms are worth a listing. Nothing here is presented as an Etsy measurement, because Etsy publishes none.',
    href: '#keywords',
  },
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
    <section id="features" className={SECTION} style={{ background: 'var(--surface)' }}>
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

        <div className="mt-10 grid gap-4 md:grid-cols-3">
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
                className="mt-3 text-[13px] font-semibold"
                style={{ color: 'var(--brand)' }}
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

/* ─────────────────────────────────────────────── D. keyword research */

const KEYWORD_ROWS = [
  { term: 'stoneware espresso cups', demand: 'High', competition: 'Low–Medium', trend: 'Rising', score: 94 },
  { term: 'ceramic espresso set with saucer', demand: 'Medium', competition: 'Low', trend: 'Rising', score: 91 },
  { term: 'pottery demitasse cups', demand: 'Medium', competition: 'Low', trend: 'Steady', score: 86 },
  { term: 'minimal espresso mug handmade', demand: 'Low–Medium', competition: 'Low', trend: 'Seasonal', score: 74 },
]

export function KeywordResearch() {
  return (
    <section id="keywords" className={SECTION} style={{ background: 'var(--page-bg)' }}>
      <div className={WRAP}>
        <div className="mx-auto max-w-[52ch] text-center">
          <Eyebrow>Etsy keyword research</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            Find keywords worth targeting.
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            Demand bands, competition and seasonality for a term and the terms around it.
          </p>
        </div>

        <div className="mx-auto mt-9 max-w-[940px]">
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

            <table className="w-full border-collapse text-left">
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
    <section id="listings" className={SECTION} style={{ background: 'var(--page-bg)' }}>
      <div className={WRAP}>
        <div className="mx-auto max-w-[52ch] text-center">
          <Eyebrow>Evidence-based listing checks</Eyebrow>
          <h2
            className="display mt-2 text-[27px] leading-[1.15] md:text-[34px]"
            style={{ color: 'var(--ink-1)' }}
          >
            A finding, a reason, and what to do.
          </h2>
          <p className="mt-3 text-[14.5px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
            {AUDIT_RULES.length} mechanical rules run against your own listing fields. No rule
            models Etsy&rsquo;s ranking — nobody outside Etsy can.
          </p>
        </div>

        <div className="mx-auto mt-9 max-w-[860px]">
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
          <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'var(--muted-1)' }}>
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
          <Link
            href="/signup"
            className="inline-flex h-11 items-center px-5 text-[14px] font-semibold"
            style={{
              background: 'var(--brand)',
              color: 'var(--on-brand)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            Start for Free
          </Link>
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
