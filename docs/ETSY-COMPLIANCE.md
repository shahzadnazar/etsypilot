# Etsy API Terms — the position, clause by clause

**Last revised 14 October 2026** (items 5, 11, 12, 18, 22, 24 and 25 re-answered
the same day, after the AI Copilot and the browser extension were removed from
the working tree — D95; every one of them is a stronger answer than the one it
replaces, and none of their positions changed). Checked on every commit by
`tests/unit/etsy-compliance.test.ts`, which fails if anything named in the
Evidence column stops existing.

## How to read this, and what it is not

This document exists so that the position survives a conversation, and so that
a feature added in six months cannot drift across a line nobody remembered.

**The numbering was fetched from <https://www.etsy.com/legal/api/> on
14 October 2026.** It must be re-checked against the live page before the API
application is submitted. Etsy renumbers this list between revisions, and the
first version of this document was written against numbers that turned out to
be wrong for ten of its fourteen rows — the positions and the evidence were
sound and the labels were not, which is exactly the failure a re-check catches.

**Almost none of the clause text is reproduced.** Three rows quote it, each
confirmed word for word against Etsy's own page. Everything else is a one-line
summary of the subject, and is marked as one:

| Marker | Meaning |
|---|---|
| **Verbatim** | Etsy's own words. Three rows carry them, each confirmed against <https://www.etsy.com/legal/api/> on 14 October 2026. |
| **Summary** | A one-line description of what the clause is about, fetched the same day. **Not Etsy's wording, and not quotable.** A summary that looked verbatim would be the same defect as a Verified badge on a modelled figure. |

## What the code shows, and what the owner states

A reviewer reading this document should be able to tell the two apart without
asking, so they are marked.

Everything in the middle column is a property of the code unless it is prefixed
**Owner's statement:**, which means the sentence rests on the owner personally
and no test can speak to it. Three rows carry one, and each carries code
evidence as well — an owner statement is never the whole of a row's answer where
code could say something, and the guard enforces that. They are the sentences
the owner has to stand behind in the application itself:

| Where | What the owner states |
|---|---|
| Section 5, item 11 | There has never been a second Etsy application. |
| Section 5, item 20 | No review of this application has been solicited anywhere. |
| Section 5, Display of Data — retention | The 30-day export window and deletion-on-request are kept by hand. |

The Evidence column is the part that is machine-checked and the part to trust.
A row's position and its evidence stay true even if its number moves — only the
label does.

Where there is genuinely nothing enforcing a position, the Evidence column says
**No mechanism** in those words, and the reason follows. A row whose evidence is
"we do not do that" is a row that will be wrong one day and nobody will know, so
there are none.

## The document's own structure

Ten sections. The Prohibited Behaviors list and the Display of Data
requirements are **both inside Section 5**, not sections of their own — so a
citation of "Section 5" and a citation of an item number name the same place,
and this document says "Section 5, item N" rather than treating them as two.

| § | Heading |
|---|---|
| 1 | License to Use the Etsy API |
| 2 | Your Developer Account |
| 3 | Application Requirements |
| 4 | Your Privacy and Etsy Member Privacy |
| 5 | Use of the Etsy API |
| 6 | Termination |
| 7 | Disclaimer, Indemnification and Release |
| 8 | Feedback |
| 9 | Non-Exclusive and Independent Relationship |
| 10 | Some Finer Legal Points |

---

## The scopes requested, and why each is the minimum

Section 5, item 17 asks for this directly. Four groups are offered on the
connect screen, carrying five distinct Etsy scope strings. The seller sees each
group, what it enables, and what stops working without it, before authorising
anything — `domain/connect/types.ts`, rendered by
`components/connect/scope-list.tsx`.

| Scope | Group | The feature it is the minimum for |
|---|---|---|
| `listings_r` | Read shop & listings — **required** | Nothing in the product works without it. The listings table, the audit's 14 rules, the cost coverage figure and every per-listing margin read the seller's own catalogue. There is no narrower read scope. |
| `shops_r` | Read shop & listings — **required** | The shop's name, currency and the active listing count. Needed to label every figure in the right currency; a product that guessed the currency would misstate profit. |
| `transactions_r` | Orders & financials — recommended | Profit Reality, Shop Pulse, the sales map and the reconciliation export. Receipts are the only source of what a sale actually earned. Declining it leaves those screens with nothing to measure and the product says so rather than estimating. |
| `billing_r` | Orders & financials — recommended | The fee lines — Etsy fees, payment processing, Offsite Ads. Without them net profit is withheld rather than computed from assumed rates: `domain/profit/service.ts` returns null and the waterfall prints Unavailable. |
| `listings_w` | Manage listings — recommended / Inventory updates — optional | The only write the product makes. One method on the whole interface, `applyListingChanges`, and nothing reaches it without the seller confirming a diff. Declining it makes CobaltRank advisory, which the connect screen states. |

