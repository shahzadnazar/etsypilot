# Legal claim verification

Both documents in this folder say, at the top:

> Every factual claim below was written to match what the software actually does — if the software
> changes, this document must change with it.

And the Privacy Policy's note 7 to the reviewing lawyer says of §8:

> It is true of the code today and enforced by a test. It must be re-verified before each release,
> and removed from this document the moment it stops being true.

This file is how that is done. It records, claim by claim, what was checked, what the evidence is,
whether a test holds it in place, and who owns the claims no test can settle. It exists because
"re-verify before each release" is an instruction nobody follows twice unless the previous answer
is written down.

**A green test suite is not the same as a true document.** Roughly half of what either document
says is not a claim about code at all — a lawful basis, a governing law, a retention process, a
sub-processor's region. Those are the lawyer's and the operator's, and they are listed here rather
than quietly omitted, so the gap between *tested* and *true* stays visible.

---

## How to re-verify, before each release

```sh
npx vitest run tests/unit/legal-claims.test.ts   # the document-to-code guard
npm test                                          # the suites it delegates to
npm run test:integration                          # the database-level claims (needs DATABASE_URL)
```

`tests/unit/legal-claims.test.ts` reads the markdown in this folder and compares it to the code. It
is not a style check: each test names the section it defends and fails with a sentence a
non-engineer can act on. It found three false statements and two undisclosed cookies on its first
run, which is the only reason to trust it at all.

Three suites carry claims this guard delegates to rather than re-implementing:

| Suite | What it actually proves |
|---|---|
| `tests/unit/operator-write-boundary.test.ts` | Staff cannot write seller data: the allowlist, and the operator import closure walked transitively |
| `tests/unit/rls.test.ts`, `tests/integration/rls.int.ts` | Row-level security is enabled on every declared table, and enforced by the database |
| `tests/integration/orders-sync.int.ts` | No buyer-identifying data reaches any table — an `information_schema` sweep plus a PII-poisoning run |

---

## Verdicts used below

| Verdict | Meaning |
|---|---|
| **TESTED** | True of the code, and a test fails if it stops being true |
| **VERIFIED** | True of the code, read and confirmed this pass, but nothing stops it drifting |
| **CORRECTED** | Was false or misleading as drafted. The document was changed this pass |
| **NARROWED** | Was true but broader than the code. The document now says the smaller true thing |
| **OPEN GAP** | The document is accurate only because it was narrowed. Closing it needs code |
| **NOT CODE** | Not a claim about software. Owned by the lawyer or the operator, not by a test |
| **WITHDRAWN** | The document said it and no longer does, because it was not true of the code |
| **SUPERSEDED** | Was true and verified when written. The feature it described has since been removed, so the claim has no subject — kept rather than deleted, because "this was checked and then the subject went" is a different fact from "this was never true" |

---

## Privacy Policy

