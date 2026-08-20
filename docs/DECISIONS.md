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
