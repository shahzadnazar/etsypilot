# Connecting EtsyPilot to a real Etsy shop

**You do not need any of this to run, build, test or demo EtsyPilot.** With
`.env.example` copied to `.env.local` and nothing filled in, the whole product
works against the Willow & Fern demo shop, cannot write to Etsy, and says so on
every screen that could be mistaken for live data.

This document is for the day the Etsy API key arrives. Follow it top to bottom;
each step says what breaks if it is skipped.

---

## 1. Create the Etsy app

1. Go to <https://www.etsy.com/developers/your-apps> and create an app.
2. Etsy issues a **keystring**. That is your `ETSY_API_KEY`. It is also the
   OAuth `client_id` — the same value, used in two places, which is Etsy's
   design and not a mistake in ours.
3. Register the redirect URI, exactly:

   | Environment | Redirect URI |
   | --- | --- |
   | Local | `http://localhost:3000/api/etsy/callback` |
   | Production | `https://<your-domain>/api/etsy/callback` |

   Register both if you develop locally. Etsy compares the string character for
   character — scheme, host, port, path — and its rejection message does not
   say which part differed. A trailing slash is a different URI.

4. Request the scopes EtsyPilot asks for. They are listed, with what each one
   enables and what stops working without it, in `domain/connect/types.ts` and
   on Settings → Shop connections:

   | Scope | Why |
   | --- | --- |
   | `shops_r`, `listings_r` | Read the shop and its listings. Required — without these there is nothing to show. |
   | `listings_w` | Publish confirmed edits from the bulk editor. Without it EtsyPilot can only suggest. |
   | `transactions_r`, `billing_r` | Orders and fee lines. Without them Profit Reality has nothing to measure. |

   Etsy reviews apps that request write access. Expect that to take time, and
   note that read-only mode is fully useful in the meantime — the bulk editor
   shows the diff and refuses to apply, rather than hiding.

---

## 2. Fill in the environment

In `.env.local`, which is git-ignored and must stay that way:

```bash
ETSY_MODE=live
ETSY_API_KEY=<the keystring from step 1>
ETSY_REDIRECT_URI=https://<your-domain>/api/etsy/callback
TOKEN_ENCRYPTION_KEY=<openssl rand -base64 32>
```

`ETSY_API_SECRET` stays empty. EtsyPilot uses OAuth 2.0 Authorization Code with
PKCE, which binds the authorization code to the browser that started the flow;
a leaked code — from a referrer header, a shared screen, a proxy log — is
useless without the verifier, and the verifier never leaves the server.

`TOKEN_ENCRYPTION_KEY` must be exactly 32 bytes, base64-encoded. Anything else
raises an error at startup rather than storing tokens unencrypted. Rotating it
invalidates stored tokens: sellers reconnect, and no shop data is lost.

Nothing here is `NEXT_PUBLIC_`, so none of it reaches the browser bundle.

---

## 3. What changes in the product

Nothing, and that is the acceptance criterion for this phase.

`lib/etsy/index.ts` is the only file that chooses an adapter. With
`ETSY_MODE=live` it constructs `LiveEtsyService` instead of `MockEtsyService`.
Every screen, every domain service and every test above that line talks to the
`EtsyService` interface and never learns which one it got.

Two things stay refused in live mode, with a valid key and a connected shop:

- **`getListingViews`** returns `UNAVAILABLE`. Etsy does not publish listing
  views through the public API.
- **`getAdsPerformance`** returns `UNAVAILABLE`. Etsy does not expose Etsy Ads
  performance through the public API.

They are methods rather than omissions precisely so the answer to "surely we
can get this now that we're connected?" is written down where someone looking
for the endpoint will find it. When Etsy publishes an endpoint, that is the
moment to change them — not before.

---

## 4. Verify on the first live call

The field names and endpoints in `lib/etsy/` follow Etsy's documented Open API
v3 shapes, but a provider's payloads are not ours to guarantee. On the first
run against a real shop, check these and correct `lib/etsy/live.ts` if Etsy has
moved:

