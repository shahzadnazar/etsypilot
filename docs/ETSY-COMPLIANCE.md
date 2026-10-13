# Etsy API Terms — the position, clause by clause

**Last revised 13 October 2026.** Checked on every commit by
`tests/unit/etsy-compliance.test.ts`, which fails if anything named in the
Evidence column stops existing.

## How to read this, and what it is not

This document exists so that the position survives a conversation, and so that
a feature added in six months cannot drift across a line nobody remembered.

**It does not reproduce Etsy's clause text.** Two of the rows below quote it,
because the repository holds those quotations where they are enforced. The rest
state the subject of the clause as this repository understands it, each marked
with where that understanding came from:

| Marker | Meaning |
|---|---|
| **Verbatim** | The clause is quoted in the codebase at the file named, and the quotation came from Etsy's own page. |
| **From the brief** | The subject was stated by the owner, who had the terms open. |
| **Subject unconfirmed** | This repository does not hold the clause text. The subject is the best reading available here, and **the item number must be checked against the current revision of the terms before this document is relied on.** Etsy renumbers this list between revisions. |

The Evidence column is the part that is machine-checked and the part to trust.
A row's position and its evidence stay true even if its number turns out to
belong to a different clause — only the label moves.

Where there is genuinely nothing enforcing a position, the Evidence column says
**No mechanism** in those words, and the reason follows. A row whose evidence is
"we do not do that" is a row that will be wrong one day and nobody will know, so
there are none.

---

## The scopes requested, and why each is the minimum

Item 17 asks for this directly. Four groups are offered on the connect screen,
carrying five distinct Etsy scope strings. The seller sees each group, what it
enables, and what stops working without it, before authorising anything —
`domain/connect/types.ts`, rendered by `components/connect/scope-list.tsx`.

| Scope | Group | The feature it is the minimum for |
|---|---|---|
| `listings_r` | Read shop & listings — **required** | Nothing in the product works without it. The listings table, the audit's 14 rules, the cost coverage figure and every per-listing margin read the seller's own catalogue. There is no narrower read scope. |
| `shops_r` | Read shop & listings — **required** | The shop's name, currency and the active listing count. Needed to label every figure in the right currency; a product that guessed the currency would misstate profit. |
| `transactions_r` | Orders & financials — recommended | Profit Reality, Shop Pulse, the sales map and the reconciliation export. Receipts are the only source of what a sale actually earned. Declining it leaves those screens with nothing to measure and the product says so rather than estimating. |
| `billing_r` | Orders & financials — recommended | The fee lines — Etsy fees, payment processing, Offsite Ads. Without them net profit is withheld rather than computed from assumed rates: `domain/profit/service.ts` returns null and the waterfall prints Unavailable. |
| `listings_w` | Manage listings — recommended / Inventory updates — optional | The only write the product makes. One method on the whole interface, `applyListingChanges`, and nothing reaches it without the seller confirming a diff. Declining it makes CobaltRank advisory, which the connect screen states. |

Not requested, and deliberately: no `email_r`, no `favorites_*`, no `feedback_r`,
no `profile_*`, no `recommend_*`, no `cart_*`, no `address_*`. The product shows
no buyer identity and has no feature that would read one — `CANNOT_DO` on the
connect screen is the seller-facing form of the same statement, and
`tests/integration/orders-sync.int.ts` sweeps `information_schema` to prove no
column could hold one.

---

## Prohibited Behavior

