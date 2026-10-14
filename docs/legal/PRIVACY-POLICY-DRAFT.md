# CobaltRank — Privacy Policy

**DRAFT FOR LEGAL REVIEW. NOT READY TO PUBLISH.**

Placeholders in `[[DOUBLE BRACKETS]]` must be filled before this goes live. Every factual claim
below was written to match what the software actually does — if the software changes, this
document must change with it.

Last updated: `[[DATE]]`

---

## 1. Who we are

`[[LEGAL_ENTITY]]`, `[[ENTITY_ADDRESS]]`, `[[ENTITY_COUNTRY]]`, is the controller of the personal
data described here. Contact us about privacy at `[[PRIVACY_EMAIL]]`.

For the shop data we process on your behalf, we act as a **processor** — you decide what we do
with it, and we do only that.

## 2. What we collect

**Your account**
Your email address, your name if you give us one, your password (stored hashed, never in plain
text), and your two-factor authentication settings. Handled by our authentication provider; we
never see your password.

**Your Etsy shop data**
When you connect a shop, we read and store: your shop's name, currency and timezone; your listings,
including titles, descriptions, tags, prices, stock levels and variations; your orders, including
line items, quantities, prices and totals; and the fee lines Etsy makes available.

**What we deliberately do not collect**
We do not store your buyers' names, email addresses, postal addresses, messages or gift notes. Our
order sync stores a two-letter country code only, for aggregate reporting — never an individual
buyer. **This is enforced by an automated test that fails if buyer-identifying data appears in our
tables.**

**Listing text — nothing is sent to a language model**
No title, description, tag, order or cost of yours is sent to an AI provider, because CobaltRank
has no AI feature and no AI provider. Nothing on any screen is written by a language model, there
is no drafting or rewriting tool, and the sub-processor table in §4 names no model provider.

A listing drafter was built for this product and has been removed from it. While it existed, this
section disclosed that a listing's current title and tags were sent to our AI provider when you
asked for a draft. That no longer happens and cannot: there is nothing in the application that
could send it.
`[[CONFIRM: there is still an ai_generations table in the database, with input, output and status
columns, and nothing writes to it — an applied migration is never edited, so it stays. It held no
rows while the feature existed either, which is why an earlier version of this section
over-disclosed: it told sellers we kept a record of every suggestion and what they did with it,
and no such record was ever written. Nothing needs to be said to a seller about an empty table
nothing writes to; this note is here so the next reader of the schema does not conclude the
document is incomplete.]]`

**There is no browser extension**
CobaltRank does not offer one, so nothing in this section applies to you and there is nothing to
install. One was built and has been removed from the application — not left unpublished behind a
switch, but taken out. It would have read the address of the Etsy page you were looking at and
sent the listing id to us, so we could show you your own figures for that listing; it read nothing
else from the page — not prices, not titles, not your Etsy cookies or session — and changed
nothing on it. Etsy's API Terms restrict browser extensions that access Etsy data, that question
has not been put to Etsy, and it is not one worth answering unilaterally.

**Costs you enter**
The product costs, shipping costs, labour rates and other figures you type in. These are yours; we
use them only to compute your figures.

**Your Etsy connection**
An OAuth access token, stored encrypted. **We never receive or store your Etsy password.**

**Usage and technical data**
Audit records of actions taken through CobaltRank, including actions that were refused. Server logs
containing IP address, browser type and timestamps, for security and debugging.

**If you join the waitlist**
Your email address, your shop URL if you give it, and which part of the page you signed up from.

## 3. Why we process it, and our lawful basis

| What | Why | Lawful basis (UK/EU GDPR) |
|---|---|---|
| Account data | To create and secure your account | Performance of a contract |
| Shop data and costs | To provide the features you use | Performance of a contract |
| Payment data | To bill you | Performance of a contract |
| Audit records | Security, dispute resolution, and because you may need to show what happened | Legitimate interests |
| Server logs | Security and debugging | Legitimate interests |
| Waitlist email | To tell you when we launch | Consent |

We do not use your data for advertising. We do not sell it. **We do not use your shop data or your
content to train artificial intelligence models.** Nobody else does either, because nothing in
CobaltRank sends your shop content to a language model: there is no AI feature in this product and
no AI provider in the sub-processor table below.

We do not currently collect payment data, because no payment provider is connected yet. The row
above describes how it will be handled when one is.

## 4. Who else processes it