Not requested, and deliberately: no `email_r`, no `favorites_*`, no
`feedback_r`, no `profile_*`, no `recommend_*`, no `cart_*`, no `address_*`. The
product shows no buyer identity and has no feature that would read one —
`CANNOT_DO` on the connect screen is the seller-facing form of the same
statement, and `tests/integration/orders-sync.int.ts` sweeps
`information_schema` to prove no column could hold one.

---

## Section 5 — Use of the Etsy API: the 25 Prohibited Behaviors

| Clause | What this product does | Evidence |
|---|---|---|
| **Item 1** — *Summary.* Copying Etsy's core features or bypassing its checkout. | There is no storefront, no cart, no checkout and no payment path between a buyer and a seller. Nothing in the product can take a buyer's money or complete a sale; the only thing it writes to Etsy is a listing field the seller confirmed. | `lib/etsy/interface.ts`, `ETSY_WRITE_METHOD`, `tests/unit/operator-write-boundary.test.ts` |
| **Item 2** — *Summary.* Diverting sales or moving members off Etsy to outside sites. | The product never addresses a buyer. It holds no buyer name, email or address and cannot — the schema has no column for one — so there is nobody to divert. No screen links a buyer anywhere, and the connect screen states the absence in the seller's own words. | `CANNOT_DO`, `tests/integration/orders-sync.int.ts`, `tests/unit/links.test.ts` |
| **Item 3** — *Summary.* Imitating Etsy's look, feel, or branding. | Its own name and its own design tokens. Every surface that mentions Etsy carries the trademark and non-endorsement notice, rendered from one constant rather than retyped, and `/legal/etsy` is a page about exactly what the relationship is and is not. | `TRADEMARK_NOTICE`, `tests/unit/brand.test.ts`, `tests/unit/legal-claims.test.ts` |
| **Item 4** — *Summary.* Practices that harm Etsy's business, reputation, or members. | Nothing reaches a seller's live listings without a confirmed diff, and rollback refuses on a fingerprint mismatch before it reaches the adapter. Staff cannot write to a seller's shop at all: the operator console may write four things, and the guard walks the operator import closure transitively to prove a listing is not one of them. | `tests/unit/operator-write-boundary.test.ts`, `domain/change-history/rollback.ts` |
| **Item 5** — *Summary.* Supporting listings that conflict with Etsy's creativity or prohibited-items rules. | **Nothing in this product writes listing text.** The drafter that did — it was forbidden to write an unverifiable claim ("best", "#1", "guaranteed") or to name another shop or brand, and a draft that broke a rule was rejected rather than repaired — has been removed, and Terms §6 now states that there is no AI feature instead of telling the seller to check generated text. So the product supports no listing content it did not read from the seller's own shop. What remains is the audit, which checks the seller's own fields against 14 mechanical rules and offers no opinion about what may be sold, and one write the seller confirmed field by field. | `AUDIT_RULES`, `tests/unit/audit.test.ts`, `ETSY_WRITE_METHOD` |
| **Item 6** — *Summary.* Enabling unauthorized copying of members' products, photos, or designs. | One shop is readable: the one the seller authorised, enforced by RLS and a ShopContext every repository requires. No competitor listing text is held, no image is ever downloaded or stored — `photoCount` is a number — and the Research screens that would have shown other shops are unbuilt in live mode. | `tests/unit/rls.test.ts`, `tests/unit/signals-boundary.test.ts`, `tests/integration/rls.int.ts` |
| **Item 7** — *Summary.* Compromising the security or integrity of the API or platform. | One client, with a bounded retry, a timeout and no second transport. The API key and secret are server-only and no Etsy value may carry the `NEXT_PUBLIC_` prefix in source or in the env template. CSP, CSRF and step-up re-authentication are each separately tested. | `tests/unit/csp.test.ts`, `tests/unit/csrf.test.ts`, `tests/unit/rate-limit.test.ts`, `tests/unit/two-factor.test.ts` |
| **Item 8** — *Summary.* Tampering with the API or creating safety or security risks. | No route in this product forwards an Etsy response to a caller, so nothing proxies or re-exposes the API. Tokens are encrypted at rest with AES-256-GCM and the schema holds `token_ref` rather than a token, and the logger redacts every field it writes. | `lib/etsy/tokens.ts`, `tests/unit/etsy-token-store.test.ts`, `tests/unit/redact.test.ts` |
| **Item 9** — *Summary.* Reverse engineering the API, or accessing internal or legacy APIs. | One adapter against the documented v3 endpoints, reached through one base-URL constant and one selector. Nothing in the product calls an undocumented path, and swapping the adapter is a one-file change the guard pins. | `ETSY_API_BASE`, `lib/etsy/interface.ts`, `tests/unit/etsy-live.test.ts` |
| **Item 10** — *Summary.* Placing an unreasonable load on the API or platform. | The display windows are the rate limiter: six hours for listings means at most four reads per shop per day however often the seller reloads, one for orders. Concurrent reads collapse to one request in-process and are refused the advisory lock across processes, with the timestamp re-read inside the lock so a serialised retry costs nothing. The client honours `Retry-After` and reads Etsy's own remaining-this-second and remaining-today headers. | `lib/etsy/freshness.ts`, `lib/etsy/http.ts`, `tests/integration/refresh-on-read.int.ts` |
| **Item 11** — *Summary.* Building multiple apps that offer essentially the same services. | This repository is one application: one API key, one redirect URI, one adapter, one selector. There is no second component of any kind — the browser extension that was the only one has been removed from the working tree, so there is not even a switched-off app to argue about. That is all a repository can show. **Owner's statement:** there has never been a second Etsy application. EtsyLens, ShopLens, RankKW and EtsyPilot are earlier names and earlier rebuilds of this same product, not separate applications; none of them ever applied for or held an Etsy API key. CobaltRank is the first and only application, and this will be its first key. | `lib/etsy/index.ts`, `tests/unit/etsy-live.test.ts`, `tests/unit/legal-claims.test.ts` |
| **Item 12** — *Summary.* Including code unrelated to the app's services. | No analytics SDK, no ad SDK, no tracker: all three telemetry adapters are Noop and the guard fails if one stops being. No AI SDK either, which is asserted against `package.json` and against the dependency tree. And there is no component outside the web app at all now: the browser extension was the only one, and the guard fails if any of the five paths it occupied comes back. | `tests/unit/telemetry.test.ts`, `tests/unit/egress-boundary.test.ts`, `tests/unit/legal-claims.test.ts` |
| **Item 13** — *Summary.* Mishandling member data. | No buyer-identifying column exists — the integration suite sweeps `information_schema` and poisons the adapter with real PII strings to prove it. Tokens encrypted, RLS on every table, a ShopContext argument on every repository function so "forgot to scope this query" is a compile error, and every log line redacted. | `tests/integration/orders-sync.int.ts`, `tests/unit/rls.test.ts`, `tests/unit/redact.test.ts`, `lib/etsy/tokens.ts` |
| **Item 14** — *Summary.* Collecting or storing member ID and password combinations. | The product never asks for an Etsy password and has no field that could take one. The connection is OAuth 2.0 with PKCE, the verifier stays in an httpOnly cookie, and the only password in the product is the one for a CobaltRank account — handled by the authentication provider, never hashed or stored here. | `lib/etsy/oauth.ts`, `CANNOT_DO`, `tests/unit/legal-claims.test.ts` |
| **Item 15** — *Summary.* Sending spam or unsolicited marketing, or connecting to ad platforms. | There is no marketing send in the product and the notification settings page says so on screen: transactional only — a finished bulk job, a failed sync, a plan change. No ad or tracking dependency in `package.json`, and no email sender is configured at all on this deployment. | `tests/unit/telemetry.test.ts`, `tests/unit/digest.test.ts`, `lib/telemetry/noop.ts` |
| **Item 16** — *Summary.* Sending order, shipping, or tracking messages to members without written approval. | Nothing is sent to a buyer, and nothing could be: no buyer email, name or address is stored or storable. Email goes only to the account holder, and `emailSenderConfigured()` is false here — which is also why a card-required trial refuses to start rather than taking a card it cannot warn. | `tests/integration/orders-sync.int.ts`, `emailSenderConfigured`, `tests/unit/trial-gate.test.ts` |
| **Item 17** — *Summary.* Requesting more data than the app needs. | Five scope strings in four groups, each named on the connect screen with what it enables and what breaks without it. The table above states why each is the minimum, and seven scope families are not requested at all. The guard asserts the OAuth request and the consent screen describe the same set. | `ETSY_SCOPES`, `CANNOT_DO`, `components/connect/scope-list.tsx` |
| **Item 18** — *Summary.* Transferring or selling API access, credentials, or member data to third parties. | **Shop content has no egress to a third party at all.** It had exactly one — the drafting call the seller initiated — and the drafter has been removed, so the allowlist of every network call in `app/`, `components/`, `domain/` and `lib/` now holds four entries, two to Etsy and two to the authentication provider, none of which carries a listing, an order or a cost. The allowlist is the mechanism rather than the sentence: a fifth destination fails the guard until somebody names it and says what it sends. Tokens never leave the server and are never returned in a response, a redirect or a log. The three export datasets go to the seller who owns them and nowhere else. **When a keyword data provider is configured, listing text must not travel to it**, and the guard fails the day `lib/signals/live.ts` holds both a network call and a shop-content type. | `tests/unit/egress-boundary.test.ts`, `LiveMarketSignalsService`, `tests/unit/export-ungated.test.ts` |
| **Item 19** — *Summary.* Using the API for purposes unrelated to member activity. | Every Etsy request is made for the signed-in seller's own shop and is caused by that seller's own read or action. There is no crawler, no scheduler and no speculative fetch: a read that finds its data outside Etsy's display window is the only trigger, so a shop nobody opens costs no requests at all. | `domain/sync/refresh.ts`, `tests/integration/refresh-on-read.int.ts`, `lib/permissions/index.ts` |
| **Item 20** — *Summary.* Soliciting fake or misleading reviews of an app. | Nothing in the product asks for a review. There is no review prompt, no rating widget and no app-store listing to review, and the link guard enumerates every outbound destination in the product — so a solicitation added later is a visible change rather than a quiet one. That is what the code shows. **Owner's statement:** no review of this application has been solicited anywhere else either, because there is no listing to review — soliciting one is conduct outside this repository and no test can speak to it. | `tests/unit/links.test.ts`, `tests/unit/narrative.test.ts` |
| **Item 21** — *Summary.* Manipulating shop statistics or engagement metrics. | The interface exposes exactly one write and it is a listing field the seller confirmed. There is no favourite, no view, no follow and no engagement action on it at all, so there is no statistic the product could move. Nothing in it writes a number to Etsy. | `lib/etsy/interface.ts`, `ETSY_WRITE_METHOD`, `tests/unit/operator-write-boundary.test.ts` |
| **Item 22** — *Summary.* Charging sellers for features Etsy provides free. | Keyword research came off the Free tier on 13 October 2026, both because it is not built and because Etsy's Marketplace Insights now provides it free. AI title suggestions, which Etsy also now ships free, cannot be a priced feature here either: there is no AI feature in this product at all, and the generation allowances that were advertised on all three tiers came off with it. No tier may advertise either, and the guard holds that. | `tests/unit/etsy-compliance.test.ts`, `domain/billing/plans.ts`, `docs/DECISIONS.md` |
| **Item 23** — *Summary.* Building apps that violate the Terms or Etsy policies. | This document is the mechanism, and it is checked rather than written: every file, test and identifier it names has to exist. The legal documents have their own guard, which compares each factual claim in them against the code, and the verification table records what no test can check. | `tests/unit/etsy-compliance.test.ts`, `tests/unit/legal-claims.test.ts`, `docs/legal/VERIFICATION.md` |
| **Item 24** — **Verbatim.** "Use or promote the use of automated systems or browser extensions to access, analyze, or scrape the Etsy Site, the Etsy API or any Etsy data … unless expressly authorized in writing by Etsy" | **There is no browser extension.** It was built and switched off behind one flag; it has now been removed from the working tree — no settings page, no download route, no manifest, no flag — and `/legal/etsy` states that rather than describing a feature behind a switch. The guard reads the claim against the filesystem: the five paths the extension occupied must not exist, and no module may read its environment variables. Nothing in the product scrapes either — the market-signals module has no sampler and may not grow one, and the Research screens are unbuilt in live mode rather than modelled. | `tests/unit/legal-claims.test.ts`, `app/(public)/legal/etsy/page.tsx`, `tests/unit/signals-boundary.test.ts` |
| **Item 25** — **Verbatim.** "Use the Etsy API to collect, scan, or otherwise request Etsy content for purposes of analytics, machine learning, training artificial intelligence models, licensing, or content removal, unless expressly authorized in writing by Etsy." **The tail is load-bearing**: the clause is a conditional, not a ban, and `components/layout/navigation.ts` quoted from "collect" onward and paraphrased it. The row carries the whole sentence. | **AI training is named in the clause itself**, and the answer is now the strongest form of it: **there is no AI provider in this product, so there is no egress to a model and nothing that could be trained on.** The egress guard asserts all three halves in one place — no network call carries shop content to a third party, no store of shop content exists that is not scoped to a single shop, and nothing inserts into `ai_generations` — so a reader of this row has one file to check rather than an absence to take on trust. The one screen that reads a seller's own receipts is named "Your sales records" rather than analytics and says why on the page. The Research section, which would have been the analytics product, is unbuilt. | `tests/unit/egress-boundary.test.ts`, `tests/unit/research-honesty.test.ts`, `components/layout/navigation.ts` |

