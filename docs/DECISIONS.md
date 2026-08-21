# EtsyPilot — Locked Decisions

Decisions confirmed by the product owner. These are binding; do not re-derive or
re-litigate them. Open items are tracked at the bottom.

---

## D1 — Brand identity: Warm Editorial (variant 9) — CONFIRMED

Ship the token set exactly as it appears in the screens. **No substitutions, no
re-derivation.**

### Light
| Token | Value |
|---|---|
| `--brand` | `#B4472A` |
| `--brand-strong` | `#8C371F` |
| `--brand-tint` | `#FBEEE7` |
| `--ink-1` | `#241B12` |
| `--ink-2` | `#4A4234` |
| `--muted-1` | `#6B6152` |
| `--muted-2` | `#8C7F6C` |
| `--border` | `#E9E2D6` |
| `--surface` | `#FFFFFF` |
| `--canvas-soft` | `#FBF8F3` |
| `--page-bg` | `#FBF8F3` |
| `--success` | `#15803D` |
| `--warning` | `#B45309` |
| `--danger` | `#B91C1C` |
| `--accent-ai` | `#7C3AED` |
| `--accent-calc` | `#0891B2` |

### Dark
| Token | Value |
|---|---|
| `--brand` | `#E07A4A` |
| `--brand-strong` | `#F3B08C` |
| `--brand-tint` | `rgba(224,122,74,.16)` |
| `--ink-1` | `#F1F5F9` |
| `--ink-2` | `#CBD5E1` |
| `--muted-1` | `#94A3B8` |
| `--muted-2` | `#64748B` |
| `--border` | `#2B3444` |
| `--surface` | `#1E293B` |
| `--canvas-soft` | `#1E293B` |
| `--page-bg` | `#0F172A` |
| `--success` | `#34D399` |
| `--warning` | `#FBBF24` |
| `--danger` | `#F87171` |
| `--accent-ai` | `#C4B5FD` |
| `--accent-calc` | `#67E8F9` |

### Theming mechanics
- CSS custom properties set on `documentElement`.
- Three-way **Light / Dark / System** toggle, exactly as designed.
- Choice persisted in `localStorage`.
- System mode follows `prefers-color-scheme` and reacts to changes live.
- **Both themes are first-class.** Every colour goes through a token so both resolve.

### Explicitly superseded
- Blue `#2563EB` in the Foundations swatch captions — stale caption text under
  terracotta chips. Ignore.
- Teal `#167C80` in `design.md` §3 — superseded. Ignore.
- **Bug to fix:** one hard-coded `#2563EB` border remains on the "Your plan" card
  in the billing screen. Replace with `var(--brand)`.

### Badge pill fills — literal, NOT tokenised
These stay as literal hex so they hold in both themes:

| Badge | Background | Border | Text |
|---|---|---|---|
| Verified | `#F0FDF4` | `#BBF7D0` | `#166534` |
| Calculated | `#ECFEFF` | `#A5F3FC` | `#0E7490` |
| Estimated | `#FFFBEB` | `#FDE68A` | `#B45309` |

---

## D2 — Terracotta vs Etsy orange — SIGNED OFF

`#B4472A` is a desaturated brick — a different hue family from Etsy's `#F1641E`
and far from it in chroma. The brief forbids *Etsy's orange* as the brand colour,
not warm colours generally.

**Per-surface watch item (not a token rule):** wherever an Etsy connection badge
or logo sits beside a terracotta primary button, make sure the two do not read as
one brand at a glance. Affected surfaces:
- OAuth / Connect Etsy shop (artboards 10–11)
- Settings → Shop connections (artboard 72)
- Browser extension popup

---

## D3 — Product name: "EtsyPilot", one word — CONFIRMED

**"EtsyPilot"** everywhere: logo, wordmark, UI copy, page titles, metadata,
navigation, buttons, marketing copy, documentation, and error strings.

The **EP monogram lockup stays exactly as designed.**

No two-word "Etsy Pilot" variant anywhere. The legacy name "RankKW" appears
nowhere in the product.

---

## D4 — Shop Pulse — DESIGNED (artboard 91)

Source: `docs/source/screens/EtsyPilot Shop Pulse & Profit Reality.dc.html`

Closes audit gaps **M1, M2, M3** and conflict **C4**.

### Screen structure
- **Header:** "Jul 14 – Aug 12 measured against this shop's own 90-day baseline ·
  USD · 5 changes detected". Actions: `Export evidence`, `Review 7 affected listings`.
- **Tabs:** Pulse · Events · Verified recoveries · Digest settings
- **KPI row (4):** Orders (Verified, vs baseline) · Revenue (Verified, vs baseline)
  · Changes detected (Calculated: "3 correlated · 1 ruled out · 1 unknown") ·
  Baseline coverage (Calculated, 88%, "11 listings too new to baseline")
- **Baseline chart:** daily orders — solid line = verified from receipts, band =
  expected range from the shop's own 90-day history, event markers on the axis.
  Legend: Actual / Expected / Baseline range.
- **Disclaimer under the chart:** "The baseline is built only from this shop's own
  order history. EtsyPilot has no access to Etsy's ranking algorithm and does not
  model it — markers show what changed and when, not why Etsy ranked anything."
- **Detected changes table:** ordered by measured impact. Columns: Change (with
  date, **event type**, delta) · Scope · Orders after · Diagnosis. Row selection
  opens the evidence panel.
- **Evidence panel:** What was observed (timestamped events) · Also tested (each
  alternative with its own verdict) · Confidence · Coverage · Limitations ·
  actions (`Review these N listings`, `Open in Bulk Editor`, `See profit impact`)
  · footer "Correlation only. EtsyPilot cannot see Etsy's ranking algorithm."

### Event types confirmed in use
`PRICE_CHANGED` · `TAGS_CHANGED` · `STOCKOUT` · `LISTING_DEACTIVATED`
(plus the "no event in your history" case → UNKNOWN)

### Diagnosis badge family (new component — extends Foundations 03)

Provenance answers *where a number came from*. Diagnosis answers *whether an event
explains a change*. They must never be confused — so diagnosis badges are
**6px-radius rectangles with a leading 3px rule**, never 999px pills.

| Variant | Background | Border | Left rule | Icon | Text |
|---|---|---|---|---|---|
| `CORRELATED` | `var(--brand-tint)` | `1px solid var(--brand)` | `3px var(--brand)` | link / chain | `var(--brand-strong)` |
| `RULED OUT` | `var(--canvas-soft)` | `1px solid #CBD5E1` | `3px var(--muted-1)` | circle-slash | `var(--muted-1)` |
| `UNKNOWN` | `transparent` | **`1px dashed var(--muted-2)`** | `3px solid var(--muted-2)` | help-circle | `var(--muted-1)` |

Type: `600 10.5px/1 Inter`, `letter-spacing: .07em`, uppercase.
Padding: `5px 10px 5px 8px`, `gap: 7px`, icon `13px`.

**Rules:**
- Each badge carries an icon **and** a word — never colour alone.
- Every diagnosis carries a comparison window, the events tested, and a confidence level.
- **A diagnosis is never shown without the evidence panel that produced it.**
  The badge is an entry point, not a verdict.
- `RULED OUT` stays visible rather than hidden — knowing what did *not* cause a
  drop is half the diagnosis.
- `UNKNOWN` is the honest default. Etsy's ranking behaviour is never offered as
  an explanation.

---

## D5 — Profit Reality — DESIGNED (artboard 92)

Closes audit gaps **M4, M5** and conflict **C5**.

**Profit Reality replaces the old "Profit & fees" waterfall** — it does not sit
beside it. One surface, four tabs: **Waterfall · Scenarios · Costs · Transactions**.

- Discounts and Refunds move into the **Transactions** tab, since the PRD's cost
  line does not include them.
- The PRD's Profit group (Profit Reality / Scenarios / Costs) resolves to **one
  screen with tabbed views**.

### Full eight-cost waterfall
| Line | Value | Provenance |
|---|---:|---|
| Gross revenue | `$18,421` | Verified |
| Etsy fees | `−$2,984` | Verified |
| Payment processing | `−$622` | Verified |
| Offsite Ads | `−$412` | Verified |
| Shipping | `−$1,147` | Seller input |
| COGS | `−$6,996` | Seller input |
| Labour | `−$1,020` | Seller input |
| Other costs | `−$302` | Seller input |
| **Net profit** | **`$4,937.15`** | **Calculated** |

### KPI row (5)
Gross revenue (Verified) · Total costs (Calculated) · Net profit (Calculated) ·
Net margin (Calculated, 26.8%) · Cost coverage (Calculated, 62%)
Total costs (Calculated, −$13,483.50)

**Net profit is COMPUTED from the eight cost lines. Never stored, never stated as
a literal.** The canvas originally read $4,938.20, arrived at independently of
the lines; the lines were right and the total was the bug. Corrected in the
design source and here: total costs −$13,483.50, net $4,937.15, margin 26.8%.

### Coverage warning (always present when coverage < 100%)
> "Costs are confirmed for 62% of order value. 38 listings have no product cost
> and no labour rate is set. The figures below exclude those orders rather than
> assuming a cost — **they are a floor, not an estimate of your whole shop**."

### Scenarios
| Scenario | Basis | Net | Margin |
|---|---|---:|---:|
| Conservative | Costs high, sales flat | `$3,842.10` | 20.9% |
| **Base** | Your confirmed inputs | `$4,938.20` | 26.8% |
| Optimistic | Costs low, sales up 8% | `$5,610.40` | 30.5% |

**Editable inputs** (drive the scenarios): Sales · Average price · Etsy fees ·
Ads · COGS · Shipping · Labour rate · Other costs.
**Verified lines are read from receipts and cannot be edited here.**

**Missing data panel:** 38 listings without a product cost · No labour minutes
recorded per product · Etsy does not expose ad spend per listing.

Footer: "Scenarios are planning tools, not a forecast of your shop."

### Continuity
Sample data is continuous with all other screens (Willow & Fern, 438 orders,
$18,420.65 gross). Net profit is `$4,938.20` rather than the old `$5,138.20`
**because labour, payment processing and other costs are now counted.**

---

## D6 — Navigation IA: PRD §9 — CONFIRMED

The Shop Pulse / Profit Reality file states this explicitly:

> "The sidebar in both screens uses the PRD §9 information architecture —
> Dashboard / Research / Listings / Profit / Tools / Data — as a concrete answer
> to the three-nav-tree question."

### Sidebar as drawn
```
Dashboard        Overview · Action Center (2) · Shop Pulse (5)
Research         Keywords · Opportunities · Niche Research
Listings         All Listings · Listing Audit · AI Copilot · Bulk Editor
Profit           Profit Reality · Scenarios · Costs
Tools            Simple Calculator · Fee, Ads ROI, Profit…
Data             Methodology · Data Sources
Billing
Settings
```

**Open item — see O3.** This IA has no home for several fully-designed surfaces
(Shop Analytics, Sales Map, Experiments, Orders, Change History).

---

## D7 — Component reuse — CONFIRMED

Both new screens "reuse the existing shell, KPI card, table, tabs, input,
coverage-warning and provenance-badge components **without modification**."

**The diagnosis badge is the only new visual vocabulary in the entire product.**
Any further new component requires justification.

---

## D8 — Answers to open questions