| Clause | What this product does | Evidence |
|---|---|---|
| **Item 2** — *Subject unconfirmed.* Misrepresenting the Application, or its relationship to Etsy. | Every seller-facing surface that mentions Etsy carries the trademark and non-endorsement notice, from one constant rather than retyped. The product never describes itself as an Etsy product, and `/legal/etsy` is a page about exactly what the relationship is. | `TRADEMARK_NOTICE`, `app/(public)/legal/etsy/page.tsx`, `tests/unit/legal-claims.test.ts` |
| **Item 5** — *Subject unconfirmed.* Selling, licensing or redistributing API data or member data. | Nothing leaves this product except to the seller who owns it. Three export datasets, each scoped to the session's own shop, served to that seller as a file. There is no data sale, no syndication, no partner feed, and no second reader of the mirror tables. | `tests/unit/export-ungated.test.ts`, `domain/export/datasets.ts`, `tests/unit/rls.test.ts` |
| **Item 10** — *Subject unconfirmed.* Using Etsy data outside the Application, or for a purpose the seller did not authorise. | Shop content has exactly one egress to a third party — the drafting call the seller initiates — and nothing stores it where it could be pooled. Every other network call in the product carries a credential or talks to Etsy. | `tests/unit/no-training.test.ts`, `lib/ai/provider-terms.ts` |
| **Item 11** — *Subject unconfirmed.* Circumventing rate limits, or the API's technical controls. | The client honours `Retry-After` on 429 and reads Etsy's own remaining-this-second and remaining-today headers. There is no parallel key, no retry storm and no second transport: one client, with a bounded retry and a timeout. The refresh windows are themselves the limiter — at most four listings reads per shop per day. | `lib/etsy/http.ts`, `tests/unit/etsy-live.test.ts`, `lib/etsy/freshness.ts` |
| **Item 13** — *Subject unconfirmed.* Sending unsolicited or marketing messages to Etsy members. | No message is sent to anybody but the account holder, and only transactionally. There is no marketing send in the product and the notification settings page says so on screen. No buyer email is read, stored or storable. | `lib/telemetry/noop.ts`, `tests/unit/telemetry.test.ts`, `tests/unit/digest.test.ts` |
| **Item 14** — *Subject unconfirmed.* Storing credentials insecurely, or exposing them. | Refresh and access tokens are encrypted at rest with AES-256-GCM; the schema has `token_ref` and no plaintext token column. No Etsy value may carry the `NEXT_PUBLIC_` prefix, in source or in the env template, and the logger redacts every field it writes. | `lib/etsy/tokens.ts`, `tests/unit/tokens.test.ts`, `tests/unit/etsy-token-store.test.ts`, `tests/unit/redact.test.ts` |
| **Item 15** — *Subject unconfirmed.* Accessing an account or shop the user did not authorise. | A shop id is never read from a request. `shopContext` is the only way to build the argument every repository requires, and it throws unless the session's own shop is the one asked for. RLS is on every table. | `lib/permissions/index.ts`, `tests/unit/rls.test.ts`, `tests/integration/rls.int.ts` |
| **Item 16** — *Subject unconfirmed.* Modifying, reverse-engineering or wrapping the API. | One adapter, written against one interface, reachable only through one selector. Nothing proxies the Etsy API outward: there is no route in this product that forwards an Etsy response to a caller. | `lib/etsy/interface.ts`, `lib/etsy/index.ts`, `tests/unit/etsy-live.test.ts` |
| **Item 17** — *From the brief.* Requesting more scope than the Application's features need. | Five scope strings in four groups, each named on the connect screen with what it enables and what breaks without it. The table above states why each is the minimum. Seven scope families are not requested at all. | `ETSY_SCOPES`, `CANNOT_DO`, `components/connect/scope-list.tsx` |
| **Item 19** — *Subject unconfirmed.* Publishing or changing a seller's listings without their instruction. | One write method on the whole interface, and two callers: apply and rollback. Both refuse on a fingerprint mismatch before reaching the adapter. The operator console may write exactly four things and a listing is not one of them — proved by walking the operator import closure transitively. | `tests/unit/operator-write-boundary.test.ts`, `ETSY_WRITE_METHOD`, `domain/change-history/rollback.ts` |
| **Item 21** — *Subject unconfirmed.* Presenting Etsy data as the Application's own, or without its provenance. | Every figure on every screen carries a provenance class — VERIFIED, CALCULATED, ESTIMATED, SELLER_INPUT, UNAVAILABLE — and the class is read from the adapter that produced it rather than written down. `/data/sources` is the catalogue, and it reports what each adapter actually is. | `tests/unit/source-claims.test.ts`, `tests/unit/provenance.test.ts`, `domain/data-sources/service.ts` |
| **Item 22** — *From the brief.* "Charging sellers for Application features that Etsy provides free of charge." | Keyword research came off the Free tier on 13 October 2026, both because it is not built and because Etsy's Marketplace Insights now provides it free. AI **title** suggestions, which Etsy also now ships free, are not a priced feature either; descriptions and tags, which Etsy does not generate, are what the drafter is for. No tier may advertise either. | `tests/unit/etsy-compliance.test.ts`, `domain/billing/plans.ts`, `docs/DECISIONS.md` |
| **Item 24** — **Verbatim.** "Use or promote the use of automated systems or browser extensions to access, analyze, or scrape the Etsy Site, the Etsy API or any Etsy data … unless expressly authorized in writing by Etsy" | The extension is built and switched off at one switch: middleware rewrites its paths so the settings page and both download routes 404. Nothing in the product scrapes: the market-signals module has no sampler and may not grow one, and the Research screens are unbuilt in live mode rather than modelled. | `lib/extension/availability.ts`, `tests/unit/extension-gate.test.ts`, `tests/unit/signals-boundary.test.ts` |
| **Item 25** — *From the brief.* Requesting Etsy content for analytics, machine learning, licensing or content removal without written authorisation. | The one screen that reads a seller's own receipts is named "Your sales records", not analytics, and the page states why. No Etsy content trains anything — one egress, no corpus. The Research section, which would have been the analytics product, is unbuilt. | `tests/unit/no-training.test.ts`, `tests/unit/research-honesty.test.ts`, `components/layout/navigation.ts` |