| § | Claim | Verdict | Evidence / owner |
|---|---|---|---|
| 1 | Controller for account data, processor for shop data | NOT CODE | Lawyer. The code cannot tell you which hat you wear |
| 2 | Password hashed, never seen by us; handled by an authentication provider | VERIFIED | Supabase Auth (`@supabase/supabase-js`). No `bcrypt`, `argon2` or `scrypt` anywhere in the repo — nothing here hashes a password because nothing here receives one |
| 2 | Shop data: name, currency, timezone, listings (titles, descriptions, tags, prices, stock, variations), orders (line items, quantities, prices, totals), fee lines | VERIFIED | `db/schema/index.ts` — `shops`, `listings`, `listing_variations`, `orders`, `order_items` |
| 2 | No buyer names, emails, addresses, messages or gift notes; two-letter country code only | **TESTED** | `tests/integration/orders-sync.int.ts` sweeps `information_schema` and poisons the adapter with real PII strings; `legal-claims` re-asserts both the sweep and the `orders` columns |
| 2 | The AI helper sends a listing's title and tags to an AI provider | **SUPERSEDED**, 14 October 2026 | Was absent entirely; `lib/ai/prompt.ts` put `CURRENT TITLE` and `CURRENT TAGS` in the prompt and `lib/ai/claude.ts` called `messages.create`, so it was added and guarded. **SUPERSEDED 14 October 2026 (D95):** the AI Copilot has been removed from the working tree. There is no provider, no prompt and no call, so the claim has no subject — §2 now states the absence instead, and `tests/unit/egress-boundary.test.ts` holds it against every network call in the product |
| 2 | Each AI draft is stored — input, output, listing, actor, accepted or rejected | **WITHDRAWN**, 12 October 2026 | This row was wrong, and it was wrong in the direction that over-discloses. `ai_generations` exists in `db/schema/index.ts` with exactly those columns and **nothing inserts into it** — `grep -r "insert(schema.aiGenerations" lib domain app` returns nothing. The earlier pass verified the SCHEMA and assumed the WRITE, which is the twelfth recorded instance in this repo of checking one property and taking its neighbour on trust. Privacy §2 and §5 now say drafts are not kept |
| 2 | The extension reads the page address and sends a listing id, nothing else | **SUPERSEDED**, 14 October 2026 | Was absent from the Privacy Policy and *denied* by Terms §4; `extension/src/content.ts` was one statement: `respond({ listingId: listingIdFromUrl(location.href), url: location.href })`. **SUPERSEDED 14 October 2026 (D95):** the extension has been removed from the working tree. §2 and Terms §4 both say there is none and say it was removed rather than switched off, and `tests/unit/legal-claims.test.ts` fails if any of the five paths it occupied comes back |
| 2 | Waitlist: email, shop URL, and which part of the page you signed up from | **CORRECTED** | The `source` column was undisclosed. `waitlist_signups` in `db/schema/index.ts` |
| 2 | OAuth token stored encrypted | **TESTED** | `lib/etsy/tokens.ts` uses `aes-256-gcm`; the schema has `token_ref` and no `access_token`/`refresh_token` column |
| 2 | Server logs hold IP, browser and timestamps | NOT CODE | Operator. This is the hosting provider's log, not ours — confirm what it retains and for how long |
| 3 | Lawful bases per category | NOT CODE | Lawyer |
| 3 | Payment data is processed to bill you | **NARROWED** | No payment provider is connected on this deployment. **Correcting this row's earlier wording:** a Stripe adapter does exist, at `lib/billing/stripe.ts`, and every method of it except webhook signature verification refuses with a stated reason until a key and a shop→customer mapping arrive. `paymentProviderConfigured()` in `lib/billing/index.ts` is the one condition that decides, and `/legal/subprocessors` reads it so the public page cannot say "not in use" once it is switched on |
| 3 | No advertising, no sale of data, no AI training on your content | **TESTED**, 13 October 2026 | Was VERIFIED by reading: no ad or tracking dependency in `package.json`, all three telemetry adapters `Noop`. The promise itself is now guarded. `tests/unit/no-training.test.ts` proved shop content had exactly one egress — every network call in the product on a named allowlist with its destination, exactly one of them both reaching a third party and touching a shop-content type — and that no store of shop content exists that is not scoped to a single shop. `ai_generations` still has no insert site. The logs and the telemetry call sites are swept too, because a listing title in a log line is the quietest corpus available. **SUPERSEDED 14 October 2026 (D95):** the guard is now `tests/unit/egress-boundary.test.ts` — renamed because the egress allowlist is a statement about the whole product rather than about a feature — and the allowlist is one entry shorter: **no** network call carries shop content to a third party, and no AI provider SDK is a dependency. The promise is unchanged and the evidence is stronger |
| 3 | "that provider does not train on it either" | **WITHDRAWN**, 14 October 2026 | A claim about Anthropic's terms, which no code can check; a guard that pretended to would make the sentence look checked. `lib/ai/provider-terms.ts` records the provider, the document the sentence rests on, its address, and whether a person has read the clause — and `/data/sources` renders it, so "relied upon" is never displayed as "checked". The guarded part was that the record described the provider the adapter actually imported, so a provider swap failed the guard until somebody read the new one's terms. `clauseRecordedBy` was never filled in. **SUPERSEDED 14 October 2026 (D95):** **the sentence is gone from §3, and so is the thing it vouched for.** There is no provider, so there is no third party whose terms the document relies on — which is why this is the one row here that closed by deletion rather than by verification, and why the last unverified sentence in either document is no longer unverified but absent. `lib/ai/provider-terms.ts` is on `with-ai-and-extension` |
| 4 | Sub-processor table — the keyword data provider | **ADDED**, 13 October 2026 | A row for the bought keyword data source the owner intends to buy after the Etsy key is approved. Nothing is bought, so `lib/legal/subprocessors.ts` resolves it NOT IN USE from `keywordDataProviderConfigured()` and the page says why — and moves it to "in use, not yet named" the moment a deployment configures one, measured rather than written down. Verified in a browser on a third server with `SIGNALS_PROVIDER` set: `tests/browser/etsy-application.py` |
| 4 | Sub-processor table | **CORRECTED**, still incomplete | Anthropic, PBC was added — it received listing content and was missing while the section above promised notice before adding one. **SUPERSEDED 14 October 2026 (D95):** that row has been **removed**, because nothing is sent to it any more, and a sub-processor table that names a company nothing sends to is false in the other direction — §4 is the Article 28 notice, so a row in it states that this provider processes your data today. `tests/unit/legal-claims.test.ts` now fails in both directions: an AI SDK with no row, and a row with no SDK. Email and payment providers remain placeholders. Lawyer's note 2; must be complete before launch |
| 5 | Account and shop data kept while the account is open; 30-day export after closure | **OPEN GAP**, flagged | There is no account-closure flow in the product. `[[CONFIRM]]` in the document says so. Owner: operator + code |
| 5 | Audit records kept for the plan's retention period | **OPEN GAP**, flagged | The period is defined per plan and displayed on the audit-log screen, but nothing deletes an expired record. Today records are kept *longer* than the sentence says. `[[CONFIRM]]` in the document |
| 5 | AI drafts kept while the account is open, including rejected ones | **WITHDRAWN**, 12 October 2026 | "No deletion path" was true and irrelevant: there is no INSERT path either, so nothing was there to delete. §5 then stated that drafts are not kept. **SUPERSEDED 14 October 2026 (D95):** §5 says there are none to keep: no AI feature, so no draft is produced, shown or stored. The `[[CONFIRM]]` note that recorded the sentence to restore has gone with the feature; the one that remains explains why the empty `ai_generations` table is still in the schema |
| 5 | Etsy content displayed within the 6h / 24h API-Terms windows | **TESTED**, 12 October 2026 | Was **CORRECTED** and open: the claim had been removed because nothing refreshed at all — `syncShopListings` and `syncShopOrders` had no caller outside `tests/integration`. Now enforced at the DISPLAY decision rather than on a schedule, which is what §5 of Etsy's API Terms actually bounds: `lib/etsy/freshness.ts` holds the two windows, `domain/sync/source.ts` returns `STALE` outside them, the loaders hand out no rows for a `STALE` source, and `domain/sync/refresh.ts` re-reads. Guards: `tests/unit/freshness-window.test.ts` (12, both numbers negative-controlled, and no surface may compare the source kind itself), `tests/integration/refresh-on-read.int.ts` (17), `tests/browser/freshness-window.py` (39). `legal-claims` parses both numbers out of §5 and compares them with the constants |
| 5 | Derived figures are our records, kept while the account is open | **WITHDRAWN**, 12 October 2026 | The tables exist and **nothing writes any of them**: `profit_records`, `profit_scenarios`, `baselines`, `events` and `actions` have zero insert sites across `lib/`, `domain/` and `app/`. Every figure the product shows is recalculated from the mirrored Etsy rows on each request. So the Etsy-content/derived-figure distinction the lawyer's note 5 relies on **does not hold in the code**, and it is the distinction that was supposed to let multi-year reporting coexist with Etsy's caching limit. §5 now says so outright: the mirrored copy IS the history, which is why it is kept while the account is open. `legal-claims` fails if an insert site appears, because the paragraph would then be describing a product that no longer exists |
| 6 | Access and portability: export yourself from Settings | **NARROWED** → **TESTED** | Three datasets exist, not everything: `transactions`, `audit`, `audit-log`. They now live in one place, `domain/export/datasets.ts`, which the route validates against and the landing-page copy renders from. Listings, cost rules and bulk-edit jobs are named as *not* exportable, and the guard fails if one of them gains an exporter and stays on that list |
| 6 | Correction in Settings; shop data corrected in Etsy and re-synced | VERIFIED | `app/(dashboard)/settings/profile`, and sync is re-runnable |
| 6 | Deletion by email, actioned within 30 days | NOT CODE | Operator. Lawyer's note 1 — a mailbox is not a process. The product is honest about having no button: `app/(dashboard)/settings/export/page.tsx` refuses to render one |
| 7 | No revoke button inside the product; revoke from Etsy | VERIFIED, and the product was **fixed** to agree | The policy was right and the app was wrong: Settings → Shop connections said "revoke from here or from your Etsy account" three lines below a disabled Disconnect button, and Data permissions pointed at the same non-existent control. Both corrected this pass |
| 8 | Nothing is written to Etsy without your confirmation | **TESTED** | `lib/etsy/interface.ts` exposes exactly one write method, `applyListingChanges`; `domain/change-history/rollback.ts` refuses on a fingerprint mismatch before it reaches the adapter |
| 8 | **Our staff cannot write to your shop** | **TESTED** | `OPERATOR_WRITABLE` in `domain/admin/operator-writes.ts` is four entries — `users.platform_role`, `admin_audit_events`, `admin_role_permissions`, `admin_permission_audit_events` — the Etsy-write allowlist is empty, and `tests/unit/operator-write-boundary.test.ts` walks the operator import closure transitively. The strongest sentence in either document, and the one the lawyer's note 7 singles out |
| 8 | Refused write attempts are recorded in your audit log | **OPEN GAP** | See below. Only two refusal paths write a record |
| 9 | Passwords hashed by the provider | VERIFIED | As §2 |
| 9 | Tokens encrypted at rest | **TESTED** | As §2 |
| 9 | 2FA available on every account, required for staff | VERIFIED | `domain/auth/two-factor.ts`: `requiresTwoFactor(role) => role !== 'USER'`; TOTP enrolment in `lib/auth/mfa-actions.ts` is open to any account |
| 9 | Row-level security on every table | **TESTED** | `tests/unit/rls.test.ts` reads every migration against every declared table; `tests/integration/rls.int.ts` proves the database enforces it |
| 9 | Audit records are append-only; no code path edits or deletes one | **TESTED** | `lib/repositories/change-jobs.ts` exports an append and two reads. The guard sweeps `domain/`, `app/` and `lib/` for `update(schema.auditRecords)` and `delete(schema.auditRecords)` and requires none |
| 10 | International transfers and the transfer mechanism | NOT CODE | Lawyer. Placeholder, and depends on where the entity and each sub-processor sit |
| 11 | The cookies the product sets | **CORRECTED** → **TESTED** | The draft listed three and was wrong about two of them. The theme is `localStorage`, not a cookie (`components/layout/theme-script.tsx`). Two real cookies were undisclosed: `etsy_oauth_flow` (10 minutes, scoped to the connection routes) and **`ep-reset-email`, which holds an email address for 15 minutes**. All four are now named, and the guard sweeps the codebase for cookie-name constants and fails on any that §11 does not disclose |
| 11 | The demo cookie's value is never read | **TESTED** | `lib/auth/index.ts` calls `jar.get(PUBLIC_DEMO_COOKIE)` and never `.value` |
| 11 | No advertising cookies, no third-party trackers, no analytics cookies | VERIFIED | Analytics, error reporting and email are all `Noop` adapters in this build. `[[CONFIRM]]` records that this is the measured position, not a policy, and must change in the same release as any provider that is switched on |
| 12–14 | Children, changes, contact | NOT CODE | Lawyer |