| Q | Decision |
|---|---|
| **Q1 — Domain** | Use a demo domain. Public tool URL renders as `etsypilot.demo/tools/etsy-seller-calculator`; app URL comes from `NEXT_PUBLIC_APP_URL` (localhost in dev). Swappable in one env var. |
| **Q2 — Dark neutrals** | ⚠️ **Conflicts with D1 — see O1.** |
| **Q3 — Postgres host** | Deferred. Build against `DATABASE_URL` with a placeholder; host chosen later. Drizzle schema and repositories are host-agnostic. |
| **Q4 — Supabase Auth** | Deferred. Build behind the `lib/auth` abstraction with a mock session provider so demo mode works with no credentials. Wiring Supabase later touches only `lib/auth`. |
| **Q5 — Demo shop identity** | Keep **Willow & Fern Studio / Salman R.** — the new file continues the same sample data, so it is now canonical. |
| **Q6 — Shop Pulse vs Experiments** | **Two distinct features sharing the Event store.** Shop Pulse detects *unplanned* deviations against a baseline and diagnoses them. Experiments measure *planned* changes against a hypothesis. The new design confirms this: Shop Pulse has its own "Verified recoveries" tab, and the evidence panel links out to Bulk Editor and Profit — not to Experiments. |
| **Q7 — AI quotas** | **Free 5/month · Solo 60 · Growth 500 · Agency 2,000.** Solo and Growth are fixed by the billing screen. Free at 5 is enough to feel the value on a listing or two without substituting for a paid plan. Agency at 2,000 is 4× Growth, matching its 10-shop / 5-seat allowance. |
| **Q8 — Weekly digest** | **Both**, and they share one artefact. One digest record is generated per shop per week, rendered in-app under Shop Pulse → Digest settings, and sent by email via Resend. Email defaults **on** (the digest's job is re-engagement, which needs a push), in-app is always available. Both independently toggleable — the Settings notification matrix already has In app / Email columns for "Weekly summary". |

---

## Open items

### O1 — ⚠️ Dark-mode neutrals: D1 and Q2 contradict each other

- **D1** says ship the dark tokens *exactly* as listed — those are cool slate
  (`--page-bg #0F172A`, `--surface #1E293B`, `--ink-2 #CBD5E1`, `--border #2B3444`,
  `--muted-1 #94A3B8`, `--muted-2 #64748B`).
- **Q2** says warm the dark neutrals for coherence with the warm light theme.

These cannot both be done.

**Interim position:** ship D1's exact values, because D1 is the specific, emphatic
instruction ("no substitutions, no re-derivation") and matches the screens. All
tokens live in one CSS block, so switching later is a seven-line change with no
component churn.

**If warming is wanted, the proposed values are:**

| Token | Cool (D1, shipping) | Warmed (proposed) |
|---|---|---|
| `--page-bg` | `#0F172A` | `#1A1410` |
| `--surface` / `--canvas-soft` | `#1E293B` | `#241C16` |
| `--border` | `#2B3444` | `#3A2E24` |
| `--ink-1` | `#F1F5F9` | `#F7F3ED` |
| `--ink-2` | `#CBD5E1` | `#DCD3C6` |
| `--muted-1` | `#94A3B8` | `#A89B89` |
| `--muted-2` | `#64748B` | `#7A6E5E` |

Brand, semantic and accent tokens are unchanged either way.

### O2 — C7: Is agency / team / multi-shop / automations in MVP?

Still unanswered. **This is the only remaining blocker for the database schema.**

- PRD §4 (MVP) does not mention them.
- The design brief and screens design them fully: 4-role capability matrix,
  pending invitations, client workspaces, approval queues, automation rule builder.
- Affects: `Membership` table, approval state on `BulkOperation`, the nav, the
  plan structure, and roughly a dozen routes.

Schema can be built so these are **additive** (a single-owner `Membership` row is
needed regardless), but the answer determines whether the surfaces get built in
Phase 1–8 or are deferred.

### O3 — C6 follow-up: where do the orphaned designed surfaces live?

PRD §9 IA (now confirmed) has no group for these fully-designed screens:
Shop Analytics (51) · Sales Map (57–58) · Experiments (59–60) · Orders ·
Change History (44–45) · Team & Roles (74) · Automations.

**Proposal — one minimal group added between Listings and Profit:**
```
Analytics        Shop Analytics · Sales Map · Experiments · Orders
```
and **Change History** moves under **Listings** (it is the bulk-edit audit trail,
and the Bulk Editor links straight into it).

Team and Automations remain parked pending **O2**.

### O4 — C8: Pricing and plan limits disagree

| | Design brief §9.24 | Billing screen (76–77) |
|---|---|---|
| Solo price | $12/mo | **$15/mo** |
| Free listing cap | 50 | not stated |
| Solo listing cap | 500 | **200** |
| Growth listing cap | — | **500** |

Free `$0`, Growth `$29`, Agency `$79` agree in both.

---

# Round 2 — artboards 93–108

Sources (all archived under `docs/source/screens/`):
`EtsyPilot Data & Methodology.dc.html` · `EtsyPilot Niche Research, Demo Mode & Digest.dc.html` ·
`EtsyPilot PRD Gap Fixes.dc.html` · `EtsyPilot Tools.dc.html`

All four carry the identical D1 token block. Verified.

**Closes:** M6, M8, M9, M10, M11 (Niche Research), M12, M16, M17 (free tool hub), and O4.

---

## D9 — Data group: Methodology (93) & Data Sources (94)

Closes **M16**. Both pages are **public** — readable before connecting a shop.
Framing: *"Provenance badges promise an explanation. These are the pages that keep it."*

### 93 · Methodology (1440 × 1120)
Tabs: **Methodology · Data sources · Change log**. Header carries `Last reviewed <date>`
and a `Download as PDF` action. Left rail is an on-page anchor nav ("On this page"):
The five classes · Keyword demand · Competition · Opportunity score · Competitor sales ·
Net profit · Shop Pulse baseline · Listing health score · What we never do.

**The five classes** — one-line definitions, now canonical:
| Class | Definition |
|---|---|
| Verified | Etsy returned it for your own shop. Exact. |
| Calculated | A visible formula over visible inputs. Reproducible. |
| Estimated | Modelled from observable signals. **Always a range.** |
| Seller input | You or a teammate entered it. **We never guess it.** |
| Unavailable | Etsy does not expose it. **We show nothing, not a guess.** |

**Per-metric card shape** — every entry uses the same five rows plus a limitations
callout: `Source` · `Method` · `Freshness` · `Confidence` · `Coverage`, then a
tinted **Limitations** box (amber `#FFFBEB`/`#FDE68A`/`#92400E` for Estimated,
neutral canvas-soft for Calculated).

Net profit card states the formula literally:
`Gross revenue − Etsy fees − payment processing − Offsite Ads − shipping − COGS − labour − other costs = net profit`
with an **Exclusions** note: orders with no confirmed cost are excluded rather than
assigned an assumed cost, *"so net profit is a floor."*

**"What we never do"** — five commitments, each with a danger-coloured ✕:
1. Model or claim knowledge of Etsy's ranking algorithm.
2. Publish an exact competitor revenue or sales figure.
3. Fill a missing number with an assumption to make a chart look complete.
4. Scrape Etsy pages, automate Etsy Messages, or hold your Etsy password.
5. Build a profile of an individual buyer, or show a region with too few orders.

### 94 · Data sources (1440 × 1020)
A seven-row table: `Source · What it provides · Class · Refresh · Limitations`.

| Source | Class | Refresh |
|---|---|---|
| Etsy Open API v3 (OAuth 2.0) | Verified | Every 15 min |
| Your cost setup | Seller input | On save |
| Public marketplace signals | Estimated | Weekly |
| Etsy Stats import (CSV) | Seller input | On upload |
| EtsyPilot event log (immutable) | Verified | Immediate |
| Language model (drafting only) | AI draft | On request |
| Demo dataset (Willow & Fern, synthetic) | **Demo** | Static |

Language-model row is decisive: *"Produces language, never data — no figure
originates here."*

Plus **"What Etsy does not release, and what to do instead"** (views → import Stats
CSV; buyer search terms → not available anywhere; Ads performance → enter spend
manually; competitor real sales → estimated ranges only) and a **Your data** card
(Export / Delete data).

---

## D10 — Badge fills, completed set

D1 fixed three. The Data Sources table and Action Center card supply the rest.
All literal hex, **not tokenised**, so they hold in both themes.

| Badge | Background | Border | Text |
|---|---|---|---|
| Verified | `#F0FDF4` | `#BBF7D0` | `#166534` |
| Calculated | `#ECFEFF` | `#A5F3FC` | `#0E7490` |
| Estimated | `#FFFBEB` | `#FDE68A` | `#B45309` |
| **AI draft** | `#F5F3FF` | `#DDD6FE` | `#6D28D9` |
| **Seller input** | `var(--canvas-soft)` | `#CBD5E1` | `var(--ink-2)` |
| **Unavailable** | `var(--canvas-soft)` | `var(--border)` | `var(--muted-1)` |
| **Demo** | `var(--canvas-soft)` | **`1px dashed var(--muted-2)`** | `var(--muted-1)` |
| Critical (severity) | `#FEF2F2` | `#FECACA` | `var(--danger)` |
| Attention (severity) | `#FFFBEB` | `#FDE68A` | `var(--warning-strong)` |
| Completed / Paid | `#F0FDF4` | `#BBF7D0` | `#166534` |
| Card declined | `#FEF2F2` | `#FECACA` | `var(--danger)` |

---

## D11 — Demo mode is a designed surface, not a hidden flag (103)

PRD §4.8. Demo mode is **the default development path**, so it gets a real look.

### 103a — Demo entry card (520px)
`DEMO MODE` chip (dashed border, uppercase, `.07em`), heading *"Explore a complete
shop first"*, and an honest capability list — three ✓ (run a bulk edit and roll it
back; see Shop Pulse diagnose a drop; reconcile profit with incomplete coverage)
and **one ✕: "Publish anything to Etsy — demo mode cannot write."**
Actions: `Explore the demo shop` / `Connect my Etsy shop instead`.
Footer: *"Demo data is synthetic. It is not benchmark data and not another seller's shop."*

### 103b — Persistent banner
A dark bar (`var(--ink-1)` background) above the top bar on **every** screen:
`DEMO MODE` chip + *"You are exploring Willow & Fern, a fictional shop. Nothing here
is connected to Etsy."* + `Connect my shop` + `Exit demo`.
Shop chip becomes **dashed** with `Willow & Fern · demo` and `Static data · no sync`.

**The load-bearing rule:**
> The dashed border and the Demo chip **replace the provenance badge everywhere in
> demo mode**, so a screenshot taken here can never be mistaken for a real shop's figures.

So `ProvenanceBadge` must render its Demo variant whenever demo mode is active,
regardless of the underlying provenance type. This is a global override, not a
per-component choice.

### 103c — Leaving demo mode (dialog, with overlay shadow)
*"Your demo work is not carried over."* Saved keyword lists, cost rules and scenarios
belong to the fictional shop and are discarded on connect.
Actions: `Export demo work` · `Stay in demo` · `Connect Etsy shop`.

---

## D12 — Weekly Shop Pulse digest (104)

Closes **M6**. Confirms **Q8 = both**, and adds the rule I did not have.

### 104 — Email, 640px
Subject-line equivalent as the H1: *"Orders were 14.5% below your baseline this week"*,
then *"Three changes correlate with the drop and one is still unexplained.
**Nothing has been changed in your shop.**"*

Three metric tiles (Orders ▼14.5% · Revenue ▼9.2% · Net profit 62% coverage), then
**What changed** — the same diagnosis badges as artboard 91, including the dashed
UNKNOWN card: *"No event in your history explains this. We are not guessing at a cause."*
Single CTA `Open Shop Pulse`.

Footer states why it arrived and how to stop: *"Sent weekly on Thursdays because you
have Shop Pulse alerts on. Change frequency or turn this off in notification settings
— one click, no confirmation needed."*

### 104b — Digest settings
Toggle + email address · Day segmented control (Mon / **Thu** / Sun) · Include
checkboxes (Shop Pulse changes and diagnoses ✓ · Profit and coverage summary ✓ ·
Open Action Center items ☐ · Seasonal windows opening soon ☐).

**Suppression rule (new, and important):**
> "If nothing crossed your baseline that week, we do not send an email. A digest with
> nothing in it trains you to ignore the next one."

The digest job must therefore check for material change **before** sending, and
no-op silently when there is none.

---

## D13 — Niche Research (102)

Closes the Niche Research part of **M11**. Completes PRD §9's Research group.

Query bar (`linen table linens` + locale + `Analyse`). Five KPI tiles:
Demand `8k–13k` (Est.) · Listings `41,000 ±8% sampling error` (Est.) ·
Crowding `High · 3.6 listings per search` (Calc.) · Price band `$28–$46, middle 50%`
(Est.) · Concentration `31% top 10 shops' share` (Calc.).

Twelve-month demand shape: amber band = estimate range, **dashed where sampling was
thin**. Sub-niches table ranked by demand against crowding, with a
`Too few samples` / `—` / `Unknown` row proving the empty case.

**"What would have to be true"** — the differentiating panel, and the tone to copy:
> "EtsyPilot will not tell you to enter a niche. These are the conditions the numbers imply."

Four numbered conditions with concrete thresholds (sell above $34; cost under $14 for
40% margin; list by early October; differentiate on something other than "linen").
Actions: `Research these keywords` / `Check margin in Fee calculator`.

Page-level amber notice: **every figure on this page is estimated.**

---

## D14 — Tools group, all six calculators + public hub (95–101)

Closes **M9** and **M12**.

Sidebar Tools group is confirmed: Simple Calculator · Fee Calculator · Ads ROI
Calculator · Profit Calculator · Category Finder · Seasonal Calendar · Keyword Lists ·
Trademark Screening. Sidebar carries a **"No shop needed — every tool works before you
connect Etsy"** note.

Global rule for the group:
> Deterministic · no shop connection · prints its formula under the result · never
> writes to a listing · where a tool depends on a rule Etsy can change, **the effective
> date is shown beside the number**.

### 95 · Fee calculator
Inputs: item price, quantity, shipping charged, item cost, shipping cost, Offsite Ads
fee %, target margin, country/currency.
**Rules applied** line: `Listing $0.20 · transaction 6.5% · processing 3% + $0.25 · effective Jul 1, 2026`.
Outputs: profit per sale with the formula spelled out, margin, break-even price, price
for target margin, a stacked fee/cost/profit bar, an itemised fee breakdown, and an
**"If you change the price"** three-row sensitivity table.
Disclaimer names the real sources of variance: currency conversion, regulatory
operating fees, Offsite Ads eligibility, local taxes.

### 96 · Ads ROI calculator
Seller-input badged. Spend scenario segmented control (×0.5 / ×1.0 / ×2.0 / ×3.0).
Outputs each with its formula: ROAS, conversion, cost per order, profit after ads,
break-even ROAS, max affordable CPA.
Footer: *"Etsy does not expose Ads performance through the public API… EtsyPilot does
not read your Etsy Ads account."*

### 97 · Profit calculator
*"One product, one month. For your whole shop use Profit Reality."* — the separation
of concerns is enforced in the copy, and `Use in Profit Reality` is the hand-off.

### 98 · Category finder
Ranked category matches with listing counts, median price bands, confidence, and
**required vs optional attributes** per match. Notes Etsy's taxonomy was
`last read Aug 9, 2026` and can change without notice.