---

## Sections 3, 4 and 5

| Clause | What this product does | Evidence |
|---|---|---|
| **Section 3** — *Subject unconfirmed.* The Application's own obligations: security, accuracy, and keeping the key confidential. | The API key and secret are server-only, read from the environment, never in a response, a redirect or a URL the browser sees. CSP, CSRF and the step-up re-authentication path are each separately tested. Nothing in the bundle can reach an Etsy credential. | `tests/unit/csp.test.ts`, `tests/unit/csrf.test.ts`, `tests/unit/etsy-live.test.ts`, `tests/unit/two-factor.test.ts` |
| **Section 4** — Application Terms executed with each Etsy seller. | A real acceptance, recorded per shop against a content-hash version of the documents, append-only, RLS on. It gates the connect path **and** every sync: a seller whose documents have changed materially is asked again before any further Etsy data is read. On this deployment the documents still carry `[[LEGAL_ENTITY]]`, so nothing may be read for anyone — the gate refuses rather than softening. | `domain/legal/acceptance.ts`, `tests/unit/legal-acceptance.test.ts`, `tests/integration/terms-acceptance.int.ts` |
| **Section 5**, display window — **Verbatim.** "You will not display listing content more than six (6) hours older than the corresponding information … You will not display any other Etsy content more than twenty-four (24) hours older" | Enforced at the display decision, not on a schedule. An aggregate outside its window is withheld — the rows are not handed to any surface — and the screen says how old the copy is, which window it broke, and re-reads the shop. No cron, no queue: a read that finds stale data is the trigger. | `lib/etsy/freshness.ts`, `tests/unit/freshness-window.test.ts`, `tests/integration/refresh-on-read.int.ts`, `tests/browser/freshness-window.py` |
| **Section 5**, retention — "you will not cache or store it longer than is reasonably necessary to provide service to your Application's users". | The mirrored copy is kept while the account is open, and Privacy §5 says so and says why: every figure the product shows is recalculated from that copy on each request, so the copy **is** the historical reporting the seller pays for. Nothing derived is stored — five tables exist for it and none has an insert site. Closing the account deletes it. | `docs/legal/PRIVACY-POLICY-DRAFT.md`, `tests/unit/legal-claims.test.ts` |
| **Section 5**, retention — a pruner that deletes expired records. | **Nothing deletes anything on a schedule.** Per-plan audit-record retention is defined and displayed, and no job applies it; there is no account-closure flow, so the 30-day export window after closure is an operational promise rather than a mechanism. Both are stated as such on the surfaces that print them and in `[[CONFIRM]]` notes in Privacy §5. | **No mechanism** — recorded in `docs/legal/VERIFICATION.md` as an outstanding item, with the surfaces that disclose it. |

---

## What is deliberately not built, and the clause each absence answers

| Not built | The clause it answers |
|---|---|
| Any sampler, scraper or crawler of the Etsy site | Item 24. `tests/unit/signals-boundary.test.ts` fails if `lib/signals` grows one. |
| The five Research screens, in live mode | Items 24 and 25, until a bought keyword source exists. The intended source is clickstream data that never touches Etsy, and `lib/signals/index.ts` holds the empty seam. |
| The browser extension, on every live surface | Item 24. Built, finished, and off at one switch until Etsy answers. |
| A store of prompts and model outputs | The no-training promise in Terms §6 and Privacy §3. `ai_generations` exists and nothing writes it. |
| Competitor revenue figures, keyword volumes, "estimated" anything presented as measured | Item 21. The product says UNAVAILABLE rather than modelling. |
