# EtsyPilot — Privacy Policy

**DRAFT FOR LEGAL REVIEW. NOT READY TO PUBLISH.**

Placeholders in `[[DOUBLE BRACKETS]]` must be filled before this goes live. Every factual claim
below was written to match what the software actually does — if the software changes, this
document must change with it.

`[[CONFIRM: THE PRODUCT NAME. This draft arrived naming the product "CobaltRank". That name appears
nowhere in the codebase — the product calls itself EtsyPilot in 100+ source files, in the extension
manifest, in every CSV filename and in the support addresses already published on the landing page.
Since every other claim here was checked against the code and corrected to match it, the name was
too: "CobaltRank" has been replaced with "EtsyPilot" throughout. If the product is in fact being
renamed, the rename belongs in the code first and this substitution should be reversed in the same
change — not left for these documents to lead.]]`

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

**Listing text you ask us to rewrite, and the drafts we produce**
When you use the AI listing helper, the listing's current title and tags are sent to our AI
provider to generate a draft. Nothing is sent unless you ask for a draft, and nothing is published
until you approve it. See the sub-processor table below.

We also **store each draft** — what was sent, what came back, which listing it was for, who asked
for it, and whether you accepted or rejected it. This is how the product can show you what it
suggested and what you did with it, and it is why a rejected suggestion is still a record. A draft
you never accept stays a draft: nothing reaches Etsy from one.

**If you install the browser extension**
The extension reads the address of the Etsy page you are looking at and sends the listing id to us,
so we can show you your own figures for that listing. It reads nothing else from the page — not
prices, not titles, not your Etsy cookies or session — and it changes nothing on it.

**Costs you enter**
The product costs, shipping costs, labour rates and other figures you type in. These are yours; we
use them only to compute your figures.

**Your Etsy connection**
An OAuth access token, stored encrypted. **We never receive or store your Etsy password.**

**Usage and technical data**
Audit records of actions taken through EtsyPilot, including actions that were refused. Server logs
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
content to train artificial intelligence models.** Where you ask for an AI draft, the listing text
is sent to our AI provider to produce it; that provider does not train on it either, and the
sub-processor table below names them.

We do not currently collect payment data, because no payment provider is connected yet. The row
above describes how it will be handled when one is.

## 4. Who else processes it

| Who | What they do | Where |
|---|---|---|
| `[[DATABASE_PROVIDER]]` | Database and authentication | `[[REGION]]` |
| `[[HOSTING_PROVIDER]]` | Runs the application | `[[REGION]]` |
| `[[EMAIL_PROVIDER]]` | Sends account and billing email | `[[REGION]]` |
| Anthropic, PBC | AI provider. Receives listing title and tags when you ask for a draft | United States |
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
older than Etsy's own, and other Etsy content no more than 24 hours older. We do not keep raw Etsy
content longer than is needed to provide the service.
`[[CONFIRM: a sync runs when you connect a shop and when it is triggered. There is no scheduler,
so nothing currently guarantees the 6-hour and 24-hour windows. This is an Etsy API Terms
obligation, not only a privacy one, and the claim that we refresh within those windows has been
removed until a scheduled refresh exists.]]`

**AI drafts** — while your account is open, alongside the listing they were written for. A
rejected draft is kept too: the record that a suggestion was made and turned down is part of the
audit trail, and deleting it would leave the trail saying less than what happened.

**Figures we calculate** — your profit history, margins and cost allocations are records we create
from your data. We keep these while your account is open, because historical reporting is what you
are paying for.

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
- There is currently **no revoke button inside EtsyPilot** — revoke from Etsy itself.
- Tokens are stored encrypted.

## 8. What we write to your shop

EtsyPilot reads your shop. Where it can write — editing a listing, applying a bulk change — it
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

EtsyPilot is for people running a business and is not for anyone under 18. We do not knowingly
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