### 99 · Seasonal calendar
12-month grid with prepare-window / live-by / peak dates per opportunity, each badged
Estimated or Low confidence, each stating the evidence
(*"a 2.4× order lift in this window last year. Confidence moderate — based on one year
of your own history"*). Actions: Research keywords · Prepare listings · Add task · Save.

### 100 · Trademark screening
Screens a phrase against USPTO / EUIPO / UKIPO, indexed with a date.
EXACT MATCH and PARTIAL MATCH result cards with register, status, class, filing date.
Two guardrails in the copy:
> "A registration does not always prevent descriptive use, and an absence of results is not permission."
> "Class 25 covers clothing, not home textiles. Your product may sit outside it — **that judgement is not one EtsyPilot can make for you.**"

Prominent **"This is not legal advice"** panel: not exhaustive, does not cover
unregistered or common-law marks, consult an attorney.

### 101 · Free tool hub — public, logged out
*"Free Etsy seller tools — no account, no shop connection, no email."*
Six cards (Fee, Profit, Ads ROI, Simple, Category finder, Trademark screening).
Conversion line is quiet and honest: *"These use numbers you type in — connect your
shop and the same calculations run on your real orders and fees."*
Carries the Etsy trademark disclaimer.

---

## D15 — Simple calculator, all eight modes (105)

Closes the remaining PRD §11 gap. Modes as pills:
Percentage · Discount · Profit · **Margin** · Markup · Fee · Net revenue · Break-even.

Worked formulas, now canonical:
| Mode | Example |
|---|---|
| Percentage | `20% of $29.00 = $5.80` |
| Discount | `$29 × (1 − 20%) = $23.20` |
| Profit | `$34.00 − $11.50 = $22.50` |
| Margin | `($34.00 − $11.50) ÷ $34.00 = 66.2%` |
| Markup | `($34.00 − $11.50) ÷ $11.50 = 195.7%` |
| Fee | `6.5% of $40.00 = $2.60` |
| Net revenue | `$40.00 − $4.25 = $35.75` |
| Break-even | `$180 fixed ÷ ($34.00 − $11.50) = 8 units` |

A margin/markup disambiguation hint sits under the result:
*"Margin divides by price. Markup divides by cost — the same two numbers give 195.7% there."*

**Validation rule:**
> "Zero price in a margin calculation, negative cost, a percentage over 100 in a
> discount — each returns a specific message and no result. **Never a silent NaN,
> never a guessed correction.**"

---

## D16 — Extension, three missing states (106)

Closes the PRD §10 state gaps. All three are 340px popups with overlay shadow.

- **106a Logged out** — *"Sign in to see this listing's health."* Sign in / Create a
  free account. Shield footer: *"The extension never sees your Etsy password and never
  signs in to Etsy on your behalf."*
- **106b No shop connected** — listing detected, **public data only**. Shows title
  length and tags used; "Your margin" renders a `Needs a shop` chip instead of a number.
  Connect Etsy shop / Explore the demo shop.
- **106c Non-Etsy page** — *"No Etsy listing on this page… The extension only reads
  pages you visit on etsy.com — it does nothing on any other site."* Offers four
  jump-in shortcuts (Shop Pulse, Keywords, Action Center, Calculators).
  Footer: *"Permissions are limited to etsy.com. The extension holds no credentials and
  cannot change a listing."*

---

## D17 — Billing: history, trial and refund terms (107) — resolves O4

Closes **M10** and the PRD §4.10 gap.

### Pricing — SETTLED
**Solo is $15/month.** The billing history shows `Solo · monthly · $15.00` charges and
a `Refund · Solo, unused period · −$15.00`. The design brief's $12 is superseded.
Free `$0` · Solo `$15` · Growth `$29` · Agency `$79`.

### Trial terms
- **14 days of Growth, no card required.**
- **Nothing charges automatically at the end** — the account moves to Free and data stays.
- One trial per account, **not per shop**.
- Bulk jobs pause if you drop below the plan they need.

Trial banner (cyan `#ECFEFF`/`#A5F3FC`) states days left and end date, and explicitly:
*"No card on file. Nothing is charged when the trial ends."*

### Refunds and cancellation
- Cancel in one click from this page — *"no email, no retention call, no confirmation maze."*
- Access continues to the end of the paid period.
- **Full refund available from the page within 14 days of a charge.** After that,
  cancelling stops the next renewal; the current period is not refunded.
- Downgrading keeps data; exceeding a limit **pauses new bulk jobs and automation
  rather than deleting anything**.

### Billing history table
`Date · Description · Amount · Status · Receipt`, with `Download all`.
Status variants that must exist: **Paid**, **Refunded** (negative amount, success
colour), **Card declined** (danger, no receipt).

---

## D18 — Action Center card: full PRD §4.1 field set, four states (108)

Closes **M8**.

Filter chips: `Open · 2` / `Done · 1` / `Dismissed · 1`.

**Every field the PRD asks for is on the card:** priority (numbered rank chip),
severity, title, explanation, evidence line, destination (primary CTA), status,
created timestamp, completed timestamp, dismissed timestamp + reason.

| State | Treatment |
|---|---|
| **Open** | `border-left: 3px var(--danger)` for Critical / `var(--warning)` for Attention. Numbered rank chip. Primary CTA + `Snooze` / `Dismiss`. |
| **In progress** | Adds a brand-tinted `In progress · 12 of 38` chip and a `Last worked <date> by <user>` line. CTA becomes `Continue …`. |
| **Completed** | `border-left: 3px var(--success)`, canvas-soft background, check icon replaces the rank chip, `Completed <date> by <user>` + operation ID. Actions become `View the change` / `Roll back`. |
| **Dismissed** | Dashed border, `opacity: .72`, ✕ icon, `Dismissed <date> by <user>` + **`Reason · not this year`**, single `Restore` action. |

Evidence lines are concrete and sourced, e.g.
*"38 orders in the last 30 days across 4 listings · combined loss $184.20 · from your
receipts and cost setup."*

Closing rule for the whole surface:
> "No dead-end alerts. Every card names its evidence and goes somewhere — dismissed
> items keep their reason and can be restored, **so the list is a record rather than a
> queue that empties into nothing.**"

Note: the completed card claims measured outcome carefully — *"Orders on those listings
are up 4% since — **measured, not claimed**."*

---

## Open items after round 2

- **O1** — dark neutrals: D1 (cool slate, shipping) vs Q2 (warm). Still needs one word.
- **O2** — agency / team / multi-shop / automations in MVP? Still the only schema blocker.
- **O3** — still no home in PRD §9 IA for: Shop Analytics (51), Sales Map (57–58),
  Experiments (59–60), Orders, Change History (44–45).
  Standing proposal: add an **Analytics** group (Shop Analytics · Sales Map ·
  Experiments · Orders); move **Change History** under Listings.
- ~~**O4** — pricing~~ → **RESOLVED by D17.** Solo is $15.

---

# Round 3 — O1, O2, O3 resolved

## D19 — Dark theme stays cool — RESOLVED (O1)

**Ship D1's exact dark values. Do not warm them.**

`--page-bg #0F172A` · `--surface #1E293B` · `--ink-2 #CBD5E1` · `--brand #E07A4A`

Rationale, recorded so it is not re-litigated: the terracotta decision was about the
**light theme**, which is the default and where the warm cream ground does the work.
The dark theme is **a cool slate carrying a warm accent, deliberately** — and it is
what all nineteen screens render today.

### REJECTED ALTERNATIVE — warmed dark neutrals
Considered and declined. Kept here only so the option is not re-proposed.

| Token | Shipping | Rejected |
|---|---|---|
| `--page-bg` | `#0F172A` | ~~`#1A1410`~~ |
| `--surface` / `--canvas-soft` | `#1E293B` | ~~`#241C16`~~ |
| `--border` | `#2B3444` | ~~`#3A2E24`~~ |
| `--ink-1` | `#F1F5F9` | ~~`#F7F3ED`~~ |
| `--ink-2` | `#CBD5E1` | ~~`#DCD3C6`~~ |
| `--muted-1` | `#94A3B8` | ~~`#A89B89`~~ |
| `--muted-2` | `#64748B` | ~~`#7A6E5E`~~ |

---

## D20 — Multi-user is out of MVP — RESOLVED (O2)

**Single owner, single shop. Park the surfaces, build the seams.**

Justification on the record: none of the PRD's twelve must-haves or six success
criteria involve a second person touching the shop.

### Seams to build from day one (additive later at no cost)
- `shop_id` **and** `actor_id` on every row.
- Create the single-owner `Membership` row — needed regardless.
- `approval_state` **nullable** on `BulkOperation`.
- Repositories already take a shop context argument (D-audit §4), so shop scoping is
  in place before multi-shop exists.

### Do NOT build
- The four-role capability matrix (artboard 74)
- Client workspaces
- The approval queue
- The automation rule builder (artboard 106 / brief §9.22)
- Any route behind them: `/team/*`, `/automations/*`

### Parked screens (designed, not implemented)
Team & roles (74) · agency delegation on Connect (10–11) · "Other shops" section on
Shop connections (72) · approval notifications (75, 18) · permission-error
pending-job state (84, keep the state, drop the approver reference).

---

## D21 — Final navigation IA — RESOLVED (O3)

Supersedes the route map in `PHASE-0-AUDIT.md` §5.

```
Dashboard      Overview · Action Center · Shop Pulse
Research       Keywords · Opportunities · Niche Research · Competitors · Keyword Lists
Listings       All Listings · Listing Audit · AI Copilot · Bulk Editor · Change History
Analytics      Shop Analytics · Sales Map · Experiments
Profit         Profit Reality (Waterfall · Scenarios · Costs · Transactions tabs)
Tools          Simple Calculator · Fee · Ads ROI · Profit · Category Finder ·
               Seasonal Calendar · Keyword Lists · Trademark Screening
Data           Methodology · Data Sources
Billing
Settings
```

- **Analytics** is a new group between Listings and Profit, with **exactly three
  members** — all designed: Shop Analytics (51) · Sales Map (57–58) · Experiments (59–60).
- **Change History** moves under Listings (it is the bulk-edit audit trail, and the
  Bulk Editor links straight into it).

### Correction applied: Orders is not a designed screen
**Orders, Reviews, Inventory and Delivery status have no design anywhere** — they are
nav items inherited from the old brief. They must not look built.

**Decision: leave all four out of the navigation entirely.** An empty state still
occupies a nav slot and implies the feature is imminent; omission is the honest
default and is trivially reversible. If they are wanted later, Orders slots into
Analytics and Inventory / Delivery status / Reviews into Listings.

---

## D22 — Plan copy — PROPOSED, awaiting decision

O2 removes most of what Growth and Agency currently advertise. The billing screen
(76–77) sells team seats, approvals, multi-shop and client workspaces — all parked.

### What is actually left after O2
Every tier differentiator that survives is **capacity or depth**, not seats or shops:
listing capacity · AI generations · rollback window · Shop Pulse baseline depth ·
profit scenarios · export · support.

### The problem with each tier
- **Growth** currently: "3 shops · Automation rules and scheduling · 5 team seats with
  approvals". All three are parked. Only "500 AI generations" survives.
- **Agency** currently: "10 shops · Client workspaces and approvals · White-label
  reports". **All of it is parked.** Nothing distinct remains — there is no product to sell.

### Recommendation — ship three tiers, hold Agency

Agency without multi-shop and client workspaces is not a thin plan, it is an empty
one. Listing it at $79 with nothing behind it is exactly the dark pattern `rules.md` §7
forbids. Hold it until Phase 9+ and present three honest tiers.

| Plan | Price | Positioning line |
|---|---|---|
| **Free** | `$0` | Research and calculators, no shop connection |
| **Solo** | `$15/mo` | One shop, up to 200 listings |
| **Growth** | `$29/mo` | One shop, up to 2,000 listings |

**Free — $0**
- Keyword, niche and product research
- All six calculators
- Methodology and data sources
- 5 AI generations / month
- ✕ No shop connection, profit or bulk editing

**Solo — $15/mo**
- Everything in Free
- Connect one Etsy shop, up to 200 listings
- Profit Reality with scenarios, and cost setup
- Bulk edits with validation, diff and 30-day rollback
- Shop Pulse with 90-day baseline and weekly digest
- 60 AI generations / month

**Growth — $29/mo**
- Everything in Solo
- Up to 2,000 listings
- 500 AI generations / month
- 90-day rollback window
- 12-month Shop Pulse history
- Full data export (CSV and JSON)
- Priority sync and support

**Agency — not listed.** Replace the fourth card with a quiet line beneath the table:
> "Managing several shops or a team? Multi-shop, roles and client approvals are in
> development. Tell us what you need — we will not bill you for something that does not
> exist yet."

No price, no "coming soon" badge, no waitlist pressure.

### Alternative, if all four tiers must appear now
Keep Agency at `$79` but rewrite it as **capacity only** (unlimited listings, 2,000 AI
generations, 12-month history, priority support) and delete every seat, shop and
client-workspace claim. Honest, but a weak $79 — which is why I recommend holding it.

### Screen consequences either way
1. **Usage meters (76)** — drop `Connected shops 2/3` and `Team seats 2/5`. Two meters
   remain: **Listings** and **AI generations**.
2. **Upgrade-required state (16)** — currently *"Automation rules are on Growth… Rules,
   approvals and multi-shop reporting start at Growth."* Automation is parked, so this
   state must be re-pointed at a real limit. Replacement:
   > **Upgrade required · You have reached 200 listings on Solo**
   > Growth raises the limit to 2,000 listings and 500 AI generations — $29/month,
   > cancel any time.
3. **Solo's negative line (76)** — *"No automation or team seats"* → *"One shop"*.
   Do not advertise the absence of something no tier has.
4. **Shop connections (72)** — the "Other shops" section (Northlight, Harbour Ceramics)
   comes out with multi-shop.
5. **AI quotas (D8/Q7)** become **Free 5 · Solo 60 · Growth 500**. The Agency figure of
   2,000 is held with the tier.

Trial and refund terms from **D17** are unaffected: 14 days of Growth, no card, nothing
charges automatically, 14-day refund window.

---

## Open items after round 3

- **D22 plan copy** — proposed above, awaiting your decision. Not a blocker: Phase 1
  touches no billing surface.
- ~~**O1** dark neutrals~~ → **RESOLVED by D19.** Cool slate, exact D1 values.
- ~~**O2** multi-user scope~~ → **RESOLVED by D20.** Out of MVP; seams built.
- ~~**O3** orphaned surfaces~~ → **RESOLVED by D21.** Analytics group of three; Orders,
  Reviews, Inventory and Delivery status omitted.
- ~~**O4** pricing~~ → **RESOLVED by D17.** Solo is $15.

**No blockers remain for Phase 1.**

---

## D22 — Plan copy — APPROVED (supersedes the proposal above)

**Three tiers. Agency held.**

Rationale on the record: a $79 card whose four bullets are all parked is exactly what
`rules.md` §7 forbids, and the capacity-only rewrite is a weak $79 that invites a
refund request.

### Tiers

| Plan | Price | Positioning |
|---|---|---|
| **Free** | `$0` | Research and calculators, no shop connection |
| **Solo** | `$15/mo` | One shop, up to 200 listings |
| **Growth** | `$29/mo` | One shop, up to 2,000 listings |

**Free — $0**
- Keyword, niche and product research
- All six calculators
- Methodology and data sources
- 5 AI generations / month
- ✕ No shop connection, profit or bulk editing

**Solo — $15/mo**
- Everything in Free
- Connect one Etsy shop, up to 200 listings
- Profit Reality with scenarios, and cost setup
- Bulk edits with validation, diff and 30-day rollback
- Shop Pulse with 90-day baseline and weekly digest
- 60 AI generations / month

**Growth — $29/mo**
- Everything in Solo
- Up to 2,000 listings
- 500 AI generations / month
- 90-day rollback window
- 12-month Shop Pulse history
- Full data export (CSV and JSON)
- Priority sync and support

**Growth listing cap moves 500 → 2,000 — approved.** With seats and shops removed,
capacity is the only honest reason for the tier to exist, so it has to be a real jump.

### The line under the table — VERBATIM, do not reword

> "Managing several shops or a team? Multi-shop, roles and client approvals are in
> development. Tell us what you need — we will not bill you for something that does not
> exist yet."

No price, no "coming soon" badge, no waitlist. **Keep that sentence exactly** — it is
the product's voice and it is doing real work.

### Screen consequences — all seven approved

1. **Usage meters (76)** — drop `Connected shops 2/3` and `Team seats 2/5`. Two remain:
   **Listings** and **AI generations**.
2. **Upgrade-required state (16)** — automation is parked, so re-point at a real limit:
   > **Upgrade required · You have reached 200 listings on Solo**
   > Growth raises the limit to 2,000 listings and 500 AI generations — $29/month,
   > cancel any time.
3. **Solo's negative line (76)** — *"No automation or team seats"* → *"One shop"*.
   Do not advertise the absence of something no tier has.
4. **Shop connections (72)** — the "Other shops" section (Northlight, Harbour Ceramics)
   comes out with multi-shop.
5. **AI quotas** become **Free 5 · Solo 60 · Growth 500**. The Agency 2,000 is held
   with the tier.
6. **Shop switcher (top bar, every screen)** — currently a switcher with connection
   status, plan, listing count and a "Manage shops" link. With one shop it collapses to
   a **static shop label plus sync freshness**. **Keep the element and its position** —
   it still carries shop context and sync state — but drop the dropdown affordance and
   the `Manage shops` link.
7. **Command palette and settings nav** — remove `Switch shop` and `Invite team member`
   from the palette; remove `Team & roles` from the settings sidebar. Do not leave a
   one-item heading behind.

### 7a — Settings sidebar: discrepancy found and resolved

The instruction assumed the Workspace group would be left with only `Billing & plan`.
The screen (artboard 72) actually shows **three** members:

```
Workspace    Team & roles · Billing & plan · Audit log
```

Removing `Team & roles` leaves **two**, not one — so "fold Billing up" alone would
strand `Audit log` under a Workspace heading with a single child, reproducing the
problem the instruction was avoiding.

**Resolution: fold both into Account and delete the Workspace group.**

```
Account       Profile · Security · Notifications · Billing & plan · Audit log
Shops & data  Shop connections · Data permissions · Costs & fees · Export & deletion
Integrations  Browser Extension
```

`Audit log` keeps its value with multi-user parked — it records the owner's own
security-relevant actions (permission grants, exports, connections), which artboard 80
already shows. If you would rather it sat under `Security`, that is a one-line change.

**Not to be confused:** `Audit log` (Settings — account and security events) and
`Change History` (Listings — listing mutations and rollback) are different surfaces and
do not merge.

### Unchanged
Trial and refund terms from **D17** stand: 14 days of Growth, no card, nothing charges
automatically at the end, 14-day refund window.

### Forward instruction — when Agency returns
**Do not resurrect the old card.** The parked features come back as a tier only when
they exist, and **the price is set then, not now.**

---

## Status after round 3

All open items are closed. **Phase 1 is unblocked.**

| Item | Resolution |
|---|---|
| ~~O1~~ dark neutrals | **D19** — cool slate, exact D1 values; warmed set rejected |
| ~~O2~~ multi-user scope | **D20** — out of MVP; seams built |
| ~~O3~~ orphaned surfaces | **D21** — Analytics group of three; four surfaces omitted |
| ~~O4~~ pricing | **D17** — Solo is $15 |
| ~~D22~~ plan copy | **Approved** — three tiers, Agency held |

~~One item carries a flagged resolution awaiting confirmation, non-blocking:
**7a** — settings sidebar, `Audit log` placement.~~ **Closed by the owner 2026-08-20 —
see D35.**


---

## D23 — Literal colours for elements that must not flip — SYSTEM CONVENTION

Any element that must stay dark in **both** themes carries a literal `#241B12`
background with `#F7F3ED` text. Never `var(--ink-1)` or `var(--ink-2)` — those
tokens invert to near-white in dark mode.

### The precise failure mode
It is not "never use a token as a background". A token background paired with a
token foreground is fine: both invert together and contrast holds (the demo chip
does exactly this). The bug is **mixing a token with a literal on the same
contrast pair** — a token background under literal white text, or the reverse.
When one side flips and the other does not, the pair collapses.

Same reasoning as the literal badge pill fills in D1/D10.

### Applied
| Surface | Was | Now |
|---|---|---|
| Demo banner (artboard 103b) | `var(--ink-1)` bg + `#F1F5F9` text | `#241B12` + `#F7F3ED` |
| Top-bar avatar chip | `var(--ink-2)` bg + `text-white` | `#241B12` + `#F7F3ED` |

Found by the audit this convention prompted. Both were invisible to typecheck
and to the production build; only rendering the dark theme caught them.

### Standing check
When reviewing any new component: for every colour pair, are both sides tokens,
or both literals? A mixed pair is the bug.

---

## D24 — One time basis: UTC — CONFIRMED

**All timestamps render in UTC.** `DISPLAY_TIMEZONE` in `lib/utils/format.ts` is
the single definition; period boundaries, day bucketing and display all share it.

`shop.timezone` is retained on the shop record because Etsy supplies it, but it
does not drive display or bucketing.

### The rule this replaces two bugs with
Two separate defects had the same root: **a calendar date passed through a zoned
formatter**.

- Phase 1: `PERIOD_START` stored at UTC midnight rendered as the previous
  evening in `America/New_York`, so the period displayed a day early.
- Phase 3: the chart axis ran `"2026-07-14"` through a zoned formatter and
  started on Jul 13.

**Calendar dates never pass through a zoned formatter.** A date key has no time
and no zone — it is the day the shop calls that day. `formatCalendarDate()`
exists for exactly this and formats in UTC.

### The companion rule
**Any comparison of two periods scales both the same way.** Prior orders were
left unscaled while period orders were reconciled onto their designed totals,
which made the revenue deviation read roughly twice its true size. If one side
of a comparison is normalised, the other side is normalised identically.

Note: artboard 91's chart caption reads "shop time zone (America/New_York)".
Superseded by this decision — the caption now reads UTC.

---

## D25 — Never author a Shop Pulse figure — CONFIRMED

**Measure it.** Where a designed number and a computed number disagree, the
computation wins — the same ruling as the $1.05 net-profit gap in D5.

**Every figure in the Shop Pulse artboard is illustrative of shape, not a target
to reproduce.**

### Canonical
The unexplained row is **−57%**, measured. The artboard's −12% was a hand-written
shop-wide number sitting in a column of per-group changes; a hand-written number
in a column of computed ones is indistinguishable from a real one, which is what
made it dangerous rather than merely wrong.

### The residual sweep — belongs in the methodology
Recorded changes are tested first. The unexplained figure is then measured on the
**residual**: the orders left after every correlated change is accounted for.

Two reasons this matters enough to publish:
1. Without it the same shortfall is reported once per quiet stretch — four
   "unexplained" rows describing one dip.
2. A seller reading −57% deserves to know it is **net of what the four recorded
   changes already explain**, not the raw shop-wide shortfall.

Added to artboard 93's Shop Pulse baseline card under **Method**, and to
`METHODOLOGIES.shopPulseBaseline` in code.

---

## D26 — A verdict reachable only by labelling is not a verdict — CONFIRMED

If a group is too thin to measure, return **UNKNOWN** — never a
measured-looking number.

Twelve listings averaging under one order each produced a +31% swing that was
pure noise, and `RULED_OUT` was unreachable except by asserting it. ### The test is EXPOSURE, not raw counts on both sides
The first cut required 5 observations on each side, which reported
"4 listings deactivated" — 27 orders then exactly zero — as *not enough data*.
Counting a complete stop as a thin sample reports the clearest case the engine
can see as unknown.

Measurability now asks: **is there a rate before the event, and enough days
after it that the prior rate would have produced a meaningful number of orders
had nothing changed?** Seeing near-zero across that exposure is a finding.
Seeing near-zero because we barely looked is not.

```
ordersBefore >= 5
beforePerDay * daysAfter >= 5
ordersBefore + max(ordersAfter, beforePerDay * daysAfter) >= 20
```

Below that the answer is UNKNOWN and `ordersAfterPercent` is `null` rather than
a percentage the sample cannot support; the table shows "Not enough data".

This is the design's own "too few samples / Unknown" state, applied to
diagnosis rather than only to research figures.

### Order of checks in `diagnose()`
1. No event → `UNKNOWN`, whatever the movement.
2. Not enough data → `UNKNOWN`, even with an event.
3. Only then does materiality decide `CORRELATED` vs `RULED_OUT`.

---

## D27 — Disjoint listing groups are a structural guarantee — CONFIRMED

**Overlapping listing groups are how a correlation engine becomes a rumour
mill** — measuring one change while the data moved another, and reporting the
borrowed movement as a finding.

One shared resolver (`narrativeGroups`), disjoint by construction, with a
**runtime invariant** that throws on overlap.

Deliberately not a test. A test proves the sets are disjoint today; the
invariant makes them unable to stop being disjoint — **including on the day a
future feature makes overlap convenient.** Keep it that way.

### Related product rule found while applying this
**UNKNOWN findings are never truncated.** Capping pulse findings by magnitude
dropped the unexplained drop behind three larger correlated ones. Correlated
findings are capped because they already carry an explanation; unexplained ones
are not, and an unexplained drop is the single thing a seller most needs to see.

For the same reason the unexplained finding is **CRITICAL** while correlated
ones are **ATTENTION**: a −100% drop the seller caused by deactivating a section
is a change they already know about. This surface answers "what needs my
attention", and the thing you already understand needs less of it.

---

## D28 — When a safety property makes something hard to test, change the architecture

**Never weaken the property.**

Found in Phase 4: `MockEtsyService` genuinely refuses to write, which made the
apply and rollback paths untestable through the global adapter. The fix was to
inject the adapter into the domain rather than relax the mock. The refusal is
still asserted as a real property, and Phase 11 now swaps the adapter without
touching the domain.

A safety property that is inconvenient to test is doing its job. The
inconvenience is a signal about the architecture, not about the property.

---

## D29 — Profit Reality: verified and assumed are different types

**A seller can never adjust an Etsy fee**, and that is enforced by the shape of
the code rather than by the inputs panel.

```ts
interface VerifiedTotals {           // readonly at every field
  readonly grossRevenue: number
  readonly etsyFees: number
  readonly paymentProcessing: number
  readonly offsiteAds: number
  readonly orderCount: number
}

interface SellerAssumptions {        // the only mutable inputs
  shippingPerOrder: number
  cogsPercent: number
  labourTotal: number
  otherCosts: number
}
```

`computeScenario(verified, assumptions, …)` takes them as separate parameters.
There is no parameter through which an adjusted Etsy fee could be passed, so
even a UI bug could not vary one. The lock icon in the panel presents a
guarantee made upstream; it is not the guarantee.

### A projected fee is not a verified one
In `BASE` the fee lines carry **VERIFIED** — they are what Etsy reported.

In `CONSERVATIVE` and `OPTIMISTIC` the sales volume is varied, so the fees that
follow from it are no longer what Etsy reported. They are relabelled
**CALCULATED** with the projection named. A scenario that kept calling them
Verified would be claiming Etsy confirmed a hypothetical it was never asked
about.

Seller lines stay `SELLER_INPUT` in every scenario.

### Scenarios apply to the waterfall, not to the ledger
Transactions and Costs describe what actually happened. Projected totals above a
table of real receipts invite reading one as the sum of the other, so those tabs
always report the base case whatever is selected — with a line saying so.

---

## D30 — Incomplete coverage is a first-class state

**Missing data lives in the panel, not in a footnote.** It is a state the
product is designed for, not an error it apologises for.

Every gap is a typed `MissingDataItem` carrying a title, what it costs the
seller in certainty, the order value affected where quantifiable, and
`resolutions` — which is required, not optional.

That includes the gap EtsyPilot cannot close: Etsy does not expose ad spend per
listing. Its resolution is the methodology explanation, so no row is a dead end.

### Reconciliation exceptions need a way out
Every `TransactionRow` that is not `MATCHED` carries a plain-language `reason`
and at least one `PRIMARY` resolution. A missing cost and a missing supplier
invoice get different resolutions, because they are different problems.

**`profit` is null wherever `cost` is null**, and renders as an em dash rather
than `0.00`. A zero in a money column is a claim; "we do not know" is not zero.

---

## D31 — Assertions on rendered output, not only on return values

Twice the suite was green while the screen was wrong: the thin-sample rule
labelled the clearest case "not enough data", and dark mode rendered
white-on-white. Both passed typecheck and unit tests.

The precise failure is **tests asserting what the code does rather than what the
seller sees**. `hasEnoughData` returning false for zero after-orders is
defensible in isolation and obviously wrong next to "4 listings deactivated".

So each phase now ends with a browser pass that asserts on rendered text, and
those assertions are kept. Scope them to visible content — searching raw HTML
also matches the RSC serialization payload, which produced a false positive on
this phase's "no Verified badge in a projected scenario" check.

---

## D32 — Provenance is a property of the number as displayed

> "Provenance is a property of the number as displayed, not of its source table.
> Any transform that changes a verified value — projection, proration, currency
> conversion, apportioning a shop-level fee across listings — demotes it and
> names what was done."

A figure does not inherit VERIFIED from the table it was read out of. It carries
VERIFIED only while it is still the number Etsy reported. The moment it is
projected, prorated, converted, apportioned or averaged, it becomes CALCULATED
and the note says which of those happened.

The rule generalises the scenario finding: a fee Etsy charged is verified; the
same fee multiplied by a sales projection is calculated, and the note names the
projection.

### The audit this produced
Swept `domain/` for every place a verified figure is divided or scaled
(`grossRevenue /`, `/ orderCount`, `etsyFees /`, `salesMultiplier`, `/ grossRevenue`).
Two real hits, both in the Profit Reality inputs panel:

| Row | Was | Now | Note |
| --- | --- | --- | --- |
| Average price | implied Verified ("From your receipts") | CALCULATED | Gross revenue ÷ orders — cannot be edited |
| Etsy fees % | implied Verified | CALCULATED | Fees charged ÷ gross revenue — cannot be edited |

Both are ratios *derived from* verified figures, not verified figures. The design
already agreed — artboard 51 labels "Average order" Calculated.

`Sales` and `Offsite Ads` stay VERIFIED: a count of orders and an amount Etsy
charged are exact aggregates, not transforms. Summing does not demote; dividing does.

### Locked is not the same as verified
Every row in the inputs panel now renders its own `ProvenanceBadge`. Read-only
rows were previously distinguishable only by being uneditable, which reads as
"Etsy said so". Two of them were not. The badge makes the difference visible
rather than inferred.

### The em-dash house rule
A null money value renders as an em dash with an accessible "Not known" label,
never `0.00`, in **every** money column — not only profit. A zero is a claim;
"we do not know" is not zero.

This is enforced by a shared cell rather than by convention: `components/ui/numeric.tsx`
exports `Money`, `Numeric` and `NumericCell`. `Money` takes `number | null` and
handles the null case itself, so no call site can render a null as zero or forget
`font-variant-numeric: tabular-nums` and `white-space: nowrap`. Money cells were
wrapping mid-value; a shared cell is the fix that cannot be forgotten.


---

## D33 — Locked is not the same as verified

**Owner, 2026-08-20:** *"A greyed field reads as authoritative, so read-only styling and
provenance are orthogonal and both must be shown. That generalises past this panel: any
disabled or derived field anywhere needs its badge."*

**Decision.** Read-only state and provenance are two independent facts about a field, and
a screen must show both:

| Fact | Says | Shown by |
|---|---|---|
| Locked | you cannot change this | the lock icon, the greyed fill |
| Provenance | where the number came from | the badge, and only the badge |

Neither implies the other. A field can be locked and Calculated (`Average price`), locked
and Verified (`Sales`), editable and Seller input (`COGS`). A future surface could have an
unlocked Estimated field and nothing about that would be contradictory.

**Why this is not a styling note.** Greying a field is a trust signal whether or not it is
meant as one: it reads as "the system owns this number", which is precisely the claim
Verified makes. A locked field with no badge therefore asserts Verified by default, and it
asserts it in the one place a seller cannot argue with — a control they are not permitted
to touch.

**Scope.** Every disabled, read-only or derived field in the product, not just the Profit
Reality inputs panel. Phase 6 onward — Listing Audit scores, Keyword Explorer volume and
competition figures, AI Copilot drafts, calculator outputs — these are mostly derived and
mostly read-only, and each one needs its badge at the point of display.

**Audited 2026-08-20.** The inputs panel was the only surface in the product with locked
value fields; every row now carries its own badge and the note that names its transform.
Buttons and dialog controls are actions, not figures, and take no badge.

---

## D34 — Coverage is measured, and the page says what it actually does

Found while checking the null-propagation property the owner asked about. Three
statements about the same 30 days disagreed:

| Source | Said |
|---|---|
| The ledger | 87 of 438 orders have no confirmed cost — $3,200.96, 17.4% of order value |
| The banner | "Costs are confirmed for 62% of order value" |
| The waterfall | COGS = 38% × **all** gross revenue, uncosted orders included |

Two separate faults.

**1. Coverage was stated, not measured.** `DEMO_TOTALS.costCoveragePercent: 62` was a
constant, and the measured figure is 83%. This is D25 ("never author a figure — measure
it") in a new place, and a worse place: coverage is the number a seller uses to decide how
much of the rest of the screen to believe. **Constant deleted.** `reconcile()` now returns
`coveragePercent`, `confirmedGross` and `ruleCostedGross`, computed from the rows, and the
banner, the waterfall, the Costs tab and the Action Center all read that one figure. A
test asserts the displayed coverage equals the share the ledger supports.

**2. The copy claimed an exclusion that never happened.** Three surfaces said uncosted
orders were "excluded rather than given an assumed cost" and that net profit was therefore
"a floor". The waterfall does no such thing — it applies the seller's default cost rule
(38% of price) to all revenue, which `computeWaterfall`'s own comment already described.
So the page rendered a dash in the ledger and then quietly included the same order in the
total above it.

**Resolution: the mechanism stays, the claims change.** The default rule is the right
mechanism — it is the seller's own configured assumption, advertised on the Costs tab as
"applies where no specific cost exists", and it carries SELLER_INPUT on the COGS line. The
strict alternative — propagate the null all the way up, so one uncosted order makes Net
profit unknown — would blank the product's headline figure over 17% of orders, and a
product whose answer to a coverage gap is a dash is not a product. So:

- **The waterfall** says the uncovered share is costed by your default rule, names the
  rule and the amount ($3,200.96), and says net profit is only as good as that rule.
- **The ledger** assumes nothing per order: cost and profit stay blank wherever no
  confirmed cost exists, and the column totals go blank with them.
- Neither surface claims exclusion any more, because neither excludes.

Net profit is unchanged at **$4,937.15** — no figure moved, only the sentences about it.

**The general rule this leaves behind:** a screen may fall back to a seller's own
assumption, but it must name the assumption, name what rests on it, and never describe
that as exclusion. Falling back silently and calling it a floor is worse than either
honest option.

### D34a — A null in a column total propagates

`domain/profit/totals.ts`: `sumOrNull` returns null if any single value is null. There is
deliberately **no `skipNulls` option**. The explicit alternative is `partialSum`, which
returns `{ knownTotal, unknownCount }` — it cannot be mistaken for a total because it
arrives carrying the count of what it left out.

The transactions ledger now has a totals row, which is the point: Gross and Fees total
because they are known on every row; Cost and Profit render the em dash with "Unknown — 87
orders have no confirmed cost". A total is the position a reader trusts most, so it is the
worst place to sum the rows we happen to understand.

The totals row sums the **filtered set**, not the twelve rows on screen. A total under a
truncated table that added only the visible rows would be wrong twice, and wrong in the
direction of looking complete.

---

## D35 — Audit log lives under Shops & data (closes D22 7a)

**Owner, 2026-08-20:** *"Put it in the Shops & data group, directly under Data
permissions. It's a record of what happened to shop data, which is what that group is
about, and it sits next to the export and delete controls a seller reaches for in the same
frame of mind. Not under Account — it isn't about the person, it's about the shop."*

```
Account       Profile · Security · Notifications · Billing & plan
Shops & data  Shop connections · Data permissions · Audit log · Costs & fees ·
              Export & deletion
Integrations  Browser Extension
```

Supersedes the D22 7a resolution that folded it into Account. Encoded in
`components/layout/navigation.ts` as `SETTINGS_NAV` so the settings screens in Phase 6
build against the decided order rather than the artboard's.

**Unchanged:** `Audit log` (account and shop-data events) and `Change History` (listing
mutations and rollback) remain different surfaces and do not merge.


---

## D36 — Modelled market signals are a separate adapter, not part of EtsyService

Phase 6 introduces the first data in the product that is **not** Etsy's: keyword demand,
competition, competitor sales. Etsy publishes none of it, to anyone.

**Decision.** `MarketSignalsService` lives in `lib/signals`, with its own selector, beside
`EtsyService` rather than inside it. Two adapters, two switches.

**Why not one adapter.** `EtsyService` is the thing the whole product treats as ground
truth — the interface that deliberately has no `getListingViews`, no `getSearchTerms`, no
`getAdsPerformance` because Etsy does not expose them. Adding modelled figures to it would
put a number Etsy has never seen behind the same door as its receipts. The badge would be
the only thing standing between a seller and that mistake, and badges are a rendering
decision; a module boundary is not.

It also gets the Free tier right by construction: research works with no shop connected,
because the research adapter never asks for one.

**Type-level consequences, both enforced:**

1. Every metric returns `Provenanced<EstimatedRange>`, never a number. An estimate that
   can be rendered as a single figure eventually is. There is no midpoint accessor.
2. Too little observation returns UNAVAILABLE with `value: null`. "Sparse data" has no
   shape for a fallback, so it cannot quietly become a small number.

**Opportunity is CALCULATED, not ESTIMATED** — a visible formula over estimated inputs
(D32 again: the transform names itself). It is null wherever demand is null, because a
score over a missing input is a number invented to fill a column.

---

## D37 — AI reaches Etsy through the bulk editor or not at all

There is one write path in this product. Phase 6 adds AI drafting and deliberately does
**not** add a second one.

`AiDraft` has no publish method. The only route out is `draftChanges()` → a DRAFT bulk
operation → validate → diff → `confirm()` → `ConfirmedOperation`. So "AI never
auto-publishes" is not a rule the copilot screen honours; it is the absence of a function.
The primary button says **Send to review**, because that is what it does.

**`AiDraft` has no field for a predicted outcome.** Not optional, not nullable — none.
"Estimated impact is not predicted. Track results in the experiment tracker after
publishing." A type with nowhere to put a forecast cannot grow one by accident, and a test
asserts the absence by name (`predictedImpact`, `expectedLift`, `rankingForecast`).

Every drafted element carries a `DraftSource`. A draft with an unexplained addition is
indistinguishable from an invention.

**Quota is a boundary, not a penalty.** `Errors.limitReached` names what still works and
when the allowance resets, and a failed generation is never counted — the difference
between a limit and a fine.

---

## D38 — The listing audit weighs money, not listings

Health score = each listing's share of **verified revenue**, weighted by the severity of
its worst issue, subtracted from 100. Errors count fully, warnings a third.

A shop with 300 clean listings and 4 broken ones earning most of the revenue is not
healthy, and a score that counted listings would tell it that it was.

Consequences, all stated on the screen rather than in a help article:

- A listing with no orders in the period carries **no weight**. Coverage says how much of
  the catalogue the score could see, and the limitation is printed beside the number.
- With no orders at all the formula changes to an unweighted count — and **says so**,
  because a different formula must never hide behind the same number.
- `Revenue at risk` is **item revenue** from that listing's own receipt lines, so it stays
  VERIFIED. Order-level discounts belong to the order; apportioning them across items
  would be a transform and would demote the figure (D32). A precise smaller claim beats a
  demoted larger one.
- The headline exposure counts each listing **once**. The per-rule figures overlap, and
  summing them produced a number larger than the shop's own revenue.

No rule claims a ranking effect. Rules describe what a listing can or cannot do, which is
knowable; never what Etsy will do with it, which is not.


---

## D39 — A prompt is an instruction; validation is a check

Phase 7's acceptance is that AI **cannot** invent metrics, claim private algorithm
knowledge, or bypass confirmation. "Cannot" is not something a prompt can deliver. A model
that follows the rules ninety-nine times in a hundred will break one in front of a seller
eventually, and the rule that matters is the one that holds on the bad day.

So every prohibition is stated twice: once in the system prompt, and once as a check
against what actually came back.

| Rule | Prompt | Check |
|---|---|---|
| No invented metrics | "Every number you write must appear in the FACTS list" | Numerals in the output diffed against the numerals in the facts |
| No ranking claims | "Etsy does not publish its ranking algorithm" | Seven patterns — rank/visibility/algorithm/SEO/more views/will perform/favoured by Etsy |
| No predictions | "Never predict an outcome" | Four patterns, including hedged forms ("should see", "can expect") |
| No unverifiable claims | "best, #1, guaranteed…" | Word list, in listing text only — the rationale may *discuss* removing one |
| Locked terms preserved | "character for character" | Present-before-and-missing-after comparison |
| Etsy's limits | stated in the constraints | 140 chars, 13 tags, 20 chars per tag, no duplicates |

**A blocked draft is withheld, never repaired.** A rewrite that invented a metric is not
trustworthy about the parts that look fine, and repairing it would mean deciding on the
seller's behalf which of its claims to believe. `generateDraft` returns a two-armed union —
`{kind:'DRAFT'}` or `{kind:'REJECTED'}` — so there is no shape for a partially-trusted
draft to occupy.

**Advisory findings exist and are shown**, for judgement calls rather than rule breaks: a
tag that came from neither the saved list nor the listing text, or an over-length tag the
seller already had. That last one blocks only when the *draft* introduced it — blocking on
a pre-existing tag would mean a shop with one legacy long tag could never get a draft,
which punishes the seller for the state of their own catalogue.

**Verdict derived, never assigned.** `ok` is one expression over the completed findings
list. The Phase 4 lesson: a rule added later must be able to block, and it cannot if some
earlier line already decided.

**The prompt states rules as facts about the world, not preferences about style.** "Etsy
does not publish its ranking algorithm; nobody outside Etsy knows it" is checkable and
stable. "Please avoid ranking claims" is a request, and requests are the first thing a long
context erodes.

---

## D40 — Facts are the only channel into a prompt

`AiRequest` carries `PromptFact[]`, each with its provenance class. There is **no free-text
field** through which a caller could pass an unlabelled claim, and no helper that accepts a
bare number: `domain/ai/facts.ts` takes `Provenanced<T>` and returns a labelled fact, so a
figure cannot lose its class on the way in.

Three consequences worth keeping:

- **An UNAVAILABLE value is rendered, not omitted.** "Views for this listing: not available
  — Etsy does not provide listing views through the public API." A model that notices a
  missing field will reason about why it is missing; one that is told plainly does not.
- **An ESTIMATED value arrives as a range with its caveat on the same line**, so the range
  and the reason it is a range cannot be separated by whatever the model does next.
- **The allowed-number set is built from the same facts as the prompt**, in the same
  function. The permission list and the prompt cannot drift apart.

The request type also has no `temperature`, no `systemPrompt` and no
`predictImpact` — a caller cannot loosen the guardrails from outside, and there is nowhere
to put a request for a forecast.

---

## D41 — Two conditions for live AI, and a build error if it leaks

`getAiProvider()` returns the live provider only when **`AI_MODE=live` AND
`ANTHROPIC_API_KEY` is set AND the shop is not in demo mode**. Any one of the three missing
means the deterministic rule-based provider runs. An environment that claims to be live
with no key would otherwise fail at the moment a seller clicks the button rather than at
the moment someone misconfigured it — and demo mode reaching a live model is the same class
of mistake as demo mode reaching Etsy, which already has two guards.

`lib/ai/claude.ts` starts with `import 'server-only'`. Importing it from a client component
is a build error, not a review comment. The key is read inside a lazy getter, never at
module load, so demo mode boots with no credentials of any kind.

**Nothing from the provider reaches the seller unfiltered.** Rate limits, auth failures and
transport errors are all mapped to one `AI_UNAVAILABLE` AppError with our own wording — the
provider's message can carry request ids, model names and header hints, and none of that is
the seller's business. A model refusal is a legitimate outcome, reported as one, and like
every other failure it is **not counted against the allowance**.

---

## D42 — AI is decoration on an explanation that already exists

`explainRule` and `recommendForAction` are given the finding the domain computed and the
evidence already on screen, and they may say nothing that is not traceable to one of them.
A recommendation citing evidence it was never given is blocked.

When the assistant's version is withheld — or the service is unreachable — the seller reads
**the product's own words**, unbadged, plus a line saying a version was withheld and why.
The information is identical in all three states. That is the design constraint: AI
decorates an explanation the domain already produced, and never *is* the explanation, so
"the AI is down" costs a badge rather than a paragraph.

Cost follows from the same principle: **one explanation per page, for the worst rule or the
top action**. Explaining every rule would be a dozen API calls per page load, spending the
seller's allowance on text they may not read, and the rules already explain themselves.

---

## D43 — The audit trail records the person, not just the change

An approved draft becomes ordinary events in the append-only log, **one per changed field**
— because Change History shows fields, rollback reverses fields, and Shop Pulse correlates
fields; a single "AI draft applied" row would be invisible to all three.

Each event carries `source: 'AI_ASSISTED'`, the **approver's actor id** (a required
parameter with no default), the operation that carried it to Etsy, the provider that
drafted it, and the rationale **the seller actually read at approval time** — not a
regenerated summary. Six months from now "why does this listing say that?" has to be
answerable, and "a model wrote it and nobody remembers approving it" is the answer this
product exists to prevent.


---

## D44 — A backward-looking figure never carries a forward-looking label

Review of D38 raised two consequences of counting each listing once. One was already
built; the other was a real defect that had shipped.

**Already built: the union is stated.** The headline counts each listing once, so the
per-rule figures do not sum to it — a listing failing three rules appears in three rule
rows and once in the total. The card says so. Without that, a careful seller adds the
column, gets a different number, and stops trusting the page — the same failure mode as a
waterfall that does not sum to its total.

**The defect: "revenue at risk".** The number is revenue those listings **earned** in the
period. "At risk" is forward-looking; the measurement is backward-looking. A missing
attribute on a listing that took $2,000 last month does not endanger $2,000 — the money is
banked. The label claimed a loss the figure had no basis for.

Renamed everywhere:

| Surface | Was | Now |
|---|---|---|
| Per-rule header | "$4,864 at risk" | "$4,864 earned by them" |
| Table column | "Revenue at risk" | "Revenue in period" |
| Headline card | "Revenue behind flagged listings" | "Revenue on listings with issues" |
| CSV column | "Revenue at risk" | "Revenue earned in period" |
| Domain field | `revenueAtRisk` | `revenueOnListing` / `revenueOnListings` |

**The field rename is the load-bearing part.** Copy can be re-broken by anyone; a field
named `revenueAtRisk` actively invites the phrase back, because the next contributor reads
the type and follows its lead. A test asserts the old name is absent from the view.

The headline now states both halves plainly: what the figure is ("revenue that N flagged
listings **earned** in this period") and what it is not ("money at risk — a missing
attribute on a listing that earned well does not endanger what it already took").

**The general rule:** every figure in this product is either a measurement of something
that happened or a projection of something that might. The label must say which. This is
D32's sibling — D32 governs what a transform does to a number's provenance, D44 governs
what a tense does to its meaning, and both fail the same way: the arithmetic stays right
while the claim quietly becomes false.


---

## D45 — "No dark patterns" is enforced, not promised

Phase 8's acceptance criterion is a claim about behaviour, so it is built as
structure rather than as copy.

**1. Leaving is never harder than joining.** `SUBSCRIBE_FLOW` and `CANCEL_FLOW` are
declared step lists, and `lifecycle.ts` **throws at module load** if cancelling has more
steps than subscribing. Cancel is one step; subscribe is two. A retention maze cannot be
added without deleting the invariant, which is a visible act in a diff. The page prints
both counts, so the symmetry is inspectable and not merely true.

**2. No charge without disclosure.** `chargeDisclosed()` is the only money-moving method
on the provider and it accepts only `DisclosedCharge` — a branded type whose sole producer
is `disclose()`, which refuses to build one without an amount, a date and a statement of
what changes. The same construction as `ConfirmedOperation` in Phase 4: a surprise charge
is not a policy we follow, it is a call that does not compile.

An upgrade is prorated and the proration is **shown**: "$14 per month more, charged for
the 10 days left in this period — $4.67 today, not a full month", then the next full
charge and its date. A seller who has already paid for a month can see they are not being
charged for another.

**3. Nothing is deleted on a downgrade.** `downgradeEffects()` enumerates what pauses.
There is no delete in the billing domain to enumerate, and each entry names who chooses:
"you choose what to remove, and nothing is removed for you."

**4. The refund window is computed.** From the charge date, so "6 more days" can be
checked against the invoice line above it. Outside the window `refundEligibility` returns
**null rather than zero days** — "not refundable" and "refundable for zero more days" are
different claims and only one is true.

**5. Failures stay visible.** A declined charge remains in the billing history with no
receipt link. A history that shows only successes is how a seller learns about a lapsed
card from a paused job instead of from their billing page.

### D45a — Demo mode blocks Etsy writes, not billing

`assertCanWrite` exists to stop a demo shop publishing to Etsy. Applying it to billing
made cancellation unwalkable and failed with "Demo mode cannot publish to Etsy" on a
refund request, which is not what a refund does.

The invariant is now stated where it bites: **a read-only context may never reach a LIVE
provider.** In demo mode the adapter selector cannot even construct the Stripe provider,
so this is the second of two guards on one property — the same doubling as the bulk
editor's demo refusal. Billing flows run against the mock, move no money, and are
reversible, so the promise "cancelling is one click" is verifiable rather than asserted.

### D45b — The mock billing store lives on globalThis

Next builds route handlers and pages into separate server bundles, so a module-level Map
is a *different* Map in each. Cancelling through the route and then re-rendering the page
read two stores: the route returned 303, the ledger changed, and the screen showed the old
plan. Every unit test passed, because a test imports one module instance.

The demo store is keyed on `globalThis` so it survives the bundle boundary. Phase 11's
repository replaces it; `StripeBillingProvider` never reads it.

### D45c — Webhooks

Verification is real and tested — it is a security boundary, not a feature: an unverified
webhook lets anyone who can reach the URL change a subscription. Signature over the **raw**
body, timing-safe comparison, and a 300-second age tolerance, because a replayed valid
signature is still valid. Tested at all four edges: wrong secret, tampered body, replay,
missing header.

Handling is idempotent by event id and allow-listed to five types. An unknown type is
acknowledged with 200 and applied to nothing — a non-200 makes the provider retry an event
we will never act on, and guessing at an unfamiliar payload is how a subscription gets
cancelled by a notification about a coupon.

The verification function lives in `lib/billing/signature.ts`, deliberately **without**
`server-only`, so it can be tested at its edges; the adapter that holds the secret keeps
the marker (D28: change the architecture, never the property).

---

## D46 — A limit is written once and read everywhere

Three defects in this phase were the same defect: a number restated beside the place that
owns it.

| Where | Said | Owner said |
|---|---|---|
| AI copilot quota | 60 generations, "Solo" | the plan: 500, "Growth" |
| App shell chip | plan from a constant | the subscription |
| Free tier listings | `null`, read elsewhere as "unlimited" | it connects no shop — `0` |

The third was the sharpest: `limits.listings: number | null` where null meant "not
applicable" for Free but was read as "unlimited" in `downgradeEffects`, so **upgrading**
from Free warned that bulk jobs would pause. An ambiguous null in a limits table is a bug
waiting for a reader; it is now `number`, with `0` meaning the plan connects no shop.

The rule: a limit belongs to the plan. Every surface reads it — the copilot, the shell,
the meters, the upgrade prompt — and none of them restates it.


---

## D47 — A session is per-request, so nothing that reads one is prerendered

The three Phase 8 defects were three faces of one failure: **state changed and the
screen did not move.** Fixing them individually left the class open, and an audit found a
fourth instance already live.

### The audit

| Class | Elsewhere? |
|---|---|
| Hardcoded / env-defaulted URL in a redirect | Clean. One instance, fixed; every redirect now resolves against `request.url`. |
| Module-level mutable state crossing a bundle boundary | Clean. Every other module-level binding is a cache of a deterministic value or a frozen constant — duplicating one per bundle costs a recompute, not a disagreement. |
| A prerendered page reading mutable state | **Still live, and worse than the original.** |

### The fourth instance

The dashboard *layout* reads the plan for the shell chip. `/billing` was made dynamic;
every other page was still prerendered at build time. So after an upgrade:

```
/billing    412 / 2,000 listings     ← correct
/dashboard  412 / 200 listings       ← the plan it was built with
```

One page fixed, ten pages wrong — and worse than the button bug, because there is no
click to make a reviewer suspicious. The seller upgrades, navigates, and the product
quietly contradicts itself.

### The fix, placed where it cannot be forgotten

Not `export const dynamic` on ten pages — the next page added would be the eleventh
mistake. `getSession()` now reads the request's cookies:

```ts
export async function getSession(): Promise<Session | null> {
  await cookies()          // Phase 11 reads the auth cookie here
  if (isDemoMode()) return DEMO_SESSION
  return null
}
```

This is not a trick to force a render mode. **A session is per-request by definition**, so
a page whose content depends on who is asking cannot be prerendered, and touching the
request is how that fact is expressed. Demo mode returning a constant session was hiding a
real property of the product. Every dashboard page is now dynamic, including the ones that
do not exist yet.

### The check that would have caught it

Change plan, then read the shell chip on three different pages and assert they agree.
Verified by removing the cookie read: the check fails with the numbers in its message
("billing 412 / 2,000, dashboard 412 / 200"), which is what a reviewer needs to see.

**The general rule:** when a fix is "this surface now reflects state", the next question is
always *which other surfaces read that state* — and the answer is usually "a shared layout,
on every page".


---

## D48 — The extension's promise is enforced by its packaging

Phase 9's acceptance criterion is "the extension never contains privileged Etsy
credentials". That is a property of an artefact, so it is checked against the artefact.

**The build refuses.** `extension/build.mjs` audits each package before writing it, and
exits non-zero on any of: a permission beyond `activeTab`, a host beyond `etsy.com`,
`chrome.cookies` / `webRequest` / `debugger` / `declarativeNetRequest`, anything shaped
like a key or token, or a URL pointing anywhere but Etsy and the configured app origin.
The same checks run in the unit suite **against the built package**, so they are part of
`npm test` rather than only of a release step.

Verified by attacking it. Four shapes, all stopped:

| Attempt | Result |
|---|---|
| `<all_urls>` + `cookies` in the manifest | build fails, naming both |
| `chrome.cookies.get()` in the popup | build fails, naming the file |
| A hardcoded `sk_live_…` | build fails, quoting the match |
| A call to a third-party telemetry host | build fails, naming the host |

**There is also no shape for a credential.** `lib/extension/contract.ts` has no token
field on any request or response and no message that writes — the same construction as
`AiDraft` in D37. Authentication is the seller's existing EtsyPilot session cookie, which
the browser sends and the extension never reads.

**The audit's first catch was its own deny-list.** `FORBIDDEN_APIS` lived in the shared
contract, the contract ships to the popup, so the build failed on its own list of
forbidden API names appearing verbatim in a shipped file. Right answer, unexpected reason:
a list of the exact strings a reviewer greps for has no business inside the artefact under
review, where it defeats that grep for everyone downstream. It moved to
`lib/extension/policy.ts`, which is excluded from the extension's compile.

### D48a — The extension reads Etsy's URL, never Etsy's page

The content script takes a URL and returns a listing id. It does not scrape. Prices,
titles and stock read off Etsy's markup would be data we present as ours, taken from a
page that changes without notice — and every figure in the popup already exists, computed,
on the server. It also never touches cookies or storage: the seller's Etsy session is
theirs, and this extension has neither business with it nor a permission that would allow
it.

### D48b — Same figures, same badges, and no score where there is no basis

The popup composes the audit and the signals adapter rather than recomputing anything, so
it cannot drift from the pages it links to. A listing the seller owns gets VERIFIED
figures and a health score; anyone else's gets ESTIMATED ranges and **no health score at
all** — one built from public data would look like the same number and mean something
else. Listing views stay UNAVAILABLE in 380 pixels exactly as they do at 1440.

### D48c — Demo listing ids are numeric, because Etsy's are

They were `L01001`. Nothing in the app minded until the extension, which reads an id out
of a real `etsy.com` URL where the id is always digits — so a demo listing could never
match and the entire own-listing path was unreachable in demo mode. A flow nobody can walk
is a flow nobody can check, which is the same finding as the prerendered billing page one
phase earlier. Ids are now `1400001001` and up.

### D48d — CORS is the boundary, so it is tested by origin

A browser will send the seller's session cookie to `/api/extension/listing` from any page
they have open; only the absence of CORS headers stops the response being read. The route
allow-lists extension ids from `EXTENSION_IDS` and grants nothing to anything else —
including `https://www.etsy.com` itself — with `Vary: Origin` on every response so a
permissive one cannot be replayed from a cache. Tested by origin rather than assumed.

The popup's own rendered-output checks route their API call through Playwright rather than
adding an http origin to that allow-list, because weakening the boundary to make its test
pass is not testing the boundary. The browser's insistence on a credentialed CORS reply —
a wildcard origin is rejected when the client sends `credentials: 'include'` — showed up
during that work as a protection doing its job.


---

## D49 — The Simple Calculator stays separate, and says what it is not

Phase 10's acceptance criterion is "Simple Calculator remains fast and separate from
Profit Reality". Both halves are checked rather than intended.

**Separate, as a property of the module graph.** `domain/calculator/engine.ts` has exactly
one import — `@/lib/provenance/types`, a type — and a test asserts that list is exactly
that. No Etsy adapter, no session, no database, no clock, no randomness. The two tools
answer different questions and the difference is the whole point: Profit Reality is a model
over verified receipts, this is arithmetic over numbers a seller typed. Merging them would
let a typed figure sit in the same frame as a receipt.

**Fast, as a measured property.** 20,000 calculations under a second. The check earned its
place immediately: the first implementation took **3.8 seconds**, because `money()`
constructed a fresh `Intl.NumberFormat` on every call — the standard way to make a
calculator slow, and invisible to every correctness test. Memoised per currency: **68ms**.

**Every result is CALCULATED.** The return type is `Extract<ProvenanceType, 'CALCULATED'>`,
so there is no branch that could return VERIFIED. Nothing here came from Etsy, and a fee
rate a seller types is not an Etsy fee — the page says so, and the result card never
carries the phrase.

### D49a — The formula is the return value, not a caption

`calculate()` returns `{ value, display, formula }`, all produced in one pass from the same
inputs. A component cannot render a formula that disagrees with the number beside it,
because it is not assembling one. D25 in miniature: never author the explanation separately
from the figure. A test asserts, for every calculation at several inputs, that the formula
string ends in the displayed result.

### D49b — It refuses rather than coerces

An empty box is not zero, `"abc"` is not zero, and a calculator that treats them as zero
gives a confident wrong answer. Every refusal names the field and what to change:

| Input | Refusal |
|---|---|
| Margin with revenue 0 | "Margin needs revenue above 0 — there is nothing to be a share of." |
| Break-even at 100% margin | "…has no break-even price — the price would never be enough." |
| Discount over 100% | "A discount over 100% would mean paying the buyer." |

A sweep over every calculation × a grid of inputs asserts no accepted input ever produces
`NaN` or `Infinity`. Removing one guard failed that sweep as well as its own test.

### D49c — The free variant is the same component, and asks nothing first

The public page at `/tools/etsy-seller-calculator` renders the same `SimpleCalculator` as
the in-app page. Not a copy with a shared look: an acquisition surface is the one most
likely to drift, and a calculator that gives different answers at two URLs is worse than
not having the second URL.

It has no login wall and no Etsy connection prompt anywhere, and the sign-up invitation
appears **only after a result exists** — before that the page has given the seller nothing,
and asking first is the pattern this product does not use. Verified by making the banner
unconditional: the check fails.

It also sits outside the `(dashboard)` group, so it reads no session and is prerendered —
the same rule as D47, in the direction that says a page which does NOT depend on who is
asking may be static.

---

## D50 — Live Etsy access is a one-file swap, and the credentials have nowhere to leak

Phase 11's acceptance criterion is "live mode can replace mock mode without rewriting the
product". It is checked, not asserted: a test walks every `.ts`/`.tsx` file under `app/`,
`components/`, `domain/` and `lib/`, and the list of files importing `lib/etsy/live.ts` must
be exactly `['lib/etsy/index.ts']`. The same test in the other direction says nothing but
the selector imports `mock.ts`. Swapping adapters is `ETSY_MODE=live` and nothing else.

The whole integration is testable with **no Etsy API key, no network and no Etsy account**,
because the transport, the clock and the randomness are injected (D28). That is not a
convenience. An integration whose security properties can only be checked against a live
provider is an integration whose security properties are never checked — and the security
properties here are the ones the brief is most explicit about.

What that buys, each with a test that fails when the property is removed:

| Property | How it is held |
|---|---|
| No credential in the repository | Every value comes from `process.env`; `.env.example` ships placeholders and a test asserts each is empty |
| No Etsy secret in the browser | Nothing Etsy-related may carry `NEXT_PUBLIC_`; asserted over the source AND the env template |
| No secret in an API response | `TokenSet` is returned by nothing; the access token reaches the HTTP client inside a closure |
| No Etsy password, ever | There is no password field in the codebase to receive one — the browser check counts `input[type=password]` on the connect screen |
| No credential in a log or an error | `redact()` strips bearer tokens, keys, verifiers and refresh tokens; `EtsyHttpError` carries status, method and PATH — never the query string, never headers |
| No stack trace to a user | Both routes redirect with one of our own outcome codes; a browser check greps the callback's response body for `verifier`, `Error` and a stack frame |
| Nothing auto-published | `applyListingChanges` is reachable only through the bulk editor's `ConfirmedOperation` gate |

PKCE is used even though the server could hold a secret. The verifier binds the
authorization code to the browser that started the flow: a code leaked through a referrer
header, a shared screen or a proxy log is useless without it, and it never leaves the
server. `statesMatch` compares in constant time and length-checks first, because
`timingSafeEqual` throws on a length mismatch and a CSRF attempt must be refused, not turned
into a 500.

Tokens are sealed with AES-256-GCM before storage. GCM rather than CBC so a row edited in
the database fails to decrypt instead of decrypting to something else. "The database is
private" is a claim about infrastructure, not about the data.

### D50a — `server-only` is a design input, not an obstacle

Adding `import 'server-only'` to the Etsy adapter turned twelve green test files red and
then failed the build. Both were right, and both were about the same thing: modules that
merely *mention* the adapter drag it into a bundle.

Two answers, and neither was to delete the marker:

**The test runner gets an alias.** `vitest.config.ts` points `server-only` at a no-op stub.
Vitest is not a client bundle; Next's bundler is where the marker matters and it still
applies there. So that the alias cannot quietly become a way to *drop* the marker, a test
asserts that `lib/etsy/tokens.ts`, `lib/etsy/live.ts`, `lib/ai/claude.ts` and
`lib/billing/stripe.ts` each still carry it.

**The bulk editor gets split.** The wizard is a client component and needs `createDraft`,
`validateOperation` and `applicableItems`. Importing them from `domain/bulk-editor/service.ts`
pulled `getEtsyService` — and through it the adapter and its token store — into the browser
graph. So the pure planning half moved to `domain/bulk-editor/plan.ts` and `service.ts` kept
everything that talks to Etsy, re-exporting the rest so no server caller changed.

**The confirm gate is unaffected by the split, and that is the point of it being a type.**
`confirm` is still the only function returning a `ConfirmedOperation`, and `applyOperation`
still accepts nothing else. The gate survived a file move because it was never enforced by
adjacency.

D28 again, in its sharpest form yet: change the architecture, never the property. The
boundary the build forced — *planning is pure, applying touches Etsy* — is a better boundary
than the one that was there before, which is usually how this goes.

### D50b — A live connection does not conjure data Etsy withholds

`getListingViews` and `getAdsPerformance` return `UNAVAILABLE` in live mode, with a valid
key and a connected shop, exactly as they do in demo. They exist as methods rather than
omissions precisely so the answer to "surely we can get this now that we're connected?" is
written down in the adapter, where someone looking for the endpoint will find it. When Etsy
publishes an endpoint, that is the moment to change them — not before.

Two quieter refusals in the same spirit, both in the mappers:

- **Attributes are left empty on both sides.** Fetching per-listing attributes for a whole
  catalog would spend the rate budget on a page nobody opened, so `toListing` leaves
  `attributes` empty — and `requiredAttributes` empty too, so no audit rule fires on data
  that was never loaded. Empty means "not fetched", not "none", and the code says so.
- **Fees are left at zero, and zero is not fee-free.** Fees come from the payment-account
  ledger, not the receipt. The profit domain treats a period with no fee data as incomplete;
  a shop whose fees read `$0` would show a wildly optimistic net profit.

`getSyncProgress` reports `overallPercent: 0` and `etaSeconds: null` when no sync is
running. Not `0` seconds — `0` reads as "arriving now", and `null` is how this product says
unknown. A sync screen that invents a percentage is the same defect as a metric that invents
a figure.

### D50c — Every OAuth outcome is written once, and a route cannot emit one without copy

`CONNECT_OUTCOMES` in `domain/connect/types.ts` holds the six ways an attempt can end and
the sentence a seller reads for each. The routes' outcome type is
`keyof typeof CONNECT_OUTCOMES`, so an outcome with no copy does not compile and copy with
no outcome has nowhere to be shown (D46). A test greps both route files and asserts every
emitted string is a key.

Every failure says the same two things, because both are true and both are what a seller
wants to know first: **nothing was connected, and nothing was changed on Etsy.** A test
asserts that phrase is in every failure's copy, and the browser checks it on the rendered
page for each `?connect=` value.

Nothing from Etsy is passed through into that URL. Its `error_description` is provider text
of unknown content heading for a URL bar, a browser history and a referrer header. The
outcome codes are ours.

The flow itself is one httpOnly cookie holding state, verifier, user id and scopes, because
those four are only meaningful together — a callback with a verifier but no state is not a
partially valid flow, it is an invalid one. `readFlowCookie` never throws: a malformed
cookie is an invalid flow like any other, and a JSON parse trace is exactly the stack trace
a user must never see. The cookie is deleted on **every** path including the failures, since
a verifier that survives a failed attempt is a verifier available for a second one.

### D50d — A write sends only what was confirmed to change

`applyListingChanges` builds its request body from `request.changes`, which is a `Partial`.
An absent key means "leave it alone". Sending the whole listing back would overwrite fields
the seller edited on Etsy between the diff and the apply — the silent clobbering the confirm
step exists to prevent — and a test asserts the body contains exactly the changed field.

An empty change set is reported `SKIPPED`, not `SUCCEEDED`: the audit log must not record a
write that never happened. A failure on one item does not roll back earlier items or stop
later ones, and each item's error is the user-safe message, never the transport detail — a
test drives a mid-batch failure and asserts Etsy's own words do not reach the result.

Which shop the tokens belong to comes from Etsy's `/users/me`, never from the request. A
`shopId` a caller could supply is a cross-shop write waiting to happen, and the callback is
the one moment in the product where the shop is not already known.

### D50e — A cache keyed by nothing is a cross-shop read

`LiveEtsyService` builds an HTTP client whose token closure captures a `shopId`. The first
version cached one client on the instance. The adapter is a process-wide singleton, so that
client would have captured the first shop it was built for and then served **every later
shop from those credentials** — no error, no warning, just another shop's listings.

The cache is now a `Map` keyed by shop, with a test that asserts a second shop builds a
second client and a third call for the first shop does not. Breaking the key back to a
constant fails it.

Worth naming as a class, because this is the second time it has appeared: **a performance
shortcut that drops an identifier turns an authorization boundary into a coincidence.** The
same shape as the mock billing store that was two different Maps (D45b) — module-level state
that looks like an implementation detail and is actually a scoping decision.

### D51 — Nothing a page needs may come from a third party

The root layout loaded Inter with a `<link rel="stylesheet">` to
`fonts.googleapis.com`. It now uses `next/font`, which fetches the face at build time and
serves it from this origin.

Two promises were failing at once, and they turn out to be the same promise.

**Privacy.** This product tells sellers their data stays theirs, and then handed Google
every seller's IP address and the URL of every page they opened. A privacy promise undone
by a font link is not a privacy promise.

**Availability.** A third-party stylesheet is *render-blocking*: the browser paints nothing
until it resolves. A seller behind a corporate proxy, an aggressive blocker or a bad mobile
connection sees a blank page for as long as their browser takes to give up.

How it was found is the part worth keeping. Five billing checks failed around the cancel
flow and it looked like a broken mutation. It was not, and the first diagnosis — CPU
contention from a second browser — was wrong. Measuring each layer separately:

| Layer | Time |
| --- | --- |
| `POST /api/billing/cancel` | 3 ms |
| `GET /billing` (returns the cancelled page) | 18 ms |
| Browser paints it | **13.4 s** |

The whole 13 seconds was the Google Fonts request hanging before it failed with
`ERR_CONNECTION_RESET`. `main` read as empty that entire time, which is why the mutation
looked broken. **The mutation was never slow, and the check was never flaky — a real
12.6-second stall was being paid on every page load, by every page.** The 15-second budget
had a 1.6-second margin and contention was merely what pushed it over.

After the fix: cancel round-trip 13.4 s → 0.3 s, holding at 0.3–0.5 s under eight busy
loops on four cores. The whole browser suite went from over ten minutes to 28 seconds.

The class: **a fixed timeout that "usually passes" is measuring something, and it is worth
finding out what.** A margin of 1.6 seconds out of 15 is not a passing check, it is a
failing check that has not happened yet.

### D51a — The check is on the origin of the request, not on the markup

A third-party dependency is invisible in the DOM, invisible in the unit tests, and on a fast
developer machine invisible in the browser too. The only thing that catches it is watching
where the requests go, so `tests/browser/rendered-output.py` records every request during
four page loads and fails if any is off-origin, naming the URL.

Its first version had the vacuous-pass defect this project keeps meeting. "Every font file
is served from this origin" was `all(f.startswith(BASE) for f in fonts)` — and during the
deliberate break it **passed**, because the third-party stylesheet never loaded, so the page
declared no font preloads at all, and `all()` of an empty list is true. It now requires that
a font is preloaded *and* that it is local. A check that passes when the thing it measures
is absent is not a check.

### D52 — The CSP was measured, not copied

A strict `script-src 'self'; style-src 'self'` was served in **Report-Only** mode first and
the pages loaded with the browser console captured. Two things violated it, and both
changed the policy that shipped:

| Count | Directive | What it was |
| --- | --- | --- |
| 31 | `script-src` | Next's inline hydration scripts and the theme bootstrap. Their content differs per page, so a hash list cannot work. A nonce is the only mechanism that does. |
| 173 | `style-src` | Inline `style="..."` **attributes**, which React sets for anything computed — a bar's width, a chart's offset. |

The second is the one a copied policy gets wrong. Chromium states it plainly: *"hashes do
not apply to event handlers, style attributes and javascript: navigations"*. No nonce and
no hash can permit a style attribute — only `'unsafe-inline'` can. So the policy carries
`style-src-attr 'unsafe-inline'`, which is the **narrow** form: style attributes only.
`style-src 'self'` still refuses a `<style>` block and any external sheet. One broad
`style-src 'self' 'unsafe-inline'` would have permitted both for the same one requirement.

There is no third-party origin anywhere in the policy. That is only possible because the
font is self-hosted (D51) — a CSP that has to name `fonts.googleapis.com` is a CSP with a
hole in it.

The nonce is read from a request header in the root layout, so every page now renders on
demand. Measured rather than assumed: TTFB on the public calculator is 19–29 ms, and D49's
speed guarantee is about client-side arithmetic, which is untouched.

### D52a — `strict-dynamic` is ON; the bug was in the bundler, and the build moved

`'strict-dynamic'` **ignores `'self'` by design**: a `<script src>` runs only if it carries
the nonce or was loaded by a script that did. That is strictly stronger than `'self'` — an
attacker who can write a `.js` file onto this origin still cannot get it executed — and it
also means one un-nonced tag breaks a page.

Next 16.3.1's **Turbopack** build emits exactly one such tag. Measured rather than guessed:
eleven script tags per page, ten carrying `nonce=`, one not, and always the same one — the
chunk the bundler split the `Button` component into. It appeared on `/billing` and
`/shop-pulse` only, because only there did `Button` land in a chunk of its own.

Nothing reported it. No server error, no hydration warning, no missing markup — the page
silently lost a piece of its JavaScript, and only the browser console knew.

The same source built with **webpack** nonces every tag on every page. So this is a
Turbopack code path, not a policy mistake, and **not something app code can fix**: which
chunk a component lands in is the bundler's decision, so any app-level workaround would be
luck rather than a fix.

| | Turbopack | webpack |
| --- | --- | --- |
| Build time | 19 s | 44 s |
| Un-nonced script tags | 1 (on 2 of 8 pages) | 0 |
| `strict-dynamic` usable | no | yes |

`npm run build` therefore uses `--webpack`. Twenty-five seconds buys the strongest script
directive available, on a product holding OAuth tokens and card details.
`npm run build:turbopack` is kept so re-testing upstream is one command.

Two related traps, both worth stating:

- The nonce must go on the **request** headers as well as the response, under the
  `Content-Security-Policy` key. That is how Next finds it to nonce its own script tags.
  Setting only `x-nonce` compiles, serves a valid-looking policy, and breaks two pages.
- **A policy becoming less strict never fails a check.** The browser checks catch a policy
  the app violates; they cannot catch one that permits too much. Widening is always a
  deliberate decision, which is why the reasoning sits in the file.

### D52b — Check the cause as well as the symptom

Two checks cover this, deliberately overlapping:

- *"No page violates its own CSP"* — the symptom. Reads the browser console during real
  page loads.
- *"Every script tag the app serves carries the CSP nonce"* — the cause. Counts un-nonced
  tags in the **served HTML** and names the offending chunk and pages.

Building with Turbopack fails both, and the second prints
`{'/billing': ['0upzpjnwu9tf1.js'], '/shop-pulse': ['0upzpjnwu9tf1.js']}` — the whole
diagnosis in one line, where the first only says a script was refused.

It counts what is SERVED rather than reading the source, because nothing in the source says
which chunk a component lands in. Same rule as the extension audit (D48): check the
artefact, not the source.

### D53 — Semantic colour is a PAIR, and the pair lives in one place

The first axe run over the finished product found **222 colour-contrast failures across 10
pages**, in a product that had passed every phase's browser check.

The largest group was one mistake repeated: a foreground token that flips with the theme,
painted on a background literal that does not.

```
CRITICAL: { bg: '#FEF2F2', border: '#FECACA', fg: 'var(--danger)' }
```

In light that reads 7.6:1. In dark, `--danger` becomes `#F87171` while `#FEF2F2` stays pale
pink: **2.5:1**. Nothing in the source looks wrong, because each half is individually
reasonable. Only the pairing is wrong, and only in one theme.

So semantic colour is now three tokens per state — `--danger-surface`, `--danger-border`,
`--danger-ink`, and the same for warning and success — defined together in each theme block.
The fg and the bg come from the same block, so they cannot disagree. 71 literals across 12
components were replaced.

**A token used as a BACKGROUND needs a paired "on" token.** `--brand` and `--success` are
painted with text on top, and in dark both are LIGHT colours: `text-white` on them measures
2.98:1 and 1.92:1. `--on-brand` and `--on-success` are white in light and near-black in
dark. 21 `text-white` class strings became `text-brand-on`.

Two token values were changed outright for AA, overriding D1's "copied verbatim from the
canvases, do not re-derive":

| Token | Was | Now | Why |
| --- | --- | --- | --- |
| `--muted-2` light | `#8C7F6C` | `#756A58` | 3.91:1 on white → 5.30:1 |
| `--muted-2` dark | `#64748B` | `#8B9AAE` | 3.07:1 on surface → 5.11:1 |
| `--danger` dark | `#F87171` | `#FA8A8A` | 4.23:1 on a selected (brand-tint) row → 5.06:1 |

D1 says ship the canvas values. It did not anticipate that three of them fail WCAG AA, and
a design decision cannot make text readable that isn't. Recorded here rather than changed
quietly. Every value was **computed**, not eyeballed — candidates were run through a
contrast calculator against every ground they actually sit on.

Result: **222 → 0** WCAG A/AA violations, both themes.

Landmarks and headings, from the same run:

- The skip link and the demo banner sat above every landmark, so landmark navigation reached
  neither — including the notice saying nothing on screen can be published to Etsy. They now
  get one landmark each: a labelled `nav` for the skip link, `role="status"` for the banner.
  Not a shared `role="banner"`, which would have been a *second* banner on the page and its
  own violation. **The fix for a missing landmark must not be another landmark in the wrong
  place.**
- `/billing` went `h1` → `h3`, which reads as a subsection of something that does not exist.
  Plan names are `h2`, siblings of "Billing history". Same `text-section` size, so nothing
  moved on screen.

### D53a — A tab is a state, not a page, and the states are DISCOVERED

Three rounds, because the first two fixes were both wrong in the same direction.

**Round one** audited each route as it loads. A deliberate break proved it hollow: the
original contrast bug was reinstated verbatim in the Transactions table's UNMATCHED pill and
the check **passed** — that pill lives behind a tab nobody had clicked.

**Round two** hard-coded the two /profit tabs. That is the same hole, smaller. A survey found
**34 hidden states across 6 routes** (both themes): three tabs on /dashboard, four on
/profit, three on /action-center, and disclosure panels on four routes. Naming two covered
2 of 34 — and covered nothing anyone adds tomorrow.

**Round three** walks the page and finds them: every `[role=tab]`, every
`[aria-expanded="false"]`. 62 surfaces audited. A tab added next month is covered the day it
ships without anyone remembering this file exists.

The expansion immediately found a real bug the hard-coded version could not see. Dismissed
action cards carried `opacity-[.72]`, which artboard 108 asks for — and which blends every
text colour toward the background. `--ink-2` fell to 4.3:1 and the timestamp line to 2.9:1,
in **both** themes, on /dashboard and /action-center. It had shipped through two phases
because the Dismissed tab is not the tab that opens by default.

**There is no opacity value that fixes it.** The tokens are tuned to just clear AA at full
strength (D53), so any alpha below 1 puts the weakest under — the failure is arithmetic, not
a bad number. The opacity is gone; the dashed border, the "Dismissed …by" line and the
Restore action carry the state, as they already did.

### D53b — Coverage is measured against what the page offered

The sweep counts what the DOM **offered** and what it actually **reached**, and fails when
they differ. Both halves are needed, and neither is a number written in the file:

```
reached == offered                       # every state found was opened
len(routes_with_states) >= 5             # ...and states are still being found
```

The first without the second is satisfied perfectly by a selector that matches nothing:
`0 == 0`. The second is a floor on **breadth** — how many routes hide something — rather
than on a total, because a total moves whenever a card is added, and the honest-looking
response to a number that keeps drifting is to lower it.

It earned its place on the first run: `28/34`. Clicking a provenance button on /dashboard
opens a panel that covers the next button, so three of four states timed out and went
unaudited. Without the guard that reads as a clean pass over a sweep that quietly skipped
six surfaces. The sweep now closes each disclosure before opening the next.

Same rule as D51a and D48, for the fourth time: **a check that passes when the thing it
measures is absent is not a check.**

### D54 — A link that 404s is a promise the product does not keep

A `/settings/export` 404 turned up while surveying hidden UI states. Diffing **every** href
in the source against **every** page that exists found it was not one broken link. It was
**25**, and the four hand-written ones were all on trust surfaces:

| Link | Where | What it promised |
| --- | --- | --- |
| `/settings/export` | next to the revoke control | "you can export or delete it from Export & deletion" — a data-rights claim |
| `/data/methodology` | every provenance drawer | "Open the full methodology →". Eleven anchors, no page |
| `/onboarding/connect` | the demo banner | "Connect my shop" — the one action the banner exists to offer |
| `/listings` | `app/not-found.tsx` | the 404 page's own recovery link was a 404 |

The other 21 were navigation entries. The sidebar advertised 38 surfaces; 17 existed. D21
removed the items that had no *design* so the nav would not look more built than the
product, and missed the other half: items that are listed and have no *page*.

None of this was catchable by typecheck, unit test or browser check. A `<Link>` with a bad
href is valid TypeScript and renders valid HTML. Nothing is wrong until someone clicks — and
nobody clicks the second button on the 404 page.

Fixed by building what was promised rather than deleting the promise:

- **`/settings/export`** — the two wired datasets, each stating what it leaves out. No delete
  button: there is no repository behind one yet, and a button that appears to delete your
  data while doing nothing is the worst thing that page could contain. It gives the route to
  request deletion, which is true today.
- **`/data/methodology`** — generated from `METHODOLOGIES`, not written beside it, so the
  drawer and the page read the same record and cannot drift into describing one metric two
  ways. A methodology page that disagrees with the badge it explains turns one uncertain
  number into two contradictory claims.
- **Nav** — unbuilt items stay visible and stop being destinations, the pattern the Tools
  page already used. The mobile bar was retargeted instead: three of its five tabs were
  dead, and on a phone the bottom bar *is* the navigation, so "Soon" on three of five would
  have been a worse answer than sending each to the real surface behind its intent.

### D54a — The flag is checked against the filesystem, in both directions

`unbuilt` is a claim about the world, so a test compares it to the world:

```
item.unbuilt && exists      → "marked unbuilt, but the page exists"
!item.unbuilt && !exists    → "linked, but there is no page"
```

Both matter. Forgetting the flag puts a 404 back in the sidebar — the original defect, 21
times. Leaving it on after building the page is quieter and arguably worse: the product
grows a feature and the navigation goes on calling it "Soon", so nobody finds it.

A unit test, not a browser check: no server, no build, no browser, so it runs in under a
second and catches a broken link at the moment it is written rather than at the end of a
phase. Broken three ways to confirm — unmark an unbuilt item, mark a built one, and point an
href at nothing; all three caught.

### D55 — What leaks was measured, not assumed

A page and a route were made to throw
`Error('LEAKCANARY sk_live_51ABCDEF… at /home/user/…/lib/etsy/tokens.ts:42')`, and the
production build was inspected end to end. Three findings, only one of which was the one
being looked for.

**Nothing reached the user.** Next strips error detail in production. The 500 page rendered
correctly, the string appeared nowhere in the HTML or the DOM, and the reference shown
matched the digest in the server log. That part was already right.

**The secret reached the log, in full.** stdout on a real deployment is a log aggregator
that keeps it for a year. "Never put secrets in logs" was being kept by luck, not by
anything in the code. Redaction existed — inside `lib/etsy/http.ts`, scoped to Etsy
transport errors. That is the wrong shape: *a credential does not become safe because it
reached the log by a different route.* It now lives in `lib/observability/redact.ts` and is
applied inside the writer, to every field of every line, so no call site can forget it.

**An unhandled route error returned 500 with an empty body and no content-type.** A caller
doing `await response.json()` gets a parse error on top of the original failure and has
nothing to show. The browser extension is exactly such a caller. Every route now answers
with `toUserFacing()` — message, recovery, retryable, reference — and a browser check
asserts the body contains *nothing else*, so a `stack` or a `context` cannot be added later
without failing.

Two things this does **not** claim. Next writes its own unredacted line before
`onRequestError` runs, and that line is not ours to suppress — the structured record is what
a log destination should be configured from. And redaction is the second line of defence,
never the first: the first is not putting a credential in an error message, which is why
`lib/etsy/http.ts` builds errors from status, method and path only.

### D55a — A reference that corresponds to nothing is worse than none

`app/error.tsx` fell back to `makeReference()` when Next supplied no digest: a fresh random
string, labelled "Reference", shown to the user as something to quote — and present in no
log anywhere. It sends someone into a support conversation holding evidence that does not
exist.

The digest is now printed when it exists and the line is omitted when it does not. Verified
both ways: with a digest the value on screen is the same one in the server log
(`digest: '3664705723'`).

Server-side `makeReference()` is unaffected and correct — there the reference is generated
*and logged* with the same value, so it does join the two.

### D55b — Two copies of a status map, both with a silent default

`statusFor` existed twice, in `app/api/billing/_shared.ts` and the export route, each a
`switch` with `default: 500`. They had already drifted: neither listed `EXTERNAL_SERVICE`,
so an Etsy failure during an export reported 500 — "we broke" — for something upstream.

One `Record<ErrorKind, number>` now, which does not compile until every kind has a status
chosen on purpose. That is not theoretical: adding it failed the build immediately over a
missing `BACKGROUND_JOB`. Same rule as D46 — written once, read everywhere — and the
exhaustive record is what makes it enforceable rather than aspirational.

### D55c — The probe stays

`/api/leakprobe` throws a string containing a credential shape and a source path, and the
browser checks assert on the response. It is a fixture, not a leftover: without something
that genuinely fails, the error path is reasoned about rather than exercised, and every
finding above came from exercising it. It refuses in production unless
`ALLOW_ERROR_PROBE=1`.
