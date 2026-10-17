# CobaltRank — design system

**Two palettes, one set of token names.** This is the first thing to know about
this file, because the mismatch it documents is the reason it exists.

| Where | Palette | Defined in |
|---|---|---|
| Public pages — `/`, `/pricing` | **Indigo on slate.** The approved brand. | `styles/marketing.css`, under `.marketing` |
| The product behind the login — dashboard, operator console | **Terracotta on cream.** Unchanged. | `styles/globals.css`, under `:root` |

Both define the *same variable names*, so every shared component renders in
whichever palette the subtree it lands in defines, and no component knows which
one it is in. A card on the landing page and the same card on `/profit` are the
same code.

`tests/unit/design-tokens.test.ts` compares the hex values in this document
against the two stylesheets, in both directions. A value changed in one place
and not the other fails the suite.

---

## 1. Brand colours — the public pages

These are the final values. The earlier Stitch export carried `#2A14B4` as
primary and `#FFF8F7` as the surface in its front-matter while its own prose
and HTML used the values below; those two are **obsolete and must not come
back**.

| Token | Hex | Purpose |
|---|---|---|
| `--brand` | `#4338CA` | Primary. Buttons, active navigation, selected states, primary trend lines. |
| `--brand-strong` | `#3730A3` | Hover and pressed states for primary controls. |
| `--brand-tint` | `#EEF2FF` | Soft indigo fills: eyebrow pills, selected rows. |
| `--on-brand` | `#FFFFFF` | Text and icons on a `--brand` fill. 8.6:1. |
| `--ink-1` | `#1E1B1B` | Charcoal. Headings and key metrics. |
| `--ink-2` | `#334155` | Body copy. |
| `--muted-1` | `#64748B` | Secondary metrics, column headings, metadata. |
| `--muted-2` | `#94A3B8` | Placeholder text, disabled labels. |
| `--page-bg` | `#F8FAFC` | The page. Cool slate. |
| `--canvas-soft` | `#F1F5F9` | Alternating section bands, table headers. |
| `--surface` | `#FFFFFF` | Cards, dropdowns, table rows. |
| `--border` | `#E2E8F0` | Resting hairlines. |
| `--border-strong` | `#CBD5E1` | Hover, selected, and overlay edges. |

### Semantic colours, and the one place this document is read carefully

Gains are emerald and losses are crimson. Each has **two** tokens, and the
distinction is not cosmetic:

| Token | Hex | Use |
|---|---|---|
| `--success-mark` | `#10B981` | Chart lines, fills, 10px indicators. |
| `--success` / `--success-ink` | `#047857` | **Any success text.** |
| `--danger-mark` | `#EF4444` | Chart lines, fills, indicators. |
| `--danger` / `--danger-ink` | `#B91C1C` | **Any loss or error text.** |
| `--warning` | `#C65D24` | Burnt orange. Opportunity flags and high-priority notices only. |

`#10B981` measures 2.5:1 on white and `#EF4444` measures 3.8:1 — both below the
4.5:1 WCAG AA needs for body text. Using them for words would put profit and
loss, the two numbers this product exists to state clearly, in the two least
readable colours on the page. The chip specs further down this document already
pair the dark values with tinted backgrounds; the split simply makes that the
rule rather than a habit.

Burnt orange is **never** a decorative field. It flags one thing at a time.

### Dark

The product ships a theme toggle in the root layout, and it applies to the
public pages too. The approved design is light; the dark blocks in
`styles/marketing.css` exist so that a visitor who has already chosen dark — or
whose system is dark and who has chosen nothing — is not served charcoal text on
a slate-900 page. Same hues, raised for contrast.

There are **two** of them, one for `:root[data-theme='dark']` and one inside
`@media (prefers-color-scheme: dark)`, because CSS has no way to share a block
between the two. `styles/globals.css` has carried that same duplication since
the toggle shipped, and `tests/unit/design-tokens.test.ts` holds the marketing
pair to the same text, character for character — a token defined in one and not
the other produces no build error and an unreadable page.

---

## 2. Brand colours — the product

Unchanged by the landing-page work, listed so this document describes the whole
system rather than half of it. Full values in `styles/globals.css`.

| Token | Light | Dark |
|---|---|---|
| `--brand` | `#B4472A` | `#E07A4A` |
| `--ink-1` | `#241B12` | `#F1F5F9` |
| `--page-bg` | `#FBF8F3` | `#0F172A` |