- [ ] `GET /users/me` returns `shop_id`. The callback keys tokens by this value
      — it comes from Etsy, never from the request, which is what stops a
      hand-edited URL writing tokens against someone else's shop.
- [ ] Prices arrive as `{ amount, divisor, currency_code }` integer minor units,
      not floats. `money()` in `live.ts` divides; a float would round twice.
- [ ] Rate-limit headers are named `x-remaining-this-second`,
      `x-remaining-today`, `x-limit-per-second`, `x-limit-per-day`. The client
      paces itself from these. If the names have changed it will still work —
      it just discovers the limit by being refused instead of avoiding it.
- [ ] `PUT /shops/{shop_id}/listings/{listing_id}` accepts a partial body.
      EtsyPilot sends only the fields the confirmed operation changed, so that
      an edit the seller made on Etsy between the diff and the apply is not
      silently overwritten.
- [ ] Timestamps are Unix seconds. `iso()` multiplies by 1000.

Two known gaps, both deliberate and both marked in `live.ts`:

- **Listing attributes** come from a separate per-listing endpoint. Fetching
  them for every listing would spend the rate budget on a page nobody opened,
  so `toListing` leaves `attributes` empty and `requiredAttributes` empty too —
  which means no audit rule fires on data that was never loaded. The audit's
  attribute rule loads them for the listings it is about to flag.
- **Fees** come from the payment-account ledger, not the receipt, so `toOrder`
  leaves them at zero. The profit domain treats a period with no fee data as
  incomplete rather than fee-free; a shop whose fees read `$0` would show a
  wildly optimistic net profit.

---

## 4a. What a successful connection writes

**One shop row per account, updated — never a second row.** A seller has a
`shops` row from the moment they sign up: the one that reads "My demo shop".
Connecting Etsy updates it. Three things already assume that: `plans.ts` sells
"Connect one Etsy shop" and lists "One shop" as the Solo limit, the seller's
memberships hang off that row, and `shops.etsy_shop_id` was put in the schema
for exactly this.

On `connect=connected`, in **one transaction**:

| Column | Becomes | Why |
| --- | --- | --- |
| `etsy_connections.shop_id` | the **session's** shop id | It is a foreign key to `shops.id`. See the warning below. |
| `etsy_connections.token_ref` | the sealed token | AES-256-GCM, `TOKEN_ENCRYPTION_KEY` |
| `etsy_connections.scopes` | what the flow asked for | So Settings can say what breaks if one is revoked |
| `shops.etsy_shop_id` | Etsy's numeric id, as text | The link between the two namespaces |
| `shops.name`, `shops.currency` | Etsy's values | The seller's real shop is not called "My demo shop" |
| `shops.connection_status` | `CONNECTED` | An existing `ConnectionStatus` value, which `live.ts` already reports |
| `shops.is_demo` | `false` | It drives the demo banner, the D11 provenance override and `readOnly`. A real shop must not claim demo figures. |

**`shops.timezone` is NOT written, and that is not an oversight.** Etsy's shop
payload has `shop_name` and `currency_code` and no timezone — `live.ts` says so
and uses `'UTC'`, which is this product's single basis (D24). Two of the three
is what the API permits.

### ⚠️ The bug this replaced, so it is not reintroduced

The callback used to store tokens under **Etsy's** shop id:

```
our shop ids    ['shop_72d56f17-b51f-4978-beed-7c609eed1ac4', ...]
callback wrote  '48123456'
result          there is no shop in EtsyPilot with that id
```

`etsy_connections.shop_id` is a foreign key to `shops.id`, so every real
connection failed the key. The comment that caused it was half right — it
argued that a shop id a caller could supply is a cross-shop write waiting to
happen, which is true. The fix is **not** to accept a shop id from the request:
it is `session.shopId`, resolved server-side from the caller's own memberships,
which no query parameter, header or cookie field can influence.

