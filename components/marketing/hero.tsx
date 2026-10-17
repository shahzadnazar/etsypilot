import Link from 'next/link'

/*
 * ██████████████████████████████████████████████████████████████████████████
 *
 *   THE HERO, AND THE SAMPLE SHOP BEHIND IT.
 *
 * ██████████████████████████████████████████████████████████████████████████
 *
 * The headline is the owner's, word for word, in the two tones the design
 * sets: the first sentence charcoal, the second indigo. It is the one piece of
 * copy on this page that may not be edited for rhythm.
 *
 * ── EVERY FIGURE BELOW IS A SAMPLE, AND SAYS SO IN THREE PLACES ──────────
 *
 * The panel is a picture of the product with a fictional shop's numbers in it.
 * This product's whole argument is that a figure without its source is worth
 * nothing, so a marketing screenshot full of invented figures is the one place
 * it could most easily contradict itself.
 *
 *   1. A strip above the panel says the shop is a sample and names it.
 *   2. The panel's own chrome carries the badge the product uses in demo mode.
 *   3. `tests/unit/source-claims.test.ts` sweeps this file for copy that names
 *      a source the product does not have, and `tests/unit/landing-page.test.ts`
 *      fails if the sample label is removed from the panel.
 *
 * The numbers themselves are the demo catalogue's shape — a shop with a real
 * loss on one product and a real gap in its data — rather than a flattering
 * invention. The hole in the ledger is the point of the product.
 */

const METRICS = [
  { label: 'Gross revenue', value: '$24,890.00', note: 'Last 30 days', tone: 'ink' },
  { label: 'Net profit', value: '$11,430.50', note: 'After every fee and cost', tone: 'up' },
  { label: 'Real profit margin', value: '45.9%', note: 'Of what buyers paid', tone: 'ink' },
  { label: 'Listing health', value: '89 / 100', note: '3 listings need attention', tone: 'warn' },
] as const

const KEYWORDS = [
  { term: 'handmade ceramic mug', demand: 'High', competition: 'Medium', opportunity: 78 },
  { term: 'minimalist matcha bowl', demand: 'Medium', competition: 'Low', opportunity: 84 },
  { term: 'speckled stoneware planter', demand: 'Medium', competition: 'Medium', opportunity: 69 },
]

const DEDUCTIONS = [
  { label: 'Etsy fees', amount: '$3,912.00' },
  { label: 'Materials and postage', amount: '$6,874.00' },
  { label: 'Offsite Ads', amount: '$1,195.50' },
]