## Terms of Service

| § | Claim | Verdict | Evidence / owner |
|---|---|---|---|
| 1 | Who the terms are between | NOT CODE | Lawyer. The entity does not exist yet; every placeholder in §1 is unfilled |
| 2 | Not an accountant, bookkeeper, tax adviser or auditor | NOT CODE | Lawyer, and true by construction — there is no filing or advice feature |
| 2 | **Where it cannot verify a figure it says so rather than estimating one** | VERIFIED | The provenance system is the product's spine: `lib/provenance/`, a badge on every figure, an empty cell and never a zero in every CSV (`domain/export/csv.ts`), and `tests/unit/provenance.test.ts` / `methodology.test.ts` hold it |
| 3 | One account per person; credentials not shared | NOT CODE | A contract term. Nothing in the code enforces it, and nothing claims to |
| 4 | We never ask for, receive or store your Etsy password | **TESTED** | OAuth + PKCE in `lib/etsy/oauth.ts`; no password field exists on any Etsy surface |
| 4 | Revoking from Etsy stops access immediately | NOT CODE | True of OAuth, enforced by Etsy rather than by us |
| 4 | We only read what we need | VERIFIED | `ETSY_SCOPES` in `lib/etsy/oauth.ts`: `listings_r`, `shops_r`, optional `listings_w`, `transactions_r`, `billing_r`. No buyer-data or email scope is requested at all |
| 4 | Nothing is written to your shop without your confirmation | **TESTED** | As Privacy §8 |
| 4 | Our staff cannot write to your shop | **TESTED** | As Privacy §8 |
| 4 | "We do not use browser extensions … to collect Etsy data outside the API" | **CORRECTED**, then **SUPERSEDED** 14 October 2026 | **This was false.** A browser extension shipped in `extension/`, and the paragraph was changed to name it and bound exactly what it read — the page address, from which a listing id; not prices, not titles, not cookies, not the session. **SUPERSEDED 14 October 2026 (D95):** the extension has been removed, so the original sentence would now be true again; it has NOT been restored in that form. The paragraph says what was built, that it has been taken out rather than switched off, and that nothing in CobaltRank runs inside a page on etsy.com. A denial that was once false is not a sentence to re-use the moment it becomes true |
| 5 | Etsy's seller policies apply to your shop | NOT CODE | Lawyer. The product does not review listings for policy compliance, and §5 says so |
| 6 | AI drafts are suggestions; you decide what to publish | **SUPERSEDED**, 14 October 2026 | `ai_generations.status` was `DRAFT` until approved, and nothing reached Etsy from `DRAFT`. **SUPERSEDED 14 October 2026 (D95):** there are no drafts. §6 keeps its number and its no-training commitment — that is the owner's commitment and it is true with or without the feature — and the allocation of responsibility for generated text goes with the drafter. Lawyer's note 6 is updated to say so, and the enforceability question returns with the feature |
| 6 | We do not train models on your content | VERIFIED + **TESTED** | As Privacy §3 |
| 7 | Your data is yours; no selling, no sharing with advertisers, no marketplace dataset | VERIFIED | No such pipeline exists. Every table is shop-scoped and RLS-enforced |
| 8 | 7-day trial, card required | VERIFIED | `TRIAL_DAYS = 7` in `domain/billing/trial.ts` |
| 8 | **"We will email you before your trial ends"** | VERIFIED by construction | There is no email sender in the repository, so the promise could not be kept — and `assertTrialCanStart()` is the *first* instruction of `startTrial()`, refusing until `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM` are both set. `tests/unit/trial-gate.test.ts` fails if the gate stops being first. The promise is therefore unbreakable rather than merely written down |
| 8 | One trial per person and per Etsy shop | NOT CODE | A contract term, unenforced. Worth enforcing when billing lands; nothing claims it is enforced now |
| 9 | Cancel at any time, in one click, no retention process | VERIFIED | `POST /api/billing/cancel`, one request, no interstitial |
| 9 | No refund of the unused part of a period | NOT CODE | Lawyer, and deliberately unimplemented: `domain/billing/trial.ts` documents the refund seam left open for a merchant of record. Lawyer's notes 2 and 5 |
| 9 | Statutory rights, including the 14-day right of withdrawal | NOT CODE | Lawyer |
| 9 | 30 days' notice of a price change | NOT CODE | Operator |
| 10 | You may close your account at any time; export for 30 days afterwards | **OPEN GAP**, flagged | No closure flow exists. `[[CONFIRM]]` in the document, matching Privacy §5 |
| 11 | Availability; dependence on Etsy's API | NOT CODE | True and unremarkable |
| 12 | Etsy warranty disclaimer naming the sole provider | NOT CODE | Lawyer's note 4 — confirm the wording against Etsy's current API Terms §3 requirement |
| 13 | Liability cap | NOT CODE | Lawyer's note 5 |
| 14–16 | Changes, governing law, contact | NOT CODE | Lawyer's notes 1 and 3 |