---

## Sections 3, 4 and 5 — the requirements rather than the prohibitions

| Clause | What this product does | Evidence |
|---|---|---|
| **Section 3** — *Summary.* Application Requirements, including the warranty disclaimer an Application must carry. | `/legal/etsy` carries the warranty disclaimer by rendering it from the Terms of Service rather than keeping a second copy, so the two cannot drift apart; the guard fails if it stops doing that. The same page states that no authorisation has been asked for or given where none has, rather than implying one. | `tests/unit/legal-claims.test.ts`, `app/(public)/legal/etsy/page.tsx`, `tests/unit/legal-pages.test.ts` |
| **Section 4** — *Summary.* Your Privacy and Etsy Member Privacy — including Application Terms executed with each Etsy seller. | A real acceptance, recorded per shop against a content-hash version of the documents, append-only, RLS on. It gates the connect path **and** every sync, so a seller whose documents have changed materially is asked again before any further Etsy data is read. On this deployment the documents still carry `[[LEGAL_ENTITY]]`, so nothing may be read for anyone — the gate refuses rather than softening. | `domain/legal/acceptance.ts`, `tests/unit/legal-acceptance.test.ts`, `tests/integration/terms-acceptance.int.ts` |
| **Section 5**, Display of Data — **Verbatim.** "You will not display listing content more than six (6) hours older than the corresponding information … You will not display any other Etsy content more than twenty-four (24) hours older" | Enforced at the display decision, not on a schedule. An aggregate outside its window is withheld — the rows are not handed to any surface — and the screen says how old the copy is, which window it broke, and re-reads the shop. No cron, no queue: a read that finds stale data is the trigger. | `lib/etsy/freshness.ts`, `tests/unit/freshness-window.test.ts`, `tests/integration/refresh-on-read.int.ts`, `tests/browser/freshness-window.py` |
| **Section 5**, Display of Data — *Summary.* Content accessed, stored or displayed may not be cached or stored longer than is reasonably necessary to serve the Application's users. | The mirrored copy is kept while the account is open, and Privacy §5 says so and says why: every figure the product shows is recalculated from that copy on each request, so the copy **is** the historical reporting the seller pays for. Nothing derived is stored — five tables exist for it and none has an insert site. Closing the account deletes it. | `docs/legal/PRIVACY-POLICY-DRAFT.md`, `tests/unit/legal-claims.test.ts` |
| **Section 5**, Display of Data — *Summary.* The same retention requirement, taken as a question about mechanism rather than about position: is there anything that deletes an expired record? | **Nothing deletes anything on a schedule.** Per-plan audit-record retention is defined and displayed, and no job applies it; there is no account-closure flow. Both are stated as such on the surfaces that print them and in `[[CONFIRM]]` notes in Privacy §5. **Owner's statement:** the 30-day export window after account closure, and the deletion of data on request within 30 days, are operational promises the owner keeps by hand. Nothing in the code performs either, and Privacy §6 says so rather than implying a button. | **No mechanism** — recorded in `docs/legal/VERIFICATION.md` as an outstanding item, with the surfaces that disclose it. |

---

## What is deliberately not built, and the clause each absence answers

| Not built | The clause it answers |
|---|---|
| Any sampler, scraper or crawler of the Etsy site | Section 5, item 24. `tests/unit/signals-boundary.test.ts` fails if `lib/signals` grows one. |
| The five Research screens, in live mode | Items 24 and 25, until a bought keyword source exists. The intended source is clickstream data that never touches Etsy, and `lib/signals/index.ts` holds the empty seam. |
| The browser extension | Item 24. Built, finished, and then removed from the working tree rather than left behind a flag — `tests/unit/legal-claims.test.ts` fails if any of its paths return. It is on the `with-ai-and-extension` branch if Etsy ever authorises one. |
| Any AI feature at all, and therefore any store of prompts and model outputs | Item 25, and the no-training promise in Terms §6 and Privacy §3, which outlives the feature. `ai_generations` still exists — an applied migration is never edited — and nothing writes it; `tests/unit/egress-boundary.test.ts` holds that, and that no provider SDK is a dependency. |
| Competitor revenue figures, keyword volumes, "estimated" anything presented as measured | Items 6 and 21, and the product's own rule against shipping an estimate dressed as a measurement. |
| Any buyer-facing surface at all | Items 1, 2 and 16. There is no buyer in this product. |