| Who | What they do | Where |
|---|---|---|
| `[[DATABASE_PROVIDER]]` | Database and authentication | `[[REGION]]` |
| `[[HOSTING_PROVIDER]]` | Runs the application | `[[REGION]]` |
| `[[EMAIL_PROVIDER]]` | Sends account and billing email | `[[REGION]]` |
| `[[KEYWORD_DATA_PROVIDER]]` | Keyword and market data. Would receive the search terms you type on a Research screen, and nothing from your shop | `[[REGION]]` |
| `[[PAYMENT_PROVIDER]]` | Takes payment | `[[REGION]]` |
| Etsy, Inc. | The source of your shop data, under your OAuth authorisation | United States |

The current list is maintained at `[[DOMAIN]]/legal/subprocessors`. We will tell you before adding
a new one that processes your data.

## 5. How long we keep it

**Your account and shop data** — while your account is open. After you close it, you can export for
30 days, then we delete it.
`[[CONFIRM: there is no in-product account-closure flow today. Closure and the 30-day window are
an operational process, like deletion in §6, and must exist before this sentence is published.]]`

**Audit records** — `[[RETENTION_DAYS]]` days, depending on your plan. These are append-only; they
cannot be edited.
`[[CONFIRM: the per-plan retention period is defined in the product and shown on the audit-log
screen, but nothing deletes a record when it expires. Today we keep them longer than this says.
Either a deletion job exists before launch, or this sentence states the real position.]]`

**Etsy content** — Etsy's API Terms require that listing content we display is no more than 6 hours
older than Etsy's own, and other Etsy content no more than 24 hours older. We enforce that when a
screen is built, not on a timer: if the copy we hold is older than its window, the screen holds the
figures back, tells you how old the copy is and why it is not showing it, and re-reads your shop
from Etsy. So nothing outside those windows is ever displayed to you, and a shop nobody opens
costs no Etsy requests at all.

We keep the copy itself while your account is open, and that is longer than the display windows on
purpose. Two reasons, both honest: a copy we may not display is still what the next read compares
against, and deleting it would turn a catalogue that is merely six hours old into a shop that
appears to have no listings — a false statement in place of a true one. And your profit history is
calculated from that copy every time you open a screen rather than stored as a separate record, so
the copy IS the historical reporting you are paying for. Closing your account deletes it; so does
asking us.

**AI drafts** — there are none. CobaltRank has no AI feature, so no draft is produced, shown or
kept, and nothing of yours is sent to a language model to produce one. This paragraph used to say
that a draft existed only on the screen you asked for it on; the screen is gone.

**Figures we calculate** — your profit history, margins, cost allocations and the findings on your
Action Center are not kept. They are recalculated from your own orders, listings and costs every
time you open the screen that shows them, so there is no separate record of them to keep, to go
stale, or to delete. What IS kept is what you typed or did: your cost rules, your bulk-edit
records, your audit log and your Etsy connection.
`[[CONFIRM: this paragraph previously said these figures were records we create and keep. They are
not: profit records, baselines, scenarios, events and actions have no insert sites in the code, so
every figure is derived at read time. The consequence for §5 is deliberate and stated above —
because nothing derived is stored, the mirrored Etsy copy is what multi-year reporting depends on,
and the two cannot be given different retention periods while that is true. If the owner later
decides to store derived figures, the two paragraphs above must be revisited together.]]`

**Server logs** — `[[LOG_RETENTION]]` days.

**Waitlist emails** — until you ask us to remove you, or until we launch and you decide not to sign
up.

## 6. Your rights

Under UK and EU data protection law you may ask for a copy of your data, correct it, have it
deleted, restrict or object to processing, or receive it in a portable format. Similar rights apply
under California law and elsewhere.

**How to exercise them, honestly:**

- **Access and portability** — export from Settings, any time, with no request: your orders and
  reconciliation, your listing-audit findings, and your audit log, as CSV. Your listings, your cost
  setup and your bulk-edit records are not yet exportable from the product — ask us at
  `[[PRIVACY_EMAIL]]` and we will send them. Portability of everything is a right, so this gap is
  closed by the email route until the product covers it.
- **Correction** — change your account details in Settings. For shop data, correct it in Etsy and
  re-sync.
- **Deletion** — **email `[[PRIVACY_EMAIL]]`.** There is no in-app delete button yet. We will
  action a deletion request within 30 days and confirm when it is done.
- **Restriction, objection, and withdrawing consent** — email `[[PRIVACY_EMAIL]]`.

We will not charge you, and we will not make the service worse for you because you exercised a
right.

If you think we have handled your data badly, please tell us first. You can also complain to your
data protection authority — in the UK, the Information Commissioner's Office.