export function Hero() {
  return (
    <section className="px-4 pt-10 pb-6 md:px-6 md:pt-16">
      <div className="mx-auto flex max-w-[1180px] flex-col items-center text-center">
        <span
          className="mono inline-flex items-center gap-1.5 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
          style={{
            background: 'var(--warning-surface)',
            color: 'var(--warning-ink)',
            border: '1px solid var(--warning-border)',
            borderRadius: '9999px',
          }}
        >
          Etsy keyword, profit &amp; shop intelligence
        </span>

        {/*
          * The one H1 on the site. Two sentences, two colours, one heading —
          * a <br> rather than two elements, so a screen reader announces one
          * heading and not two fragments.
          */}
        <h1
          className="display mt-5 max-w-[20ch] text-[34px] leading-[1.08] md:text-[52px]"
          style={{ color: 'var(--ink-1)' }}
        >
          Find Better Keywords.
          <br />
          <span style={{ color: 'var(--brand)' }}>Know Your Real Profit.</span>
        </h1>

        <p
          className="mt-5 max-w-[58ch] text-[15.5px] leading-relaxed"
          style={{ color: 'var(--ink-2)' }}
        >
          Research Etsy keywords, check listings with evidence, monitor shop performance, and make
          safer bulk updates — all in one place.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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
          <Link
            href="#features"
            className="inline-flex h-11 items-center border px-5 text-[14px] font-semibold"
            style={{
              borderColor: 'var(--border-strong)',
              color: 'var(--ink-1)',
              background: 'var(--surface)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            Explore Features
          </Link>
        </div>

        <p className="mt-4 text-[12.5px]" style={{ color: 'var(--muted-1)' }}>
          Free plan, no card. Connecting a shop is optional and separate.
        </p>
      </div>

      <DashboardPreview />
    </section>
  )
}

/* ────────────────────────────────────────────── the sample shop's screen */

export function DashboardPreview() {
  return (
    <figure className="mx-auto mt-10 max-w-[1100px]">
      <div
        className="overflow-hidden border"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--surface)',
          borderRadius: 'var(--card-radius)',
          boxShadow: '0 1px 3px 0 rgba(15,23,42,.04), 0 1px 2px -1px rgba(15,23,42,.02)',
        }}
      >
        {/* Chrome: the sample label lives here, inside the picture, so a
            screenshot of the screenshot still carries it. */}
        <div
          className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
          style={{ borderColor: 'var(--border)', background: 'var(--canvas-soft)' }}
        >
          <span className="flex gap-1.5" aria-hidden>
            {['#CBD5E1', '#CBD5E1', '#CBD5E1'].map((dot, index) => (
              <span
                key={index}
                className="block h-2.5 w-2.5 rounded-full"
                style={{ background: dot }}
              />
            ))}
          </span>
          <span className="mono text-[11px]" style={{ color: 'var(--muted-1)' }}>
            cobaltrank.app/dashboard
          </span>
          <span
            className="mono ml-auto px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{
              background: 'var(--brand-tint)',
              color: 'var(--brand-strong)',
              borderRadius: '4px',
            }}
          >
            Illustrative sample shop
          </span>
        </div>

        <div className="p-3 md:p-4">
          <div
            className="flex flex-wrap items-center gap-2 border px-3 py-2 text-[12px]"
            style={{
              borderColor: 'var(--warning-border)',
              background: 'var(--warning-surface)',
              color: 'var(--warning-ink)',
              borderRadius: 'var(--paper-radius)',
            }}
          >
            <span aria-hidden>⚑</span>
            <span>2 listings have made a net loss since their last price change.</span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((metric) => (
              <div
                key={metric.label}
                className="border p-3"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--surface)',
                  borderRadius: 'var(--paper-radius)',
                }}
              >
                <span
                  className="mono block text-[10px] uppercase tracking-[0.07em]"
                  style={{ color: 'var(--muted-1)' }}
                >
                  {metric.label}
                </span>
                <span
                  className="figure mt-1 block text-[21px] font-semibold"
                  style={{
                    color:
                      metric.tone === 'up'
                        ? 'var(--success)'
                        : metric.tone === 'warn'
                          ? 'var(--warning-ink)'
                          : 'var(--ink-1)',
                  }}
                >
                  {metric.value}
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: 'var(--muted-1)' }}>
                  {metric.note}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_1fr]">
            <div
              className="border"
              style={{ borderColor: 'var(--border)', borderRadius: 'var(--paper-radius)' }}
            >
              <div
                className="border-b px-3 py-2 text-[12px] font-semibold"
                style={{ borderColor: 'var(--border)', color: 'var(--ink-1)' }}
              >
                Keyword opportunities
              </div>
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  Three sample keywords with their modelled demand, competition and opportunity
                  score.
                </caption>
                <thead>
                  <tr>
                    {['Search term', 'Demand', 'Competition', 'Opportunity'].map((head) => (
                      <th
                        key={head}
                        scope="col"
                        className="mono px-3 py-1.5 text-[10px] uppercase tracking-[0.06em]"
                        style={{ color: 'var(--muted-1)', background: 'var(--canvas-soft)' }}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KEYWORDS.map((row) => (
                    <tr key={row.term} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2 text-[12.5px]" style={{ color: 'var(--ink-1)' }}>
                        {row.term}
                      </td>
                      <td className="px-3 py-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                        {row.demand}
                      </td>
                      <td className="px-3 py-2 text-[12px]" style={{ color: 'var(--ink-2)' }}>
                        {row.competition}
                      </td>
                      <td
                        className="figure px-3 py-2 text-right text-[12.5px] font-semibold"
                        style={{ color: 'var(--brand)' }}
                      >
                        {row.opportunity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div
              className="border p-3"
              style={{ borderColor: 'var(--border)', borderRadius: 'var(--paper-radius)' }}
            >
              <span className="block text-[12px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                Where the money went
              </span>
              <div className="mt-2.5 flex flex-col gap-2">
                {DEDUCTIONS.map((line) => (
                  <div key={line.label} className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px]" style={{ color: 'var(--ink-2)' }}>
                      {line.label}
                    </span>
                    <span className="figure text-[12.5px]" style={{ color: 'var(--danger)' }}>
                      −{line.amount}
                    </span>
                  </div>
                ))}
                <div
                  className="mt-1 flex items-baseline justify-between gap-3 border-t pt-2"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <span className="text-[12.5px] font-semibold" style={{ color: 'var(--ink-1)' }}>
                    Kept
                  </span>
                  <span
                    className="figure text-[14px] font-semibold"
                    style={{ color: 'var(--success)' }}
                  >
                    $11,430.50
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <figcaption className="mt-2.5 text-center text-[12px]" style={{ color: 'var(--muted-1)' }}>
        A sample shop, not a real one. Connect your own and every figure here is replaced by yours —
        each one labelled with where it came from.
      </figcaption>
    </figure>
  )
}