---

## 3. Typography

| Role | Face | Where |
|---|---|---|
| Display — headlines, section headings | **Petrona** (`--font-display`) | Public pages only |
| Figures — every number on a public page | **IBM Plex Mono** (`--font-mono`), tabular | Public pages only |
| Body and the entire product UI | **Inter** (`--font-sans`) | Everywhere |

Both display faces are fetched at build time and served from this origin. The
CSP carries no third-party font origin, and a render-blocking request to a font
CDN is a blank page on any network that cannot reach it.

The Stitch export specified Plus Jakarta Sans for headings. Petrona was already
in place for the display voice and is kept: the page is a financial document,
not a product launch, and swapping it would have been a redesign rather than an
implementation. Sizes and the tight negative tracking follow the export.

Scale: `app/globals` sets `caption 11 · label 12 · small 13 · body 14 · section
18 · page 26 · metric 30 · display 36`, in `tailwind.config.ts`.

---

## 4. Shape and spacing

| | |
|---|---|
| Controls — buttons, inputs, badges | **8px** (`--paper-radius`) |
| Cards, panels, tables | **12px** (`--card-radius`) |
| Page gutter | 16px mobile, 24px tablet and up |
| Section rhythm | 64px mobile, 80px desktop |
| Maximum content width | 1180px |

Tap targets are at least 24×24 (WCAG 2.2 SC 2.5.8) and interactive controls on
a form are 44px high on mobile, 38px from `md` up.
`tests/unit/tap-targets.test.ts` enforces the first of those.

---

## 5. Elevation

Hairlines do the structural work; shadow is reserved for things that genuinely
float.

| Level | Use | Value |
|---|---|---|
| 0 | Page canvas | none |
| 1 | Cards and section containers | `0 1px 3px 0 rgba(15,23,42,.04), 0 1px 2px -1px rgba(15,23,42,.02)` |
| 2 | Dropdowns and overlays | `0 4px 6px -1px rgba(15,23,42,.06), 0 2px 4px -2px rgba(15,23,42,.04)` |

---

## 6. Components

**Buttons.** Primary is solid `--brand` with `--on-brand` text, 8px radius,
40px tall (32px small). Hover `--brand-strong`. Focus is a 2px `--brand`
outline at 2px offset — set once in `styles/marketing.css` for every link,
button, input and summary on the page, so no component can forget it.

**Secondary** is `--surface` with a `--border` hairline and `--ink-1` text;
hover fills `--canvas-soft` and darkens the border to `--border-strong`.

**Data cards.** `--surface`, 1px `--border`, 12px radius. Metric label in
`--muted-1`, uppercase, 11px. Value in the display face, charcoal, tabular.

**Trend pills.** Tinted background at 10%, dark semantic text: `--success-ink`
on `--success-surface`, `--danger-ink` on `--danger-surface`.

**Tables.** Header `--canvas-soft` with a `--border` bottom rule; rows 48px on
`--surface`; hover fills `--canvas-soft`. Every figure tabular.

---

## 7. Rules that outrank the design

These come from the product, not from the design system, and the landing page
is held to them by `tests/unit/source-claims.test.ts`,
`tests/unit/legal-claims.test.ts` and `tests/unit/landing-page.test.ts`.

1. **No figure without its provenance.** Any number shown as product output
   carries a provenance badge or an explicit label saying it is illustrative.
2. **No invented source.** Nothing on a public page may name a data source the
   product does not have. Etsy publishes no keyword search volume, to anybody,
   so no screen states one as measured.
3. **No invented proof.** No testimonials, no user counts, no star ratings, no
   press logos, until they exist.
4. **Legal pages are linked through the gate**, never directly, while the
   documents carry placeholders (`components/legal/legal-links.tsx`).
5. **Negative money is shown negative**, in `--danger`, never clamped to zero.
6. **No invented domain.** The canonical link, both social cards, the sitemap
   and robots.txt's `Sitemap:` line are omitted entirely until
   `NEXT_PUBLIC_APP_URL` is set, rather than pointing at a host this deployment
   does not control (`lib/seo/site.ts`, `tests/unit/seo.test.ts`).
7. **No invented company.** The footer reads `© <year> CobaltRank` and stops
   there. There is no registered entity yet — the legal documents carry
   `[[LEGAL_ENTITY]]` as a marked blank for the same reason.
