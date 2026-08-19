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
| **Net profit** | **`$4,938`** | **Calculated** |

### KPI row (5)
Gross revenue (Verified) · Total costs (Calculated) · Net profit (Calculated) ·
Net margin (Calculated, 26.8%) · Cost coverage (Calculated, 62%)

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