## 7. Your Etsy connection

The connection is an OAuth token you grant and can revoke.

- **We never hold your Etsy password.**
- **Revoke at any time from your Etsy account.** This stops all reads and writes immediately.
- There is currently **no revoke button inside CobaltRank** — revoke from Etsy itself.
- Tokens are stored encrypted.

## 8. What we write to your shop

CobaltRank reads your shop. Where it can write — editing a listing, applying a bulk change — it
shows you exactly what will change and sends nothing to Etsy until you confirm.

**Our staff cannot write to your shop.** Support staff can read your data to help you; the ability
to write to seller data does not exist in the operator tools, and that boundary is enforced by an
automated test.

Refused write attempts are recorded in your audit log.

## 9. Security

- Passwords are hashed by our authentication provider; we never see them
- Etsy tokens are encrypted at rest
- Two-factor authentication is available on every account, and required for our own staff accounts
- Database row-level security is enabled on every table
- Audit records are append-only — there is no code path that edits or deletes one

No system is perfectly secure. If a breach affects your data and is likely to risk your rights, we
will tell you and the relevant authority, as the law requires.

## 10. International transfers

Your data may be processed outside your country, including in the United States. Where it leaves
the UK or EEA we rely on `[[TRANSFER_MECHANISM]]` — for example Standard Contractual Clauses or an
adequacy decision.

## 11. Cookies

We use cookies that are necessary for the service. There are four, and this is all of them:

- **A session cookie**, so you stay signed in. Set by our authentication provider.
- **A password-reset cookie** (`ep-reset-email`), set when you ask to reset your password. It holds
  the address you typed, so the next screen does not have to ask again, and it expires after **15
  minutes**. It is set for every submission, including addresses with no account — otherwise the
  presence of the cookie would itself reveal whether an account exists.
- **An Etsy connection cookie** (`etsy_oauth_flow`), set only while you are connecting a shop. It
  holds the one-time state of that flow, expires after **10 minutes**, is scoped to the connection
  routes, and is cleared when the flow finishes. Your Etsy token is never in it — tokens stay on
  the server.
- **A demo cookie** (`ep_public_demo`), set when you open the public demo. It is a flag whose
  **value is never read** — nothing is stored in it and it carries no information about you.

All four are `httpOnly` where we set them, so no script in your browser can read them.

Your light/dark preference is kept in your browser's **local storage**, not in a cookie. It never
reaches our servers.

We do not use advertising cookies or third-party trackers, and there are no analytics cookies: no
analytics provider is connected. The product's analytics, error-reporting and email adapters are
all inert in this build.
`[[CONFIRM: this is the measured position today, not a policy. If an analytics provider is switched
on, it must be named here and in §4, and this paragraph must change in the same release.]]`

## 12. Children

CobaltRank is for people running a business and is not for anyone under 18. We do not knowingly
collect data from children.

## 13. Changes

We will post changes here and update the date at the top. If a change materially affects you, we
will tell you by email before it takes effect.

## 14. Contact

`[[LEGAL_ENTITY]]`
`[[ENTITY_ADDRESS]]`
`[[PRIVACY_EMAIL]]`
`[[CONFIRM: whether a Data Protection Officer or an EU/UK representative is required]]`

---

## Notes for the lawyer reviewing this

1. **No in-app deletion exists.** §6 says so plainly rather than implying a button that is not
   built. Under GDPR a 30-day email process is acceptable, but it must actually happen — confirm
   there is an operational process behind it, not just a mailbox.
2. **The sub-processor table is incomplete** because the email and payment providers are not yet
   chosen. It must be complete before launch; GDPR requires naming them.
3. **Representative requirement.** If the entity is established outside the UK/EEA and targets
   customers in them, an Article 27 representative may be required in each.
4. **Transfer mechanism** is a placeholder and depends on where the entity and each sub-processor
   sit.
5. **Retention of calculated figures** (§5) is written to distinguish derived records from mirrored
   Etsy content, because Etsy's API Terms limit how long Etsy content may be cached. Confirm this
   distinction holds up, since the product's value is multi-year historical reporting.
6. **Etsy API Terms Section 4** requires that sellers are transparently informed about what is
   collected, how it is used, stored, secured and disclosed, and what controls they have. This
   document is intended to satisfy that; confirm it does.
7. **§8's claim that staff cannot write to seller data** is a strong statement. It is true of the
   code today and enforced by a test. It must be re-verified before each release, and removed from
   this document the moment it stops being true.