### Two refusals that are not failures

**`connect=shop_already_linked`** — that Etsy shop is attached to a different
EtsyPilot account. A real case: a shop sold, an agency and its client, one
person with two accounts. Attaching it to whoever connected last would move a
shop's data between accounts. Enforced by a unique index on
`shops.etsy_shop_id` (migration `0009`), with a `SELECT` for the wording —
because a `SELECT` then an `UPDATE` is a race and only the index holds under
concurrency.

**`connect=demo_mode`** — `ETSY_MODE` is not `live`. A connection sets
`is_demo = false`, which removes the demo banner and the demo provenance badge
from every figure; if the adapter is still the mock one, the seller would be
shown the Willow & Fern catalogue as their own shop. **Set `ETSY_API_KEY` and
`ETSY_MODE=live` together** — this is that pairing enforced rather than
documented. Refused before the code is exchanged, so no token is minted for a
connection that will not be saved.

---

## 5. Token storage

`lib/etsy/tokens.ts` is marked `server-only`, so importing it from a client
component is a build error. That is the only reliable way to keep a refresh
token out of a bundle.

Which store runs is decided by `DATABASE_URL` **alone**:

| `DATABASE_URL` | `TOKEN_ENCRYPTION_KEY` | Store | Behaviour |
| --- | --- | --- | --- |
| unset | — | `MemoryTokenStore` | One process; tokens lost on restart, and the connect screen says so |
| set | set | `DatabaseTokenStore` | Encrypted rows in `etsy_connections` |
| set | unset/malformed | `DatabaseTokenStore` | Refuses every call, naming the variable |

The key deliberately does not take part in that choice: falling back to the
in-memory store would be a silent downgrade for a deployment that asked for
persistence. `docs/DATABASE-AND-AUTH-SETUP.md` §3 has the full argument and the
generation command.

**This section used to say `DatabaseTokenStore` was unimplemented and refused
every call.** That stopped being true when it was implemented; the line is
corrected here rather than left to mislead whoever reads this next.

---

## 6. Security properties to preserve

These hold today. If a change breaks one, the change is wrong:

| Property | Enforced by |
| --- | --- |
| No credential in the repository | Every value is read from `process.env`; `.env.local` is git-ignored |
| No Etsy secret in the browser | Nothing Etsy-related is `NEXT_PUBLIC_`; `tokens.ts` and `live.ts` are `server-only` |
| No secret in an API response | `TokenSet` is never returned by anything; the access token reaches the HTTP client inside a closure |
| No Etsy password, ever | There is no password field in the codebase to receive one — the seller types it on etsy.com |
| No cross-shop access | Every adapter method takes a `shopId` from a `ShopContext` the caller already holds; the callback takes the shop from Etsy, never from the request |
| No stack traces to users | Routes redirect with one of our own outcome codes; `AppError` carries a message and a recovery, never transport detail |
| No credential in a log | `redact()` in `lib/etsy/http.ts` strips bearer tokens, api keys, verifiers and refresh tokens from anything attached to an error |
| Nothing auto-published | `applyListingChanges` is reachable only through the bulk editor's `ConfirmedOperation` gate |

---

## 7. If something goes wrong

Every failure path lands on Settings → Shop connections with a `?connect=`
outcome, and the copy for each lives in `domain/connect/types.ts`:

| Outcome | Means |
| --- | --- |
| `not_configured` | `ETSY_API_KEY` or `ETSY_REDIRECT_URI` is missing on the server |
| `cancelled` | The seller declined on Etsy. Not an error |
| `expired` | The flow took longer than ten minutes, or cookies were cleared |
| `state_mismatch` | The reply did not match the request that started it. Refused |
| `no_shop` | Etsy approved, but that account has no shop to read |
| `exchange_failed` | Etsy refused the final step |
| `connected` | Done |

None of them carries Etsy's own error text. That text is of unknown content and
would be heading for a URL bar, a browser history and a referrer header.