---

## The one open gap: refused writes and the audit log

Privacy §8 ends:

> Refused write attempts are recorded in your audit log.

**This is narrower than it reads.** Exactly two refusal paths write a record, both in
`domain/change-history/rollback.ts`: a fingerprint mismatch ("the catalogue moved between confirm
and apply") and a read-only shop. Everything else refuses correctly and records nothing —
demo-mode and public-visitor refusals on costs, notifications, profile and billing all throw from
the domain, as they should, and leave no trace in the log the sentence points at.

So the audit log's own exported header — "Every action taken on this shop through CobaltRank,
including the ones that were refused" — is true of rollbacks and optimistic about the rest.

Two honest ways to close it, in order of preference:

1. **Record the refusal where it is raised.** `assertCanWrite` and `assertNotPublicVisitor` are the
   two gates; a refusal record appended at each would make the sentence true everywhere at once and
   make the log more useful than any wording change. It is the better fix and the larger one — the
   gates are synchronous and the append is not.
2. **Narrow the sentence** to "refused bulk changes and rollbacks are recorded", which is what is
   true today.

The guard (`§8: refused write attempts are recorded, and something records them`) asserts that a
refusal writer exists and carries this gap in its own comment, so the scope of the claim is visible
at the place somebody would change it. It deliberately does **not** assert that every gate records
one — a test that passes today by asserting the weaker thing is better than a test somebody deletes
because it was always red.

**Owner: code. This is the only claim in either document whose accuracy depends on wording rather
than on behaviour.**

---

## What this pass changed in the drafts

Nine factual corrections, every one evidenced above:

1. The theme was called a cookie. It is `localStorage`.
2. Two real cookies were undisclosed, one of them holding an email address for fifteen minutes.
3. The AI provider was missing from the sub-processor table while it receives listing content.
4. "No AI training" stood alone and read as "no model sees your content".
5. The storage of AI drafts — input, output and verdict — was not disclosed at all.
6. The Terms denied using a browser extension. One ships in this repository.
7. The extension was undisclosed in the Privacy Policy's collection section.
8. The waitlist's `source` field was undisclosed.
9. "We refresh within those [6h/24h] windows" was false — there is no scheduler — and was removed.

Two over-claims narrowed: the export scope (three datasets, not everything), and the payment-data
row (no provider is connected).

**Five of those nine corrections are about features that no longer exist.** Numbers 3, 4, 5, 6 and
7 concern the AI provider and the browser extension, both removed from the working tree on
14 October 2026 (D95). The corrections are kept rather than deleted, because they record what the
documents got wrong and why — a sentence written from memory rather than read out of the code — and
that lesson is the reason `/legal/etsy` now reads its claim against the filesystem. Where a claim's
subject has gone, its row above is marked **SUPERSEDED** with the date.

Four `[[CONFIRM]]` notes added where the document described a process rather than code: account
closure, audit-record retention, Etsy refresh windows, and analytics cookies.

One name changed throughout: see below.

---

## The product name

**Resolved, 12 October 2026.** The drafts arrived naming the product "CobaltRank" while the code
called itself something else everywhere. The verification pass changed the documents to match the
code and left a `[[CONFIRM]]` note saying the opposite of what had just been done would be wrong:
*a policy is the one document that must not lead a rename.*

The owner has since renamed the product **to CobaltRank**, in the code first, for a trademark
reason — Etsy's API Terms §1 forbid a name confusingly similar to Etsy's marks and require Etsy's
marks to appear less prominently than the developer's own branding, and a name whose dominant
element was Etsy's trademark would not survive the API-key review. The documents and the code now
agree, and the `[[CONFIRM]]` note has been removed from both because the question it asked has an
answer.

The guard stays: `legal-claims` compares each document's H1 to `package.json`, and
`tests/unit/brand.test.ts` fails on the previous name anywhere outside the files deliberately kept
as history. The dated decision records in `memory.md` and `docs/DECISIONS.md` were **not** rewritten
— they say what was decided when, which is the only thing they are for — and each carries a new
dated entry recording this change beside the old one.

---

## Defects this pass found in the product, not in the documents

Verifying a document against code reads the code as a seller would, which turned up four places
where the product itself said something untrue:

1. **Settings → Shop connections** told the seller "revoke from here or from your Etsy account —
   both take effect immediately", three lines below a Disconnect button that is a deliberately
   disabled `NotYet`. A page contradicting itself about a data-rights control. Fixed.
2. **Settings → Data permissions** pointed at Shop connections as the place to revoke, and said
   Export & deletion "is where you remove it" when deletion is an email request. Both fixed.
3. **Settings → Export & deletion** listed two datasets while the route served three. The missing
   one was the audit log — downloadable from its own screen, absent from the page a seller is sent
   to for their data rights, and the page Privacy §6 points at. Under-claiming is the same defect
   as over-claiming: the seller cannot find a file they are entitled to and has no way to know it
   exists. Fixed, and the page's copy is now a `Record` keyed by dataset id, so a dataset with no
   copy written for it is a compile error rather than a quietly shorter page.
4. **The landing page's trust section and FAQ** both named four exportable datasets, two of which
   have no exporter. Both now render their nouns from `domain/export/datasets.ts`, and the guard
   fails if somebody types them back in by hand.

---

## The pages, and the gate (added after the first verification pass)

The first pass corrected the documents and left them unreadable: `/legal/terms` was a 404 and the
report did not say so. That is now built, and the parts worth recording here are the ones a future
reader will want to check:

| Thing | Where | Verdict |
|---|---|---|
| Four public pages | `app/(public)/legal/*` | Render from `docs/legal/*.md`; `tests/unit/legal-pages.test.ts` fails if a page carries the document's own prose |
| Sub-processor page | `/legal/subprocessors` | **Section 4 of the Privacy Policy, rendered** — not lifted into a new file, so the §4 guard in `legal-claims` still covers the published page. Three states, and which one a role is in is measured from the running configuration |
| Etsy page | `/legal/etsy` | Printed the extension's real permission list from `extension/manifest.chrome.json` — a sentence written from memory is how the false denial got into the Terms. Since D95 there is no manifest: the page states that there is no extension, and `tests/unit/legal-claims.test.ts` checks that claim against the absence of the five paths rather than against the page's own words. Still quotes §12's disclaimer out of the Terms |
| Placeholder gate | `lib/legal/documents.ts` | One function, `legalDocumentsInForce()`, read by the footer, the signup form, the page metadata and the acceptance flow |
| Per-seller acceptance | `terms_acceptances`, migration 0015 | Append-only, RLS on, version is a sha256 of the published documents |
| The gate | `domain/legal/acceptance.ts` | `/api/etsy/connect` before PKCE, `/api/etsy/callback` before the exchange, and both sync entry points |

**What a visitor sees at `/legal/terms` today:** the document in full, with a banner stating it is a
draft, not in force, and not being presented for acceptance, and with every blank marked in the
text. Not a 404 — the file exists, and answering "not found" to somebody looking for the terms is a
false statement made by a server.

**The one claim `/legal/etsy` does not make** is that Etsy has authorised a browser extension.
Etsy's own API Terms could not be read while this was written — `etsy.com` and
`developers.etsy.com` are both blocked by this environment's egress proxy — so the page summarises
the Prohibited Behavior provision and attributes the summary as a summary. It used to state
exactly what the extension read; since D95 it states that there is no extension, that one was
built and removed rather than switched off, and that no authorisation has been given or asked for
because there is nothing left to authorise. Whether reading a listing id out of a URL falls under
item 24 is Etsy's call, and the page says so rather than answering it.

---

## Before publishing either document

Neither is publishable today, and the draft banner is held in place by a test that fails in both
directions — a document published with placeholders still in it, and a document still labelled
draft after every placeholder is filled.

Outstanding, in the order they block:

- [ ] **The entity.** Country, type, address, support and privacy addresses. Everything in Privacy
      §1 and Terms §1, and the governing-law and consumer-rights clauses that follow from it.
- [ ] **The sub-processor table.** The email, payment and keyword data providers are not chosen.
      GDPR requires naming them. The keyword data row is dormant and says so; the other two are
      the same, and the database and hosting rows are LIVE and unnamed, which is the gap that
      blocks launch.
- [x] ~~**Read the AI provider's no-training clause**~~ — **no longer applicable, 14 October
      2026.** Privacy §3 said "that provider does not train on it either", which rested on a
      third party's terms that nobody here had read; `lib/ai/provider-terms.ts` recorded that
      honestly and `/data/sources` displayed it as relied upon rather than checked. D95 removed
      the AI Copilot, and the sentence with it. This closed by deletion, not by somebody reading
      the clause — which is worth distinguishing, because it comes back the day an AI provider
      does.
- [ ] **An operational deletion process** behind the 30-day promise in Privacy §6. Lawyer's note 1.
- [ ] **An account-closure flow**, or a Privacy §5 and Terms §10 that describe the real position.
- [x] **The Etsy 6h/24h windows.** Closed 12 October 2026, and not with a scheduler: §5 of Etsy's
      API Terms bounds what may be DISPLAYED, so the window is checked where the display decision
      is made and out-of-window content is withheld. A cron that stopped running would leave every
      page rendering happily on month-old data; this cannot, because the check that would have
      triggered the refresh is the one that decides whether to show anything.
- [ ] **Audit-record expiry**, or a §5 that says records are kept longer than the plan's period.
- [ ] **The refusal-logging gap** above: close it in code, or narrow Privacy §8's last line.
- [x] **The pages exist.** `/legal/terms`, `/legal/privacy`, `/legal/subprocessors` and
      `/legal/etsy` render from the markdown in this folder, so correcting a document corrects the
      page. They are reachable with no account, carry the draft state above the text, and are not
      linked from any public surface while a placeholder remains.
- [x] **Acceptance at connection, not a footer link.** Etsy's API Terms §4 requires executed
      Application Terms with each seller. Built: `terms_acceptances`, recorded per shop with a
      content-hash version, append-only, RLS on, and gated server-side at `/api/etsy/connect`,
      `/api/etsy/callback` and both sync entry points. The flow refuses while any placeholder
      remains — nobody can accept `[[LEGAL_ENTITY]]` — which means **no shop can connect and
      nothing can sync on this deployment today.** That is the intended consequence and it is why
      the list below still blocks launch.
- [ ] **A lawyer.** Every `NOT CODE` row above, and all six notes at the foot of each document.
